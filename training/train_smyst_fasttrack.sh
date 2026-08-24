#!/usr/bin/env bash
# smyst 1.0 Fast-Track: SFT (LoRA) auf dem Entwickler-Mac mit MLX — 0 $ GPU-Kosten.
#
# Vorbereitung (einmal):
#   1. GitHub -> Actions -> "Trainingsdaten-Export (smyst 1.0)" -> Run workflow
#   2. Artefakt "training-export" herunterladen und in ../training-export entpacken
#
# Start:
#   ./train_smyst_fasttrack.sh                      # Qwen2.5-0.5B-Instruct, 1000 Iterationen
#   ./train_smyst_fasttrack.sh Qwen/Qwen2.5-1.5B-Instruct 2000   # staerkere Basis
#
# Ergebnis: adapters/smyst-1.0-sft (LoRA) und fused/smyst-1.0-sft (gemergtes
# Modell) plus ein Beispiel-Prompt zum Gegenlesen. Danach: Auswertung gegen
# das eingefrorene Eval-Set (siehe training/README.md, Promotions-Gate),
# Export nach GGUF fuer den llama.cpp-Server (docker/Dockerfile.llamacpp).
set -euo pipefail
cd "$(dirname "$0")"

MODEL="${1:-Qwen/Qwen2.5-0.5B-Instruct}"
ITERS="${2:-1000}"
EXPORT_DIR="${3:-../training-export}"
DATA_DIR="../mlx-data"
ADAPTER_DIR="adapters/smyst-1.0-sft"
FUSED_DIR="fused/smyst-1.0-sft"

# MLX gibt es nur fuer Apple Silicon.
if [ "$(uname -m)" != "arm64" ]; then
  echo "FEHLER: MLX benoetigt Apple Silicon (arm64). Auf diesem Rechner: $(uname -m)" >&2
  exit 1
fi

if ! ls "$EXPORT_DIR"/sft-*.jsonl >/dev/null 2>&1; then
  echo "FEHLER: keine sft-*.jsonl in $EXPORT_DIR — zuerst Trainingsdaten-Export (Workflow) + Artefakt-Download." >&2
  exit 1
fi

# Eigene venv, damit das Projekt-Backend unberuehrt bleibt. Bevorzugt uv
# (bringt eigene Python-Builds mit, mlx_lm will >= 3.10); ohne uv reicht
# python3.12, falls vorhanden. python3.9 (Mac-Systempython) reicht NICHT.
if [ ! -x .venv-mlx/bin/mlx_lm.lora ]; then
  if command -v uv >/dev/null 2>&1; then
    uv venv -q --python 3.12 .venv-mlx
    uv pip install -q --python .venv-mlx/bin/python mlx mlx_lm
  elif command -v python3.12 >/dev/null 2>&1; then
    python3.12 -m venv .venv-mlx
    ./.venv-mlx/bin/pip install -q --upgrade mlx mlx_lm
  else
    echo "FEHLER: braucht uv oder python3.12 fuer mlx_lm (Systempython 3.9 reicht nicht)." >&2
    exit 1
  fi
fi

echo "== 1/4 Daten konvertieren ($EXPORT_DIR -> $DATA_DIR) =="
# --from-qa ist der Fast-Track-Datensatz: die QA-Antworten der Pipeline
# (GPT-4o, verdict=pass, mit Profilkontext) — ohne ihn sind es nur die
# wenigen echten Chat-Austausche. Deaktivierbar via WITH_QA_DATA=0.
QA_FLAG="--from-qa"
if [ "${WITH_QA_DATA:-1}" = "0" ]; then QA_FLAG=""; fi
# Daumen-hoch-Feedback ( preference-*.jsonl) ist belohntes Verhalten und
# gehoert in jeden Lauf — abschaltbar via WITH_PREFERENCE_DATA=0.
PREF_FLAG="--from-preference"
if [ "${WITH_PREFERENCE_DATA:-1}" = "0" ]; then PREF_FLAG=""; fi
./prepare_sft_mlx.py --in "$EXPORT_DIR" --out "$DATA_DIR" $QA_FLAG $PREF_FLAG

echo "== 2/4 LoRA-SFT: $MODEL, $ITERS Iterationen =="
./.venv-mlx/bin/mlx_lm.lora \
  --model "$MODEL" \
  --train \
  --data "$DATA_DIR" \
  --fine-tune-type lora \
  --num-layers 16 \
  --batch-size 4 \
  --iters "$ITERS" \
  --adapter-path "$ADAPTER_DIR"

echo "== 3/4 Adapter mit Basis verschmelzen =="
./.venv-mlx/bin/mlx_lm.fuse --model "$MODEL" --adapter-path "$ADAPTER_DIR" --save-path "$FUSED_DIR"

echo "== 4/4 Beispiel-Antwort (Gegenlesen!) =="
./.venv-mlx/bin/mlx_lm.generate \
  --model "$FUSED_DIR" \
  --prompt "Du bist ein KI-Zwilling auf smyst.com. Stelle dich kurz vor und erklaere, wer du bist." \
  --max-tokens 120

echo ""
echo "FERTIG: $FUSED_DIR — naechster Schritt: Eval gegen smyst-eval-v2, dann GGUF-Export fuer llama.cpp."
