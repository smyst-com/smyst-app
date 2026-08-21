#!/usr/bin/env bash
# Autopilot-Guard (Supervisor): alle 15 Minuten pruefen, dass alle smyst-
# Automatiken laufen; Ausgefallene automatisch neu starten (Self-Healing).
set -uo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT" || exit 1
LOG="$REPO_ROOT/training/guard.log"
log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }

# 1) launchd-Dienste geladen? sonst nachladen
for P in com.smyst.retrain-autopilot com.smyst.autopilot-watchdog; do
  launchctl list "$P" >/dev/null 2>&1 || { launchctl load "$HOME/Library/LaunchAgents/$P.plist" 2>/dev/null; log "SELF-HEAL: $P neu geladen."; }
done

# 2) Watchdog laeuft nach? (Log aelter als 36h -> jetzt ausfuehren)
WL="$REPO_ROOT/training/watchdog.log"
if [ -f "$WL" ]; then
  AGE=$(( $(date +%s) - $(stat -f %m "$WL") ))
  [ "$AGE" -gt $((36*3600)) ] && { log "SELF-HEAL: Watchdog haengt ($((AGE/3600))h) -> starte jetzt."; bash training/autopilot_watchdog.sh >/dev/null 2>&1; }
fi

# 3) Backend erreichbar? (2 Fehlversuche -> Alarm-Issue)
H=$(curl -s -m 10 -o /dev/null -w "%{http_code}" https://smyst-api.zeabur.app/api/v1/tts/voices || echo 000)
if [ "$H" != "200" ]; then
  sleep 30
  H2=$(curl -s -m 10 -o /dev/null -w "%{http_code}" https://smyst-api.zeabur.app/api/v1/tts/voices || echo 000)
  if [ "$H2" != "200" ]; then
    log "ALARM: Backend nicht erreichbar (HTTP $H/$H2)."
    gh issue create -R smyst-com/smyst-app -t "🚨 Autopilot-Guard: Backend nicht erreichbar" \
      -b "TTS-Health-Check 2x fehlgeschlagen ($(date '+%F %T')). Bitte Zeabur pruefen: https://zeabur.com" \
      -l "autopilot-watchdog" >/dev/null 2>&1 || true
  fi
fi
log "Guard-Check ok."
