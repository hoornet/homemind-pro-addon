"""Constants for Nives integration."""

DOMAIN = "nives"
CONF_API_URL = "api_url"
CONF_API_TOKEN = "api_token"
CONF_USER_ID = "user_id"
# The persona ("Custom Prompt") is configured in ONE place: the add-on's
# Configuration tab. The integration had its own "Custom system prompt"
# options field until 2.4.23; it was sent per request and silently overrode
# the add-on's — two fields, one invisible winner (nives#54). Any value still
# stored in old config entries is ignored.

DEFAULT_API_URL = "http://localhost:3100"
DEFAULT_USER_ID = "default"
DEFAULT_TIMEOUT = 120  # Claude with tool use can take 60+ seconds

API_CHAT_ENDPOINT = "/api/chat"
# Same request, answered as Server-Sent Events while the reply is produced.
API_CHAT_STREAM_ENDPOINT = "/api/chat/stream"
API_HEALTH_ENDPOINT = "/api/health"
API_STT_ENDPOINT = "/api/stt"

# Transcription is quick compared with a tool-using chat turn, but it now sits
# in front of one — the user is waiting on both — so this stays far below
# DEFAULT_TIMEOUT and fails fast enough to retry by just speaking again.
STT_TIMEOUT = 45

# A spoken command is seconds long; anything approaching this is a stuck
# microphone rather than speech, and uploading it would bill the user for a
# recording nobody meant to make. 16-bit 16 kHz mono runs 32 KB/s, so this is
# a little over five minutes.
STT_MAX_AUDIO_BYTES = 10 * 1024 * 1024

# Languages the Whisper-family transcription models understand, as the bare
# ISO-639-1 codes Assist matches against. Kept broad on purpose: the model is
# chosen server-side and every one of these is a language somebody's house
# might be spoken to in.
STT_LANGUAGES = [
    "af", "am", "ar", "as", "az", "ba", "be", "bg", "bn", "bo", "br", "bs",
    "ca", "cs", "cy", "da", "de", "el", "en", "es", "et", "eu", "fa", "fi",
    "fo", "fr", "gl", "gu", "ha", "haw", "he", "hi", "hr", "ht", "hu", "hy",
    "id", "is", "it", "ja", "jw", "ka", "kk", "km", "kn", "ko", "la", "lb",
    "ln", "lo", "lt", "lv", "mg", "mi", "mk", "ml", "mn", "mr", "ms", "mt",
    "my", "ne", "nl", "nn", "no", "oc", "pa", "pl", "ps", "pt", "ro", "ru",
    "sa", "sd", "si", "sk", "sl", "sn", "so", "sq", "sr", "su", "sv", "sw",
    "ta", "te", "tg", "th", "tk", "tl", "tr", "tt", "uk", "ur", "uz", "vi",
    "yi", "yo", "yue", "zh",
    # Home Assistant's own code for Norwegian, translated on the way out — see
    # LANGUAGE_ALIASES. Advertising it is what lets Assist pick Nives at all
    # for a Norwegian pipeline; the match is exact, with no fallback to "no".
    "nb",
]

# Home Assistant language codes that the transcription model spells otherwise.
LANGUAGE_ALIASES = {"nb": "no"}

# Where the add-on leaves its API token for us, relative to the Home Assistant
# config directory. The add-on has config:rw, so it writes into the very
# directory Home Assistant reads its own configuration from.
#
# This is read on every setup, which is the whole point: it works for config
# entries that already exist. The Supervisor discovery message does not —
# Supervisor deduplicates discovery, so re-announcing raises no new event and an
# existing entry never learns the token. That is what broke Assist in 2.4.0.
TOKEN_FILE_RELPATH = "nives/.api_token"

# Our receipt back to the add-on: the SHA-256 of the token we actually managed
# to read. The add-on only starts REQUIRING the token once it sees a receipt
# matching the token it handed over, so it can never lock out an integration
# that — for whatever reason — cannot read the file. Rotating the token
# invalidates the receipt until we write a new one, which is the intended
# behaviour: auth falls back to off rather than to broken.
TOKEN_ACK_RELPATH = "nives/.api_token.ack"

CLOUD_SIGNUP_URL = "https://nives.house"

# The "Restart required" repair issue raised when the add-on has copied newer
# integration files than the ones Home Assistant is running (HACS-style, with
# a Submit button that restarts Core — see repairs.py).
RESTART_ISSUE_ID = "restart_required"

# The persistent notification the add-on's ha-restart service posts for the
# same situation. It stays as the fallback for the two cases where no repair
# is possible — a fresh install (no integration running yet) and the first
# update after the repair feature ships (the running integration predates it).
# When the repair IS raised, the notification is dismissed so the user sees
# one prompt, not two. Must match NOTIFY_ID in s6-rc.d/ha-restart/run.
RESTART_NOTIFY_ID = "nives_restart_needed"

# System-prompt override for AI Task requests. Keeps task output clean and
# literal, instead of the chatty smart-home assistant persona. Intentionally
# separate from the user's conversation persona (the add-on's Custom Prompt).
AI_TASK_CUSTOM_PROMPT = (
    "You are a data-generation assistant for Home Assistant. Follow the "
    "instructions exactly and output only what is asked — no greetings, "
    "commentary, or chit-chat."
)
