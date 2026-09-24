"""Versioniertes Sprachregister von smyst.com.

Auftrag Inhaber 24.09.2026: weltweite Mehrsprachigkeit aller Profile mit
versioniertem Sprachregister, eindeutigen Sprachcodes und getrennt erfassten
Varianten (z. B. Kurmandschi ku vs. Sorani ckb).

Quelle des Weltumfangs: Ethnologue, 29. Auflage 2026 — 7.170 lebende
Sprachen (https://www.ethnologue.com/faq/how-many-languages/, Stand
Sep. 2026). Glottolog zaehlt dagegen ~7.900 Eintraege (andere
Klassifikationsmethodik); wir dokumentieren Ethnologue als Primaerquelle.

Dieses Register ist die DEFINITION des Testumfangs (was geprueft werden
soll), nicht das Testergebnis. Ergebnisse pflegt der Language-Autopilot
(app/workers/language_autopilot.py) in der Testmatrix im Object Brain.
Eine Sprache gilt erst dann als unterstuetzt, wenn der Autopilot die
 jeweilige Funktion nachweislich bestanden hat — registriert heisst NICHT
funktionierend.

Tiers:
  P0 = Prioritaet (Auftrag): Deutsch, Tuerkisch, Englisch, Kurdisch
       (Kurmandschi + Sorani getrennt)
  P1 = die 15 Voice-/UI-Sprachen (src/lib/voiceLanguage.ts, ASR, TTS)
  P2 = naechste Ausbaustufe nach Sprecherzahl (Text-Chat zuerst)
  P3 = Rest des Ethnologue-Umfangs — registriert als ZIEL, ungetestet,
       bis Kapazitaet und Fachpruefung da sind (keine Behauptung).

Gebaerdensprachen (z. B. DGS, ASL, TID) haben keinen Audio-/Text-Pfad in
diesem Register; sie sind als nicht anwendbar markiert und brauchen eigene
Verfahren (Video/Avatare) — offen, nicht behauptet.
"""

from __future__ import annotations

LANGUAGE_REGISTER_VERSION = "1.0.0"
ETHNOLOGUE_LIVING_LANGUAGES_2026 = 7_170
ETHNOLOGUE_SOURCE = "Ethnologue: Languages of the World, 29. Auflage 2026"

# code -> (englischer Name, einheimischer Name, Schrift, Tier, Familie, RTL)
_REGISTER: dict[str, tuple[str, str, str, str, str, bool]] = {
    # ── P0: Prioritaetssprachen (Auftrag 24.09.2026) ──────────────────────
    "de": ("German", "Deutsch", "Latn", "P0", "Indogermanisch > Germanisch", False),
    "tr": ("Turkish", "Türkçe", "Latn", "P0", "Turkisch > Oghusisch", False),
    "en": ("English", "English", "Latn", "P0", "Indogermanisch > Germanisch", False),
    "ku": ("Kurdish (Kurmanji)", "Kurdî (Kurmancî)", "Latn", "P0", "Iranisch > Nordwest", False),
    "ckb": ("Kurdish (Sorani)", "کوردیی سۆرانی", "Arab", "P0", "Iranisch > Nordwest", True),
    # ── P1: Voice-/UI-Matrix (15 Sprachen) ───────────────────────────────
    "zh": ("Chinese", "中文", "Hans", "P1", "Sinitisch", False),
    "es": ("Spanish", "Español", "Latn", "P1", "Indogermanisch > Romanisch", False),
    "ar": ("Arabic", "العربية", "Arab", "P1", "Afroasiatisch > Semitisch", True),
    "fr": ("French", "Français", "Latn", "P1", "Indogermanisch > Romanisch", False),
    "pt": ("Portuguese", "Português", "Latn", "P1", "Indogermanisch > Romanisch", False),
    "ru": ("Russian", "Русский", "Cyrl", "P1", "Indogermanisch > Slawisch", False),
    "ja": ("Japanese", "日本語", "Jpan", "P1", "Japonisch", False),
    "ko": ("Korean", "한국어", "Kore", "P1", "Koreisch", False),
    "it": ("Italian", "Italiano", "Latn", "P1", "Indogermanisch > Romanisch", False),
    "hi": ("Hindi", "हिन्दी", "Deva", "P1", "Indogermanisch > Indoarisch", False),
    "id": ("Indonesian", "Bahasa Indonesia", "Latn", "P1", "Malayo-Polynesisch", False),
    "bn": ("Bengali", "বাংলা", "Beng", "P1", "Indogermanisch > Indoarisch", False),
    # ── P2: Ausbaustufe nach Sprecherzahl (Text zuerst) ──────────────────
    "nl": ("Dutch", "Nederlands", "Latn", "P2", "Indogermanisch > Germanisch", False),
    "pl": ("Polish", "Polski", "Latn", "P2", "Indogermanisch > Slawisch", False),
    "uk": ("Ukrainian", "Українська", "Cyrl", "P2", "Indogermanisch > Slawisch", False),
    "ro": ("Romanian", "Română", "Latn", "P2", "Indogermanisch > Romanisch", False),
    "el": ("Greek", "Ελληνικά", "Grek", "P2", "Indogermanisch > Griechisch", False),
    "hu": ("Hungarian", "Magyar", "Latn", "P2", "Uralisch > Ugrian", False),
    "cs": ("Czech", "Čeština", "Latn", "P2", "Indogermanisch > Slawisch", False),
    "sv": ("Swedish", "Svenska", "Latn", "P2", "Indogermanisch > Germanisch", False),
    "da": ("Danish", "Dansk", "Latn", "P2", "Indogermanisch > Germanisch", False),
    "fi": ("Finnish", "Suomi", "Latn", "P2", "Uralisch > Finnisch", False),
    "he": ("Hebrew", "עברית", "Hebr", "P2", "Afroasiatisch > Semitisch", True),
    "fa": ("Persian", "فارسی", "Arab", "P2", "Iranisch > Südwest", True),
    "ur": ("Urdu", "اردو", "Arab", "P2", "Indogermanisch > Indoarisch", True),
    "pa": ("Punjabi", "ਪੰਜਾਬੀ", "Guru", "P2", "Indogermanisch > Indoarisch", False),
    "ta": ("Tamil", "தமிழ்", "Taml", "P2", "Dravidisch", False),
    "te": ("Telugu", "తెలుగు", "Telu", "P2", "Dravidisch", False),
    "mr": ("Marathi", "मराठी", "Deva", "P2", "Indogermanisch > Indoarisch", False),
    "gu": ("Gujarati", "ગુજરાતી", "Gujr", "P2", "Indogermanisch > Indoarisch", False),
    "vi": ("Vietnamese", "Tiếng Việt", "Latn", "P2", "Austroasiatisch", False),
    "th": ("Thai", "ไทย", "Thai", "P2", "Tai-Kadai", False),
    "sw": ("Swahili", "Kiswahili", "Latn", "P2", "Niger-Kongo > Bantu", False),
    "am": ("Amharic", "አማርኛ", "Ethi", "P2", "Afroasiatisch > Semitisch", False),
    "ha": ("Hausa", "Hausa", "Latn", "P2", "Afroasiatisch > Tschadisch", False),
    "yo": ("Yoruba", "Yorùbá", "Latn", "P2", "Niger-Kongo > Volta-Niger", False),
    "ig": ("Igbo", "Igbo", "Latn", "P2", "Niger-Kongo > Volta-Niger", False),
    "zu": ("Zulu", "isiZulu", "Latn", "P2", "Niger-Kongo > Bantu", False),
    "ps": ("Pashto", "پښتو", "Arab", "P2", "Iranisch > Ost", True),
    "az": ("Azerbaijani", "Azərbaycan dili", "Latn", "P2", "Turkisch > Oghusisch", False),
    "kk": ("Kazakh", "Қазақ тілі", "Cyrl", "P2", "Turkisch > Kiptschak", False),
    "uz": ("Uzbek", "Oʻzbekcha", "Latn", "P2", "Turkisch > Karluk", False),
    "ka": ("Georgian", "ქართული", "Geor", "P2", "Kartwelisch", False),
    "hy": ("Armenian", "Հայերեն", "Armn", "P2", "Indogermanisch > Armenisch", False),
    "my": ("Burmese", "မြန်မာ", "Mymr", "P2", "Sino-tibetisch", False),
    "km": ("Khmer", "ខ្មែរ", "Khmr", "P2", "Austroasiatisch", False),
    "ne": ("Nepali", "नेपाली", "Deva", "P2", "Indogermanisch > Indoarisch", False),
    "si": ("Sinhala", "සිංහල", "Sinh", "P2", "Indogermanisch > Indoarisch", False),
    "tl": ("Filipino", "Filipino", "Latn", "P2", "Malayo-Polynesisch", False),
}

#: P3 dokumentiert den weltweiten Restumfang als ZIEL, ohne Behauptung von
#: Unterstuetzung. Ethnologue 2026: 7.170 lebende Sprachen; davon sind
#: |REGISTERED| in diesem Register erfasst (Version siehe oben).
REGISTER_REST_UNTESTED = (
    ETHNOLOGUE_LIVING_LANGUAGES_2026 - len(_REGISTER),
    "weitere lebende Sprachen (Ethnologue 2026) — Zielumfang, ungetestet",
)

#: Gebärdensprachen: kein Audio-/Text-Test anwendbar; eigene Verfahren noetig.
SIGN_LANGUAGES_NOTE = (
    "Gebaerdensprachen (DGS, ASL, TID u. a.) und Sprachen ohne standardisierte "
    "Schrift sind im Audio-/Text-Prüfplan nicht anwendbar (n/a) und als offen "
    "markiert — sie brauchen eigene Verfahren (Video/Avatar)."
)


def registered_language_codes() -> list[str]:
    return list(_REGISTER)


def register_entries() -> dict[str, dict[str, str | bool]]:
    return {
        code: {
            "code": code,
            "name": name,
            "native": native,
            "script": script,
            "tier": tier,
            "family": family,
            "rtl": rtl,
        }
        for code, (name, native, script, tier, family, rtl) in _REGISTER.items()
    }


def is_registered(code: str | None) -> bool:
    return bool(code) and str(code) in _REGISTER


def language_name(code: str | None) -> str | None:
    """Englischer Sprachname fuer Prompts (None bei unbekanntem Code)."""
    if not code:
        return None
    entry = _REGISTER.get(str(code))
    return entry[0] if entry else None


def language_tier(code: str | None) -> str | None:
    if not code:
        return None
    entry = _REGISTER.get(str(code))
    return entry[3] if entry else None


def priority_languages() -> list[str]:
    """P0-Sprachen des Auftrags: Deutsch, Tuerkisch, Englisch, Kurdisch."""
    return [code for code, entry in _REGISTER.items() if entry[3] == "P0"]


def register_summary() -> dict[str, object]:
    tiers: dict[str, int] = {}
    for entry in _REGISTER.values():
        tiers[entry[3]] = tiers.get(entry[3], 0) + 1
    return {
        "version": LANGUAGE_REGISTER_VERSION,
        "source": ETHNOLOGUE_SOURCE,
        "ethnologueLivingLanguages": ETHNOLOGUE_LIVING_LANGUAGES_2026,
        "registered": len(_REGISTER),
        "tiers": tiers,
        "restTargetUntested": REGISTER_REST_UNTESTED[0],
        "signLanguages": SIGN_LANGUAGES_NOTE,
    }
