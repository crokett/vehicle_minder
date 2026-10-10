"""Persistent storage for the vehicle_minder integration."""

from __future__ import annotations

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .models import MaintenanceItem, ServiceRecord, Vehicle

STORAGE_VERSION = 1
STORAGE_KEY = "vehicle_minder"


class VehicleMinderStore:
    """Handle persistent storage of the Vehicle Minder fleet."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialize the store."""
        self._store = Store[dict](
            hass,
            STORAGE_VERSION,
            STORAGE_KEY,
        )

    async def async_load(self) -> dict[str, Vehicle]:
        """Load the fleet from persistent storage."""
        data = await self._store.async_load()

        if not data:
            return {}

        fleet: dict[str, Vehicle] = {}

        for vehicle_id, vehicle_data in data.get("vehicles", {}).items():
            maintenance_items = {
                item_id: MaintenanceItem(
                    item_id=item_data.get("item_id"),
                    name=item_data["name"],
                    interval_distance=item_data.get("interval_distance"),
                    interval_hours=item_data.get("interval_hours"),
                    interval_months=item_data.get("interval_months"),
                )
                for item_id, item_data in vehicle_data.get(
                    "maintenance_items", {}
                ).items()
            }

            service_records = {
                record_id: ServiceRecord(**record_data)
                for record_id, record_data in vehicle_data.get(
                    "service_records", {}
                ).items()
            }

            fleet[vehicle_id] = Vehicle(
                vehicle_id=vehicle_id,
                name=vehicle_data["name"],
                vehicle_type=vehicle_data["vehicle_type"],
                vin=vehicle_data.get("vin"),
                make=vehicle_data["make"],
                model=vehicle_data["model"],
                year=vehicle_data["year"],
                current_mileage=vehicle_data.get("current_mileage", 0),
                current_hours=vehicle_data.get("current_hours", 0),
                maintenance_items=maintenance_items,
                service_records=service_records,
            )

        return fleet

    async def async_save(self, fleet: dict[str, Vehicle]) -> None:
        """Save the fleet to persistent storage."""
        data = {
            "vehicles": {
                vehicle_id: vehicle.to_dict()
                for vehicle_id, vehicle in fleet.items()
            }
        }

        await self._store.async_save(data)