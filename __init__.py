"""The vehicle_minder integration."""

from __future__ import annotations

import voluptuous as vol
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .models import MaintenanceItem, ServiceRecord, Vehicle
from .storage import VehicleMinderStore

_PLATFORMS: list[Platform] = [Platform.SENSOR]

type VehicleMinderConfigEntry = ConfigEntry[dict[str, Vehicle]]


async def async_setup_entry(
    hass: HomeAssistant,
    entry: VehicleMinderConfigEntry,
) -> bool:
    """Set up the integration from a config entry."""

    store = VehicleMinderStore(hass)
    fleet = await store.async_load()

    entry.runtime_data = fleet

    await hass.config_entries.async_forward_entry_setups(entry, _PLATFORMS)

    # --- Service: add_vehicle ---
    async def handle_add_vehicle(call) -> None:
        """Add a new vehicle to the fleet."""
        from .sensor import VehicleSensor

        vehicle = Vehicle(
            make=call.data["make"],
            model=call.data["model"],
            year=call.data["year"],
            name=call.data["name"],
            vehicle_type=call.data["vehicle_type"],
            vin=call.data.get("vin"),
            current_mileage=call.data["current_mileage"],
        )

        fleet[vehicle.vehicle_id] = vehicle
        await store.async_save(fleet)

        runtime = hass.data[DOMAIN][entry.entry_id]

        entity = VehicleSensor(vehicle)

        runtime["entities"][vehicle.vehicle_id] = entity
        runtime["add_entities"]([entity])

    hass.services.async_register(
        DOMAIN,
        "add_vehicle",
        handle_add_vehicle,
        schema=vol.Schema(
            {
                vol.Required("make"): str,
                vol.Required("model"): str,
                vol.Required("year"): int,
                vol.Required("name"): str,
                vol.Required("vehicle_type"): str,
                vol.Optional("vin"): str,
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
        )

        fleet[vehicle_id].maintenance_items[item.item_id] = item
        await store.async_save(fleet)

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
            description=call.data["description"],
        )

        fleet[vehicle_id].service_records[record.record_id] = record
        await store.async_save(fleet)

    hass.services.async_register(
        DOMAIN,
        "add_service_record",
        handle_add_service_record,
        schema=vol.Schema(
            {
                vol.Required("vehicle_id"): str,
                vol.Required("date"): str,
                vol.Required("mileage"): int,
                vol.Required("description"): str,
            }
        ),
    )

    return True