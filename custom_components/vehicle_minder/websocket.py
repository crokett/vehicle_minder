
"""WebSocket API for Vehicle Minder."""

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN


@callback
def async_register(hass: HomeAssistant) -> None:
    """Register Vehicle Minder WebSocket commands."""
    websocket_api.async_register_command(hass, websocket_get_config)


@callback
@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/get_config",
    }
)
def websocket_get_config(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return global Vehicle Minder configuration."""

    entries = hass.config_entries.async_entries(DOMAIN)

    if not entries:
        connection.send_result(msg["id"], {"distance_unit": "mi"})
        return

    entry = entries[0]

    entry_data = hass.data.get(DOMAIN, {}).get(entry.entry_id, {})

    distance_unit = entry_data.get(
        "distance_unit",
        entry.data.get("distance_unit", "mi"),
    )

    # Ensure the value sent to JavaScript is a string.
    if hasattr(distance_unit, "value"):
        distance_unit = distance_unit.value

    connection.send_result(
        msg["id"],
        {"distance_unit": str(distance_unit)},
    )
