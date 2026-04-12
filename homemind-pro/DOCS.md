# HomeMind PRO

AI assistant with cognitive memory for Home Assistant. Talk to your smart home naturally — it remembers your preferences, understands your devices, and gets smarter over time.

## Quick Start

1. Install this add-on
2. Choose your LLM mode in the Configuration tab:
   - **Cloud**: Paste your HomeMind PRO API key (get one at [homemind.veganostr.com](https://homemind.veganostr.com))
   - **BYOK**: Select your provider and paste your own API key
3. Start the add-on
4. Go to **Settings > Voice assistants** and select "Home Mind" as your conversation agent
5. Talk to your home via Assist!

## How It Works

HomeMind PRO bundles two services in one add-on:

- **Home Mind Server** — AI conversation engine that understands your smart home. It connects to Home Assistant automatically (no URL or token needed).
- **Shodh Memory** — Cognitive memory system with semantic search. Remembers your preferences, routines, and device configurations across conversations.

## LLM Modes

### Cloud Mode (Recommended)

Uses HomeMind's managed LLM service. You get a monthly token budget per tier — no API key management, no surprise bills.

1. Sign up at [homemind.veganostr.com](https://homemind.veganostr.com)
2. Choose a tier (Starter, Standard, or Advanced)
3. Paste your HomeMind PRO API key in the add-on configuration

### BYOK Mode (Bring Your Own Key)

Use your own API key from:

- **Anthropic** — Claude models
- **OpenAI** — GPT models
- **OpenRouter** — Access to many models via a single key
- **Ollama** — Local models (requires Ollama running on your network)

## Configuration

| Option | Description |
|--------|-------------|
| LLM Mode | `cloud` (managed) or `byok` (your own key) |
| Cloud API Key | Your HomeMind PRO API key (cloud mode only) |
| LLM Provider | anthropic, openai, openrouter, or ollama (byok mode only) |
| API Key | Your provider API key (byok mode only) |
| Model | Model ID (leave empty for provider default) |
| API Base URL | Custom endpoint for OpenAI-compatible APIs or Ollama |
| Custom Prompt | Override the assistant's personality |
| Log Level | debug, info, warn, or error |

## Companion Integration

The **Home Mind** conversation agent integration is automatically installed when the add-on starts. No manual installation needed.

After the add-on starts, go to **Settings > Voice assistants** and select "Home Mind" as your conversation agent.

If the integration doesn't appear, restart Home Assistant Core once — the add-on installs it on startup.

## Data & Privacy

All data stays on your device:
- Conversations stored in `/data/conversations.db`
- Memories stored in `/data/shodh/`
- No telemetry, no cloud dependency (in BYOK mode)
- In Cloud mode, LLM calls go directly to OpenRouter — your HA data never leaves your network

## Troubleshooting

- **Add-on won't start**: Check the log tab. Most common issue: missing or invalid API key.
- **"Cannot connect to Home Assistant"**: The add-on uses the Supervisor API automatically. If you see this error, try restarting the add-on.
- **Slow responses**: LLM responses can take 10-60 seconds depending on the model and tool usage. This is normal.
- **High memory usage**: Shodh Memory has a known memory leak. The add-on includes a watchdog that restarts it automatically when it exceeds 512MB.

## Support

- [GitHub Issues](https://github.com/hoornet/homemind-pro-addon/issues)
- [homemind.veganostr.com](https://homemind.veganostr.com)
