# Produktions-Dockerfile (Zeabur, Build-Kontext = REPO-ROOT).
# Zeabur baut mit dem Repo-Root als Kontext — alle COPY-Pfade tragen deshalb
# den backend/-Prefix. docker-compose (Profil legacy-local) baut mit demselben
# Kontext (context: .). Nach Aenderungen hier: in Zeabur Settings -> Dockerfile
# "Load from GitHub" klicken + Save + Redeploy (Override spiegelt diese Datei).

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIPER_BIN=/opt/piper/piper
ENV PIPER_VOICES_DIR=/voices
ENV ASR_LOCAL_MODEL=small
ENV ASR_MODEL_DIR=/models

# Piper-TTS (CPU) + kuratierte synthetische Stimmen — ersetzt den frueheren
# Salad-Voice-Worker fuer Standard-TTS. Kein Code-Change: tts.py nutzt den
# lokalen Piper-Pfad, sobald PIPER_BIN und /voices existieren.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && curl -fsSL https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz | tar -xz -C /opt \
 && test -x /opt/piper/piper

RUN mkdir -p /voices && cd /voices \
 && for v in \
      de/de_DE/thorsten/medium/de_DE-thorsten-medium \
      de/de_DE/kerstin/low/de_DE-kerstin-low \
      de/de_DE/karlsson/low/de_DE-karlsson-low \
      de/de_DE/pavoque/low/de_DE-pavoque-low \
      de/de_DE/ramona/low/de_DE-ramona-low \
      de/de_DE/eva_k/x_low/de_DE-eva_k-x_low \
      en/en_US/ryan/medium/en_US-ryan-medium \
      en/en_US/amy/medium/en_US-amy-medium \
      en/en_US/joe/medium/en_US-joe-medium \
      en/en_US/lessac/medium/en_US-lessac-medium \
      en/en_US/hfc_male/medium/en_US-hfc_male-medium \
      en/en_US/hfc_female/medium/en_US-hfc_female-medium \
      tr/tr_TR/dfki/medium/tr_TR-dfki-medium \
    ; do \
      f=${v##*/}; \
      curl -fsSL -o "$f.onnx" "https://huggingface.co/rhasspy/piper-voices/resolve/main/$v.onnx"; \
      curl -fsSL -o "$f.onnx.json" "https://huggingface.co/rhasspy/piper-voices/resolve/main/$v.onnx.json"; \
    done

WORKDIR /app

COPY backend/pyproject.toml ./
COPY backend/app ./app
RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir ".[asr]"

# Whisper-Modell (small, int8) ins Image backen: Server-Diktat (PR #283,
# local-whisper-Fallback in asr.py) ohne Kaltstart-Download beim ersten Aufruf.
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8', download_root='/models')"

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
