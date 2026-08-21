#!/usr/bin/env bash
# Installiert die smyst-Autopiloten nach ~/Library/smyst-autopilots (AUSSERHALB
# von Google Drive: launchd darf Drive-Skripte/Logs nicht ausfuehren/schreiben)
# und laedt alle drei launchd-Dienste. Idempotent.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$HOME/Library/smyst-autopilots"
mkdir -p "$DEST/logs"
for S in autopilot_retrain.sh autopilot_watchdog.sh autopilot_guard.sh; do
  cp "$REPO_ROOT/training/$S" "$DEST/$S"
  sed -i '' "s|REPO_ROOT=.*|REPO_ROOT=\"$REPO_ROOT\"|" "$DEST/$S"
  sed -i '' "s|\"\$REPO_ROOT/training/|\"\$DEST/logs/|g" "$DEST/$S"
  chmod +x "$DEST/$S"
done
for P in retrain-autopilot autopilot-watchdog autopilot-guard; do
  launchctl bootout "gui/$(id -u)/com.smyst.$P" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.smyst.$P.plist" 2>/dev/null || true
done
echo "Autopiloten installiert: $DEST (logs unter $DEST/logs)"
