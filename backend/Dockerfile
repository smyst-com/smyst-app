FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir --upgrade pip \
  && pip install --no-cache-dir .

# Piper TTS: statisches Binary + rein synthetische Stimmen (Open Source, MIT)
ADD https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz /tmp/piper.tar.gz
RUN tar -xzf /tmp/piper.tar.gz -C /opt && rm /tmp/piper.tar.gz

ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx /voices/de_DE-thorsten-medium.onnx
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx.json /voices/de_DE-thorsten-medium.onnx.json
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/kerstin/low/de_DE-kerstin-low.onnx /voices/de_DE-kerstin-low.onnx
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/kerstin/low/de_DE-kerstin-low.onnx.json /voices/de_DE-kerstin-low.onnx.json
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/medium/en_US-ryan-medium.onnx /voices/en_US-ryan-medium.onnx
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/medium/en_US-ryan-medium.onnx.json /voices/en_US-ryan-medium.onnx.json
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx /voices/en_US-amy-medium.onnx
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx.json /voices/en_US-amy-medium.onnx.json
RUN chmod -R a+rX /opt/piper /voices

EXPOSE 8000

CMD uvicorn app.main:app --host :: --port 8000
