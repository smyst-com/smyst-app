#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FORBIDDEN = [
    "cloud" + "flare",
    "wrang" + "ler",
    "@cloud" + "flare",
    "smyst-vite-app" + ".pages.dev",
]
SCAN_ROOTS = [
    ".github/workflows",
    "backend",
    "config",
    "public",
    "scripts",
    "src",
]
SCAN_FILES = [
    "README.md",
    "SETUP.md",
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
]
SKIP_PARTS = {
    ".git",
    "node_modules",
    "node_modules.broken.20260618112001",
    "dist",
    "dev-dist",
    "__pycache__",
}
SKIP_FILES = {
    "scripts/check-provider-exit.py",
}


def is_text(path: Path) -> bool:
    try:
        path.read_text(encoding="utf-8")
        return True
    except UnicodeDecodeError:
        return False


def iter_paths() -> list[Path]:
    paths: list[Path] = []
    for rel in SCAN_FILES:
        path = ROOT / rel
        if path.exists():
            paths.append(path)
    for rel in SCAN_ROOTS:
        base = ROOT / rel
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if not path.is_file():
                continue
            if any(part in SKIP_PARTS for part in path.relative_to(ROOT).parts):
                continue
            if path.relative_to(ROOT).as_posix() in SKIP_FILES:
                continue
            paths.append(path)
    return sorted(set(paths))


def main() -> None:
    issues: list[str] = []
    for path in iter_paths():
        if not is_text(path):
            continue
        rel = path.relative_to(ROOT)
        for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            lower = line.lower()
            for pattern in FORBIDDEN:
                if pattern.lower() in lower:
                    issues.append(f"{rel}:{line_no}: forbidden legacy provider reference: {pattern}")
    if issues:
        raise SystemExit("FAILED provider exit check:\n" + "\n".join(issues))
    print("provider exit validation passed")


if __name__ == "__main__":
    main()
