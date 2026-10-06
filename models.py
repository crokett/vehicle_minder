"""Models for the vehicle_minder integration."""

from __future__ import annotations

import uuid


class MaintenanceItem:
    """Represent a maintenance item for a vehicle."""

    def __init__(
        self,
        name: str,
        item_id: str | None = None,
        interval_distance: int | None = None,
        interval_hours: int | None = None,
        interval_months: int | None = None,
    ) -> None:
        """Initialize a maintenance item."""
        if (interval_distance is None) == (interval_hours is None):
            raise ValueError(
                "Exactly one of interval_distance or interval_hours must be provided"
            )

        self.item_id = item_id or f"item_{uuid.uuid4().hex[:8]}"
        self.name = name
        self.interval_distance = interval_distance
        self.interval_hours = interval_hours

    def to_dict(self) -> dict:
        """Convert the maintenance item to a dictionary."""
        return {
            "item_id": self.item_id,
            "name": self.name,
            "interval_distance": self.interval_distance,
            "interval_hours": self.interval_hours,
        }


class ServiceRecord:
    """Represent a completed service record."""

    def __init__(
        self,
        date: str,
        mileage: int,
        service_type: str,
        notes: str,
        cost: float,
        record_id: str | None = None,
    ) -> None:
        """Initialize a service record."""
        self.record_id = record_id or f"record_{uuid.uuid4().hex[:8]}"
        self.date = date
        self.mileage = mileage
        self.service_type = service_type
        self.notes = notes
        self.cost = cost

    def to_dict(self) -> dict:
        """Convert the service record to a dictionary."""
        return {
            "record_id": self.record_id,
            "date": self.date,
            "mileage": self.mileage,
            "service_type": self.service_type,
            "notes": self.notes,
            "cost": self.cost,
        }

class Vehicle:
    """Represent a vehicle."""

    def __init__(
        self,
        make: str,
        model: str,
        year: int,
        name: str,
        vehicle_type: str,
        vehicle_id: str | None = None,
        vin: str | None = None,
        current_mileage: int = 0,
        maintenance_items: dict[str, MaintenanceItem] | None = None,
        service_records: dict[str, ServiceRecord] | None = None,
    ) -> None:
        """Initialize a vehicle."""
        self.vehicle_id = vehicle_id or f"vehicle_{uuid.uuid4().hex[:8]}"
        self.name = name
        self.vehicle_type = vehicle_type
        self.vin = vin
        self.make = make
        self.model = model
        self.year = year
        self.current_mileage = current_mileage
        self.maintenance_items = maintenance_items or {}
        self.service_records = service_records or {}

    def to_dict(self) -> dict:
        """Convert the vehicle to a dictionary."""
        return {
            "vehicle_id": self.vehicle_id,
            "name": self.name,
            "vehicle_type": self.vehicle_type,
            "vin": self.vin,
            "make": self.make,
            "model": self.model,
            "year": self.year,
            "current_mileage": self.current_mileage,
            "maintenance_items": {
                item_id: item.to_dict()
                for item_id, item in self.maintenance_items.items()
            },
            "service_records": {
                record_id: record.to_dict()
                for record_id, record in self.service_records.items()
            },
        }