# smyst.com Voice-Worker (Phase 2) — Piper-Standard-TTS (CPU) + Chatterbox-Klon-TTS (GPU).
# Stateless; Chatterbox-/Whisper-Modelle werden beim ersten Start nach /tmp/hf geladen.
# Piper-Binary und -Stimmen sind ins Image gebundelt (Option A, Freigabe 14.07.2026).
FROM python:3.11-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg libsndfile1 libgomp1 git espeak-ng \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# chatterbox-tts bringt torch/torchaudio als Abhaengigkeit mit (CUDA-Wheels).
RUN pip install --no-cache-dir chatterbox-tts faster-whisper "fastapi>=0.115" "uvicorn[standard]>=0.32" "httpx>=0.27"

# Piper TTS: statisches Binary + rein synthetische Stimmen (Open Source, MIT)
ADD https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz /tmp/piper.tar.gz
RUN tar -xzf /tmp/piper.tar.gz -C /opt && rm /tmp/piper.tar.gz

# Kuratierte de/en/tr-Stimmen (19 Voice-IDs inkl. Aliase, siehe PIPER_VOICE_FILES)
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx /voices/de_DE-thorsten-medium.onnx
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx.json /voices/de_DE-thorsten-medium.onnx.json
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/kerstin/low/de_DE-kerstin-low.onnx /voices/de_DE-kerstin-low.onnx
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/kerstin/low/de_DE-kerstin-low.onnx.json /voices/de_DE-kerstin-low.onnx.json
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/karlsson/low/de_DE-karlsson-low.onnx /voices/de_DE-karlsson-low.onnx
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/karlsson/low/de_DE-karlsson-low.onnx.json /voices/de_DE-karlsson-low.onnx.json
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/pavoque/low/de_DE-pavoque-low.onnx /voices/de_DE-pavoque-low.onnx
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/pavoque/low/de_DE-pavoque-low.onnx.json /voices/de_DE-pavoque-low.onnx.json
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/ramona/low/de_DE-ramona-low.onnx /voices/de_DE-ramona-low.onnx
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/ramona/low/de_DE-ramona-low.onnx.json /voices/de_DE-ramona-low.onnx.json
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/eva_k/x_low/de_DE-eva_k-x_low.onnx /voices/de_DE-eva_k-x_low.onnx
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/eva_k/x_low/de_DE-eva_k-x_low.onnx.json /voices/de_DE-eva_k-x_low.onnx.json
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/medium/en_US-ryan-medium.onnx /voices/en_US-ryan-medium.onnx
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/medium/en_US-ryan-medium.onnx.json /voices/en_US-ryan-medium.onnx.json
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx /voices/en_US-amy-medium.onnx
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx.json /voices/en_US-amy-medium.onnx.json
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/joe/medium/en_US-joe-medium.onnx /voices/en_US-joe-medium.onnx
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/joe/medium/en_US-joe-medium.onnx.json /voices/en_US-joe-medium.onnx.json
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx /voices/en_US-lessac-medium.onnx
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json /voices/en_US-lessac-medium.onnx.json
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/hfc_male/medium/en_US-hfc_male-medium.onnx /voices/en_US-hfc_male-medium.onnx
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/hfc_male/medium/en_US-hfc_male-medium.onnx.json /voices/en_US-hfc_male-medium.onnx.json
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/hfc_female/medium/en_US-hfc_female-medium.onnx /voices/en_US-hfc_female-medium.onnx
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/hfc_female/medium/en_US-hfc_female-medium.onnx.json /voices/en_US-hfc_female-medium.onnx.json
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/tr/tr_TR/dfki/medium/tr_TR-dfki-medium.onnx /voices/tr_TR-dfki-medium.onnx
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/tr/tr_TR/dfki/medium/tr_TR-dfki-medium.onnx.json /voices/tr_TR-dfki-medium.onnx.json

# Je eine Piper-Standardstimme fuer weitere Sprachwellen-Sprachen
# (ja/ko/bn haben keine Piper-Stimme und laufen ueber espeak-ng).
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/siwis/medium/fr_FR-siwis-medium.onnx /voices/fr_FR-siwis-medium.onnx
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/siwis/medium/fr_FR-siwis-medium.onnx.json /voices/fr_FR-siwis-medium.onnx.json
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/sharvard/medium/es_ES-sharvard-medium.onnx /voices/es_ES-sharvard-medium.onnx
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/sharvard/medium/es_ES-sharvard-medium.onnx.json /voices/es_ES-sharvard-medium.onnx.json
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/it/it_IT/paola/medium/it_IT-paola-medium.onnx /voices/it_IT-paola-medium.onnx
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/it/it_IT/paola/medium/it_IT-paola-medium.onnx.json /voices/it_IT-paola-medium.onnx.json
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/faber/medium/pt_BR-faber-medium.onnx /voices/pt_BR-faber-medium.onnx
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/faber/medium/pt_BR-faber-medium.onnx.json /voices/pt_BR-faber-medium.onnx.json
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/irina/medium/ru_RU-irina-medium.onnx /voices/ru_RU-irina-medium.onnx
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/irina/medium/ru_RU-irina-medium.onnx.json /voices/ru_RU-irina-medium.onnx.json
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/ar/ar_JO/kareem/medium/ar_JO-kareem-medium.onnx /voices/ar_JO-kareem-medium.onnx
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/ar/ar_JO/kareem/medium/ar_JO-kareem-medium.onnx.json /voices/ar_JO-kareem-medium.onnx.json
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/zh/zh_CN/huayan/medium/zh_CN-huayan-medium.onnx /voices/zh_CN-huayan-medium.onnx
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/zh/zh_CN/huayan/medium/zh_CN-huayan-medium.onnx.json /voices/zh_CN-huayan-medium.onnx.json
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/hi/hi_IN/pratham/medium/hi_IN-pratham-medium.onnx /voices/hi_IN-pratham-medium.onnx
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/hi/hi_IN/pratham/medium/hi_IN-pratham-medium.onnx.json /voices/hi_IN-pratham-medium.onnx.json
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/id/id_ID/news_tts/medium/id_ID-news_tts-medium.onnx /voices/id_ID-news_tts-medium.onnx
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/id/id_ID/news_tts/medium/id_ID-news_tts-medium.onnx.json /voices/id_ID-news_tts-medium.onnx.json

RUN chmod -R a+rX /opt/piper /voices

COPY app.py /app/app.py

ENV HF_HOME=/tmp/hf \
    TORCH_HOME=/tmp/torch \
    PYTHONUNBUFFERED=1 \
    PIPER_BIN=/opt/piper/piper \
    PIPER_VOICES_DIR=/voices

EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "::", "--port", "8000"]
