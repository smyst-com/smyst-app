#!/usr/bin/env bash
# smyst Autopilot-Watchdog: prueft TAEGICH, dass alle Automatiken laufen,
# und schlaegt bei Ausfall automatisch Alarm (GitHub-Issue via gh CLI).
# 1) Trainings-Autopilot: Log-Eintrag juenger als 8 Tage?
# 2) GitHub-Workflows (Eval + Quality-Autopilot): letzter Erfolg juenger als 2 Tage?
set -uo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT" || exit 1
LOG="$REPO_ROOT/training/watchdog.log"
ALERT=""
log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }

# 1) Trainings-Autopilot
TRAIN_LOG="$REPO_ROOT/training/autopilot.log"
if [ -f "$TRAIN_LOG" ]; then
  AGE=$(( $(date +%s) - $(stat -f %m "$TRAIN_LOG") ))
  [ "$AGE" -gt $((8*24*3600)) ] && ALERT="Re-Trainings-Autopilot: kein Log seit $((AGE/86400)) Tagen. "
else
  ALERT="Re-Trainings-Autopilot: Log fehlt. "
fi

# 2) GitHub-Workflows. Die anonyme REST-API reicht (Repo ist public) und
#    funktioniert im launchd-Kontext, wo gh keinen Keychain-Zugriff hat —
#    die fruehere gh-Abfrage meldete dort falsch "kein erfolgreicher Lauf".
for WF_FILE in "eval.yml:Chat-Qualitaets-Eval" "quality-autopilot.yml:Quality-Autopilot"; do
  WF_PATH="${WF_FILE%%:*}"; WF_NAME="${WF_FILE##*:}"
  LAST=$(curl -sf --max-time 20 "https://api.github.com/repos/smyst-com/smyst-app/actions/workflows/$WF_PATH/runs?per_page=10" \
    | python3 -c 'import json,sys
try:
    runs = json.load(sys.stdin)["workflow_runs"]
except Exception:
    sys.exit(0)
for r in runs:
    if r["conclusion"] == "success":
        print(r["created_at"]); break' 2>/dev/null)
  if [ -z "$LAST" ]; then
    ALERT="${ALERT}Workflow '$WF_NAME': kein erfolgreicher Lauf gefunden. "
  else
    AGE=$(( $(date +%s) - $(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$LAST" +%s 2>/dev/null || echo 0) ))
    [ "$AGE" -gt $((2*24*3600)) ] && ALERT="${ALERT}Workflow '$WF_NAME': letzter Erfolg $((AGE/86400)) Tage her. "
  fi
done

# 3) Codeberg-Mirror synchron halten (Master-Prompt: nach jedem Merge).
#    Es wird origin/main gespiegelt, nicht die lokalen Branches: die koennen
#    auf dem Autopilot-Mac aelter sein als der Mirror (Non-Fast-Forward-Fehler,
#    siehe Watchdog-Vorfaelle ab 21.08.2026).
git -C "$REPO_ROOT" fetch origin --quiet >> "$LOG" 2>&1 \
  && git -C "$REPO_ROOT" push codeberg origin/main:main --quiet >> "$LOG" 2>&1 \
  && git -C "$REPO_ROOT" push codeberg --tags --quiet >> "$LOG" 2>&1 \
  && log "Codeberg-Mirror synchron (origin/main -> codeberg/main)." || log "WARNUNG: Codeberg-Sync fehlgeschlagen."

if [ -n "$ALERT" ]; then
  log "ALARM: $ALERT"
  gh issue create -R smyst-com/smyst-app \
    -t "🚨 Autopilot-Watchdog: Automatik ausgefallen" \
    -b "$ALERT

Automatisch gemeldet vom Watchdog ($(date '+%F %T')). Bitte pruefen:
- Mac eingeschaltet? launchctl list | grep smyst
- GitHub Actions: https://github.com/smyst-com/smyst-app/actions" \
    -l "autopilot-watchdog" 2>/dev/null || true
else
  log "OK – alle Autopiloten laufen."
fi
