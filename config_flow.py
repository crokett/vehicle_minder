"""Config flow for the vehicle_minder integration."""

import logging
from typing import Any

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.config_entries import ConfigFlowResult
from homeassistant.const import UnitOfLength

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)


class VehicleConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for vehicle_minder."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Collect distance unit preference and create the entry."""
        # Enforce single config entry — abort if the integration is already set up.
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()

        if user_input is not None:
            return self.async_create_entry(
                title="Vehicle Minder",
                data={
                    "distance_unit": user_input["distance_unit"],
                  
                },
            )

        data_schema = vol.Schema(
            {
                vol.Required(
                    "distance_unit",
                    default=UnitOfLength.MILES,
                ): vol.In(
                    {
                        UnitOfLength.KILOMETERS: "Kilometers",
                        UnitOfLength.MILES: "Miles (Default)",
                    }
                ),
            }
        )

        return self.async_show_form(
            step_id="user",
            data_schema=data_schema,
            errors={},
        )
