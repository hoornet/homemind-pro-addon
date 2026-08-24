"""Conversation agent for Nives."""

from __future__ import annotations

import logging
from typing import Literal

import aiohttp

from homeassistant.components.conversation import (
    ConversationEntity,
    ConversationEntityFeature,
    ConversationInput,
    ConversationResult,
)
from homeassistant.const import MATCH_ALL
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr, intent
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from . import NivesConfigEntry
from .const import (
    API_CHAT_ENDPOINT,
    DEFAULT_TIMEOUT,
)

_LOGGER = logging.getLogger(__name__)


class UsageLimitError(Exception):
    """Raised when the Nives server returns HTTP 402 (usage limit reached)."""


async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: NivesConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up conversation agent from a config entry."""
    async_add_entities([NivesConversationAgent(hass, config_entry)])


class NivesConversationAgent(ConversationEntity):
    """Nives conversation agent."""

    _attr_has_entity_name = True
    _attr_name = None  # entity name = device name
    _attr_supported_features = ConversationEntityFeature.CONTROL
    _attr_translation_key = "nives"

    def __init__(self, hass: HomeAssistant, entry: NivesConfigEntry) -> None:
        """Initialize the agent."""
        self.hass = hass
        self.entry = entry
        self._session = async_get_clientsession(hass)

        self._attr_unique_id = entry.entry_id
        self._attr_device_info = dr.DeviceInfo(
            identifiers={(entry.domain, entry.entry_id)},
            name="Nives",
            manufacturer="Nives",
            model="AI Assistant",
            entry_type=dr.DeviceEntryType.SERVICE,
        )

    @property
    def supported_languages(self) -> list[str] | Literal["*"]:
        """Return supported languages."""
        return MATCH_ALL

    async def async_process(self, user_input: ConversationInput) -> ConversationResult:
        """Process a conversation input and return a response."""
        _LOGGER.debug("Processing conversation input: %s", user_input.text)

        data = self.entry.runtime_data
        user_id = data.user_id
        if user_input.context and user_input.context.user_id:
            user_id = str(user_input.context.user_id)

        conversation_id = user_input.conversation_id

        # Voice satellites (Voice PE etc.) always carry a device_id; the
        # dashboard/app Assist dialog does not. The server uses this to switch
        # to its voice persona — shorter prompt, tighter token budget — so
        # spoken answers don't read like essays. (The legacy HACS integration
        # keyed on agent_id, but modern HA sets agent_id on every routed
        # request — that heuristic would mark ALL requests as voice.)
        is_voice = user_input.device_id is not None

        try:
            response_text = await self._call_api(
                api_url=data.api_url,
                api_token=data.api_token,
                message=user_input.text,
                user_id=user_id,
                conversation_id=conversation_id,
                language=user_input.language,
                is_voice=is_voice,
            )
        except UsageLimitError:
            _LOGGER.warning("Nives usage limit reached")
            await self.hass.services.async_call(
                "persistent_notification",
                "create",
                {
                    "title": "Nives — Out of balance",
                    "message": (
                        "Nives has used up its available balance. "
                        "Top up at nives.house — or, if you bring your own "
                        "key, add credit with your provider — and Nives "
                        "picks right back up."
                    ),
                    "notification_id": "nives_usage_limit",
                },
            )
            intent_response = intent.IntentResponse(language=user_input.language)
            intent_response.async_set_speech(
                "I'm out of balance. "
                "Please top up at nives.house and I'll pick right back up."
            )
            return ConversationResult(
                response=intent_response,
                conversation_id=conversation_id,
            )
        except aiohttp.ClientResponseError as err:
            # The server ANSWERED — with an error status. Saying "couldn't
            # reach the server" here sends people debugging connectivity when
            # the log already names the real problem (#63, and #1 before it).
            _LOGGER.error("Nives server returned an error: %s", err.message)
            intent_response = intent.IntentResponse(language=user_input.language)
            intent_response.async_set_error(
                intent.IntentResponseErrorCode.UNKNOWN,
                f"Sorry, the Nives server returned an error (HTTP {err.status}). "
                "The add-on log has the details.",
            )
            return ConversationResult(
                response=intent_response,
                conversation_id=conversation_id,
            )
        except (aiohttp.ClientError, TimeoutError) as err:
            _LOGGER.error("Error calling Nives API: %s", err)
            intent_response = intent.IntentResponse(language=user_input.language)
            intent_response.async_set_error(
                intent.IntentResponseErrorCode.UNKNOWN,
                "Sorry, I couldn't reach the Nives server right now.",
            )
            return ConversationResult(
                response=intent_response,
                conversation_id=conversation_id,
            )

        intent_response = intent.IntentResponse(language=user_input.language)
        intent_response.async_set_speech(response_text)

        # Reopen the satellite mic for a follow-up when we just asked a question,
        # mirroring Home Assistant's built-in agents (continue_conversation is True
        # when the response ends with a question mark — "?" or full-width "？").
        # Guarded: older HA versions' ConversationResult has no such field.
        continue_conversation = bool(response_text) and response_text.rstrip().endswith(
            ("?", "？")
        )
        if continue_conversation:
            try:
                return ConversationResult(
                    response=intent_response,
                    conversation_id=conversation_id,
                    continue_conversation=True,
                )
            except TypeError:
                _LOGGER.debug(
                    "ConversationResult has no continue_conversation field on this HA version"
                )

        return ConversationResult(
            response=intent_response,
            conversation_id=conversation_id,
        )

    async def _call_api(
        self,
        api_url: str,
        api_token: str | None,
        message: str,
        user_id: str,
        conversation_id: str | None,
        language: str | None = None,
        is_voice: bool = False,
    ) -> str:
        """Call the Nives API."""
        url = f"{api_url}{API_CHAT_ENDPOINT}"

        payload: dict = {
            "message": message,
            "userId": user_id,
            "isVoice": is_voice,
        }
        # Only send the key when there is a conversation in flight. A service
        # call without a conversation_id would otherwise put an explicit null
        # on the wire, which request validation rejects (#63).
        if conversation_id:
            payload["conversationId"] = conversation_id
        # The Assist pipeline's language (e.g. "sl", "en"). Without it the model
        # has no anchor at all and infers the language from context that is
        # soaked in native-language entity names — which is how an English
        # question got a Slovenian answer. The server uses it only as a
        # tie-breaker; the language of the user's actual words always wins.
        if language:
            payload["language"] = language

        # The persona (Custom Prompt) is deliberately NOT sent per request. It
        # lives in one place only — the add-on's Configuration tab — and the
        # server applies it from there. The integration used to send its own
        # options value here, which silently overrode the add-on field and
        # cost days of confusion on nives#54.

        headers: dict = {}
        if api_token:
            headers["Authorization"] = f"Bearer {api_token}"

        async with self._session.post(
            url,
            json=payload,
            headers=headers,
            timeout=aiohttp.ClientTimeout(total=DEFAULT_TIMEOUT),
        ) as response:
            if response.status == 402:
                raise UsageLimitError()
            if response.status != 200:
                # Capture the body: the status alone says "the server
                # objected", the body says WHY (validation details, error
                # codes) — and this log line is all a bug report will carry.
                body = (await response.text())[:300]
                raise aiohttp.ClientResponseError(
                    response.request_info,
                    response.history,
                    status=response.status,
                    message=f"API error {response.status}: {body}",
                )
            data = await response.json()
            response_text = data.get("response")
            if response_text:
                return response_text
            error = data.get("error")
            if isinstance(error, dict):
                hint = error.get("hint")
                code = error.get("code")
                if hint:
                    return f"{hint} [{code}]" if code else hint
            return "I received your request but got no response."
