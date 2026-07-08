# smyst.com Voice-Worker (Phase 2) — Chatterbox-Klon-TTS auf GPU.
# Stateless; Modelle werden beim ersten Start nach /tmp/hf geladen.
FROM python:3.11-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg libsndfile1 libgomp1 git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# chatterbox-tts bringt torch/torchaudio als Abhaengigkeit mit (CUDA-Wheels).
RUN pip install --no-cache-dir chatterbox-tts faster-whisper "fastapi>=0.115" "uvicorn[standard]>=0.32" "httpx>=0.27"

COPY app.py /app/app.py

ENV HF_HOME=/tmp/hf \
    TORCH_HOME=/tmp/torch \
    PYTHONUNBUFFERED=1

EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "::", "--port", "8000"]
