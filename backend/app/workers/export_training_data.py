"""smyst.com Trainings-Export-Worker: Chat-Archive -> Trainings-JSONL.

Baustein fuer smyst 1.0 (eigenes Modell via Continued Pretraining): liest die
Chat-Archive (chat-archives/, IDrive e2) und verdichtet sie zu zwei
JSONL-Dateien im Trainingsformat:

- sft-<datum>.jsonl         alle User->Twin-Austausche (Supervised Fine-Tuning)
- preference-<datum>.jsonl  nur bewertete Antworten (Daumen hoch/runter) als
                            Rohmaterial fuer spaetere DPO-Paare

Es werden NUR Chats mit twinId exportiert (ohne Persona kein Trainingswert)
und ausschliesslich gelesen — Archive und Feedback bleiben unveraendert.
Records enthalten keine Nutzerkennung; die Chat-ID bleibt als technischer
Schluessel fuer Loesch-Anfragen erhalten.

Start:
    python -m app.workers.export_training_data --dry-run
    python -m app.workers.export_training_data --out training-export --limit 500
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

import boto3
from botocore.config import Config

from app.core.config import settings
from app.integrations.chat_store import CHAT_ARCHIVE_PREFIX

#: Mehr Verlauf bringt kein Signal mehr, blaeht die Records aber stark auf.
HISTORY_LIMIT = 8


def storage_configured() -> bool:
    return bool(settings.idrive_e2_access_key and settings.idrive_e2_secret_key)


def _client() -> Any:
    return boto3.client(
        "s3",
        endpoint_url=settings.idrive_e2_endpoint,
        region_name=settings.idrive_e2_region,
        aws_access_key_id=settings.idrive_e2_access_key,
        aws_secret_access_key=settings.idrive_e2_secret_key,
        config=Config(connect_timeout=4, read_timeout=10, retries={"max_attempts": 2}),
    )


def iter_chat_archives(client: Any, *, limit: int | None = None) -> Iterator[dict]:
    """Liest Chat-Archive aus e2; fehlerhafte Objekte werden still uebersprungen."""
    count = 0
    paginator = client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=settings.idrive_e2_bucket, Prefix=CHAT_ARCHIVE_PREFIX):
        for entry in page.get("Contents", []) or []:
            if limit is not None and count >= limit:
                return
            try:
                response = client.get_object(Bucket=settings.idrive_e2_bucket, Key=entry["Key"])
                data = json.loads(response["Body"].read().decode("utf-8"))
            except Exception:
                continue
            if isinstance(data, dict) and data.get("id"):
                count += 1
                yield data


def _text(message: dict) -> str:
    content = message.get("content")
    return content.strip() if isinstance(content, str) else ""


def build_training_records(chat: dict) -> tuple[list[dict], list[dict]]:
    """Zerlegt EIN Chat-Archiv in SFT- und Preference-Records (rein, testbar).

    SFT-Record je vollstaendigem User->Assistant-Paar; Preference-Record
    zusaetzlich fuer jede Antwort mit Nutzerbewertung (rating up/down —
    Meldungen ("report") sind Moderationsfaelle, keine Trainingssignale).
    """
    twin_id = chat.get("twinId")
    if not isinstance(twin_id, str) or not twin_id:
        return [], []
    messages = chat.get("messages")
    if not isinstance(messages, list):
        return [], []

    sft: list[dict] = []
    preference: list[dict] = []
    history: list[dict[str, str]] = []
    pending_user: dict | None = None

    for message in messages:
        if not isinstance(message, dict):
            continue
        role = message.get("role")
        text = _text(message)
        if role == "user":
            pending_user = message if text else None
            continue
        if role != "assistant" or not text or pending_user is None:
            continue
        record = {
            "twinId": twin_id,
            "chatId": chat.get("id"),
            "language": pending_user.get("language"),
            "history": history[-HISTORY_LIMIT:],
            "prompt": _text(pending_user),
            "response": text,
            "createdAt": message.get("createdAt"),
        }
        sft.append(record)
        feedback = message.get("feedback")
        rating = feedback.get("rating") if isinstance(feedback, dict) else None
        if rating in ("up", "down"):
            preference.append({**record, "rating": rating, "comment": feedback.get("comment")})
        history = history[-HISTORY_LIMIT:] + [
            {"role": "user", "content": _text(pending_user)},
            {"role": "assistant", "content": text},
        ]
        pending_user = None

    return sft, preference


def write_jsonl(records: list[dict], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def main(argv: list[str] | None = None) -> int:  # pragma: no cover - CLI-Verdrahtung
    parser = argparse.ArgumentParser(description="smyst.com Trainings-Export (Chat-Archive -> JSONL)")
    parser.add_argument("--out", default="training-export", help="Zielverzeichnis fuer JSONL-Dateien")
    parser.add_argument("--limit", type=int, default=None, help="max. Anzahl Chat-Archive")
    parser.add_argument("--dry-run", action="store_true", help="nur zaehlen, nichts schreiben")
    args = parser.parse_args(argv)

    if not storage_configured():
        print("IDrive-e2-Zugang nicht konfiguriert (IDRIVE_E2_ACCESS_KEY/SECRET_KEY).")
        return 1

    sft_all: list[dict] = []
    preference_all: list[dict] = []
    chats = 0
    for chat in iter_chat_archives(_client(), limit=args.limit):
        chats += 1
        sft, preference = build_training_records(chat)
        sft_all.extend(sft)
        preference_all.extend(preference)

    stamp = datetime.now(timezone.utc).date().isoformat()
    print(f"{chats} Chat-Archive gelesen -> {len(sft_all)} SFT-Records, {len(preference_all)} Preference-Records")
    if args.dry_run:
        print("Dry-Run: nichts geschrieben.")
        return 0

    out = Path(args.out)
    write_jsonl(sft_all, out / f"sft-{stamp}.jsonl")
    write_jsonl(preference_all, out / f"preference-{stamp}.jsonl")
    print(f"Geschrieben nach {out}/sft-{stamp}.jsonl und {out}/preference-{stamp}.jsonl")
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
