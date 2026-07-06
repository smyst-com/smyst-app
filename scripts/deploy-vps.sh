#!/usr/bin/env sh
set -eu

echo "blocked: VPS production deployment is not allowed by the smyst.com free-only policy." >&2
echo "Production must use GitHub Actions, IDrive e2, Salad and Spaceship DNS only." >&2
echo "Use IDrive e2 Static Deploy and Salad Backend Deploy; legacy edge deploys are disabled." >&2
exit 1
