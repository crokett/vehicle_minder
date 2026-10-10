"""Register the Vehicle Minder frontend panel with Home Assistant."""

from __future__ import annotations

from pathlib import Path
from homeassistant.components import frontend
from homeassistant.core import HomeAssistant

from .const import DOMAIN

# Get absolute path to custom_components/vehicle_minder/frontend/
FRONTEND_DIR = Path(__file__).parent / "frontend"


async def async_setup_panel(hass: HomeAssistant) -> None:
    """Register static path and custom panel for Vehicle Minder."""

    # 1. Register static path pointing directly to local frontend directory
   # Guard static path registration to avoid aiohttp duplicate route errors
    if "vehicle_minder_static" not in hass.data.get("http_registered_static_paths", set()):
        await hass.http.async_register_static_paths(
            [
                frontend.StaticPathConfig(
                    url_path="/vehicle_minder_static",
                    path=str(FRONTEND_DIR),
                    cache_headers=False,
                )
            ]
        )
        hass.data.setdefault("http_registered_static_paths", set()).add("vehicle_minder_static")

    # 2. Register built-in custom panel using module_url
    if DOMAIN not in hass.data.get("frontend_panels", {}):
        frontend.async_register_built_in_panel(
            hass,
            component_name="custom",
            sidebar_title="Vehicle Minder",
            sidebar_icon="mdi:car-cog",
            frontend_url_path=DOMAIN,
            config={
                "_panel_custom": {
                    "name": "vehicle-minder-panel",
                    "embed_iframe": False,
                    "trust_external": True,
                    "js_url": "/vehicle_minder_static/vehicle-minder-panel.js",
                }
            },
            require_admin=False,
        )