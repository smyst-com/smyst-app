# smyst 1.0 — llama.cpp-Server als Salad-Container (Mini-Image ~100 MB)
#
# Das Q4-Modell (350 MB) wird NICHT ins Image gebrannt, sondern beim Start
# aus IDrive e2 geladen (wie der Voice-Worker sein Modell laedt). Dadurch
# ist das Image ~100 MB statt 1,5 GB — jeder Salad-Knoten laedt es in
# Sekunden statt Minuten (das war die Blockade: Consumer-Knoten fielen
# waehrend des 1,5-GB-Downloads zurueck in 'allocating').
FROM ghcr.io/ggml-org/llama.cpp:light

COPY <<'SCRIPT' /app/start.sh
#!/bin/sh
set -e
MODEL=/models/smyst-1.0-Q4_K_M.gguf
if [ ! -f "$MODEL" ]; then
  echo "Lade smyst-1.0 aus e2..."
  mkdir -p /models
  curl -fsSL --retry 5 --retry-delay 3 "$MODEL_URL" -o /tmp/model-f16.gguf
  LD_LIBRARY_PATH=/app /app/llama-quantize /tmp/model-f16.gguf "$MODEL" Q4_K_M
  rm /tmp/model-f16.gguf
  echo "Modell bereit."
fi
exec /app/llama-server --model "$MODEL" --host 0.0.0.0 --port 8080 --ctx-size 4096 --parallel 4
SCRIPT
RUN chmod +x /app/start.sh
ENV LD_LIBRARY_PATH=/app
EXPOSE 8080
ENTRYPOINT ["/app/start.sh"]
