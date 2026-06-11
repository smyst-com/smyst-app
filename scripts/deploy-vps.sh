#!/usr/bin/env sh
set -eu

echo "blocked: VPS production deployment is not allowed by the Smyst free-only policy." >&2
echo "Production must use GitHub Free, Cloudflare Free, and IDrive e2 only." >&2
echo "Use .github/workflows/deploy.yml for Cloudflare Pages and Workers deployment." >&2
exit 1

