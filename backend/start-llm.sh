#!/bin/bash
# smyst 1.0 — Startet llama-server als Hintergrundprozess neben der FastAPI.
# Laedt das aktive Modell aus IDrive e2 (nur solange das persistente Volume
# /models noch leer ist oder einen anderen Kandidaten enthaelt). Danach
# laeuft der Server dauerhaft mit ~1.2 GB RAM (von 8 GB auf Zeabur).

MODEL="/models/smyst-active.gguf"
# Markierung der aktiven Version (Volume /models ist persistent seit 28.09.):
# Liegt bereits der WUNSCH-Kandidat im Volume, entfaellt der e2-Download beim
# Container-Start komplett — sonst kaeme nach einem Modellwechsel immer der
# alte Volume-Inhalt zum Zug.
WANT_LABEL="smyst-1.1 Q4_K_M"
HAVE_LABEL="$(cat /models/.smyst-model 2>/dev/null || echo "")"

# ROLLBACK auf smyst-1.1 Q4_K_M (10.10.2026, Inhaber-Vollmacht "100 % fertig,
# bis alles stabil funktioniert"): smyst-1.3 Q4_K_M war seit dem 30.09. live
# und fiel im Betrieb durch — Live-Beweise 10.10.: Einstein-Chat antwortete
# als erfundene "Anna Maria von Habsburg-..."-Persona (falsche Identitaet),
# türkische Antworten grammatikalisch verstümmelt, non-stream Complete mit
# ReadTimeout-Ketten (08:05:25/08:05:40 UTC). smyst-1.1 Q4_K_M war vom
# 28.09.-30.09. live bewährt (echte Ich-Form-Persona-Antworten, türkische
# Pflicht-Smokes grün, Monats-Stichprobe #882: 475/600). 1.3 bleibt als
# zweite Kandidatin in der Liste (keine Entfernung — Wechsel zurück jederzeit
# möglich), Q8_0 v4 dahinter, smyst-1.0 f16 zuletzt. Q4_K_M zuerst (28.09.
# "blitzschnell": ~2x CPU-Speed gegen Q8_0). Freeze-Parameter ctx 8192 /
# parallel 2 / alias / nproc-Threads unveraendert.
if [ ! -f "$MODEL" ] || [ "$HAVE_LABEL" != "$WANT_LABEL" ]; then
  if [ -n "$IDRIVE_E2_ACCESS_KEY" ]; then
  echo "smyst: Lade Modell aus e2 (ein paar Minuten)..."
  mkdir -p /models
  python3 -c "
import boto3, sys
from botocore.config import Config
c = boto3.client('s3', endpoint_url='https://s3.us-west-2.idrivee2.com',
    region_name='us-west-2',
    aws_access_key_id='$IDRIVE_E2_ACCESS_KEY',
    aws_secret_access_key='$IDRIVE_E2_SECRET_KEY',
    config=Config(read_timeout=900, retries={'max_attempts': 10}))
candidates = [
    ('models/smyst-1.0/2026-08-25/smyst-1.1-Q4_K_M.gguf', 'smyst-1.1 Q4_K_M'),
    ('models/smyst-1.3/2026-09-23/smyst-1.3-Q4_K_M.gguf', 'smyst-1.3 Q4_K_M'),
    ('models/smyst-1.1/2026-08-23/smyst-1.1-v4-Q8_0.gguf', 'smyst-1.1 v4 Q8_0'),
    ('models/smyst-1.0/2026-08-20/smyst-1.0-f16.gguf', 'smyst-1.0 f16'),
]
for key, label in candidates:
    try:
        c.head_object(Bucket='smyst-memories', Key=key)
    except Exception:
        print(label, 'nicht in e2 — naechster Kandidat.')
        continue
    c.download_file('smyst-memories', key, '$MODEL')
    open('/models/.smyst-model', 'w').write(label)
    print('Modell geladen:', label)
    break
else:
    sys.exit('kein Modell in e2 gefunden')
" && echo "smyst: Modell bereit."
  fi
fi

# Binary-Pfad: Dockerfile entpackt nach /opt/llama/llama-b*/ (inkl. Shared
# Libs) — LD_LIBRARY_PATH zeigt auf das Archiv-Verzeichnis.
LLAMA_BIN=$(find /opt/llama -maxdepth 2 -type f -name llama-server 2>/dev/null | head -1)
LLAMA_DIR=$(dirname "$LLAMA_BIN" 2>/dev/null)

if [ -f "$MODEL" ] && [ -n "$LLAMA_BIN" ] && [ -x "$LLAMA_BIN" ]; then
  echo "smyst: Starte llama-server auf :8080 (f16, ~1.5 GB RAM)..."
  export LD_LIBRARY_PATH="$LLAMA_DIR:${LD_LIBRARY_PATH:-}"
  # Threads: alle verfuegbaren Kerne (frueher 1 Thread — bei 20 s LLM-Timeout
  # lief jede Anfrage ins Timeout, bevor das Modell antworten konnte).
  # nice 10: Die 2-Kern-VM teilte sich beide Kerne mit dem k3s-Control-Plane —
  # unter Chat-Last verhungerte k3s/kubelet zweimal (05.09.: K3s offline).
  # Mit lowerer Prioritaet behaelt die Control-Plane Vorrang, llama nutzt
  # beide Kerne weiter, wenn sie frei sind. Freeze-Parameter unveraendert.
  # --cache-reuse 256 (28.09.): Der Chat-Prompt beginnt mit dem langen,
  # pro Twin IDENTISCHEN System-Prompt — llama-server verschiebt per
  # KV-Shifting den gemeinsamen Prefix aus dem Vorlauf-Cache in den Slot
  # statt ihn neu zu berechnen. Folge-Nachrichten im selben Chat sparen
  # damit fast den kompletten Prefill.
  nice -n 10 "$LLAMA_BIN" \
    --model "$MODEL" \
    --alias smyst-1.0 \
    --host 127.0.0.1 --port 8080 \
    --ctx-size 8192 --parallel 2 \
    --cache-reuse 256 \
    --threads "$(nproc)" &
  export SMYST_LLM_BASE_URL=http://127.0.0.1:8080/v1
  echo "smyst: LLM-Server aktiv auf $SMYST_LLM_BASE_URL"
else
  echo "smyst: Nicht verfuegbar (Modell: $([ -f "$MODEL" ] && echo ja || echo fehlt), Binary: ${LLAMA_BIN:-fehlt}) — Fallback auf groq/gateway."
  unset SMYST_LLM_BASE_URL
fi

exec "$@"
