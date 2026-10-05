#!/usr/bin/env python3
"""Verdichtet Profilbilder unter die GitHub-Pages-Artefaktgrenze.

Befund 03.-05.10.2026: Das Pages-Artefakt (Bilderanteil ~8,2-8,4 GB bei
~79k Profilen, Ø ~100 kB nach der alten 512-px-Diaet) wurde vom
Deploy-Step wiederholt mit 'total size is less than 10GB' abgelehnt —
die Website zeigte tagelang keine neuen Profile. Der erste Versuch
(PR #911, ImageMagick) war ein No-op: magick/convert sind auf
ubuntu-latest NICHT vorinstalliert (bekannte Falle, siehe alter
Bild-Diaet-Schritt und Deploy 32432444735). Dieses Skript nutzt Pillow
und mehrere Prozesse.

Regeln:
- Nur JPEG-Dateien (PNG/ander bleiben unberuehrt — Endungs-Inhalt muss
  zusammenpassen; die alte Diaet kodert ebenfalls nur JPEG-Endungen neu).
- Nur Dateien > MIN_BYTES; 512 px Kante behalten (keine sichtbare
  Design-Aenderung), Qualitaet 65 + optimize.
- Neues Bild ersetzt das alte NUR, wenn es kleiner ist — niemals
  Verschlechterung ohne Gewinn; idempotent (bereits verdichtete fallen
  unter die Schwelle).
"""

from __future__ import annotations

import os
import sys
from concurrent.futures import ProcessPoolExecutor

ROOT = "dist/public/profile-images"
MIN_BYTES = 40 * 1024
MAX_EDGE = 512
QUALITY = 65
WORKERS = 8

def _du_mb(root: str) -> int:
    total = 0
    for dirpath, _dirs, files in os.walk(root):
        for name in files:
            try:
                total += os.path.getsize(os.path.join(dirpath, name))
            except OSError:
                pass
    return total // (1024 * 1024)

def _shrink(path: str) -> int:
    try:
        original = os.path.getsize(path)
        if original <= MIN_BYTES or not path.lower().endswith((".jpg", ".jpeg")):
            return 0
        from PIL import Image  # erst nach den Billig-Checks importieren

        with Image.open(path) as img:
            rgb = img.convert("RGB") if img.mode != "RGB" else img
            rgb.thumbnail((MAX_EDGE, MAX_EDGE))
            tmp = path + ".shrunk"
            rgb.save(tmp, "JPEG", quality=QUALITY, optimize=True)
        if os.path.getsize(tmp) < original:
            os.replace(tmp, path)
            return original - os.path.getsize(path)
        os.remove(tmp)
        return 0
    except Exception:
        try:
            os.remove(path + ".shrunk")
        except OSError:
            pass
        return 0

def main() -> int:
    if not os.path.isdir(ROOT):
        print(f"{ROOT} nicht vorhanden — nichts zu verdichten.")
        return 0
    before = _du_mb(ROOT)
    files = [
        os.path.join(dirpath, name)
        for dirpath, _dirs, names in os.walk(ROOT)
        for name in names
    ]
    with ProcessPoolExecutor(max_workers=WORKERS) as pool:
        saved = sum(pool.map(_shrink, files, chunksize=256))
    after = _du_mb(ROOT)
    print(
        f"Bilder verdichtet (Pillow, {WORKERS} Prozesse): {before} MB -> {after} MB "
        f"(gespart {saved // (1024 * 1024)} MB von {len(files)} Dateien)"
    )
    return 0

if __name__ == "__main__":
    sys.exit(main())
