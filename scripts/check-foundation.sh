#!/usr/bin/env sh
set -eu

python3 "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)/scripts/validate-foundation.py"
echo "free-only foundation checks passed"

