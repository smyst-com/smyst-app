#!/usr/bin/env python3
"""SBOM- und Technology-Profil-Generator (Security-Autopilot, 29.09.2026).

Erzeugt .security/sbom.json aus den zwei Lockfiles des Repos:
- package-lock.json (npm/Frontend+Root)
- backend/uv.lock (Python/Backend, via uv export beim Aufrufer)

Plus ein grobes Technology-Profil (Stack-Ebenen) fuer den Radar-Abgleich.
Frei von Netz-Zugaengen: reine Datei-Auswertung.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
OUT_DIR = ROOT / ".security"


def npm_packages() -> dict[str, str]:
    lock = ROOT / "package-lock.json"
    result: dict[str, str] = {}
    if not lock.exists():
        return result
    data = json.loads(lock.read_text())
    for name, info in data.get("packages", {}).items():
        if not name:
            continue
        clean = name.removeprefix("node_modules/")
        version = info.get("version")
        if clean and version:
            result[clean] = version
    return result


def pypi_packages(requirements_txt: Path | None) -> dict[str, str]:
    result: dict[str, str] = {}
    if requirements_txt is None or not requirements_txt.exists():
        return result
    for line in requirements_txt.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith(("#", "-")) or "==" not in line:
            continue
        name, _, version = line.partition("==")
        name = name.split("[")[0].strip()
        version = version.split(";")[0].strip()
        if name and version:
            result[name] = version
    return result


def technology_profile() -> dict[str, str]:
    return {
        "frontend": "react+vite (github pages)",
        "backend": "python/fastapi (zeabur)",
        "database": "keine SQL-DB; IDrive e2 (S3, Object Brain)",
        "cache": "In-Process-RAM (kein Redis in Produktion)",
        "ai": "smyst-1.1 (llama.cpp) + OpenRouter/Groq-Kette",
        "auth": "HMAC-Session-Tokens + Google-OIDC-Login + E-Mail-Konten (scrypt)",
        "containers": "python:3.12-slim (backend), github-hosted runner (ci)",
        "os": "debian-slim-Basis im Container; CI ubuntu-24.04",
        "ci": "github actions (alle uses SHA-gepinnt)",
        "storage": "idrive e2 (privat) + github pages (statisch)",
        "dns_tls": "spaceship dns; zeabur ingress TLS",
    }


def main() -> int:
    req = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    npm = npm_packages()
    pypi = pypi_packages(req)
    OUT_DIR.mkdir(exist_ok=True)
    sbom = {
        "schema": "smyst-sbom-v1",
        "generatedAtUtc": datetime.now(timezone.utc).isoformat(),
        "technologyProfile": technology_profile(),
        "components": [
            {
                "ecosystem": "npm",
                "name": name,
                "version": version,
                "scope": "production-lockfile",
            }
            for name, version in sorted(npm.items())
        ]
        + [
            {
                "ecosystem": "PyPI",
                "name": name,
                "version": version,
                "scope": "backend-lockfile",
            }
            for name, version in sorted(pypi.items())
        ],
        "counts": {"npm": len(npm), "pypi": len(pypi), "total": len(npm) + len(pypi)},
    }
    (OUT_DIR / "sbom.json").write_text(json.dumps(sbom, indent=1, ensure_ascii=False) + "\n")
    print(f"SBOM: {len(npm)} npm + {len(pypi)} pypi = {len(npm) + len(pypi)} Komponenten -> .security/sbom.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
