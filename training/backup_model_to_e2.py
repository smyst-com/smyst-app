#!/usr/bin/env python3
"""Sichert smyst-Modell-Artefakte (Fast-Track) nach IDrive e2.

alles andere (Publish-Index, Profilbilder, Chat-Archive, QA-Berichte,
Trainingsdaten-Exporte) liegt ohnehin in e2 — nur die MLX-Trainings-
ergebnisse (fused-Modell, LoRA-Adapter) existieren bisher NUR lokal auf
dem Entwickler-Mac. Dieses Skript laedt sie unter einem versionierten
Pfad hoch, z. B.:

    models/smyst-1.0/2026-08-20/fused/model.safetensors
    models/smyst-1.0/2026-08-20/adapters.safetensors
    models/smyst-1.0/2026-08-20/MANIFEST.json

Start (Keys wie beim Backend — automatisch aus backend/.env gelesen,
        oder als Umgebungsvariablen):
    ../backend/.venv/bin/python backup_model_to_e2.py --version 2026-08-20

backend/.env (gitignored) braucht nur:
    IDRIVE_E2_ACCESS_KEY=...
    IDRIVE_E2_SECRET_KEY=...

Ohne Keys: --dry-run zeigt nur, was hochgeladen wuerde.
"""

from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import os
import sys
from pathlib import Path

ENDPOINT = "https://s3.us-west-2.idrivee2.com"
REGION = "us-west-2"
BUCKET = "smyst-memories"

#: Was gesichert wird: (lokaler Pfad relativ zu training/, e2-Dateiname).
#: Bewusst KLEINE DATEIEN ZUERST — bei wackliger Anbindung kommen die sicher
#: durch, und das 1-GB-Modell als Letztes (ein Abbruch kostet dann nur den
#: grossen Teil, nicht die kleinen).
ARTEFAKTE = [
    ("fused/smyst-1.0-sft/config.json", "fused-config.json"),
    ("fused/smyst-1.0-sft/generation_config.json", "fused-generation-config.json"),
    ("fused/smyst-1.0-sft/tokenizer_config.json", "fused-tokenizer-config.json"),
    ("fused/smyst-1.0-sft/tokenizer.json", "fused-tokenizer.json"),
    ("adapters/smyst-1.0-sft/adapters.safetensors", "adapters.safetensors"),
    ("fused/smyst-1.0-sft/model.safetensors", "fused-model.safetensors"),
]


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description="smyst-Modellartefakte -> IDrive e2")
    parser.add_argument("--version", default=datetime.date.today().isoformat(),
                        help="Versionsname des Stands (Default: heute)")
    parser.add_argument("--dry-run", action="store_true", help="nur zeigen, nicht hochladen")
    args = parser.parse_args()

    base = Path(__file__).resolve().parent
    vorhanden = [(base / lokal, name) for lokal, name in ARTEFAKTE if (base / lokal).exists()]
    fehlen = [lokal for lokal, _ in ARTEFAKTE if not (base / lokal).exists()]
    if fehlen:
        print("FEHLEND (uebersprungen):", ", ".join(fehlen))
    if not vorhanden:
        sys.exit("keine Artefakte gefunden — zuerst train_smyst_fasttrack.sh laufen lassen")

    manifest = {
        "model": "smyst-1.0-sft",
        "version": args.version,
        "basis": "Qwen/Qwen2.5-0.5B-Instruct",
        "erstellt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "dateien": {name: {"bytes": p.stat().st_size, "sha256": _sha256(p)} for p, name in vorhanden},
    }

    key_prefix = f"models/smyst-1.0/{args.version}"
    total = sum(p.stat().st_size for p, _ in vorhanden)
    print(f"{len(vorhanden)} Dateien, {total / 1e6:.1f} MB -> s3://{BUCKET}/{key_prefix}/")
    if args.dry_run:
        for p, name in vorhanden:
            print(f"  {name:32s} {p.stat().st_size / 1e6:8.1f} MB")
        return 0

    access = os.environ.get("IDRIVE_E2_ACCESS_KEY", "").strip()
    secret = os.environ.get("IDRIVE_E2_SECRET_KEY", "").strip()
    if not access or not secret:
        # Fallback: backend/.env (liegt neben training/), ist gitignored und
        # wird von nichts anderem eingelesen — nur fuer lokale Laeuufe.
        env_file = base.parent / "backend" / ".env"
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                if line.startswith("IDRIVE_E2_ACCESS_KEY="):
                    access = access or line.split("=", 1)[1].strip()
                elif line.startswith("IDRIVE_E2_SECRET_KEY="):
                    secret = secret or line.split("=", 1)[1].strip()
    if not access or not secret:
        sys.exit(
            "IDRIVE_E2_ACCESS_KEY/IDRIVE_E2_SECRET_KEY fehlen: entweder als "
            "Umgebungsvariablen oder in backend/.env eintragen."
        )

    import boto3
    from botocore.config import Config

    # e2 von diesem Anschluss aus langsam (gemesen ~3 MB/s): grosszuegige
    # Zeitlimits + Wiederholungen, sonst bricht der 1-GB-Upload mitten im
    # Multipart-Teil ab (ReadTimeout ab Part ~6 am 20.08. erlebt).
    client = boto3.client(
        "s3", endpoint_url=ENDPOINT, region_name=REGION,
        aws_access_key_id=access, aws_secret_access_key=secret,
        config=Config(connect_timeout=10, read_timeout=900,
                      retries={"max_attempts": 10}),
    )
    for path, name in vorhanden:
        _upload_robust(client, path, f"{key_prefix}/{name}", name)
    client.put_object(
        Bucket=BUCKET, Key=f"{key_prefix}/MANIFEST.json",
        Body=json.dumps(manifest, indent=2, ensure_ascii=False).encode("utf-8"),
        ContentType="application/json",
    )
    print(f"FERTIG — inkl. MANIFEST.json unter s3://{BUCKET}/{key_prefix}/")
    return 0


def _upload_robust(client, path: Path, key: str, name: str, part_mb: int = 16,
                   part_retries: int = 8) -> None:
    """Datei-Upload mit eigenem Multipart-Teil-Retry.

    Warum nicht client.upload_file: Bei instabiler Anbindung (gemesen:
    Verbindungsabbruch alle 1-2 Minuten unter Dauerlast) bricht botocore
    den GESAMTEN Upload mitten im Teil ab und startet von vorn — bei 1 GB
    unbrauchbar. Hier ist nur der aktuelle Teil vom Abbruch betroffen und
    wird mit frischer Verbindung wiederholt.
    """
    size = path.stat().st_size
    if size <= part_mb * 1024 * 1024:
        for versuch in range(1, part_retries + 1):
            try:
                client.put_object(Bucket=BUCKET, Key=key, Body=path.read_bytes())
                print(f"  hochgeladen: {name}")
                return
            except Exception as error:
                print(f"  {name}: Versuch {versuch} fehlgeschlagen ({type(error).__name__}), erneut...", flush=True)
        raise RuntimeError(f"{name} konnte nicht hochgeladen werden")

    upload = client.create_multipart_upload(Bucket=BUCKET, Key=key)
    upload_id = upload["UploadId"]
    parts: list[dict[str, object]] = []
    anzahl = (size + part_mb * 1024 * 1024 - 1) // (part_mb * 1024 * 1024)
    try:
        with path.open("rb") as handle:
            for nr in range(1, anzahl + 1):
                chunk = handle.read(part_mb * 1024 * 1024)
                for versuch in range(1, part_retries + 1):
                    try:
                        antwort = client.upload_part(
                            Bucket=BUCKET, Key=key, UploadId=upload_id,
                            PartNumber=nr, Body=chunk,
                        )
                        parts.append({"PartNumber": nr, "ETag": antwort["ETag"]})
                        if nr % 10 == 0 or nr == anzahl:
                            print(f"  {name}: Teil {nr}/{anzahl}", flush=True)
                        break
                    except Exception as error:
                        print(f"  {name}: Teil {nr}, Versuch {versuch} ({type(error).__name__})", flush=True)
                else:
                    raise RuntimeError(f"{name}: Teil {nr} endgueltig gescheitert")
        client.complete_multipart_upload(
            Bucket=BUCKET, Key=key, UploadId=upload_id,
            MultipartUpload={"Parts": parts},
        )
        print(f"  hochgeladen: {name} ({anzahl} Teile)")
    except Exception:
        try:
            client.abort_multipart_upload(Bucket=BUCKET, Key=key, UploadId=upload_id)
        except Exception:
            pass
        raise


if __name__ == "__main__":
    raise SystemExit(main())
