#!/bin/sh
set -e

# Ensure bind-mounted data directories exist and are writable by nextjs (UID 1001)
mkdir -p /app/.data /app/data /app/.next/cache
chown -R nextjs:nodejs /app/.data /app/data /app/.next/cache 2>/dev/null || true
chmod -R ug+rwX /app/.data /app/data 2>/dev/null || true

# Pre-warm O(1) RAM index in the background after Next.js is already serving HTTP
(
  i=0
  while [ "$i" -lt 60 ]; do
    if wget -q -T 3 -O- 'http://127.0.0.1:3000/api/site-settings' >/dev/null 2>&1; then
      sleep 3
      wget -q -T 20 -O- 'http://127.0.0.1:3000/api/storage?statsOnly=true' >/dev/null 2>&1 || true
      wget -q -T 20 -O- 'http://127.0.0.1:3000/api/storage?freeOnly=true&includeFeatured=true&page=1&pageSize=12' >/dev/null 2>&1 || true
      wget -q -T 20 -O- 'http://127.0.0.1:3000/api/storage?page=1&pageSize=24' >/dev/null 2>&1 || true
      break
    fi
    i=$((i + 1))
    sleep 1
  done
) &

exec su-exec nextjs:nodejs node server.js
