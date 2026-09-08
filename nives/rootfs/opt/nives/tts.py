"""Text-to-speech platform for Nives.

Registers Nives as a Text-to-speech option in the Assist pipeline, so the
add-on can do the speaking as well as the thinking and the listening. Text is
posted to the Nives server's synthesis endpoint, which returns MP3.

The entity exists only when the server reports synthesis is switched on (see
async_setup_entry in __init__.py) — an entity that answered every request with
"not enabled" would still show up as a pipeline choice, which is worse than not
being there at all.

A voice speaks one language. When the server tells us which one, that is the
only language this entity advertises: offering a Slovene voice for an English
pipeline produces English words read with Slovene phonetics, which sounds
broken in a way that is hard to diagnose from the Assist side.
"""

from __future__ import annotations

import logging

import aiohttp

from homeassistant.components import tts
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from . import NivesConfigEntry
from .const import (
    API_TTS_ENDPOINT,
    TTS_DEFAULT_LANGUAGE,
    TTS_LANGUAGES,
    TTS_MAX_CHARS,
    TTS_TIMEOUT,
)

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: NivesConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the Nives text-to-speech entity from a config entry."""
    async_add_entities([NivesTtsEntity(hass, config_entry)])


class NivesTtsEntity(tts.TextToSpeechEntity):
    """Nives text-to-speech provider."""

    _attr_has_entity_name = True
    _attr_name = "Text-to-speech"

    def __init__(self, hass: HomeAssistant, entry: NivesConfigEntry) -> None:
        """Initialize the text-to-speech entity."""
        self.hass = hass
        self.entry = entry
        self._session = async_get_clientsession(hass)

        self._attr_unique_id = f"{entry.entry_id}_tts"
        self._attr_device_info = dr.DeviceInfo(
            identifiers={(entry.domain, entry.entry_id)},
            name="Nives",
            manufacturer="Nives",
            model="AI Assistant",
            entry_type=dr.DeviceEntryType.SERVICE,
        )

    @property
    def supported_languages(self) -> list[str]:
        """Languages the configured voice can speak.

        Exactly one when the server names the voice's language, because that is
        the truth; the broader list only when it does not, so an unconfigured
        or older server still offers something usable rather than nothing.
        """
        language = self.entry.runtime_data.tts_language
        if language:
            return [language]
        return TTS_LANGUAGES

    @property
    def default_language(self) -> str:
        """Language used when the pipeline does not ask for one."""
        return self.entry.runtime_data.tts_language or TTS_DEFAULT_LANGUAGE

    async def async_get_tts_audio(
        self, message: str, language: str, options: dict | None = None
    ) -> tts.TtsAudioType:
        """Speak one reply. (None, None) means the pipeline stays silent."""
        text = (message or "").strip()
        if not text:
            _LOGGER.debug("Nothing to speak")
            return None, None

        if len(text) > TTS_MAX_CHARS:
            # Truncating would cut a sentence mid-word and bill for the part
            # nobody hears. A reply this long is a bug upstream, not something
            # to paper over quietly.
            _LOGGER.error(
                "Reply is %d characters, over the %d-character limit; not speaking it",
                len(text),
                TTS_MAX_CHARS,
            )
            return None, None

        data = self.entry.runtime_data
        url = f"{data.api_url}{API_TTS_ENDPOINT}"

        headers = {"Content-Type": "application/json"}
        if data.api_token:
            headers["Authorization"] = f"Bearer {data.api_token}"

        payload: dict[str, str] = {"text": text}
        if language:
            payload["language"] = language

        try:
            async with self._session.post(
                url,
                json=payload,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=TTS_TIMEOUT),
            ) as response:
                if response.status != 200:
                    body = await response.text()
                    _LOGGER.error(
                        "Nives synthesis failed: HTTP %s — %s",
                        response.status,
                        body[:200],
                    )
                    return None, None
                audio = await response.read()
        except (aiohttp.ClientError, TimeoutError) as err:
            _LOGGER.error("Couldn't reach the Nives server to speak: %s", err)
            return None, None

        if not audio:
            _LOGGER.error("Synthesis returned no audio")
            return None, None

        return "mp3", audio
