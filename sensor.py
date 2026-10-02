"""Sensor platform for the vehicle_minder integration."""

from __future__ import annotations

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .models import Vehicle


class VehicleSensor(SensorEntity):
    """A sensor entity representing a single vehicle."""

    _attr_has_entity_name = True

    def __init__(self, vehicle: Vehicle) -> None:
        """Initialize the sensor."""
        self._vehicle = vehicle
        self._attr_unique_id = vehicle.vehicle_id

    @property
    def name(self) -> str:
        """Return the vehicle's friendly name."""
        return self._vehicle.name

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
    def extra_state_attributes(self) -> dict:
        """Return vehicle details as extra state attributes."""
        return {
            "vehicle_type": self._vehicle.vehicle_type,
            "vin": self._vehicle.vin,
            "make": self._vehicle.make,
            "model": self._vehicle.model,
            "year": self._vehicle.year,
            "current_mileage": self._vehicle.current_mileage,
            "maintenance_items": [
                item.to_dict()
                for item in self._vehicle.maintenance_items.values()
            ],
            "service_records": [
                record.to_dict()
                for record in self._vehicle.service_records.values()
            ],
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