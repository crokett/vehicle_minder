"""The vehicle_minder integration."""

from __future__ import annotations

import voluptuous as vol
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv
from homeassistant.components.frontend import async_register_built_in_panel
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .models import MaintenanceItem, ServiceRecord, Vehicle
from .panel import async_setup_panel
from .storage import VehicleMinderStore

_PLATFORMS: list[Platform] = [Platform.SENSOR]

type VehicleMinderConfigEntry = ConfigEntry[dict[str, Vehicle]]


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the Vehicle Minder integration (panel registration)."""
    await async_setup_panel(hass)
    return True

async def async_setup_entry(
    hass: HomeAssistant,
    entry: VehicleMinderConfigEntry,
) -> bool:
    """Set up the integration from a config entry."""

    store = VehicleMinderStore(hass)
    loaded_fleet = await store.async_load()

    # 1. Fallback for missing/deleted storage file
    raw_fleet = loaded_fleet if loaded_fleet is not None else {}

    # 2. Rehydrate raw JSON dicts into Vehicle instances
    fleet = {}
    for vehicle_id, vehicle_data in raw_fleet.items():
        if isinstance(vehicle_data, dict):
            fleet[vehicle_id] = (
                Vehicle.from_dict(vehicle_data)
                if hasattr(Vehicle, "from_dict")
                else vehicle_data
            )
        else:
            fleet[vehicle_id] = vehicle_data

    entry.runtime_data = fleet

    # 3. Register static HTTP path so the browser can load JS assets
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                url_path="/vehicle_minder_static",
                path=hass.config.path("custom_components/vehicle_minder/frontend"),
                cache_headers=False,
            )
        ]
    )


    # 4. Forward entity setups to platforms
    await hass.config_entries.async_forward_entry_setups(entry, _PLATFORMS)

   
   # --- Service: add_vehicle ---
    async def handle_add_vehicle(call: ServiceCall) -> None:
        """Add a new vehicle to the fleet."""
        from .sensor import VehicleSensor

        data = call.data
        vehicle = Vehicle(
            make=data["make"],
            model=data["model"],
            year=data["year"],
            name=data["name"],
            vehicle_type=data.get("vehicle_type", "car"),
            vin=data.get("vin"),
            current_mileage=data["current_mileage"],
        )

        # 1. Update in-memory fleet dictionary
        fleet[vehicle.vehicle_id] = vehicle

        # 2. Serialize fleet to raw dicts for JSON storage
        serializable_fleet = {}
        for v_id, v in fleet.items():
            if isinstance(v, dict):
                # Already a dict from JSON load
                serializable_fleet[v_id] = v
            elif hasattr(v, "to_dict"):
                # Vehicle object with to_dict method
                serializable_fleet[v_id] = v.to_dict()
            else:
                # Fallback object serialization
                serializable_fleet[v_id] = v.__dict__

        # 3. Save serialized dict to disk
        await store.async_save(serializable_fleet)

        # 4. Dynamically add the new sensor entity
        runtime = hass.data[DOMAIN][entry.entry_id]
        entity = VehicleSensor(vehicle)

        if isinstance(runtime, dict):
            if "entities" in runtime:
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
                vol.Required("current_mileage"): vol.All(
                    vol.Coerce(int),
                    vol.Range(min=0),
                )
            }
        ),
    )
    # --- Service: set_mileage ---
    async def handle_set_mileage(call) -> None:
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
    # --- Service: set_mileage ---

    # --- Service: add_maintenance_item ---
    async def handle_add_maintenance_item(call) -> None:
        """Add a maintenance item to a specific vehicle."""
        vehicle_id = call.data["vehicle_id"]

        if vehicle_id not in fleet:
            raise ValueError(f"Vehicle '{vehicle_id}' not found")

        item = MaintenanceItem(
            name=call.data["name"],
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
                vol.Exclusive("interval_distance", "interval"): int,
                vol.Exclusive("interval_hours", "interval"): int,
                vol.Exclusive("interval_months", "interval"): int,
            }
        ),
    )

    # --- Service: add_service_record ---
    async def handle_add_service_record(call) -> None:
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
    async def handle_delete_vehicle(call) -> None:
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