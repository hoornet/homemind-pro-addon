# Changelog

## 1.0.3

- Fix HA API 401 errors — use Supervisor internal proxy (`http://supervisor/core`) instead of direct HA access
- Add-ons must route HA API calls through the Supervisor, not directly to `homeassistant:8123`

## 1.0.2

- Add diagnostics for Supervisor token injection
- Confirmed SUPERVISOR_TOKEN is present (112 chars) — issue was routing, not auth

## 1.0.1

- Fix Shodh startup failure — call `shodh server` binary directly instead of wrapper script
- Fix Dockerfile for HA Supervisor build context (clone server from GitHub at build time)
- Remove pre-built image reference (local builds only until CI/CD is set up)

## 1.0.0

- Initial release
- Bundles home-mind-server + Shodh Memory in a single HA add-on
- Two LLM modes: Cloud (managed proxy) and BYOK (bring your own key)
- Supports Anthropic, OpenAI, and Ollama providers
- Persistent conversation history (SQLite)
- Cognitive memory with semantic search (Shodh)
- Automatic HA integration via Supervisor API (no manual URL/token config)
- Memory leak watchdog for Shodh (auto-restart at 512MB RSS)
- Architectures: amd64, aarch64 (RPi4/5)
