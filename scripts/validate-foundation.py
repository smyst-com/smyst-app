#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

REQUIRED_FILES = [
    "README.md",
    "SETUP.md",
    "package.json",
    "package-lock.json",
    ".github/workflows/deploy.yml",
    ".github/workflows/e2e-deployment.yml",
    ".github/workflows/foundation-ci.yml",
    "config/backup-recovery-manifest.json",
    "config/change-protection-manifest.json",
    "config/surface-protection-manifest.json",
    "config/final-readiness-scorecard.json",
    "scripts/check-backup-recovery.py",
    "scripts/check-change-protection.py",
    "scripts/check-surface-protection.py",
    "scripts/check-final-readiness.py",
    "scripts/check-profile-image-design-guard.py",
    "scripts/check-provider-exit.py",
    "scripts/live-test.sh",
    "scripts/test-all.sh",
    "src/App.tsx",
    "src/data/curated-public-twin-data.ts",
    "src/lib/useAuth.ts",
    "src/lib/useTwinMvp.ts",
    "src/lib/useMemoryUpload.ts",
    "backend/app/main.py",
    "backend/app/api/v1/router.py",
    "backend/app/security/middleware.py",
    "public/robots.txt",
    "public/sitemap.xml",
    "public/llms.txt",
    "public/ai.txt",
    "public/.well-known/security.txt",
    "public/_headers",
    "public/manifest.webmanifest",
    "public/sw.js",
    "public/offline.html",
    "capacitor.config.ts",
]

REQUIRED_TEXT = {
    "README.md": ["Spaceship", "IDrive e2", "Salad", "GitHub"],
    "SETUP.md": ["Spaceship DNS", "IDrive e2 Static Hosting", "Salad Compute", "GitHub Actions"],
    ".github/workflows/deploy.yml": ["workflow_dispatch", "IDrive e2 Static Deploy", "Salad Backend Deploy"],
    "config/change-protection-manifest.json": ["GitHub.com Free", "IDrive e2", "Salad.com", "Spaceship DNS"],
    "config/surface-protection-manifest.json": ["salad-api-idrive-metadata", "idrive-e2"],
    "config/final-readiness-scorecard.json": ["Spaceship DNS", "IDrive e2 as central storage", "Salad compute"],
    "scripts/check-provider-exit.py": ["provider exit validation passed"],
    "backend/app/main.py": ["FastAPI", "CORSMiddleware"],
    "backend/app/api/v1/router.py": ["api_router", "include_router"],
    "backend/app/security/middleware.py": ["Strict-Transport-Security"],
    "src/data/curated-public-twin-data.ts": ["CURATED_PUBLIC_TWIN_SPECS", "REQUIRED_PUBLIC_TWIN_CATEGORIES"],
    "public/llms.txt": ["GitHub Free", "Spaceship DNS", "IDrive e2", "Salad"],
}

FORBIDDEN_PATHS = [
    "workers",
    "wrang" + "ler.toml",
    "wrang" + "ler.translate.toml",
    "wrang" + "ler.www-redirect.toml",
    "wrang" + "ler.legacy-auth-redirect.toml",
    "scripts/activate-" + "cloud" + "flare-subdomains.mjs",
    "scripts/deploy-" + "cloud" + "flare-pages.mjs",
    "scripts/deploy-" + "cloud" + "flare-workers-api.mjs",
    "scripts/check-" + "cloud" + "flare-cutover.sh",
]


def fail(message: str) -> None:
    raise SystemExit(f"FAILED foundation validation: {message}")


def require(value: bool, message: str) -> None:
    if not value:
        fail(message)


def main() -> None:
    for rel_path in REQUIRED_FILES:
        require((ROOT / rel_path).exists(), f"required file missing: {rel_path}")

    for rel_path in FORBIDDEN_PATHS:
        require(not (ROOT / rel_path).exists(), f"legacy provider path must be removed: {rel_path}")

    for rel_path, terms in REQUIRED_TEXT.items():
        content = (ROOT / rel_path).read_text(encoding="utf-8")
        missing = [term for term in terms if term not in content]
        require(not missing, f"{rel_path} missing required terms: {', '.join(missing)}")

    print("foundation validation passed")


if __name__ == "__main__":
    main()
