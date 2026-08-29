"""Nives integration for Home Assistant."""
from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass, field
from datetime import timedelta
from pathlib import Path

import aiohttp

from homeassistant.components import persistent_notification
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.loader import async_get_integration

from .const import (
    API_HEALTH_ENDPOINT,
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

# How often to re-ask the server whether it is set up to transcribe. Two
# minutes keeps a toggled setting — and a server that was still starting when
# Home Assistant loaded this entry — from stranding the user for long, at the
# cost of one small request against a service running on the same machine.
CAPABILITY_CHECK_INTERVAL = timedelta(minutes=2)


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


async def _async_setup_capability_watch(
    hass: HomeAssistant, entry: NivesConfigEntry
) -> None:
    """Reload the entry when the server's transcription setting changes.

    Which platforms this entry runs is decided once, at setup, from a server
    that may not have been up yet — and the user can switch transcription on or
    off in the add-on at any time, which restarts the add-on but never touches
    this config entry. Without this watch both directions strand the user:
    switching on does nothing until a manual reload, switching off leaves a
    speech-to-text entity selected in their pipeline that answers every
    utterance with an error, and a server that was still booting when Home
    Assistant started loses the entity for the whole session.
    """

    async def _async_check(_now=None) -> None:
        data = entry.runtime_data
        if (await _async_stt_enabled(hass, data.api_url)) == (
            Platform.STT in data.platforms
        ):
            return
        _LOGGER.info("Nives transcription availability changed; reloading")
        hass.config_entries.async_schedule_reload(entry.entry_id)

    entry.async_on_unload(
        async_track_time_interval(hass, _async_check, CAPABILITY_CHECK_INTERVAL)
    )


def _get_platforms(stt_enabled: bool = False) -> list[Platform]:
    """Platforms to set up. AI Task is added only on HA versions that have it
    (2025.7+), so older cores keep the conversation agent and just skip it.
    Speech-to-text is added only when the server is actually configured to
    transcribe (see _async_stt_enabled)."""
    platforms: list[Platform] = [Platform.CONVERSATION]
    ai_task_platform = getattr(Platform, "AI_TASK", None)
    if ai_task_platform is not None:
        try:
            from homeassistant.components import ai_task  # noqa: F401

            platforms.append(ai_task_platform)
        except ImportError:
            _LOGGER.info("ai_task unavailable on this HA version; skipping AI Task entity")
    if stt_enabled:
        platforms.append(Platform.STT)
    return platforms


async def _async_stt_enabled(hass: HomeAssistant, api_url: str) -> bool:
    """Ask the server whether it is set up to transcribe.

    Health is public, so this needs no token. Any failure answers "no": the
    add-on has to be reachable for the integration to work at all, and a
    speech-to-text entity that cannot transcribe is worse than none, because
    it still offers itself as a choice in the Assist pipeline.
    """
    session = async_get_clientsession(hass)
    try:
        async with session.get(
            f"{api_url}{API_HEALTH_ENDPOINT}",
            timeout=aiohttp.ClientTimeout(total=10),
        ) as response:
            if response.status != 200:
                return False
            body = await response.json()
    except (aiohttp.ClientError, TimeoutError, ValueError) as err:
        _LOGGER.debug("Could not read server capabilities: %s", err)
        return False
    return bool(body.get("stt"))


@dataclass
class NivesData:
    """Runtime data for a Nives config entry."""

    api_url: str
    api_token: str | None
    user_id: str
    # The platforms this entry actually set up. Recorded rather than recomputed
    # so unload takes down exactly what setup brought up, even if the server's
    # answer about transcription has changed in between.
    platforms: list[Platform] = field(default_factory=list)


type NivesConfigEntry = ConfigEntry[NivesData]


async def async_setup_entry(hass: HomeAssistant, entry: NivesConfigEntry) -> bool:
    """Set up Nives from a config entry."""
    api_url = entry.data.get(CONF_API_URL, "").rstrip("/")
    platforms = _get_platforms(await _async_stt_enabled(hass, api_url))
    entry.runtime_data = NivesData(
        api_url=api_url,
        api_token=await _async_resolve_token(hass, entry),
        user_id=entry.data.get(CONF_USER_ID, DEFAULT_USER_ID),
        platforms=platforms,
    )
    await hass.config_entries.async_forward_entry_setups(entry, platforms)
    entry.async_on_unload(entry.add_update_listener(_async_update_listener))
    await _async_setup_update_watch(hass, entry)
    await _async_setup_capability_watch(hass, entry)
    return True


async def _async_update_listener(hass: HomeAssistant, entry: NivesConfigEntry) -> None:
    """Reload the config entry when options change."""
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: NivesConfigEntry) -> bool:
    """Unload a config entry."""
    platforms = getattr(entry.runtime_data, "platforms", None) or _get_platforms()
    return await hass.config_entries.async_unload_platforms(entry, platforms)
