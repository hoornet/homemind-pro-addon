# Changelog

## 1.0.10

- Fix Supervisor discovery: wrap host/port in `config` key per HA API spec
- Fix config_flow: skip connectivity check during hassio discovery (HA Core → add-on routing not available at config time)

## 1.0.9

- Bump bundled server to v0.14.0 (auto-detect language, OpenRouter attribution, Shodh v0.1.91, security hardening)
- Fix conversation agent entity name to "HomeMind PRO" in Assist

## 1.0.8

- Rename integration display name to "HomeMind PRO" throughout the HA UI

## 1.0.7

- Add GitHub Actions CI/CD — builds and pushes multi-arch images on every push to master
- Pre-built images published to `ghcr.io/hoornet/homemind-pro-{arch}` (amd64 + aarch64)
- config.yaml now references pre-built GHCR images — faster installs, no local Docker build on HA
- GHA build cache per arch reduces incremental build times

## 1.0.6

- Fix config validation error when `llm_base_url` is empty (HA rejects empty string as invalid URL)

## 1.0.5

- Add OpenRouter as a first-class LLM provider option (no more "openai" workaround)
- Cloud mode now routes directly to OpenRouter (replaces old metering proxy)
- Default model for OpenRouter: `anthropic/claude-haiku-4.5`
- Updated config descriptions with OpenRouter model ID examples

## 1.0.4

- Auto-install Home Mind HA integration on startup — no HACS required
- Bundled integration files are copied to `/config/custom_components/home_mind/`
- Auto-updates when a newer version is bundled
- Truly one-click install: add-on handles everything

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
