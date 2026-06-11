from __future__ import annotations

import html
import re
from dataclasses import dataclass


SQL_META_PATTERN = re.compile(
    r"(--|/\*|\*/|;|\b(drop|alter|truncate|union|exec|execute)\b)",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class ValidationResult:
    value: str
    warnings: list[str]


def escape_html(value: str) -> str:
    return html.escape(value, quote=True)


def normalize_text(value: str, *, max_length: int = 10_000) -> ValidationResult:
    warnings: list[str] = []
    normalized = re.sub(r"\s+", " ", value).strip()
    if len(normalized) > max_length:
        normalized = normalized[:max_length]
        warnings.append("truncated")
    if SQL_META_PATTERN.search(normalized):
        warnings.append("sql_meta_pattern_detected")
    return ValidationResult(value=normalized, warnings=warnings)


def assert_safe_identifier(value: str) -> str:
    if not re.fullmatch(r"[a-zA-Z0-9_.:-]{1,160}", value):
        raise ValueError("Unsafe identifier")
    return value

