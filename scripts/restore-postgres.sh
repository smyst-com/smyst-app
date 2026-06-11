#!/usr/bin/env sh
set -eu

echo "blocked: PostgreSQL restore is legacy-local only and not part of production." >&2
echo "Production restore procedures must target Cloudflare storage primitives and IDrive e2." >&2
exit 1

