#!/usr/bin/env bash
# smyst Re-Trainings-Autopilot (Phase 4): 1x/Woche automatisch pruefen und
# trainieren – nur wenn neue Trainingsdaten vorliegen; afterwards Eval-Gate
# (siehe training/README.md). Idempotent, wirft nie, loggt alles.
#
# Voraussetzung (einmalig): Trainingsdaten-Export aus GitHub in ../training-export
# entpackt (Workflow "Trainingsdaten-Export"). Liegt kein NEUER Export vor,
# beendet sich der Autopilot protokolliert, ohne zu trainieren.

set -uo pipefail
cd "$(dirname "$0")"
REPO_ROOT="$(cd .. && pwd)"
LOG="$REPO_ROOT/training/autopilot.log"
MARKER="$REPO_ROOT/training/.autopilot_last_run"
EXPORT_DIR="$REPO_ROOT/training-export"

log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }

log "=== Re-Trainings-Autopilot gestartet ==="

# 1) Neuesten Code holen (Trainings-Skripte aktualisieren sich selbst)
git -C "$REPO_ROOT" pull --quiet >> "$LOG" 2>&1 || log "WARNUNG: git pull fehlgeschlagen (offline?) – fahre mit lokalem Stand fort."

# 2) Wochen-Rhythmus: nicht oefter als alle 7 Tage trainieren
if [ -f "$MARKER" ]; then
  LAST=$(cat "$MARKER" 2>/dev/null || echo 0)
  NOW=$(date +%s)
  AGE=$(( NOW - LAST ))
  if [ "$AGE" -lt $((7*24*3600)) ]; then
    log "Letzter Lauf erst $(( AGE / 3600 ))h her – nichts zu tun."
    exit 0
  fi
fi

# 3) Daten-Gate: nur trainieren, wenn ein Export existiert, der NEUER ist als
#    der letzte Trainingslauf ( sonst trainieren wir Altes neu).
if [ ! -d "$EXPORT_DIR" ]; then
  log "Kein Trainingsdaten-Export in $EXPORT_DIR – kein Training. (Export-Workflow in GitHub starten.)"
  exit 0
fi
if [ -f "$MARKER" ] && [ "$EXPORT_DIR" -nt "$MARKER" ]; then
  log "NEUE Trainingsdaten erkannt – starte Fast-Track-Training."
else
  log "Trainingsdaten unverändert seit letztem Lauf – kein Training nötig."
  exit 0
fi

# 4) Training (LoRA-SFT auf dem Mac, 0 $ GPU-Kosten)
date +%s > "$MARKER"
if ./train_smyst_fasttrack.sh >> "$LOG" 2>&1; then
  log "Training abgeschlossen: fused/smyst-1.0-sft"
  log "NAECHSTER SCHRITT: Promotions-Gate (eval_checkpoint_mlx.py) gegen smyst-eval-v2 – nur bei besserem Score deployen."
else
  log "FEHLER beim Training – siehe Log oben. Live-Modell bleibt unangetastet."
fi
log "=== Autopilot beendet ==="
