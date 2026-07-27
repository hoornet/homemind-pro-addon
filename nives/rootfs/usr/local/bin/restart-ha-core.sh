#!/usr/bin/env bash
# Ask Home Assistant Core to restart, so it loads integration files we just
# updated. Prints what happened; exits 0 only if a request was accepted.
#
# Reads the token from SUPERVISOR_TOKEN, or from the s6 container environment.
#
# Two endpoints are tried, in the order of what our add-on permissions actually
# grant:
#
# 1. The Home Assistant Core API proxy — granted by `homeassistant_api: true` in
#    config.yaml, and the exact path the server already uses for every state
#    read and service call it makes. This is the one that should work.
#
# 2. The Supervisor management endpoint, as a fallback. This needs
#    `hassio_role: manager`, which this add-on deliberately does NOT request:
#    being able to restart Core is not worth also handing the add-on the power
#    to manage other add-ons and backups, especially in the same release series
#    where we closed the API off. It is kept only in case some install is
#    configured such that it works.
#
# History worth keeping: 2.4.2 and 2.4.3 used endpoint 2 alone and failed with
# "403: Forbidden" on a real install, every time. 2.4.3 was written on the
# theory that Supervisor was merely busy mid-update and a retry would land — it
# would not have, because the failure was permissions, not timing. That was only
# visible because 2.4.3 started logging the response body; before that the
# status was thrown away. Log the reason.

RESP="/tmp/ha-core-restart-resp"

TOKEN="${SUPERVISOR_TOKEN:-}"
if [ -z "$TOKEN" ] && [ -f /var/run/s6/container_environment/SUPERVISOR_TOKEN ]; then
    TOKEN=$(cat /var/run/s6/container_environment/SUPERVISOR_TOKEN)
fi
if [ -z "$TOKEN" ]; then
    echo "no SUPERVISOR_TOKEN — cannot ask Home Assistant to restart"
    exit 1
fi

for url in \
    "http://supervisor/core/api/services/homeassistant/restart" \
    "http://supervisor/core/restart"
do
    CODE=$(curl -s -o "$RESP" -w '%{http_code}' --max-time 30 -X POST \
        -H "Authorization: Bearer ${TOKEN}" \
        -H "Content-Type: application/json" \
        -d '{}' \
        "$url" 2>/dev/null)

    case "$CODE" in
        2*)
            echo "Home Assistant Core restart accepted (${url})"
            rm -f "$RESP"
            exit 0
            ;;
        *)
            echo "restart request refused by ${url} (HTTP ${CODE:-none}): $(head -c 150 "$RESP" 2>/dev/null)"
            ;;
    esac
done

rm -f "$RESP"
exit 1
