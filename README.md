# Nives

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)
[![Add-on version](https://img.shields.io/badge/dynamic/yaml?url=https%3A%2F%2Fraw.githubusercontent.com%2Fhoornet%2Fnives%2Fmaster%2Fnives%2Fconfig.yaml&query=%24.version&label=Add--on&color=brightgreen)](nives/CHANGELOG.md)

> _Previously known as **HomeMind PRO**. See the [v2.0.0 changelog](nives/CHANGELOG.md) for migration notes._

**An AI assistant for Home Assistant that remembers.** Talk to your home in plain language — by voice or text through HA Assist — and Nives recalls your preferences, routines, device nicknames, and sensor baselines across every conversation. No re-teaching, no re-explaining.

> Tell it once — *"100 ppm is normal for my NOx sensor"*, *"bedroom lights should go to 30% in the evening"*, *"call the WLED strip 'main kitchen light'"* — and it remembers next time.

## What you get

- **Persistent memory** — preferences, routines, sensor baselines, device nicknames. Survives restarts.
- **Natural voice & text control** through Home Assistant Assist.
- **Knows your home** — reads your floors, areas, and device capabilities, so it always knows which room a light is in and how to control it.
- **Creates & manages automations** — just ask ("turn the porch light on at sunset", "make the evening scene 30 minutes earlier") and Nives builds, edits, lists, or removes Home Assistant automations for you — always confirming before it changes anything, and using what it remembers about your home (your "evening", your preferred brightness).
- **Works inside your automations** — Nives is also a Home Assistant **AI Task** provider: call `ai_task.generate_data` from any automation to get an answer or structured data, reasoned with your home's context. It can even look at a **camera snapshot** and tell you what matters (with a vision-capable model) — great for smarter, low-false-alarm camera and doorbell alerts.
- **Your memories are stored on your machine** — the memory database lives on your Home Assistant box, not ours, and there's no telemetry. (To answer you, Nives does send the *relevant* memories plus your home layout to the model with each request — the add-on docs spell out exactly what goes where. Want none of it to leave the house? Run a local model via Ollama.)
- **Two ways to power it** — managed **Nives Cloud** (recommended) or **bring your own key**. Both run the exact same on-device server and memory; only the AI endpoint differs.

## Choosing how to power Nives

Nives needs a language model to do the thinking. You have two options — pick one in the add-on's **Configuration** tab.

### Nives Cloud — the easy, recommended path

The no-fuss option, and the best choice for most people — especially if you're new to this, or you'd simply rather not spend your evenings benchmarking models and tweaking settings.

With Nives Cloud you **never choose, test, or babysit a model.** Behind the scenes we run a **curated, always-current selection of top models** and keep it updated for you — when a better or faster one comes along, or one gets retired, we swap it on our side. Your assistant just keeps getting better, with nothing for you to install or change.

**How it works:**

1. Sign up at **[nives.house](https://nives.house)** and pick a plan.
2. Copy the key it gives you.
3. Paste it into the add-on's **Cloud** section and save.

That's it — no AI provider accounts to manage, no model names to research, no surprise bills (each plan includes a monthly usage allowance). Plans differ by **speed, monthly usage, and how capable the models are**, all described in plain terms so you can choose by *experience* rather than by model spec sheets. See **[nives.house](https://nives.house)** for current plans.

### Bring Your Own Key (BYOK) — for tinkerers

Prefer full control? Run Nives with **your own** provider key — Anthropic, OpenAI, OpenRouter, or a local Ollama endpoint — and pick your own model. No subscription.

A few honest notes so it goes smoothly:

- Your model **must support function / tool calling** — that's how Nives actually controls your home.
- Memory quality scales with the model: stronger models extract and recall facts more reliably.
- For a fully self-hosted, local-first setup, the open-source **[home-mind](https://github.com/hoornet/home-mind)** project (which Nives grew from) is purpose-built for exactly that.

## Install

1. In Home Assistant, open **Settings → Add-ons → Add-on Store**.
2. Click the **⋮** menu (top-right) → **Repositories**.
3. Add this URL: `https://github.com/hoornet/nives`
4. Find **Nives** in the store and click **Install**.
5. Open the **Configuration** tab, choose **Cloud** or **BYOK** (see above), enter your key, and **Save**.
6. **Start** the add-on.

Then point Home Assistant at it: **Settings → Voice assistants → (your assistant) → Conversation agent → Nives**. Now just talk to your home — type in Assist, or speak if you've set up a voice pipeline.

## Under the hood

Nives bundles two services into one add-on:

- **Nives server** — the conversation engine. Connects to Home Assistant automatically (no URL or token to configure) and controls your devices through HA's own tools.
- **Shodh memory** — an on-device cognitive memory with semantic search, so Nives surfaces the right context at the right moment. The memory store itself never leaves your HA machine. ([Shodh Memory](https://github.com/varun29ankuS/shodh-memory) is an independent open-source project — Nives integrates it, and the same engine powers home-mind.)

## Nives or home-mind?

People regularly ask how Nives relates to **[home-mind](https://github.com/hoornet/home-mind)** — reasonable, since both come from the same author. Short version: **it's the same brain in a different box, and Nives has grown extra tools.**

Nives started as a fork of the home-mind server, so the core — the conversation engine and the memory layer — is shared heritage. Since then they've deliberately become two independent products aimed at two kinds of people:

- **home-mind** is the DIY path: Docker Compose, run the server and [Shodh Memory](https://github.com/varun29ankuS/shodh-memory) yourself, install the integration, wire it together. Full control, every choice yours, completely hands-on.
- **Nives** is the same stack as **one Home Assistant add-on**: one container, the companion integration installs itself, Supervisor auto-discovers it. Add repo → install → paste a key → done. In most cases you never need a terminal.

What has actually diverged:

| | home-mind | Nives |
|---|---|---|
| **Install** | Docker Compose + manual integration setup | One HA add-on, self-configuring |
| **HA tools** | 5 (read state, list/search entities, call services, history) | 10 — those plus automation **create/list/update/delete** and service discovery, behind a server-enforced confirmation gate |
| **AI Task** | — | `ai_task.generate_data` (text + structured output), usable inside your automations |
| **Vision** | — | camera snapshots as input — "is this expected?" on a doorbell frame |
| **Voice satellites** | — | reopens the mic when it asks you a question (Voice PE `continue_conversation`) |
| **arm64 / Raspberry Pi** | official Shodh Docker image is amd64-only | add-on ships arm64 binaries — works on a Pi / arm64 HAOS out of the box |
| **Models** | BYOK: Anthropic / OpenAI / OpenRouter / Ollama | same BYOK, plus optional managed [Nives Cloud](https://nives.house) |

Both are AGPL-3.0 with open repos, and both are maintained. There are **no features locked behind the Nives subscription** — Cloud exists purely as the less-tinkering option, and the BYOK path is free and never touches our servers. If you enjoy owning every moving part, home-mind is built for you; if you'd rather it just work, that's Nives.

## Related projects

- **[home-mind](https://github.com/hoornet/home-mind)** — the open-source server Nives grew from (AGPL-3.0). An independent project; run it yourself if you prefer the fully-DIY path.
- **[Shodh Memory](https://github.com/varun29ankuS/shodh-memory)** — the cognitive memory engine powering both, by [@varun29ankuS](https://github.com/varun29ankuS). We integrate it, we didn't write it — and neither project would exist without it.
- **[nives.house](https://nives.house)** — the optional Nives Cloud service.

## Support & feedback

Nives is in early access and we'd genuinely love to hear from you.

- **Bugs / feature ideas:** open an [issue](https://github.com/hoornet/nives/issues).
- **Cloud or subscription questions:** [nives.house](https://nives.house) or hello@nives.house.

## License

AGPL-3.0 — see [LICENSE](LICENSE).
