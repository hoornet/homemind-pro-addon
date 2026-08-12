"""Nives integration for Home Assistant."""
from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path

from homeassistant.components import persistent_notification
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.loader import async_get_integration

from .const import (
    CONF_API_TOKEN,
    CONF_API_URL,
    CONF_USER_ID,
    DEFAULT_USER_ID,
    DOMAIN,
    RESTART_ISSUE_ID,
    RESTART_NOTIFY_ID,
    TOKEN_ACK_RELPATH,
    TOKEN_FILE_RELPATH,
)

_LOGGER = logging.getLogger(__name__)

# How often to compare the integration files on disk against the version Home
# Assistant is actually running. The add-on overwrites the files while Core
# keeps running the old code, so this is the only way the running side ever
# notices. Five minutes keeps the repair reasonably prompt after an add-on
# update without measurable cost (one tiny file read).
UPDATE_CHECK_INTERVAL = timedelta(minutes=5)


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


def _read_disk_version() -> str | None:
    """Version of the integration files currently on disk. Blocking — call in
    an executor. The add-on replaces these files in place, so this path stays
    valid even after an update has been copied underneath the running code."""
    try:
        manifest = Path(__file__).with_name("manifest.json")
        version = json.loads(manifest.read_text(encoding="utf-8")).get("version")
        return str(version) if version else None
    except (OSError, ValueError):
        return None


async def _async_setup_update_watch(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Raise a fixable "Restart required" repair when the add-on has installed
    newer integration files than the ones Home Assistant is running.

    The loader cached our manifest when this code was imported at Core start,
    so integration.version is the version of the *running* code no matter what
    the add-on has written to disk since — including across config-entry
    reloads, which re-run setup but never re-import modules.
    """
    integration = await async_get_integration(hass, DOMAIN)
    running_version = str(integration.version)

    async def _async_check(_now=None) -> None:
        disk_version = await hass.async_add_executor_job(_read_disk_version)
        if not disk_version or disk_version == running_version:
            # Also covers an add-on rollback: no restart gains anything.
            ir.async_delete_issue(hass, DOMAIN, RESTART_ISSUE_ID)
            return
        versions = {
            "installed_version": disk_version,
            "running_version": running_version,
        }
        ir.async_create_issue(
            hass,
            DOMAIN,
            RESTART_ISSUE_ID,
            is_fixable=True,
            severity=ir.IssueSeverity.WARNING,
            translation_key=RESTART_ISSUE_ID,
            translation_placeholders=versions,
            data=versions,
        )
        # One prompt, not two: the add-on's ha-restart service may already
        # have posted its notification for this same update.
        persistent_notification.async_dismiss(hass, RESTART_NOTIFY_ID)

    entry.async_on_unload(
        async_track_time_interval(hass, _async_check, UPDATE_CHECK_INTERVAL)
    )
    hass.async_create_task(_async_check())


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
    await _async_setup_update_watch(hass, entry)
    return True


async def _async_update_listener(hass: HomeAssistant, entry: NivesConfigEntry) -> None:
    """Reload the config entry when options change."""
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: NivesConfigEntry) -> bool:
    """Unload a config entry."""
    return await hass.config_entries.async_unload_platforms(entry, _get_platforms())
