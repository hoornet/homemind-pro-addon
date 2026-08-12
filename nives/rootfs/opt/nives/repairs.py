"""Repairs platform: the one-click "Restart required" fix.

When the add-on copies updated integration files into /config, the running
integration raises a fixable issue in Settings → Repairs (see __init__.py).
This flow is what the Submit button runs: it asks Home Assistant to restart
itself. Core initiating its own restart is the crucial difference from the
add-on requesting one through the Supervisor proxy — the proxy path is what
produced the 504-then-double-restart of issue #50. The restart only ever
happens here, on the user's explicit click.
"""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components.repairs import RepairsFlow
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResult


class RestartRequiredFixFlow(RepairsFlow):
    """Confirm, then restart Home Assistant."""

    def __init__(self, data: dict[str, Any] | None) -> None:
        self._placeholders = {
            key: str(value) for key, value in (data or {}).items()
        }

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """First step — go straight to the confirmation form."""
        return await self.async_step_confirm()

    async def async_step_confirm(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Show the confirmation form; on submit, restart Home Assistant."""
        if user_input is not None:
            await self.hass.services.async_call("homeassistant", "restart")
            return self.async_create_entry(title="", data={})
        return self.async_show_form(
            step_id="confirm",
            data_schema=vol.Schema({}),
            description_placeholders=self._placeholders,
        )


async def async_create_fix_flow(
    hass: HomeAssistant, issue_id: str, data: dict[str, Any] | None
) -> RepairsFlow:
    """Create the fix flow for our restart_required issue."""
    return RestartRequiredFixFlow(data)
