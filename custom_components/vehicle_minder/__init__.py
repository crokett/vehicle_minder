"""Set up Vehicle Minder integration from a config entry."""

from __future__ import annotations

import logging
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv
from homeassistant.config_entries import ConfigEntry
from homeassistant.components.http import Path, StaticPathConfig

import voluptuous as vol

from .const import DOMAIN, PLATFORMS
from .models import Vehicle, MaintenanceItem, ServiceRecord
from .panel import async_setup_panel
from .storage import VehicleMinderStore
from . import websocket
from homeassistant.const import UnitOfLength

_LOGGER = logging.getLogger(__name__)

async def async_setup(hass, config):
    """Set up Vehicle Minder."""
    websocket.async_register(hass)
    return True

async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
) -> bool:
    """Set up the integration from a config entry."""

     # Register the frontend folder so files can be fetched via /vehicle_minder_assets/...
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                "/vehicle_minder_assets",
                str(Path(__file__).parent / "frontend"),
                cache_headers=False, # Set to True once stable for caching
            )
        ]
    )
    # Register static frontend panel
    await async_setup_panel(hass)

    # Load storage
    store = VehicleMinderStore(hass)
    loaded_fleet = await store.async_load()
    raw_fleet = loaded_fleet if loaded_fleet is not None else {}

   # Rehydrate raw JSON dicts into Vehicle instances
    fleet: dict[str, Vehicle] = {}
    for vehicle_id, vehicle_data in raw_fleet.items():
        if isinstance(vehicle_data, dict):
            if hasattr(Vehicle, "from_dict") and callable(getattr(Vehicle, "from_dict")):
                fleet[vehicle_id] = Vehicle.from_dict(vehicle_data)
            else:
                fleet[vehicle_id] = Vehicle(**vehicle_data)
        else:
            fleet[vehicle_id] = vehicle_data

    entry.runtime_data = fleet


    # Read the saved preference (defaults to miles if missing)
    distance_unit = entry.data.get("distance_unit", UnitOfLength.MILES)

   # Initialize domain data store for entities
    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][entry.entry_id] = {
        "fleet": fleet,
        "entities": {},
        "distance_unit": distance_unit,
    }

    # Forward entity setups to platforms
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    # --- Service: add_vehicle ---
    async def handle_add_vehicle(call: ServiceCall) -> None:
        """Add a new vehicle to the fleet."""
        data = call.data
        _LOGGER.info("Adding vehicle via service: %s", data)

        vehicle = Vehicle(
            make=data["make"],
            model=data["model"],
            year=data["year"],
            name=data["name"],
            vehicle_type=data.get("vehicle_type", "car"),
            vin=data.get("vin"),
            use_hours = call.data.get("use_hours", False),
            current_mileage=data.get("current_mileage", 0),
            current_hours=data.get("current_hours", 0.0),
        )

        fleet[vehicle.vehicle_id] = vehicle

       
        await store.async_save(fleet)

        from .sensor import VehicleSensor
        runtime = hass.data[DOMAIN][entry.entry_id]
        entity = VehicleSensor(vehicle)
        runtime["entities"][vehicle.vehicle_id] = entity

        if "add_entities" in runtime:
            runtime["add_entities"]([entity])

    hass.services.async_register(
        DOMAIN,
        "add_vehicle",
        handle_add_vehicle,
        schema=vol.Schema(
            {
                vol.Required("make"): cv.string,
                vol.Required("model"): cv.string,
                vol.Required("year"): vol.All(vol.Coerce(int), vol.Range(min=1900)),
                vol.Required("name"): cv.string,
                vol.Optional("vehicle_type", default="car"): cv.string,
                vol.Optional("vin"): cv.string,
                vol.Optional("use_hours", default=False): cv.boolean,  
               # Mutually exclusive metrics: user can provide mileage OR hours, but not both
                vol.Exclusive("current_mileage", "usage_metric"): vol.All(
                    vol.Coerce(int),
                    vol.Range(min=0),
                ),
                vol.Exclusive("current_hours", "usage_metric"): vol.All(
                    vol.Coerce(float),
                    vol.Range(min=0.0),
                ),
            }
        ),
    )

    # --- Sservice: set_hours ---
    async def handle_set_hours(call: ServiceCall) -> None:
        """Update the current operating hours of a vehicle/equipment."""
        vehicle_id = call.data["vehicle_id"]
        new_hours = call.data["current_hours"]

        if vehicle_id not in fleet:
            _LOGGER.error("Vehicle ID %s not found in fleet", vehicle_id)
            return

        vehicle = fleet[vehicle_id]
        vehicle.current_hours = new_hours
        
        # Save changes to persistence store
        await store.async_save(fleet)

        # Update the live sensor entity state if it exists
        runtime = hass.data[DOMAIN][entry.entry_id]
        if "entities" in runtime and vehicle_id in runtime["entities"]:
            entity = runtime["entities"][vehicle_id]
            entity.async_write_ha_state()

        _LOGGER.info("Updated hours for %s to %s hrs", vehicle.name, new_hours)

    hass.services.async_register(
        DOMAIN,
        "set_hours",
        handle_set_hours,
        schema=vol.Schema(
            {
                vol.Required("vehicle_id"): cv.string,
                vol.Required("current_hours"): vol.All(vol.Coerce(float), vol.Range(min=0.0)),
            }
        ),
    )

    # --- Service: set_mileage ---
    async def handle_set_mileage(call: ServiceCall) -> None:
        """Set the current mileage for a vehicle."""
        vehicle_id = call.data["vehicle_id"]
        if vehicle_id not in fleet:
            raise ValueError(f"Vehicle '{vehicle_id}' not found")

        fleet[vehicle_id].current_mileage = call.data["mileage"]
        await store.async_save(fleet)

        runtime = hass.data[DOMAIN][entry.entry_id]
        entity = runtime["entities"].get(vehicle_id)
        if entity:
            entity.async_write_ha_state()

    hass.services.async_register(
        DOMAIN,
        "set_mileage",
        handle_set_mileage,
        schema=vol.Schema(
            {
                vol.Required("vehicle_id"): str,
                vol.Required("mileage"): vol.All(
                    vol.Coerce(int),
                    vol.Range(min=0),
                ),
            }
        ),
    )

    # --- Service: add_maintenance_item ---
    async def handle_add_maintenance_item(call: ServiceCall) -> None:
        """Add a maintenance item to a specific vehicle."""
        vehicle_id = call.data["vehicle_id"]
        if vehicle_id not in fleet:
            raise ValueError(f"Vehicle '{vehicle_id}' not found")

        item = MaintenanceItem(
            name=call.data["name"],
            due_soon_threshold=call.data["due_soon_threshold"],
            interval_distance=call.data.get("interval_distance"),
            interval_hours=call.data.get("interval_hours"),
            interval_months=call.data.get("interval_months"),
        )

        fleet[vehicle_id].maintenance_items[item.item_id] = item
        await store.async_save(fleet)

        runtime = hass.data[DOMAIN][entry.entry_id]
        entity = runtime["entities"].get(vehicle_id)
        if entity:
            entity.async_write_ha_state()

    hass.services.async_register(
        DOMAIN,
        "add_maintenance_item",
        handle_add_maintenance_item,
        schema=vol.Schema(
            {
                vol.Required("vehicle_id"): str,
                vol.Required("name"): str,
                vol.Optional("due_soon_threshold", default=0.0): vol.Coerce(float),
                vol.Exclusive("interval_distance", "interval"): int,
                vol.Exclusive("interval_hours", "interval"): int,
                vol.Exclusive("interval_months", "interval"): int,

            }
        ),
    )

    # --- Service: add_service_record ---
    async def handle_add_service_record(call: ServiceCall) -> None:
        """Add a completed service record to a specific vehicle."""
        vehicle_id = call.data["vehicle_id"]
        if vehicle_id not in fleet:
            raise ValueError(f"Vehicle '{vehicle_id}' not found")

        record = ServiceRecord(
            date=call.data["date"],
            mileage=call.data["mileage"],
            service_type=call.data["service_type"],
            notes=call.data["notes"],
            cost=call.data["cost"],
        )

        fleet[vehicle_id].service_records[record.record_id] = record
        await store.async_save(fleet)

        runtime = hass.data[DOMAIN][entry.entry_id]
        entity = runtime["entities"].get(vehicle_id)
        if entity:
            entity.async_write_ha_state()

    hass.services.async_register(
        DOMAIN,
        "add_service_record",
        handle_add_service_record,
        schema=vol.Schema(
            {
                vol.Required("vehicle_id"): str,
                vol.Required("date"): str,
                vol.Required("mileage"): vol.All(
                    vol.Coerce(int),
                    vol.Range(min=0),
                ),
                vol.Required("service_type"): str,
                vol.Required("notes"): str,
                vol.Required("cost"): vol.All(
                    vol.Coerce(float),
                    vol.Range(min=0),
                ),
            }
        ),
    )

    # --- Service: delete_vehicle ---
    async def handle_delete_vehicle(call: ServiceCall) -> None:
        """Remove a vehicle and all its data from the fleet."""
        vehicle_id = call.data["vehicle_id"]
        if vehicle_id not in fleet:
            raise ValueError(f"Vehicle '{vehicle_id}' not found")

        del fleet[vehicle_id]
        await store.async_save(fleet)

        runtime = hass.data[DOMAIN][entry.entry_id]
        entity = runtime["entities"].pop(vehicle_id, None)
        if entity:
            await entity.async_remove()

    hass.services.async_register(
        DOMAIN,
        "delete_vehicle",
        handle_delete_vehicle,
        schema=vol.Schema(
            {
                vol.Required("vehicle_id"): str,
            }
        ),
    )

    return True