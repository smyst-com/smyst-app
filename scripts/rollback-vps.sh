#!/usr/bin/env sh
set -eu

echo "blocked: VPS rollback is not allowed by the Smyst free-only policy." >&2
echo "Use Git revert/cherry-pick, IDrive e2 static artifact rollback and Salad backend rollback for production." >&2
exit 1
