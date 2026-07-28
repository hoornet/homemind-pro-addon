# Nives

AI assistant with cognitive memory for Home Assistant. Talk to your smart home naturally — it remembers your preferences, understands your devices, and gets smarter over time.

> _Previously known as **HomeMind PRO**. See the [v2.0.0 changelog](CHANGELOG.md) for migration notes._

## Quick Start

1. Install this add-on
2. Choose your LLM mode: **Cloud** or **BYOK** (see sections below)
3. Start the add-on
4. Go to **Settings > Voice assistants** and select **Nives** as your conversation agent
5. Talk to your home via Assist!

## How It Works

Nives bundles two services in one add-on:

- **Nives Server** — AI conversation engine that understands your smart home. Connects to Home Assistant automatically — no URL or token needed.
- **Shodh Memory** — Cognitive memory system with semantic search. Remembers your preferences, routines, and device configurations across conversations.

## What Nives Can Do

- **Answer & control** — ask about any sensor or device, and control them by voice or text ("dim the lounge", "is the bedroom warm?").
- **Remember** — tell it your preferences, baselines, and nicknames once; it uses them across every conversation.
- **Create & manage automations** — ask it to set up, change, list, or delete automations ("turn the porch light on at sunset every day"). It always shows what it will do and waits for your confirmation, and names its automations with a `Nives:` prefix so you can find them under Settings → Automations.
- **Power your automations (AI Task)** — Nives registers an `ai_task` entity, so any automation can call `ai_task.generate_data` to get an answer or structured data reasoned with your home's context. With a vision-capable model it can also analyze an **image attachment** (e.g. a camera snapshot) — useful for smarter, low-false-alarm camera/doorbell notifications.

---

## Cloud Mode (recommended)

Use Nives Cloud — a managed AI service with a monthly token budget. No API key management, no surprise bills.

### Setup

1. Sign up at [nives.house](https://nives.house) — one plan, everything included
2. Copy your **Nives API Key** from your dashboard
3. In the add-on Configuration tab:
   - Set **LLM Mode** to `cloud`
   - Paste your key into **Nives API Key**
4. Save and start the add-on

### Cloud Configuration

| Option | Description |
|--------|-------------|
| LLM Mode | Set to `cloud` |
| Nives API Key | Your key from nives.house |

---

## BYOK Mode (Bring Your Own Key)

Use your own API key from any supported provider. Your data goes directly to the provider — no middleman.

> **Important:** BYOK is best-effort and not actively supported. Two requirements must hold or chat will fail:
>
> 1. Your selected model **must** support function/tool calling. Models without it return HTTP 404 ("No endpoints found that support tool use").
> 2. Memory extraction quality varies by model — some small open-weight models may not store facts reliably.
>
> For deep local/Ollama setups or custom-model work, the open-source [home-mind](https://github.com/hoornet/home-mind) project is the right tool. The Nives add-on is optimised for Nives Cloud.

### Setup

1. Get an API key from your chosen provider (Anthropic, OpenAI, OpenRouter, or Ollama)
2. In the add-on Configuration tab:
   - Set **LLM Mode** to `byok`
   - Set **Provider** to your chosen provider
   - Paste your **API Key**
   - Set a **Model** — optional for Anthropic, OpenAI and OpenRouter (each has a sensible default); **required for Ollama**, where you must enter the model you pulled (e.g. `qwen3:8b`)
3. Save and start the add-on

### BYOK Configuration

| Option | Description |
|--------|-------------|
| LLM Mode | Set to `byok` |
| Provider | `anthropic`, `openai`, `openrouter`, or `ollama` |
| API Key | Your provider API key |
| Model | Model ID. Optional for Anthropic / OpenAI / OpenRouter; **required for Ollama** |
| API Base URL | Custom endpoint. Leave empty for cloud providers; for Ollama, defaults to `http://homeassistant:11434/v1` if you leave it blank |

### Supported Providers

- **Anthropic** — Claude models (direct API)
- **OpenAI** — GPT models (direct API)
- **OpenRouter** — Access to many models via a single key (recommended for BYOK)
- **Ollama** — Local models running on your network

---

## Companion Integration

The **Nives** conversation agent integration is automatically installed when the add-on starts. No manual installation needed.

After the add-on starts, go to **Settings > Voice assistants** and select **Nives** as your conversation agent.

If the integration doesn't appear, restart Home Assistant Core once — the add-on installs it on startup.

### API access (advanced)

The add-on's HTTP API uses an access token. It is generated on first start and
handed to the companion integration automatically — **there is nothing to
configure.** The add-on only begins requiring the token once the integration has
confirmed it has it, so the two can never get out of step; the add-on log says
which state it is in on every start.

It only matters if you call the API yourself (a script, or the add-on's port
mapped to your network). In that case, read it from your Home Assistant
configuration folder — `nives/.api_token`, e.g. with the File Editor, SSH or
Terminal add-on — and send it as a bearer token:

```
curl -H "Authorization: Bearer <token>" http://<addon-host>:3100/api/chat ...
```

`/api/health` stays public so monitoring doesn't need the token.

---

## Common Options

| Option | Description |
|--------|-------------|
| Custom Prompt | Override the assistant's personality. Leave empty for the default. |
| Log Level | `debug`, `info`, `warn`, or `error`. Use `debug` for troubleshooting. |

---

## Data & Privacy

**Stored on your device, always:**
- Conversations in `/data/conversations.db`
- Memories in `/data/shodh/`
- No telemetry

Nothing is stored anywhere else — there is no copy of your memories or your home on our side.

**What is sent to the AI model, on every message:**

To answer usefully, Nives has to tell the model about your home. Each request includes:
- your message and recent conversation
- the memories relevant to what you asked
- your home layout — floors, rooms, and the device IDs in them
- the capabilities of your lights
- the results of anything it looks up to answer you (device states, history)

This is true in **both** Cloud and BYOK mode — the difference is only *which* provider receives it. In Cloud mode that's the model provider we route to; in BYOK mode it's whichever provider's key you entered, and we're not in the path at all. If you'd rather none of it left your network, run a local model via Ollama in BYOK mode (see the note above about local setups).

## Troubleshooting

- **Add-on won't start**: Check the Log tab. Most common issue: missing or invalid API key.
- **Nives doesn't appear in Voice assistants**: Restart Home Assistant Core once after the add-on starts.
- **Slow responses**: LLM responses can take 10–60 seconds depending on the model and tool usage. This is normal.
- **High memory usage**: Shodh Memory has a known memory leak. The add-on includes a watchdog that restarts it automatically when it exceeds 512 MB.

## Support

- [GitHub Issues](https://github.com/hoornet/nives/issues)
- [nives.house](https://nives.house)
