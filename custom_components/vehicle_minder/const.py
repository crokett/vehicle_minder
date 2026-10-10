"""Constants for the vehicle_minder integration."""
from homeassistant.const import Platform
DOMAIN = "vehicle_minder"
# Define the entity platforms used by Vehicle Minder (e.g. sensor.py)
PLATFORMS: list[Platform] = [
    Platform.SENSOR,
]