#!/usr/bin/env bash
# smyst Re-Trainings-Autopilot v2 (20.09.2026): endloser, datengetriggerter
# Zyklus (24/7-Bereitschaft, kein blindes Kalender-Training):
#
#   1. Trainingsdaten-Export aus GitHub anstossen + Artefakt holen
#   2. Daten-Gate: nur trainieren, wenn ein NEUES Export-Artefakt vorliegt
#   3. Fast-Track-SFT (MLX auf dem Mac, 0 $ GPU-Kosten) — Linie ~/smyst-train
#   4. Promotions-Gate (gate.py, 40 Fragen, Max 600): neue Version muss den
#      Champion schlagen — sonst KEIN Release, Version wird verworfen
#   5. Bei Sieg: GGUF (Q4_K_M + Q8_0), Qualitaets-Tor (llama-server Smoke),
#      GitHub-Release mit 30-MB-Teilen (Resume-Upload im Hintergrund) und
#      Transfer-Auftrag — der model-transfer-watcher (launchd, stuendlich)
#      loest den e2-Spiegel aus, sobald alle Teile oben sind.
#
# Dieses Skript stellt NIE auf Produktion um (start-llm.sh, scale-2k-Workflows,
# llm_router.py sind Freeze-Bereiche — der Produktions-Wechsel bleibt allein
# eine Inhaber-Entscheidung). Es loescht niemals Daten oder Releases.
#
# Idempotent, wirft nie (launchd), loggt alles nach logs/autopilot.log.

set -uo pipefail
REPO_ROOT="/Users/alanbest/Library/CloudStorage/GoogleDrive-smyst247@gmail.com/.shortcut-targets-by-id/1GILNbp2CZmdjcolV9-kHi9Br4z8hwiub/smyst.com info/smyst.com app"
TRAIN_HOME="/Users/alanbest/smyst-train"
LOG="$HOME/Library/smyst-autopilots/logs/autopilot.log"
MARKER="$HOME/Library/smyst-autopilots/logs/.autopilot_last_run"
STATE="$TRAIN_HOME/autopilot-state.json"
EXPORT_DIR="$REPO_ROOT/training-export"
REGISTRY="$REPO_ROOT/training/model-registry.json"
EVAL_OUT="$HOME/Library/smyst-autopilots/logs/eval"
PARTS_BASE="$HOME/Library/smyst-autopilots"
PY="$TRAIN_HOME/.venv/bin/python"

log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }

mkdir -p "$EVAL_OUT" "$PARTS_BASE" 2>/dev/null || true

# gh im launchd-Kontext ohne Keychain: Token-Datei als Fallback (chmod 600)
if [ -f "$HOME/.smyst-secrets/gh_token" ] && ! gh auth status >/dev/null 2>&1; then
  export GH_TOKEN="$(cat "$HOME/.smyst-secrets/gh_token")"
fi
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

# 0) Voraussetzungen
if [ ! -x "$PY" ]; then log "FEHLER: $PY fehlt (venv) — kein Training."; exit 0; fi
FREE_GB=$(df -g / | awk 'NR==2{print $4}')
if [ "${FREE_GB:-0}" -lt 15 ]; then log "FEHLER: nur ${FREE_GB} GB frei (<15) — kein Training."; exit 0; fi

# 1) Neuesten Code holen (Autopilot aktualisiert sich selbst)
git -C "$REPO_ROOT" pull --quiet >> "$LOG" 2>&1 || log "WARNUNG: git pull fehlgeschlagen (offline?) – fahre mit lokalem Stand fort."

# 2) Schutzpause 2 h gegen Doppellauf (Starter + manueller Lauf)
if [ -f "$MARKER" ]; then
  LAST=$(cat "$MARKER" 2>/dev/null || echo 0)
  NOW=$(date +%s)
  if [ $(( NOW - LAST )) -lt $((2*3600)) ]; then
    log "Letzter Lauf erst $(( (NOW - LAST) / 60 ))min her – Schutzpause, nichts zu tun."
    exit 0
  fi
fi
date +%s > "$MARKER"

# 3) Trainingsdaten-Export anstossen und Artefakt holen. Scheitert der
#    Export (offline, API-Limit), laeuft der Zyklus mit dem letzten Stand.
EXPORT_RUN_ID=""
if command -v gh >/dev/null 2>&1; then
  log "Stosse Trainingsdaten-Export (GitHub) an …"
  if gh workflow run training-export.yml --ref main >> "$LOG" 2>&1; then
    for _ in $(seq 1 210); do
      sleep 20
      EXPORT_RUN_ID=$(gh run list --workflow=training-export.yml --limit 1 --json databaseId,status,conclusion -q '.[0] | select(.status=="completed") | .databaseId' 2>/dev/null)
      [ -n "$EXPORT_RUN_ID" ] && break
    done
    if [ -n "$EXPORT_RUN_ID" ]; then
      CONCL=$(gh run view "$EXPORT_RUN_ID" --json conclusion -q .conclusion 2>/dev/null)
      rm -rf "$EXPORT_DIR" && mkdir -p "$EXPORT_DIR"
      if [ "$CONCL" = "success" ] && gh run download "$EXPORT_RUN_ID" -n training-export -D "$EXPORT_DIR" >> "$LOG" 2>&1; then
        log "Export-Artefakt geholt (Run $EXPORT_RUN_ID)."
        echo "$EXPORT_RUN_ID" > "$EXPORT_DIR/.run-id"
      else
        log "WARNUNG: Export-Run $EXPORT_RUN_ID endete mit '$CONCL' – verwende letzten Stand."
        LATEST=$(ls -t "$TRAIN_HOME"/catalog-cache.json 2>/dev/null | head -1)
      fi
    else
      log "WARNUNG: Export-Run nicht rechtzeitig fertig – verwende letzten Stand."
    fi
  else
    log "WARNUNG: Export-Dispatch fehlgeschlagen (API-Limit?) – verwende letzten Stand."
  fi
fi

# 4) Daten-Gate: nur trainieren, wenn das Artefakt NEU ist (Run-ID-Vergleich)
LAST_DATA_RUN=$(python3 -c "import json;print(json.load(open('$STATE')).get('last_data_run',''))" 2>/dev/null || echo "")
THIS_RUN=$(cat "$EXPORT_DIR/.run-id" 2>/dev/null || echo "alt")
if [ "$THIS_RUN" = "alt" ] && [ ! -d "$EXPORT_DIR" ]; then
  log "Keine Trainingsdaten in $EXPORT_DIR – kein Training. (Export-Workflow pruefen.)"
  exit 0
fi
if [ -n "$LAST_DATA_RUN" ] && [ "$THIS_RUN" = "$LAST_DATA_RUN" ]; then
  log "Trainingsdaten unverändert (Run $THIS_RUN bereits trainiert) – kein Training nötig."
  exit 0
fi

# 5) Version + Trainingsdaten bauen (bewiesener Weg, Katalog-Slug-Auflösung)
VERSION=$(python3 -c "import json;v=json.load(open('$STATE'))['champion']['version'];m=v.split('-')[1].split('.');print(f\"smyst-{m[0]}.{int(m[1])+1}\")" 2>/dev/null)
[ -n "$VERSION" ] || { log "FEHLER: Version aus State nicht lesbar."; exit 0; }
log "NEUE Trainingsdaten (Run $THIS_RUN) – baue Datensatz fuer $VERSION …"
if ! python3 "$TRAIN_HOME/baue-trainingsdaten.py" "$EXPORT_DIR" >> "$LOG" 2>&1; then
  log "FEHLER beim Datensatz-Bau – kein Training, Live-Modell unangetastet."
  exit 0
fi

# 6) Training (LoRA-SFT, 2000 Iterationen, Rezept wie smyst-1.2)
cat > "$TRAIN_HOME/config-autopilot.yaml" <<EOF
model: "Qwen/Qwen2.5-1.5B-Instruct"
train: true
fine_tune_type: lora
data: "$TRAIN_HOME/mlx-data"
batch_size: 4
iters: 2000
learning_rate: 1.0e-05
max_seq_length: 2048
num_layers: 16
save_every: 200
steps_per_eval: 200
steps_per_report: 10
adapter_path: "$TRAIN_HOME/adapters/$VERSION"
grad_checkpoint: false
clear_cache_threshold: 0
lora_parameters:
  rank: 8
  dropout: 0.0
  scale: 20.0
EOF
rm -rf "$TRAIN_HOME/adapters/$VERSION"
log "Training $VERSION gestartet (2000 Iterationen, ca. 1-2 h) …"
if ! "$PY" -m mlx_lm lora -c "$TRAIN_HOME/config-autopilot.yaml" >> "$LOG" 2>&1; then
  log "FEHLER beim Training – siehe Log oben. Live-Modell bleibt unangetastet."
  exit 0
fi
grep -q "Saved final weights" "$LOG" || { log "FEHLER: Training endete ohne 'Saved final weights'."; exit 0; }
log "Training abgeschlossen."

# 7) Fuse + tokenizer_config bereinigen (extra_special_tokens-LIST-Falle)
if ! "$PY" -m mlx_lm fuse --model Qwen/Qwen2.5-1.5B-Instruct \
      --adapter-path "$TRAIN_HOME/adapters/$VERSION" \
      --save-path "$TRAIN_HOME/fused/$VERSION" >> "$LOG" 2>&1; then
  log "FEHLER beim Fuse – kein Gate, Live-Modell unangetastet."
  exit 0
fi
python3 - "$TRAIN_HOME/fused/$VERSION/tokenizer_config.json" <<'PY' >> "$LOG" 2>&1
import json, sys
p = sys.argv[1]
d = json.load(open(p))
d.pop("extra_special_tokens", None)
json.dump(d, open(p, "w"), indent=2, ensure_ascii=False)
PY

# 8) Promotions-Gate: 40 identische Fragen gegen den Champion (Max 600)
GATE_JSON="$TRAIN_HOME/gate-$VERSION-neu.json"
if ! "$PY" "$TRAIN_HOME/gate.py" "$TRAIN_HOME/fused/$VERSION" "$GATE_JSON" >> "$LOG" 2>&1; then
  log "Promotions-Gate: Eval fehlgeschlagen – KEINE Promotion, alter Stand bleibt."
  exit 0
fi
NEW_SCORE=$(python3 -c "import json;print(json.load(open('$GATE_JSON'))['checkpoint']['score'])")
CHAMP_SCORE=$(python3 -c "import json;print(json.load(open('$STATE'))['champion']['score'])")
BETTER=$(python3 -c "print(1 if float('$NEW_SCORE') > float('$CHAMP_SCORE') else 0)")
if [ "$BETTER" != "1" ]; then
  python3 - "$STATE" "$VERSION" "$NEW_SCORE" "$THIS_RUN" <<'PY'
import json, sys
p, v, s, run = sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4]
st = json.load(open(p))
st.setdefault("verworfen", []).append({"version": v, "score": s})
st["letzte_version"] = v
st["last_data_run"] = run
json.dump(st, open(p, "w"), indent=2, ensure_ascii=False)
PY
  log "Promotions-Gate: NEU $VERSION $NEW_SCORE <= Champion $CHAMP_SCORE – KEINE Promotion, Version verworfen."
  exit 0
fi
log "Promotions-Gate bestanden: $VERSION $NEW_SCORE > Champion $CHAMP_SCORE."

# 9) GGUF bauen (Konversion immer vom FUSED-Modell — MLX-Adapter ist nicht PEFT)
GG=/tmp/llama.cpp-gate
LM=/tmp/llama-mac
if [ ! -f "$GG/convert_hf_to_gguf.py" ]; then
  rm -rf "$GG" && git clone --depth 1 -q https://github.com/ggerganov/llama.cpp "$GG" >> "$LOG" 2>&1
fi
if [ ! -x "$LM/build/bin/llama-quantize" ]; then
  curl -sL --retry 3 -o /tmp/llama-mac.zip https://github.com/ggml-org/llama.cpp/releases/download/b6362/llama-b6362-bin-macos-arm64.zip >> "$LOG" 2>&1 \
    && rm -rf "$LM" && unzip -o -q /tmp/llama-mac.zip -d "$LM" >> "$LOG" 2>&1
fi
CVENV="$TRAIN_HOME/.venv-gguf/bin/python"
if [ ! -x "$CVENV" ]; then log "FEHLER: GGUF-venv fehlt ($CVENV) — kein Release, Modell nur lokal."; exit 0; fi
F16="/tmp/$VERSION-f16.gguf"
Q4="/tmp/$VERSION-Q4_K_M.gguf"
Q8="/tmp/$VERSION-Q8_0.gguf"
rm -rf "/tmp/$VERSION-hf" && cp -r "$TRAIN_HOME/fused/$VERSION" "/tmp/$VERSION-hf"
python3 - "/tmp/$VERSION-hf/tokenizer_config.json" <<'PY' >> "$LOG" 2>&1
import json, sys
p = sys.argv[1]
d = json.load(open(p)); d.pop("extra_special_tokens", None)
json.dump(d, open(p, "w"), indent=2, ensure_ascii=False)
PY
if ! "$CVENV" "$GG/convert_hf_to_gguf.py" "/tmp/$VERSION-hf" --outfile "$F16" --outtype f16 >> "$LOG" 2>&1 \
   || ! "$LM/build/bin/llama-quantize" "$F16" "$Q4" Q4_K_M >> "$LOG" 2>&1 \
   || ! "$LM/build/bin/llama-quantize" "$F16" "$Q8" Q8_0 >> "$LOG" 2>&1; then
  log "FEHLER bei GGUF-Konversion/Quantisierung — kein Release."
  exit 0
fi

# 10) Qualitaets-Tor: llama-server Smoke auf Q4_K_M UND Q8_0 ("Hallo!" ist
#     implizit, Haupttest = Persona mit Produktions-Anti-Loop-Sampling).
#     Bestanden ist erst: Antwort da, kein Loop, KEINE CJK-Zeichen (Sprach-
#     Drift-Falle 20.09.), Ich-Form, >= 20 Woerter, deutschlastig (Ratio >= 0.6).
PORT=8081
SMOKE_FRAGE='{"messages":[{"role":"system","content":"You are Albert Einstein — the AI twin profile. Answer as Albert Einstein yourself, in the first person. Keep it concise."},{"role":"user","content":"Wer sind Sie und was haben Sie entdeckt?"}],"max_tokens":250,"temperature":0.2,"top_p":0.95,"min_p":0.05,"repeat_penalty":1.18,"repeat_last_n":384,"frequency_penalty":0.25,"presence_penalty":0.2}'
pruefe_antwort() {
  python3 - "$1" <<'PY'
import json, re, sys
try:
    d = json.loads(sys.argv[1], strict=False)
    a = d["choices"][0]["message"]["content"]
except Exception:
    print("FAIL leer"); sys.exit(0)
w = a.split()
loop = any(len(w) >= 2*n and " ".join(w[-n:]).lower() == " ".join(w[-2*n:-n]).lower() for n in (8, 5, 4))
cjk = bool(re.search(r"[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]", a))
deutsch = len(re.findall(r"\b(ich|bin|und|der|die|das|nicht|ist|war|mein|meine|mit|auch|eine|sehr|aber|fuer|über|jahr|leben|werk|zeit)\b", a, re.I))
ratio = deutsch / max(len(w), 1)
if loop: print("FAIL loop")
elif cjk: print("FAIL cjk-drift")
elif not re.search(r"\b(ich|mein|mir|mich)\b", a, re.I): print("FAIL keine-ich-form")
elif len(w) < 20: print("FAIL zu-kurz")
elif ratio < 0.6: print(f"FAIL deutsch-ratio {ratio:.2f}")
else: print(f"OK {len(w)}w ratio {ratio:.2f}")
PY
}
SMOKE_GESAMT=1
for QUANT in Q4_K_M Q8_0; do
  DATEI=$( [ "$QUANT" = "Q4_K_M" ] && echo "$Q4" || echo "$Q8" )
  "$LM/build/bin/llama-server" -m "$DATEI" --port 8081 --ctx-size 8192 --alias "$VERSION-$QUANT" > "/tmp/llama-server-$VERSION-$QUANT.log" 2>&1 &
  SRV=$!
  R=""
  for _ in $(seq 1 90); do
    sleep 5
    R=$(curl -s --max-time 120 "http://127.0.0.1:$PORT/v1/chat/completions" -H "Content-Type: application/json" -d "$SMOKE_FRAGE" 2>/dev/null)
    echo "$R" | grep -q '"content"' && break
  done
  kill $SRV 2>/dev/null; wait $SRV 2>/dev/null
  URTEIL=$(pruefe_antwort "$R")
  log "Smoke $QUANT: $URTEIL"
  case "$URTEIL" in OK*) ;; *) SMOKE_GESAMT=0 ;; esac
done
if [ "$SMOKE_GESAMT" != "1" ]; then
  python3 - "$STATE" "$VERSION" "$NEW_SCORE" "$THIS_RUN" <<'PY'
import json, sys
p, v, s, run = sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4]
st = json.load(open(p))
st.setdefault("verworfen", []).append({"version": v, "score": s, "grund": "Smoke-Qualitaets-Tor (Quant-Schädigung/Sprach-Drift)"})
st["letzte_version"] = v
st["last_data_run"] = run
json.dump(st, open(p, "w"), indent=2, ensure_ascii=False)
PY
  log "Qualitaets-Tor FEHLGESCHLAGEN — KEIN Release, Version verworfen. Live-Modell unangetastet."
  exit 0
fi
log "Qualitaets-Tor bestanden (Q4_K_M + Q8_0)."

# 11) Release: 30-MB-Teile + SHA256SUMS, Upload-Loop im Hintergrund
# Fix 23.09.: NN ohne Punkt-Verlust — aus smyst-1.3 wurde frueher "3"
# (Tag v-smyst-3-gguf); jetzt korrekt "1.3" (Tag v-smyst-1.3-gguf).
NN=$(echo "$VERSION" | sed 's/^smyst-//')
TAG="v-smyst-$NN-gguf"
PARTS_DIR="$PARTS_BASE/parts-$NN"
rm -rf "$PARTS_DIR" && mkdir -p "$PARTS_DIR"
cd "/tmp" || exit 0
split -b 30m -d -a 2 "$Q4" "$PARTS_DIR/s${NN}q4p"
( cd "/tmp" && shasum -a 256 "$VERSION-Q4_K_M.gguf" "$VERSION-Q8_0.gguf" > "$PARTS_DIR/SHA256SUMS" )
TOTAL=$(ls "$PARTS_DIR"/s${NN}q4p* | wc -l | tr -d ' ')
if ! gh release view "$TAG" -R smyst-com/smyst-app >/dev/null 2>&1; then
  gh release create "$TAG" -R smyst-com/smyst-app --title "$VERSION GGUF (Q4_K_M + Q8_0)" \
    --notes "$VERSION (Qwen2.5-1.5B + LoRA, 2000 Iterationen). Gate: $NEW_SCORE/600 (Champion davor: $CHAMP_SCORE). Q4_K_M = ${TOTAL} Teile s${NN}q4pNN + SHA256SUMS; Q8_0-Teile folgen bei Bedarf. Automatisch vom Trainings-Autopilot." >> "$LOG" 2>&1
fi
cat > "$PARTS_BASE/upload-$NN.sh" <<UPEOF
#!/bin/bash
set -u
cd "$PARTS_DIR" || exit 1
ULO="\$HOME/Library/smyst-autopilots/logs/gguf-upload-$NN.log"
for r in \$(seq 1 10); do
  vorh="\$(gh release view "$TAG" -R smyst-com/smyst-app --json assets -q '.assets[].name' 2>/dev/null || true)"
  miss=0
  for f in SHA256SUMS s${NN}q4p*; do
    echo "\$vorh" | grep -qx "\$f" && continue
    miss=1
    echo "\$(date '+%F %T') UP \$f" >> "\$ULO"
    gh release upload "$TAG" -R smyst-com/smyst-app "\$f" --clobber >> "\$ULO" 2>&1 \
      || echo "\$(date '+%F %T') FEHLER \$f" >> "\$ULO"
  done
  [ "\$miss" = "0" ] && break
  sleep 60
done
echo "\$(date '+%F %T') FERTIG (alle \$r Runden)" >> "\$ULO"
UPEOF
chmod +x "$PARTS_BASE/upload-$NN.sh"
nohup "$PARTS_BASE/upload-$NN.sh" >/dev/null 2>&1 &
log "Upload-Loop gestartet ($TOTAL Teile -> Release $TAG), laeuft im Hintergrund."

# 12) Transfer-Auftrag: model-transfer-watcher (stuendlich) loest den e2-
#     Spiegel aus, sobald alle Teile im Release sind.
cat > "$PARTS_BASE/transfer-pending-$NN.json" <<TFEOF
{"release_tag": "$TAG", "parts_prefix": "s${NN}q4p", "out_name": "$VERSION-Q4_K_M.gguf", "e2_prefix": "models/$VERSION/$(date +%F)", "total_parts": $TOTAL}
TFEOF
log "Transfer-Auftrag hinterlegt: $PARTS_BASE/transfer-pending-$NN.json"

# 13) Promotion: State + Registry fortschreiben
python3 - "$STATE" "$VERSION" "$NEW_SCORE" "$GATE_JSON" "$THIS_RUN" <<'PY'
import json, sys, datetime
p, v, s, g, run = sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4], sys.argv[5]
st = json.load(open(p))
alt = st.get("champion", {})
st["history"] = st.get("history", [])[-19:] + [alt]
st["champion"] = {"version": v, "score": s, "gate_file": g.split("/")[-1]}
st["letzte_version"] = v
st["last_data_run"] = run
st["letzter_lauf"] = datetime.datetime.now().isoformat()
json.dump(st, open(p, "w"), indent=2, ensure_ascii=False)
print("State: Champion jetzt", v)
PY
python3 - "$REGISTRY" "$VERSION" "$NEW_SCORE" "$GATE_JSON" <<'PY'
import json, sys, datetime
from pathlib import Path
reg_path, version, score, report = sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4]
try:
    reg = json.loads(Path(reg_path).read_text())
except Exception:
    reg = {"version": version, "score": None, "history": []}
reg = {
    "version": version,
    "score": score,
    "model": f"fused/{version}",
    "promoted_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "eval_report": report,
    "history": reg.get("history", [])[-19:] + [{"version": reg.get("version"), "score": reg.get("score")}],
}
Path(reg_path).write_text(json.dumps(reg, indent=2, ensure_ascii=False))
PY
log "PROMOTION: $VERSION (Gate $NEW_SCORE > $CHAMP_SCORE) — Registry + State fortgeschrieben."
log "HINWEIS: Produktions-Wechsel (QA-Lane-Release-Referenz bzw. Chat-Kandidatenliste) bleibt bewusst Inhaber-Entscheidung."
log "=== Autopilot beendet ==="
exit 0
