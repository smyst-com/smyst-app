#!/usr/bin/env sh
set -eu

echo "blocked: PostgreSQL backups are legacy-local only and not part of production." >&2
echo "Production data must use Cloudflare storage primitives and IDrive e2 object storage." >&2
exit 1

