"""Sensor platform for the vehicle_minder integration."""

from __future__ import annotations

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .models import Vehicle
from typing import Any


class VehicleSensor(SensorEntity):
    """A sensor entity representing a single vehicle."""

    _attr_has_entity_name = True
    _attr_name = None # prevent duplicate car name from showing in dashboard and on card

    def __init__(self, vehicle: Vehicle) -> None:
        """Initialize the sensor."""
        self._vehicle = vehicle
        self._attr_unique_id = vehicle.vehicle_id


    @property
    def device_info(self) -> DeviceInfo:
        """Return information about the vehicle device."""
        return DeviceInfo(
            identifiers={(DOMAIN, self._vehicle.vehicle_id)},
            name=self._vehicle.name,
            manufacturer=self._vehicle.make,
            model=self._vehicle.model,
        )

    @property
    def native_value(self) -> int:
        """Return the current vehicle mileage."""
        return self._vehicle.current_mileage

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return entity specific state attributes."""
        # 1. Safely retrieve service records from the vehicle object
        raw_records = getattr(self._vehicle, "service_records", None)

         # 2. Convert raw_records into a clean list
        if raw_records is None:
             service_records_list = []
        elif isinstance(raw_records, dict):
            service_records_list = [
            r.to_dict() if hasattr(r, "to_dict") else r
            for r in raw_records.values()
        ]
        elif isinstance(raw_records, list):
            service_records_list = [
            r.to_dict() if hasattr(r, "to_dict") else r
            for r in raw_records
        ]
        else:
            service_records_list = []

    # 3. Return attributes dictionary guaranteed to never return None for collections
        return {
        "make": getattr(self._vehicle, "make", ""),
        "model": getattr(self._vehicle, "model", ""),
        "year": getattr(self._vehicle, "year", ""),
        "vehicle_id": getattr(self._vehicle, "vehicle_id", ""),
        "vehicle_type": getattr(self._vehicle, "vehicle_type", ""),
        "use_hours": getattr(self._vehicle, "use_hours", False),
        "current_mileage": getattr(self._vehicle, "current_mileage", 0),
        "current_hours": getattr(self._vehicle, "current_hours", 0.0),
        "vin": getattr(self._vehicle, "vin", ""),
        "service_records": service_records_list,
        "maintenance_items": [
            item.to_dict() if hasattr(item, "to_dict") else item
            for item in (getattr(self._vehicle, "maintenance_items", {}) or {}).values()
        ],
        "maintenance_status": (
            self._vehicle.maintenance_status()
            if hasattr(self._vehicle, "maintenance_status") and callable(self._vehicle.maintenance_status)
            else {}
        ) or {},
    }


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Vehicle Minder sensors from a config entry."""
    fleet: dict[str, Vehicle] = entry.runtime_data

    entities = {
        vehicle.vehicle_id: VehicleSensor(vehicle)
        for vehicle in fleet.values()
    }

    async_add_entities(list(entities.values()))

    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][entry.entry_id] = {
        "add_entities": async_add_entities,
        "entities": entities,
    }