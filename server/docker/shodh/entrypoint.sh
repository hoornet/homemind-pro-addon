#!/bin/sh
# Fix data volume ownership for migration from root-based containers
# to the official shodh image (runs as uid 1000)
if [ -d /data ] && [ "$(stat -c '%u' /data)" != "1000" ]; then
  echo "[entrypoint] Fixing /data ownership for shodh user..."
  chown -R 1000:1000 /data
fi

exec setpriv --reuid=1000 --regid=1000 --init-groups "$@"
