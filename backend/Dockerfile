FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir .

# Keep the control server small and stateless. Voice synthesis belongs on the
# dedicated worker layer; the API returns 503 for local Piper TTS when no worker
# or mounted voice engine is configured.

 EXPOSE 8000

 CMD ["uvicorn", "app.main:app", "--host", "::", "--port", "8000"]
 
