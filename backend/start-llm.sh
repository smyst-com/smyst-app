#!/bin/bash
# smyst 1.0 — Startet llama-server als Hintergrundprozess neben der FastAPI.
# Laedt das f16-Modell (988 MB) aus IDrive e2 beim ersten Start. Danach
# laeuft der Server dauerhaft mit ~1.5 GB RAM ( von 8 GB auf Zeabur).

MODEL="/models/smyst-1.0-f16.gguf"

if [ ! -f "$MODEL" ] && [ -n "$IDRIVE_E2_ACCESS_KEY" ]; then
  echo "smyst 1.0: Lade f16-Modell aus e2 (988 MB, ein paar Minuten)..."
  mkdir -p /models
  python3 -c "
import boto3, sys
from botocore.config import Config
c = boto3.client('s3', endpoint_url='https://s3.us-west-2.idrivee2.com',
    region_name='us-west-2',
    aws_access_key_id='$IDRIVE_E2_ACCESS_KEY',
    aws_secret_access_key='$IDRIVE_E2_SECRET_KEY',
    config=Config(read_timeout=900, retries={'max_attempts': 10}))
c.download_file('smyst-memories', 'models/smyst-1.0/2026-08-20/smyst-1.0-f16.gguf', '$MODEL')
print('Modell geladen.')
" && echo "smyst 1.0: Modell bereit."
fi

if [ -f "$MODEL" ] && [ -x /usr/local/bin/llama-server ]; then
  echo "smyst 1.0: Starte llama-server auf :8080 (f16, ~1.5 GB RAM)..."
  /usr/local/bin/llama-server \
    --model "$MODEL" \
    --host 127.0.0.1 --port 8080 \
    --ctx-size 2048 --parallel 2 \
    --threads 1 &
  export SMYST_LLM_BASE_URL=http://127.0.0.1:8080/v1
  echo "smyst 1.0: LLM-Server aktiv auf $SMYST_LLM_BASE_URL"
else
  echo "smyst 1.0: Nicht verfuegbar — Fallback auf groq/gateway."
  unset SMYST_LLM_BASE_URL
fi

exec "$@"
