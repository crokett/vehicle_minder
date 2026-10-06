"""Models for the vehicle_minder integration."""

from __future__ import annotations

import uuid
from datetime import date as date_type
from dateutil.relativedelta import relativedelta


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
        """Initialize a maintenance item.

        Exactly one of interval_distance, interval_hours, or interval_months
        must be provided.
        """
        provided = sum(
            x is not None
            for x in (interval_distance, interval_hours, interval_months)
        )
        if provided != 1:
            raise ValueError(
                "Exactly one of interval_distance, interval_hours, or "
                "interval_months must be provided"
            )

        self.item_id = item_id or f"item_{uuid.uuid4().hex[:8]}"
        self.name = name
        self.interval_distance = interval_distance
        self.interval_hours = interval_hours
        self.interval_months = interval_months

    def to_dict(self) -> dict:
        """Convert the maintenance item to a dictionary."""
        return {
            "item_id": self.item_id,
            "name": self.name,
            "interval_distance": self.interval_distance,
            "interval_hours": self.interval_hours,
            "interval_months": self.interval_months,
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
        current_hours: float = 0,
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
        self.current_hours = current_hours
        self.maintenance_items = maintenance_items or {}
        self.service_records = service_records or {}

    # ------------------------------------------------------------------
    # Maintenance status helpers
    # ------------------------------------------------------------------

    def _last_service_for(self, item: MaintenanceItem) -> ServiceRecord | None:
        """Return the most recent service record whose type matches the item name."""
        matches = [
            r for r in self.service_records.values()
            if r.service_type.lower() == item.name.lower()
        ]
        if not matches:
            return None
        return max(matches, key=lambda r: r.date)

    def maintenance_status(self) -> list[dict]:
        """Return a status entry for every maintenance item.

        Each entry is a dict with keys:
            item_id, name, interval_type, interval_value,
            last_service_date, last_service_mileage,
            due_at, current_value, overdue (bool), overdue_by
        """
        today = date_type.today()
        statuses = []

        for item in self.maintenance_items.values():
            last = self._last_service_for(item)
            entry: dict = {
                "item_id": item.item_id,
                "name": item.name,
                "last_service_date": last.date if last else None,
                "last_service_mileage": last.mileage if last else None,
                "overdue": False,
                "overdue_by": None,
                "due_at": None,
                "current_value": None,
                "interval_type": None,
                "interval_value": None,
            }

            if item.interval_distance is not None:
                entry["interval_type"] = "distance"
                entry["interval_value"] = item.interval_distance
                last_mileage = last.mileage if last else 0
                due_at = last_mileage + item.interval_distance
                overdue_by = self.current_mileage - due_at
                entry["due_at"] = due_at
                entry["current_value"] = self.current_mileage
                entry["overdue"] = overdue_by > 0
                entry["overdue_by"] = max(overdue_by, 0)

            elif item.interval_hours is not None:
                entry["interval_type"] = "hours"
                entry["interval_value"] = item.interval_hours
                last_hours = 0.0
                # Use the mileage field of the service record as hours
                # when the vehicle tracks hours instead of miles.
                if last:
                    last_hours = float(last.mileage)
                due_at = last_hours + item.interval_hours
                overdue_by = self.current_hours - due_at
                entry["due_at"] = due_at
                entry["current_value"] = self.current_hours
                entry["overdue"] = overdue_by > 0
                entry["overdue_by"] = max(overdue_by, 0)

            elif item.interval_months is not None:
                entry["interval_type"] = "months"
                entry["interval_value"] = item.interval_months
                if last:
                    try:
                        last_date = date_type.fromisoformat(last.date)
                    except ValueError:
                        last_date = today
                    due_date = last_date + relativedelta(months=item.interval_months)
                else:
                    # Never serviced — treat as immediately due
                    due_date = today
                delta = today - due_date
                entry["due_at"] = due_date.isoformat()
                entry["current_value"] = today.isoformat()
                entry["overdue"] = delta.days > 0
                entry["overdue_by"] = max(delta.days, 0)

            statuses.append(entry)

        return statuses

    @property
    def overdue_count(self) -> int:
        """Return the number of overdue maintenance items."""
        return sum(1 for s in self.maintenance_status() if s["overdue"])

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
            "current_hours": self.current_hours,
            "maintenance_items": {
                item_id: item.to_dict()
                for item_id, item in self.maintenance_items.items()
            },
            "service_records": {
                record_id: record.to_dict()
                for record_id, record in self.service_records.items()
            },
        }