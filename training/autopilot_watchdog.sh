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

# 2) GitHub-Workflows
for WF in "Chat-Qualitaets-Eval" "Quality-Autopilot"; do
  LAST=$(gh run list --workflow "$WF" --limit 1 --json conclusion,createdAt --jq '.[0] | select(.conclusion=="success") | .createdAt' 2>/dev/null | head -1)
  if [ -z "$LAST" ]; then
    ALERT="${ALERT}Workflow '$WF': kein erfolgreicher Lauf gefunden. "
  else
    AGE=$(( $(date +%s) - $(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$LAST" +%s 2>/dev/null || echo 0) ))
    [ "$AGE" -gt $((2*24*3600)) ] && ALERT="${ALERT}Workflow '$WF': letzter Erfolg $((AGE/86400)) Tage her. "
  fi
done

# 3) Codeberg-Mirror synchron halten (Master-Prompt: nach jedem Merge)
git -C "$REPO_ROOT" push codeberg --all --quiet >> "$LOG" 2>&1 \
  && git -C "$REPO_ROOT" push codeberg --tags --quiet >> "$LOG" 2>&1 \
  && log "Codeberg-Mirror synchron." || log "WARNUNG: Codeberg-Sync fehlgeschlagen."

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
