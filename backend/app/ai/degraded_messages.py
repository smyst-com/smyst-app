"""Lokalisierte Wartemeldungen fuer den degradierten LLM-Fallback.

Der lokale deterministische Fallback (LocalDeterministicProvider) arbeitete
frueher als Prompt-Echo: Er gab Prompt-/Kontext-Interna woertlich an Endnutzer
zurueck (live beobachtet am 2026-07-17 im oeffentlichen Twin-Chat). Dieses
Modul liefert stattdessen eine kurze, sichere Wartemeldung in der Sprache des
Nutzers — ohne jegliche Prompt-Interna.
"""

from __future__ import annotations

import re
from typing import Any

# Sprachumfang deckungsgleich mit REQUIRED_VOICE_LANGUAGES im Frontend
# (src/lib/voiceLanguage.ts).
DEGRADED_FALLBACK_MESSAGES: dict[str, str] = {
    "en": "I'm sorry - I can't reach my knowledge right now. Please try again in a moment.",
    "de": "Entschuldige - ich kann gerade nicht auf mein Wissen zugreifen. Bitte versuche es gleich noch einmal.",
    "tr": "Uzgunum - su anda bilgime ulasamiyorum. Lutfen birazdan tekrar dene.",
    "es": "Lo siento: ahora mismo no puedo acceder a mi conocimiento. Intentalo de nuevo en un momento.",
    "fr": "Desole - je ne peux pas acceder a mes connaissances pour le moment. Reessaie dans un instant.",
    "it": "Mi dispiace: al momento non riesco ad accedere alle mie conoscenze. Riprova tra un attimo.",
    "pt": "Desculpa - nao consigo aceder ao meu conhecimento neste momento. Tenta novamente daqui a pouco.",
    "ru": "Извини — сейчас я не могу получить доступ к своим знаниям. Пожалуйста, попробуй ещё раз через минуту.",
    "zh": "抱歉——我现在无法访问我的知识。请稍后再试。",
    "ja": "ごめんなさい。今は知識にアクセスできません。少し待ってからもう一度お試しください。",
    "ko": "죄송합니다. 지금은 지식에 접근할 수 없습니다. 잠시 후 다시 시도해 주세요.",
    "ar": "عذرا - لا أستطيع الوصول إلى معرفتي الآن. يرجى المحاولة مرة أخرى بعد قليل.",
    "hi": "माफ़ कीजिए - मैं अभी अपनी जानकारी तक नहीं पहुँच पा रहा हूँ। कृपया थोड़ी देर में फिर कोशिश करें।",
    "id": "Maaf - saat ini saya tidak dapat mengakses pengetahuan saya. Silakan coba lagi sebentar lagi.",
    "bn": "দুঃখিত - এই মুহূর্তে আমি আমার জ্ঞানে পৌঁছাতে পারছি না। অনুগ্রহ করে একটু পরে আবার চেষ্টা করুন।",
}

DEFAULT_DEGRADED_LANGUAGE = "en"

# Das Frontend markiert die Zielsprache in der Nutzernachricht, z. B.
# "[Voice language: German (de). Answer only in German. ...]"
# (src/lib/voiceLanguage.ts, voiceLanguageInstruction).
_VOICE_LANGUAGE_MARKER = re.compile(
    r"\[voice language:[^\](]*\((?P<code>[a-z]{2})\)", re.IGNORECASE
)


def resolve_degraded_language(prompt: str, metadata: dict[str, Any] | None = None) -> str:
    """Ermittelt die Sprache fuer die Wartemeldung.

    Reihenfolge: explizite Sprache aus Request-Metadata, dann der
    Voice-Language-Marker aus dem Prompt, sonst Englisch.
    """
    if isinstance(metadata, dict):
        meta_lang = str(metadata.get("language") or "").strip().lower()[:2]
        if meta_lang in DEGRADED_FALLBACK_MESSAGES:
            return meta_lang
    match = _VOICE_LANGUAGE_MARKER.search(prompt or "")
    if match:
        code = match.group("code").lower()
        if code in DEGRADED_FALLBACK_MESSAGES:
            return code
    return DEFAULT_DEGRADED_LANGUAGE


def degraded_fallback_message(prompt: str, metadata: dict[str, Any] | None = None) -> str:
    """Kurze, sichere Wartemeldung in Nutzersprache — nie Prompt-Interna."""
    return DEGRADED_FALLBACK_MESSAGES[resolve_degraded_language(prompt, metadata)]
