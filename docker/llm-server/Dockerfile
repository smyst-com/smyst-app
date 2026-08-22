# smyst 1.0 — llama.cpp-Server als Salad-CPU-Container
#
# Build (im Workflow "smyst 1.0 LLM Deploy"): das f16-GGUF kommt per BuildKit-
# Secret (presigned e2-URL) in die Quantisierungs-Stufe — das fertige Q4-Modell
# liegt IM IMAGE, zur Laufzeit braucht der Container keinerlei Zugangsdaten und
# keinen Download (Neustarts sind dadurch sicher).
#
# Laufzeit: llama-server auf :8080, OpenAI-kompatibel (/v1/chat/completions),
# Health unter /health. Auth: LLM_API_KEY (Bearer) — im Deploy-Skript gesetzt.

FROM ghcr.io/ggml-org/llama.cpp:full-cpu AS quantisierer
WORKDIR /work
# Die Secret-Datei enthaelt NUR die presigned URL (ein Objekt, <=7 Tage
# gueltig) — sie landet nicht im Image.
RUN --mount=type=secret,id=modelurl,required=true \
    curl -fsSL "$(cat /run/secrets/modelurl)" -o smyst-1.0-f16.gguf \
    && /app/llama-quantize smyst-1.0-f16.gguf smyst-1.0-Q4_K_M.gguf Q4_K_M

FROM ghcr.io/ggml-org/llama.cpp:server-cpu
COPY --from=quantisierer /work/smyst-1.0-Q4_K_M.gguf /models/smyst-1.0-Q4_K_M.gguf
ENV LLAMA_ARG_MODEL=/models/smyst-1.0-Q4_K_M.gguf \
    LLAMA_ARG_HOST=0.0.0.0 \
    LLAMA_ARG_PORT=8080 \
    LLAMA_ARG_CTX_SIZE=4096 \
    LLAMA_ARG_PARALLEL=4
EXPOSE 8080
