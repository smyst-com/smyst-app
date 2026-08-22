"""Langzeit-Gedaechnis: der Twin merkt sich Fakten ueber den Nutzer (Phase 3).

Deterministische Extraktion (keine zusaetzlichen LLM-Kosten, Free-tier-freundlich):
der Nutzer nennt Namen, Vorlieben, Wohnort, Beruf — oder bittet explizit
"merke dir ..."/"remember ...". Gespeichert wird pro Nutzer (user_store-Dokument,
Feld chatMemories, max. 50 Eintraege, dedupliziert) und beim naechsten Chat als
Block in den Prompt injiziert. Ohne Login kein Gedaechtnis (anonym weiter nutzbar).
"""

from __future__ import annotations

import re
import time
from typing import Any

from app.integrations.user_store import load_user_doc, save_user_doc

MAX_MEMORIES = 50
MAX_MEMORY_CHARS = 160

# (Muster, Sprache) – bewusst konservativ: nur klare Selbst-Aussagen des Nutzers.
# Fakten-Muster enden am Satzzeichen ([^.!?;]), damit sie nicht ganze Absätze schlucken;
# nur das explizite "merke dir"/"remember" darf laengere Passageen umfassen.
_FACT = r"[^.!?;\n]{2,40}"
_PATTERNS: list[re.Pattern[str]] = [
    re.compile(rf"\b(?:ich hei(?:ß|ss)e|mein name ist)\s+{_FACT}", re.IGNORECASE),
    re.compile(rf"\b(?:my name is|i am called|i'm called)\s+{_FACT}", re.IGNORECASE),
    re.compile(rf"\bich wohne in\s+{_FACT}", re.IGNORECASE),
    re.compile(rf"\bi live in\s+{_FACT}", re.IGNORECASE),
    re.compile(rf"\bich komme aus\s+{_FACT}", re.IGNORECASE),
    re.compile(rf"\b(?:ich (?:mag|liebe)|ich bin Fan von)\s+{_FACT}", re.IGNORECASE),
    re.compile(rf"\bi (?:like|love)\s+{_FACT}", re.IGNORECASE),
    re.compile(rf"\bich (?:arbeite als|bin)\s+(?:ein[er]?|die)?\s*{_FACT}", re.IGNORECASE),
    re.compile(rf"\bi (?:work as|am)\s+(?:an?|the)?\s*{_FACT}", re.IGNORECASE),
    re.compile(r"\bmerke dir[,!:]?\s+.{3,140}", re.IGNORECASE),
    re.compile(r"\bremember (?:that\s+)?.{3,140}", re.IGNORECASE),
]


def _clean(match_text: str) -> str:
    return " ".join(match_text.split()).rstrip(" .,;:")[  :MAX_MEMORY_CHARS]


def extract_user_memories(message: str) -> list[str]:
    """Alle Gedaechtnis-wuerdigen Selbst-Aussagen einer Nutzer-Nachricht."""
    found: list[str] = []
    for pattern in _PATTERNS:
        for match in pattern.finditer(message):
            cleaned = _clean(match.group(0))
            if cleaned and cleaned.lower() not in {item.lower() for item in found}:
                found.append(cleaned)
    return found[:5]


def remember(user_sub: str, text: str) -> bool:
    """Fakt im Nutzer-Dokument speichern (dedupliziert, max. 50)."""
    cleaned = _clean(text)
    if not cleaned:
        return False
    doc = load_user_doc(user_sub) or {"sub": user_sub}
    memories = [item for item in (doc.get("chatMemories") or []) if isinstance(item, dict)]
    lowered = cleaned.lower()
    if any(str(item.get("text", "")).lower() == lowered for item in memories):
        return False
    memories.append({"text": cleaned, "createdAt": int(time.time() * 1000)})
    doc["chatMemories"] = memories[-MAX_MEMORIES:]
    return save_user_doc(user_sub, doc)


def memory_block(user_sub: str | None, *, max_items: int = 15) -> str:
    """Prompt-Block mit den juengsten Erinnerungen an den Nutzer; leer ohne Login."""
    if not user_sub:
        return ""
    doc = load_user_doc(user_sub)
    if not doc:
        return ""
    memories = [item for item in (doc.get("chatMemories") or []) if isinstance(item, dict)]
    if not memories:
        return ""
    lines = [f"- {item.get('text', '')}" for item in memories[-max_items:] if item.get("text")]
    if not lines:
        return ""
    return (
        "What you remember about the user from earlier conversations "
        "(weave these in naturally when relevant, never list them mechanically):\n"
        + "\n".join(lines)
    )
