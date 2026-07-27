"""Nives integration for Home Assistant."""
from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant

from .const import (
    CONF_API_TOKEN,
    CONF_API_URL,
    CONF_USER_ID,
    DEFAULT_USER_ID,
    TOKEN_ACK_RELPATH,
    TOKEN_FILE_RELPATH,
)

_LOGGER = logging.getLogger(__name__)


def _read_token_file(path: str) -> str | None:
    """Read the token the add-on left for us. Blocking — call in an executor."""
    try:
        with open(path, encoding="utf-8") as handle:
            return handle.read().strip() or None
    except FileNotFoundError:
        return None
    except OSError as err:
        _LOGGER.warning("Could not read the Nives API token at %s: %s", path, err)
        return None


def _write_token_ack(path: str, token: str) -> None:
    """Tell the add-on we read its token. Blocking — call in an executor."""
    try:
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(hashlib.sha256(token.encode()).hexdigest())
    except OSError as err:
        # Not fatal: the add-on simply keeps auth switched off.
        _LOGGER.warning("Could not confirm the Nives API token at %s: %s", path, err)


async def _async_resolve_token(
    hass: HomeAssistant, entry: ConfigEntry
) -> str | None:
    """Resolve the API token for this entry.

    The file the add-on writes wins over anything stored in the entry, so
    rotating the token only takes a restart. The entry value remains the
    fallback for setups where the integration talks to a Nives server it does
    not share a filesystem with (manual install against a remote add-on).
    """
    token = await hass.async_add_executor_job(
        _read_token_file, hass.config.path(TOKEN_FILE_RELPATH)
    )
    if token:
        await hass.async_add_executor_job(
            _write_token_ack, hass.config.path(TOKEN_ACK_RELPATH), token
        )
        _LOGGER.info("Using the Nives API token handed over by the add-on")
        return token

    entry_token = entry.data.get(CONF_API_TOKEN, "").strip() or None
    _LOGGER.info(
        "No API token file from the add-on; using the %s",
        "token stored in the config entry" if entry_token else "API without a token",
    )
    return entry_token


def _get_platforms() -> list[Platform]:
    """Platforms to set up. AI Task is added only on HA versions that have it
    (2025.7+), so older cores keep the conversation agent and just skip it."""
    platforms: list[Platform] = [Platform.CONVERSATION]
    ai_task_platform = getattr(Platform, "AI_TASK", None)
    if ai_task_platform is not None:
        try:
            from homeassistant.components import ai_task  # noqa: F401

            platforms.append(ai_task_platform)
        except ImportError:
            _LOGGER.info("ai_task unavailable on this HA version; skipping AI Task entity")
    return platforms


@dataclass
class NivesData:
    """Runtime data for a Nives config entry."""

    api_url: str
    api_token: str | None
    user_id: str


type NivesConfigEntry = ConfigEntry[NivesData]


async def async_setup_entry(hass: HomeAssistant, entry: NivesConfigEntry) -> bool:
    """Set up Nives from a config entry."""
    entry.runtime_data = NivesData(
        api_url=entry.data.get(CONF_API_URL, "").rstrip("/"),
        api_token=await _async_resolve_token(hass, entry),
        user_id=entry.data.get(CONF_USER_ID, DEFAULT_USER_ID),
    )
    await hass.config_entries.async_forward_entry_setups(entry, _get_platforms())
    entry.async_on_unload(entry.add_update_listener(_async_update_listener))
    return True


async def _async_update_listener(hass: HomeAssistant, entry: NivesConfigEntry) -> None:
    """Reload the config entry when options change."""
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: NivesConfigEntry) -> bool:
    """Unload a config entry."""
    return await hass.config_entries.async_unload_platforms(entry, _get_platforms())
