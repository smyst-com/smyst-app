#!/usr/bin/env sh
set -eu

echo "blocked: VPS rollback is not allowed by the Smyst free-only policy." >&2
echo "Use Cloudflare Pages deployments and Worker versions for production rollback." >&2
exit 1

