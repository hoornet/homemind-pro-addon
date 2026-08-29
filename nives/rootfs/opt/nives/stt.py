"""Speech-to-text platform for Nives.

Registers Nives as a Speech-to-text option in the Assist pipeline, so the
add-on can do the listening as well as the thinking. Audio is streamed here as
raw PCM by Assist, wrapped in a WAV container, and posted to the Nives server's
transcription endpoint.

The entity exists only when the server reports transcription is switched on
(see async_setup_entry in __init__.py) — an entity that answered every request
with "not enabled" would still show up as a pipeline choice, which is worse
than not being there.
"""

from __future__ import annotations

import logging
import struct
from collections.abc import AsyncIterable

import aiohttp

from homeassistant.components import stt
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from . import NivesConfigEntry
from .const import (
    API_STT_ENDPOINT,
    LANGUAGE_ALIASES,
    STT_LANGUAGES,
    STT_MAX_AUDIO_BYTES,
    STT_TIMEOUT,
)

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: NivesConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the Nives speech-to-text entity from a config entry."""
    async_add_entities([NivesSttEntity(hass, config_entry)])


def _wav_container(pcm: bytes, sample_rate: int, channels: int, bits: int) -> bytes:
    """Wrap raw PCM in a minimal WAV container.

    Assist hands us headerless PCM frames while the transcription endpoint
    wants a file it can identify, so the 44-byte RIFF header is the whole
    bridge between them. Built by hand rather than with `wave` so nothing
    touches the filesystem or blocks the event loop.
    """
    block_align = channels * bits // 8
    byte_rate = sample_rate * block_align
    return b"".join(
        (
            b"RIFF",
            struct.pack("<I", 36 + len(pcm)),
            b"WAVEfmt ",
            struct.pack("<IHHIIHH", 16, 1, channels, sample_rate, byte_rate, block_align, bits),
            b"data",
            struct.pack("<I", len(pcm)),
            pcm,
        )
    )


class NivesSttEntity(stt.SpeechToTextEntity):
    """Nives speech-to-text provider."""

    _attr_has_entity_name = True
    _attr_name = "Speech-to-text"

    def __init__(self, hass: HomeAssistant, entry: NivesConfigEntry) -> None:
        """Initialize the speech-to-text entity."""
        self.hass = hass
        self.entry = entry
        self._session = async_get_clientsession(hass)

        self._attr_unique_id = f"{entry.entry_id}_stt"
        self._attr_device_info = dr.DeviceInfo(
            identifiers={(entry.domain, entry.entry_id)},
            name="Nives",
            manufacturer="Nives",
            model="AI Assistant",
            entry_type=dr.DeviceEntryType.SERVICE,
        )

    @property
    def supported_languages(self) -> list[str]:
        """Languages the transcription model understands."""
        return STT_LANGUAGES

    @property
    def supported_formats(self) -> list[stt.AudioFormats]:
        """Audio formats accepted from the pipeline."""
        return [stt.AudioFormats.WAV]

    @property
    def supported_codecs(self) -> list[stt.AudioCodecs]:
        """Audio codecs accepted from the pipeline."""
        return [stt.AudioCodecs.PCM]

    @property
    def supported_bit_rates(self) -> list[stt.AudioBitRates]:
        """Bit rates accepted from the pipeline."""
        return [stt.AudioBitRates.BITRATE_16]

    @property
    def supported_sample_rates(self) -> list[stt.AudioSampleRates]:
        """Sample rates accepted from the pipeline."""
        return [stt.AudioSampleRates.SAMPLERATE_16000]

    @property
    def supported_channels(self) -> list[stt.AudioChannels]:
        """Channel counts accepted from the pipeline."""
        return [stt.AudioChannels.CHANNEL_MONO]

    async def async_process_audio_stream(
        self, metadata: stt.SpeechMetadata, stream: AsyncIterable[bytes]
    ) -> stt.SpeechResult:
        """Transcribe one utterance."""
        language = _base_language(metadata.language)

        pcm = bytearray()
        async for chunk in stream:
            pcm.extend(chunk)
            if len(pcm) > STT_MAX_AUDIO_BYTES:
                # Stop reading rather than drain: the pipeline moves on to
                # intent recognition as soon as this returns and never waits
                # on the audio stream, so continuing to read a microphone that
                # will not stop would block here for as long as it kept going.
                _LOGGER.warning(
                    "Recording exceeded %d bytes; not transcribing",
                    STT_MAX_AUDIO_BYTES,
                )
                return stt.SpeechResult(None, stt.SpeechResultState.ERROR)

        if not pcm:
            # Empty, not broken: an ERROR here surfaces as "speech-to-text
            # failed", where the pipeline's own "didn't catch that" is both
            # truer and friendlier.
            _LOGGER.debug("Empty recording; nothing to transcribe")
            return stt.SpeechResult("", stt.SpeechResultState.SUCCESS)

        audio = _wav_container(
            bytes(pcm),
            int(metadata.sample_rate),
            int(metadata.channel),
            int(metadata.bit_rate),
        )

        try:
            text = await self._transcribe(audio, language)
        except (aiohttp.ClientError, TimeoutError) as err:
            _LOGGER.error("Couldn't reach the Nives server to transcribe: %s", err)
            return stt.SpeechResult(None, stt.SpeechResultState.ERROR)

        if text is None:
            return stt.SpeechResult(None, stt.SpeechResultState.ERROR)
        return stt.SpeechResult(text, stt.SpeechResultState.SUCCESS)

    async def _transcribe(self, audio: bytes, language: str | None) -> str | None:
        """POST the audio to the Nives server. None means "no usable text"."""
        data = self.entry.runtime_data
        url = f"{data.api_url}{API_STT_ENDPOINT}"

        form = aiohttp.FormData()
        form.add_field("audio", audio, filename="speech.wav", content_type="audio/wav")
        # Telling the model which language to expect is what makes short
        # commands work. Left to auto-detect, a two-second utterance carries
        # too little signal and a Slovenian request comes back as Croatian.
        if language:
            form.add_field("language", language)

        headers: dict[str, str] = {}
        if data.api_token:
            headers["Authorization"] = f"Bearer {data.api_token}"

        async with self._session.post(
            url,
            data=form,
            headers=headers,
            timeout=aiohttp.ClientTimeout(total=STT_TIMEOUT),
        ) as response:
            if response.status != 200:
                body = await response.text()
                _LOGGER.error(
                    "Nives transcription failed: HTTP %s — %s",
                    response.status,
                    body[:200],
                )
                return None
            payload = await response.json()

        if not isinstance(payload, dict):
            _LOGGER.error("Unexpected transcription response shape: %r", payload)
            return None
        text = (payload.get("text") or "").strip()
        if not text:
            _LOGGER.debug("Transcription came back empty")
            return None
        return text


def _base_language(language: str | None) -> str | None:
    """Reduce a pipeline language tag to the bare code the model expects.

    Assist speaks in tags like "sl-SI" or "en-GB"; the transcription API wants
    "sl" or "en". A few of Home Assistant's codes are not the model's: Home
    Assistant offers Norwegian as "nb" (Bokmål), which the model only knows as
    plain "no".
    """
    if not language:
        return None
    code = language.replace("_", "-").split("-", 1)[0].lower()
    return LANGUAGE_ALIASES.get(code, code) or None
