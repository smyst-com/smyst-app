#!/usr/bin/env sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT"

echo "== Free-only production policy =="
python3 scripts/validate-foundation.py

echo "== Shell syntax =="
for script in scripts/*.sh; do
  sh -n "$script"
done

if command -v npm >/dev/null 2>&1; then
  echo "== Root app typecheck/build =="
  npm run lint:tsc
  npm run build
elif command -v node >/dev/null 2>&1 && [ -f node_modules/typescript/bin/tsc ]; then
  echo "== Root app typecheck =="
  node node_modules/typescript/bin/tsc --noEmit

  if [ "${SMYST_RUN_DIRECT_VITE_BUILD:-no}" = "yes" ] && [ -f node_modules/vite/bin/vite.js ]; then
    echo "== Root app build =="
    node node_modules/vite/bin/vite.js build
  else
    echo "npm not found; skipped direct Vite build fallback"
  fi
else
  echo "npm not found; skipped root app typecheck/build"
fi

echo "test-all completed"
