"""Constants for Nives integration."""

DOMAIN = "nives"
CONF_API_URL = "api_url"
CONF_API_TOKEN = "api_token"
CONF_USER_ID = "user_id"
CONF_CUSTOM_PROMPT = "custom_prompt"

DEFAULT_API_URL = "http://localhost:3100"
DEFAULT_USER_ID = "default"
DEFAULT_TIMEOUT = 120  # Claude with tool use can take 60+ seconds

API_CHAT_ENDPOINT = "/api/chat"
API_HEALTH_ENDPOINT = "/api/health"

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

# System-prompt override for AI Task requests. Keeps task output clean and
# literal, instead of the chatty smart-home assistant persona. Intentionally
# separate from CONF_CUSTOM_PROMPT (the user's conversation persona).
AI_TASK_CUSTOM_PROMPT = (
    "You are a data-generation assistant for Home Assistant. Follow the "
    "instructions exactly and output only what is asked — no greetings, "
    "commentary, or chit-chat."
)
