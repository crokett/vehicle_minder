"""Register the Vehicle Minder frontend panel with Home Assistant."""

from __future__ import annotations

from pathlib import Path

from homeassistant.components.frontend import async_register_built_in_panel
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant

from .const import DOMAIN

_WWW_DIR = Path(__file__).parent / "www"
_PANEL_URL = f"/local/{DOMAIN}/vehicle-minder-panel.js"


async def async_setup_panel(hass: HomeAssistant) -> None:
    """Serve the panel JS and register the sidebar panel."""

    # Serve the www/ directory under /local/vehicle_minder/
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                url_path=f"/local/{DOMAIN}",
                path=str(_WWW_DIR),
                cache_headers=False,
            )
        ]
    )

    # Register the full-page panel accessible from the HA sidebar
    async_register_built_in_panel(
        hass,
        component_name="custom",
        sidebar_title="Vehicle Minder",
        sidebar_icon="mdi:car-wrench",
        frontend_url_path=DOMAIN,
        config={
            "_panel_custom": {
                "name": "vehicle-minder-panel",
                "module_url": _PANEL_URL,
                "embed_iframe": False,
                "trust_external": False,
            }
        },
        require_admin=False,
    )
