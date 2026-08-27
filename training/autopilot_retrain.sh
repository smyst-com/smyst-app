#!/usr/bin/env bash
# smyst Re-Trainings-Autopilot: endloser, datengetriggerter Zyklus (24/7-
# Bereitschaft, kein blindes Kalender-Training — siehe training/README.md):
#
#   1. Trainingsdaten-Export aus GitHub anstossen + Artefakt holen
#   2. Daten-Gate: nur trainieren, wenn NEUE Daten seit dem letzten Lauf
#   3. Fast-Track-SFT (MLX, lokal, 0 $ GPU-Kosten)
#   4. Promotions-Gate (eval_checkpoint_mlx.py): neuer Checkpoint muss den
#      produktiven Stand schlagen — sonst KEIN Versionswechsel, Alarm im Log
#   5. Bei Erfolg: Registry-Version smyst 1.x+1, Backup nach IDrive e2
#      (sofern Keys in backend/.env), altes Modell bleibt als Rollback
#
# Idempotent, wirft nie (launchd), loggt alles nach logs/autopilot.log.

set -uo pipefail
REPO_ROOT="/Users/alanbest/Library/CloudStorage/GoogleDrive-smyst247@gmail.com/.shortcut-targets-by-id/1GILNbp2CZmdjcolV9-kHi9Br4z8hwiub/smyst.com info/smyst.com app"
LOG="$HOME/Library/smyst-autopilots/logs/autopilot.log"
MARKER="$HOME/Library/smyst-autopilots/logs/.autopilot_last_run"
EXPORT_DIR="$REPO_ROOT/training-export"
REGISTRY="$REPO_ROOT/training/model-registry.json"
EVAL_OUT="$HOME/Library/smyst-autopilots/logs/eval"

log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }

mkdir -p "$EVAL_OUT" 2>/dev/null || true

# gh im launchd-Kontext ohne Keychain: Token-Datei als Fallback (chmod 600)
if [ -f "$HOME/.smyst-secrets/gh_token" ] && ! gh auth status >/dev/null 2>&1; then
  export GH_TOKEN="$(cat "$HOME/.smyst-secrets/gh_token")"
fi

# 1) Neuesten Code holen (Autopilot aktualisiert sich selbst)
git -C "$REPO_ROOT" pull --quiet >> "$LOG" 2>&1 || log "WARNUNG: git pull fehlgeschlagen (offline?) – fahre mit lokalem Stand fort."

# 2) Wochen-Rhythmus aufheben: der Lauf darf jederzeit starten, das
#    DATEN-Gate (Schritt 4) entscheidet, ob Training Noetig hat. Ein leerer
#    Lauf kostet nur den Export-Check.
if [ -f "$MARKER" ]; then
  LAST=$(cat "$MARKER" 2>/dev/null || echo 0)
  NOW=$(date +%s)
  if [ $(( NOW - LAST )) -lt $((2*3600)) ]; then
    log "Letzter Lauf erst $(( (NOW - LAST) / 60 ))min her – Schutzpause, nichts zu tun."
    exit 0
  fi
fi
date +%s > "$MARKER"

# 3) Trainingsdaten-Export anstossen und Artefakt holen (gh ist auf der
#    Workstation authentifiziert). Scheitert der Export (offline, API-Limit),
#    laeuft der Zyklus mit dem letzten Stand weiter — kein Stillstand.
EXPORT_RUN_ID=""
if command -v gh >/dev/null 2>&1; then
  log "Stosse Trainingsdaten-Export (GitHub) an …"
  if gh workflow run training-export.yml --ref main >> "$LOG" 2>&1; then
    for _ in $(seq 1 60); do
      sleep 20
      EXPORT_RUN_ID=$(gh run list --workflow=training-export.yml --limit 1 --json databaseId,status,conclusion -q '.[0] | select(.status=="completed") | .databaseId' 2>/dev/null)
      [ -n "$EXPORT_RUN_ID" ] && break
    done
    if [ -n "$EXPORT_RUN_ID" ]; then
      rm -rf "$EXPORT_DIR" && mkdir -p "$EXPORT_DIR"
      if gh run download "$EXPORT_RUN_ID" -n training-export -D "$EXPORT_DIR" >> "$LOG" 2>&1; then
        log "Export-Artefakt geholt (Run $EXPORT_RUN_ID)."
      else
        log "WARNUNG: Artefakt-Download fehlgeschlagen – verwende letzten Stand."
      fi
    else
      log "WARNUNG: Export-Run nicht rechtzeitig fertig – verwende letzten Stand."
    fi
  else
    log "WARNUNG: Export-Dispatch fehlgeschlagen (API-Limit?) – verwende letzten Stand."
  fi
fi

# 4) Daten-Gate: nur trainieren, wenn der Export NEU ist (Zeitstempel-Vergleich)
if [ ! -d "$EXPORT_DIR" ]; then
  log "Keine Trainingsdaten in $EXPORT_DIR – kein Training. (Export-Workflow pruefen.)"
  exit 0
fi
STATE_FILE="$HOME/Library/smyst-autopilots/logs/.autopilot_last_data"
NEWEST_DATA=$(find "$EXPORT_DIR" -type f -name '*.jsonl' -newer "$STATE_FILE" 2>/dev/null | head -1)
if [ -z "$NEWEST_DATA" ] && [ -f "$STATE_FILE" ]; then
  log "Trainingsdaten unverändert seit letztem Lauf – kein Training nötig."
  exit 0
fi
touch "$STATE_FILE"
log "NEUE Trainingsdaten erkannt – starte Fast-Track-Training."

# 5) Training (LoRA-SFT auf dem Mac)
cd "$REPO_ROOT/training" || exit 1
if ./train_smyst_fasttrack.sh >> "$LOG" 2>&1; then
  log "Training abgeschlossen: fused/smyst-1.0-sft"
else
  log "FEHLER beim Training – siehe Log oben. Live-Modell bleibt unangetastet."
  exit 0
fi

# 6) Promotions-Gate: neuer Checkpoint gegen den produktiven Stand messen.
#    Score = persona + deutsch + erste_person + keine_wiederholung +
#            kein_zeitbruch + vollstaendig − leer_abgebrochen (je %, Max 600).
REPORT="$EVAL_OUT/eval-$(date +%F-%H%M).json"
if ! ./.venv-mlx/bin/python eval_checkpoint_mlx.py \
      --model fused/smyst-1.0-sft \
      --eval-set eval/smyst-eval-v2.jsonl \
      --out "$REPORT" >> "$LOG" 2>&1; then
  log "Promotions-Gate: Eval fehlgeschlagen – KEINE Promotion, alter Stand bleibt."
  exit 0
fi
NEW_SCORE=$(python3 - "$REPORT" << 'PY'
import json, sys
r = json.load(open(sys.argv[1]))["checkpoint"]
if "score" in r:
    print(r["score"])
else:  # aeltere Reports ohne Gesamtscore
    print(round(r["persona_nennung"] + r["deutsch"] + r["erste_person"] - r["leer_abgebrochen"], 2))
PY
)
CURRENT_SCORE=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['score'])" "$REGISTRY" 2>/dev/null || echo "")

if [ -n "$CURRENT_SCORE" ]; then
  BETTER=$(python3 -c "print(1 if float('$NEW_SCORE') > float('$CURRENT_SCORE') else 0)")
  if [ "$BETTER" != "1" ]; then
    log "Promotions-Gate: NEU $NEW_SCORE <= produktiv $CURRENT_SCORE – KEINE Promotion, Alarm: Training brachte keinen messbaren Gewinn."
    exit 0
  fi
fi

# 7) Promotion: Registry fortschreiben (minor-Bump), Backup nach e2 (falls Keys).
python3 - "$REGISTRY" "$NEW_SCORE" "$REPORT" << 'PY'
import json, sys, datetime
from pathlib import Path
reg_path, score, report = sys.argv[1], float(sys.argv[2]), sys.argv[3]
reg = json.loads(Path(reg_path).read_text()) if Path(reg_path).exists() else {"version": "smyst-1.0", "score": None, "history": []}
major, minor = reg["version"].split("-")[1].split(".")
reg = {
    "version": f"smyst-{major}.{int(minor) + 1}",
    "score": score,
    "model": "fused/smyst-1.0-sft",
    "promoted_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "eval_report": report,
    "history": reg.get("history", [])[-19:] + [{"version": reg["version"], "score": reg.get("score")}],
}
Path(reg_path).write_text(json.dumps(reg, indent=2, ensure_ascii=False))
print(reg["version"])
PY
NEW_VERSION=$(python3 -c "import json;print(json.load(open('$REGISTRY'))['version'])")
log "PROMOTION: $NEW_VERSION (Score $NEW_SCORE > ${CURRENT_SCORE:-kein Vorstand}) – neuer produktiver Checkpoint."

if [ -f "$REPO_ROOT/backend/.env" ] || [ -n "${IDRIVE_E2_ACCESS_KEY:-}" ]; then
  ../backend/.venv/bin/python backup_model_to_e2.py --version "$(date +%F)" >> "$LOG" 2>&1 \
    && log "Modell-Backup nach IDrive e2 hochgeladen." \
    || log "WARNUNG: e2-Backup fehlgeschlagen – Modell nur lokal, Backup spaeter nachholen."
else
  log "Keine e2-Keys (backend/.env) – nutze GitHub-Backup-Weg (model-backup-e2.yml)."
  BACKUP_HOOK="./autopilot_backup_github.sh"
  [ -x "$HOME/Library/smyst-autopilots/autopilot_backup_github.sh" ] && BACKUP_HOOK="$HOME/Library/smyst-autopilots/autopilot_backup_github.sh"
  if "$BACKUP_HOOK" "$(date +%F)" >> "$LOG" 2>&1; then
    log "Modell-Backup via GitHub nach e2 hochgeladen."
  else
    log "WARNUNG: GitHub-Backup fehlgeschlagen – Modell nur lokal, spaeter nachholen."
  fi
fi
log "=== Autopilot beendet ==="

# 5) DPO-Stufe: Praeferenztraining aus 👍/👎 (aktiviert sich selbst ab 100 Paaren)
if ./.venv-mlx/bin/python ./build_dpo_dataset.py >> "$LOG" 2>&1; then
  if [ -d "$HOME/smyst-train/dpo-data" ] && [ -s "$HOME/smyst-train/dpo-data/train.jsonl" ]; then
    log "DPO: Praeferenzpaare vorhanden – DPO-Training auf letztem fused Modell."
    BASE=$(ls -dt "$HOME"/smyst-train/fused/smyst-1.1-v* 2>/dev/null | head -1)
    if [ -n "$BASE" ]; then
      ./.venv-mlx/bin/python ./.venv-mlx/bin/mlx_lm.lora \
        --model "$BASE" --train --data "$HOME/smyst-train/dpo-data" \
        --fine-tune-type lora --num-layers 16 --batch-size 4 --iters 1000 \
        --dpo-loss --adapter-path "$HOME/smyst-train/adapters/dpo-$(date +%F)" >> "$LOG" 2>&1 \
        && log "DPO abgeschlossen – danach Promotions-Gate ausfuehren (training/README.md)." \
        || log "DPO fehlgeschlagen – SFT-Stand bleibt unangetastet."
    fi
  else
    log "DPO uebersprungen: zu wenige Praeferenzpaare (sammele Nutzer-Feedback)."
  fi
fi
