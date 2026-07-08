#!/usr/bin/env sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT"

echo "== Free-only production policy =="
python3 scripts/validate-foundation.py
python3 scripts/check-backup-recovery.py
python3 scripts/check-change-protection.py
python3 scripts/check-surface-protection.py
python3 scripts/check-final-readiness.py
python3 scripts/check-profile-image-design-guard.py
python3 scripts/check-provider-exit.py

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

if command -v node >/dev/null 2>&1; then
  echo "== Bottom icon regression protection =="
  node scripts/check-bottom-icon-regression.mjs

  echo "== Voice wave regression protection =="
  node scripts/check-voice-wave-regression.mjs

  echo "== Safe destructive actions protection =="
  node scripts/check-safe-destructive-actions.mjs

  echo "== Profile cockpit UX protection =="
  node scripts/check-profile-cockpit-ux.mjs

  echo "== Memory media voice UX protection =="
  node scripts/check-memory-media-voice-ux.mjs

  echo "== Ad readiness audit =="
  node scripts/ad-readiness-audit.mjs

  echo "== Performance and PWA audit =="
  node scripts/performance-pwa-audit.mjs

  echo "== Native toolchain audit =="
  node scripts/native-toolchain-audit.mjs
fi

echo "test-all completed"
