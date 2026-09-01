#!/usr/bin/env bash
#
# Guard against internal-only content reaching a public repo.
#
# This repo is public and AGPL. Everything tracked here is published the moment
# it is pushed, and git history keeps it forever — deleting a file later does
# not unpublish it. Two classes of mistake have actually happened:
#
#   1. Internal voice in a tracked file. `nives/CLAUDE.md` carried absolute
#      /home/... paths and the local layout of the private repos, because it is
#      auto-loaded by tooling and therefore never re-read by a human.
#   2. Naming what powers Nives Cloud in user-facing copy. The v2.4.14 changelog
#      shipped "Nives Cloud via OpenRouter" and was only caught after release.
#      That is the whole of what a subscriber pays for — anyone who reads it can
#      mint their own key and never pay again.
#
# Run locally before pushing:  .github/scripts/check-public-content.sh
#
# Scope note: this cannot police the add-on's *code*. Cloud mode has to set a
# base URL, and `options-to-env.sh` is public by license — so the provider is
# discoverable there no matter what. The rule is enforceable on the surfaces
# people actually read, and that is what check 6 covers.

set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

findings=0

# Tracked files only, minus vendored/generated trees and the license texts.
#
# This script excludes itself. That is not a convenience: a checker that names
# the things it hunts for would publish them. Every pattern below is therefore
# a generic *class* — no literal address, host, or path from our infrastructure
# appears in this file. Specific known-secret literals belong in the private
# hub audit tool, never here.
mapfile -t FILES < <(
  git ls-files -z |
    tr '\0' '\n' |
    grep -vE '(^|/)(node_modules|dist|build)/' |
    grep -vE '(^|/)(LICENSE|package-lock\.json|.*\.lock)$' |
    grep -vE '^\.github/scripts/check-public-content\.sh$'
)

report() { # <rule> <file:line> <detail>
  printf '  %-26s %s\n      %s\n' "$1" "$2" "$3"
  findings=$((findings + 1))
}

scan() { # <rule-name> <regex> [file-filter-regex] [allow-regex]
  local rule="$1" re="$2" filter="${3:-}" allow="${4:-}"
  local f ln text
  for f in "${FILES[@]}"; do
    [ -f "$f" ] || continue
    [ -n "$filter" ] && ! [[ "$f" =~ $filter ]] && continue
    while IFS=: read -r ln text; do
      [ -n "${ln:-}" ] || continue
      # An allow-regex exempts documented placeholders — the things a reader is
      # meant to substitute. It never exempts a file, only a specific shape.
      [ -n "$allow" ] && grep -qE "$allow" <<<"$text" && continue
      report "$rule" "$f:$ln" "$(printf '%.140s' "${text# }")"
    done < <(grep -nE "$re" "$f" 2>/dev/null)
  done
}

echo "Checking ${#FILES[@]} tracked files for internal-only content…"
echo

# 1 — Absolute paths from a developer machine. Nobody outside can use them and
#     they expose the local layout of the private repos. Conventional
#     placeholders in example config are what a reader is supposed to substitute,
#     so they stay green — and so do service accounts that live inside a
#     container image rather than on anyone's laptop (`pi`, and `shodh` from the
#     upstream shodh-memory image, whose bundled models a Dockerfile has to copy
#     out of /home/shodh). Names are allowlisted one at a time on purpose: the
#     tempting alternative, skipping `COPY --from=` lines wholesale, would blind
#     the check to a real `/home/<developer>/` path inside a build stage.
scan "local-path" '/home/[a-z_][a-z0-9_-]*/' '' '/home/(user|username|youruser|your-user|your_user|me|pi|shodh|<[^>]+>|\$\{?[A-Z_]+)/'

# 2 — A bare routable IP address. Nothing here should ever point at a host by
#     number: users reach us by hostname and the add-on talks to Home Assistant
#     by service name. A literal is therefore almost always someone's server.
#     Private, loopback, link-local and documentation ranges are fine.
#     Each address is judged on its own — a documentation-range example on the
#     same line must not mask a real host beside it.
for f in "${FILES[@]}"; do
  [ -f "$f" ] || continue
  while IFS=: read -r ln ip; do
    [ -n "${ip:-}" ] || continue
    [[ "$ip" =~ ^(0|10|127|255)\.|^169\.254\.|^192\.168\.|^192\.0\.2\.|^198\.51\.100\.|^203\.0\.113\.|^172\.(1[6-9]|2[0-9]|3[01])\. ]] && continue
    # Four-part version numbers (S6_OVERLAY_VERSION=3.2.0.2) are shaped exactly
    # like an address. A line that is declaring a version is not naming a host.
    line=$(sed -n "${ln}p" "$f")
    [[ "$line" =~ [Vv][Ee][Rr][Ss][Ii][Oo][Nn] ]] && continue
    report "routable-ip" "$f:$ln" "$ip"
  done < <(grep -noE '\b([0-9]{1,3}\.){3}[0-9]{1,3}\b' "$f" 2>/dev/null)
done

# 3 — Real credentials. Deliberately requires a long tail so documented
#     placeholders like `sk-ant-api03-...` stay green.
scan "credential" 'sk-ant-api03-[A-Za-z0-9_-]{20,}|sk-or-v1-[A-Za-z0-9_-]{20,}|sk_live_[A-Za-z0-9]{20,}|rk_live_[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}'

# 4 — Wallet connection strings and private keys.
scan "secret-uri" 'nostr\+walletconnect://|nwc://|-----BEGIN [A-Z ]*PRIVATE KEY-----'

# 5 — A committed .env is almost always an accident.
for f in "${FILES[@]}"; do
  case "$f" in
    .env|*/.env|*.env.local|*/.env.production)
      report "env-file" "$f" "environment file is tracked in a public repo" ;;
  esac
done

# 6 — Never link the paid offering to the provider behind it. OpenRouter on its
#     own is fine and necessary — it is a BYOK option in the config schema. The
#     forbidden thing is the pairing, because that link is the whole of what a
#     subscriber is buying: name it and any reader can mint their own key.
#
#     Scope is every prose-ish tracked file, not just user-facing docs. The
#     narrow version of this check missed the worst instance in the fleet —
#     home-mind's CLAUDE.md said "the paid product (Nives) now talks to
#     OpenRouter directly" — because it was the wrong file type and the wrong
#     word. "Cloud" is not the only way to say it, so the second half of the
#     pairing matches how the paid offering gets described, not one brand name.
#
#     Matched per markdown *cell*, not per line. A comparison table legitimately
#     lists BYOK providers in one column and Cloud in another; that is a contrast,
#     not a claim about what Cloud runs. Prose lines have no `|`, so they are a
#     single cell and still match in full — which is how the v2.4.14 changelog
#     bullet ("Nives Cloud via OpenRouter") would have been caught.
for f in "${FILES[@]}"; do
  [ -f "$f" ] || continue
  [[ "$f" =~ \.(md|markdown|ya?ml|json|txt)$ ]] || continue
  while IFS= read -r hit; do
    [ -n "$hit" ] && report "paid-provider-link" "$f:${hit%%:*}" "${hit#*:}"
  done < <(
    awk -F'|' '{
      for (i = 1; i <= NF; i++)
        if ($i ~ /[Oo]pen[Rr]outer/ &&
            $i ~ /[Cc]loud|paid product|paid tier|managed (option|plan|service)|provisioned|we run/) {
          print NR ":" $i; break
        }
    }' "$f"
  )
done

# 7 — The private hub's directory name. If it appears here, someone pasted their
#     local layout into a published file — the same mistake as an absolute path,
#     just relative, which is exactly why the path check above misses it.
scan "internal-layout" 'homemind-projects/'

echo
if [ "$findings" -gt 0 ]; then
  echo "FAIL — $findings finding(s). This repo is public; fix before pushing."
  echo "If a hit is a false positive, tighten the pattern rather than deleting the check."
  exit 1
fi
echo "PASS — no internal-only content found in tracked files."
