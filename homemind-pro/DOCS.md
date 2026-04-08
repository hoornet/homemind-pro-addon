# HomeMind PRO

AI assistant with cognitive memory for Home Assistant. Talk to your smart home naturally — it remembers your preferences, understands your devices, and gets smarter over time.

## Quick Start

1. Install this add-on
2. Choose your LLM mode in the Configuration tab:
   - **Cloud**: Paste your HomeMind Cloud API key (get one at [homemind.veganostr.com](https://homemind.veganostr.com))
   - **BYOK**: Select your provider (Anthropic, OpenAI, or Ollama) and paste your API key
3. Start the add-on
4. Go to **Settings > Voice assistants** and select "Home Mind" as your conversation agent
5. Talk to your home via Assist!

## How It Works

HomeMind PRO bundles two services in one add-on:

- **Home Mind Server** — AI conversation engine that understands your smart home. It connects to Home Assistant automatically (no URL or token needed).
- **Shodh Memory** — Cognitive memory system with semantic search. Remembers your preferences, routines, and device configurations across conversations.

## LLM Modes

### Cloud Mode (Recommended for getting started)

Uses HomeMind's managed LLM service. You get a monthly token budget — no API key management, no surprise bills.

1. Sign up at [homemind.veganostr.com](https://homemind.veganostr.com)
2. Choose a tier (Lite or Standard)
3. Paste your proxy API key in the add-on configuration

### BYOK Mode (Bring Your Own Key)

Use your own API key from:

- **Anthropic** — Claude models (recommended: claude-haiku-4-5-20251001)
- **OpenAI** — GPT models
- **Ollama** — Local models (requires Ollama running on your network)

## Configuration

| Option | Description |
|--------|-------------|
| LLM Mode | `cloud` (managed) or `byok` (your own key) |
| Cloud API Key | Your HomeMind proxy key (cloud mode only) |
| LLM Provider | anthropic, openai, or ollama (byok mode only) |
| API Key | Your provider API key (byok mode only) |
| Model | Model ID (leave empty for default) |
| API Base URL | Custom endpoint for OpenAI-compatible APIs or Ollama |
| Custom Prompt | Override the assistant's personality |
| Log Level | debug, info, warn, or error |

## Companion Integration

This add-on works with the **Home Mind** HACS integration, which registers as a conversation agent in Home Assistant. The integration is auto-discovered when the add-on starts.

If auto-discovery doesn't work, install the integration manually via HACS and point it to `http://local-homemind-pro:3100`.

## Data & Privacy

All data stays on your device:
- Conversations stored in `/data/conversations.db`
- Memories stored in `/data/shodh/`
- No telemetry, no cloud dependency (in BYOK mode)
- In Cloud mode, only LLM API calls go through the proxy — your HA data never leaves your network

## Troubleshooting

- **Add-on won't start**: Check the log tab. Most common issue: missing or invalid API key.
- **"Cannot connect to Home Assistant"**: The add-on uses the Supervisor API automatically. If you see this error, try restarting the add-on.
- **Slow responses**: LLM responses can take 10-60 seconds depending on the model and tool usage. This is normal.
- **High memory usage**: Shodh Memory has a known memory leak. The add-on includes a watchdog that restarts it automatically when it exceeds 512MB.

## Support

- [GitHub Issues](https://github.com/hoornet/homemind-pro-addon/issues)
- [Home Mind Documentation](https://github.com/hoornet/home-mind/wiki)
