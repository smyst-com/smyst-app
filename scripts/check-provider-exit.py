#!/usr/bin/env python3
from __future__ import annotations

import ast
import io
import tokenize
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
# Kommentare/Doc-Strings sind Prosa, kein Provider-Aufruf: sie werden vor dem
# Scan ausmaskiert (Zeilennummern bleiben erhalten), damit echte Code-Treffer
# weiterhin anschlagen. Dateitypen ohne Kommentar-Syntax (md, json, html)
# werden unveraendert geprueft.
SLASH_COMMENT_SUFFIXES = {
    ".c",
    ".cjs",
    ".css",
    ".go",
    ".h",
    ".java",
    ".js",
    ".jsx",
    ".kt",
    ".mjs",
    ".rs",
    ".scss",
    ".swift",
    ".ts",
    ".tsx",
}
HASH_COMMENT_SUFFIXES = {
    ".cfg",
    ".conf",
    ".env",
    ".example",
    ".ini",
    ".sh",
    ".toml",
    ".yaml",
    ".yml",
    ".zsh",
}
HASH_COMMENT_NAMES = {
    "Dockerfile",
    ".dockerignore",
    ".gitignore",
}


def blank_span(chars: list[list[str]], line_no: int, start_col: int, end_col: int | None = None) -> None:
    """Ersetzt einen Bereich einer Zeile durch Leerzeichen (1-basierte Zeile)."""
    if not 1 <= line_no <= len(chars):
        return
    line = chars[line_no - 1]
    stop = len(line) if end_col is None else min(end_col, len(line))
    for col in range(max(start_col, 0), stop):
        line[col] = " "


def mask_python(text: str) -> str:
    chars = [list(line) for line in text.splitlines()]
    try:
        for token in tokenize.generate_tokens(io.StringIO(text).readline):
            if token.type == tokenize.COMMENT:
                blank_span(chars, token.start[0], token.start[1])
        tree = ast.parse(text)
    except (SyntaxError, tokenize.TokenError, IndentationError, ValueError):
        # Unparsebar: lieber roh scannen (False Positive) als etwas uebersehen.
        return text
    for node in ast.walk(tree):
        if not isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        doc = node.body[0] if node.body else None
        if not isinstance(doc, ast.Expr) or not isinstance(doc.value, ast.Constant):
            continue
        if not isinstance(doc.value.value, str):
            continue
        for line_no in range(doc.lineno, (doc.end_lineno or doc.lineno) + 1):
            blank_span(chars, line_no, 0)
    return "\n".join("".join(line) for line in chars)


def mask_slash_comments(text: str) -> str:
    chars = [list(line) for line in text.splitlines()]
    row, col = 1, 0
    quote: str | None = None
    idx = 0
    while idx < len(text):
        char = text[idx]
        nxt = text[idx + 1] if idx + 1 < len(text) else ""
        if char == "\n":
            row, col, idx = row + 1, 0, idx + 1
            continue
        if quote is not None:
            if char == "\\":
                col, idx = col + 2, idx + 2
                continue
            if char == quote:
                quote = None
            col, idx = col + 1, idx + 1
            continue
        if char in "\"'`":
            quote = char
            col, idx = col + 1, idx + 1
            continue
        if char == "/" and nxt == "/":
            blank_span(chars, row, col)
            while idx < len(text) and text[idx] != "\n":
                idx += 1
            continue
        if char == "/" and nxt == "*":
            start_row, start_col = row, col
            idx += 2
            col += 2
            while idx < len(text) and not (text[idx] == "*" and text[idx + 1 : idx + 2] == "/"):
                if text[idx] == "\n":
                    blank_span(chars, row, start_col if row == start_row else 0)
                    row, col = row + 1, 0
                else:
                    col += 1
                idx += 1
            blank_span(chars, row, start_col if row == start_row else 0, col + 2)
            col, idx = col + 2, idx + 2
            continue
        col, idx = col + 1, idx + 1
    return "\n".join("".join(line) for line in chars)


def mask_hash_comments(text: str) -> str:
    masked: list[str] = []
    for line in text.splitlines():
        quote: str | None = None
        cut: int | None = None
        for col, char in enumerate(line):
            if quote is not None:
                if char == quote:
                    quote = None
                continue
            if char in "\"'":
                quote = char
                continue
            if char == "#" and (col == 0 or line[col - 1] in " \t"):
                cut = col
                break
        masked.append(line if cut is None else line[:cut])
    return "\n".join(masked)


def mask_comments(path: Path, text: str) -> str:
    if path.suffix == ".py":
        return mask_python(text)
    if path.suffix in SLASH_COMMENT_SUFFIXES:
        return mask_slash_comments(text)
    if path.suffix in HASH_COMMENT_SUFFIXES or path.name in HASH_COMMENT_NAMES:
        return mask_hash_comments(text)
    return text


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
        scanned = mask_comments(path, path.read_text(encoding="utf-8"))
        for line_no, line in enumerate(scanned.splitlines(), start=1):
            lower = line.lower()
            for pattern in FORBIDDEN:
                if pattern.lower() in lower:
                    issues.append(f"{rel}:{line_no}: forbidden legacy provider reference: {pattern}")
    if issues:
        raise SystemExit("FAILED provider exit check:\n" + "\n".join(issues))
    print("provider exit validation passed")


if __name__ == "__main__":
    main()
