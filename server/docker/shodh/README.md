# Shodh Memory Container

Thin wrapper around the official `varunshodh/shodh-memory` image. Adds an entrypoint script that fixes data volume ownership on first run, so upgrades from older root-based containers work seamlessly.

No binary downloads needed — the official image provides everything.
