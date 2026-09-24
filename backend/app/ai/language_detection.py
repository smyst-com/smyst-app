"""Serverseitige Spracherkennung fuer Chat-Nachrichten.

Ursache des Live-Fehlers 24.09.2026 (Screenshot Inhaber): Ein Nutzer fragte
Mustafa Kemal Atatuerk auf Tuerkisch, das Profil antwortete auf Deutsch und
behauptete, kein Tuerkisch zu sprechen. Das Frontend erkennt die Sprache
nur ueber Sonderzeichen/Wortmarker (src/lib/voiceLanguage.ts) — tuerkischer
Text ohne ğ/ı/ş (z. B. ASCII-getippt "Turkce konusabilir misin?") fiel auf
die UI-Sprache 'de' zurueck, und der Prompt zwang das kleine Modell auf
Deutsch ("Default answer language: German"), worauf es die Faehigkeit
absprach.

Dieses Modul erkennt die Sprache NUTZERSEITIG autoritativ im Backend:
1. Expliziter Sprachwunsch in der Nachricht ("speak English", "türkçe
   konuşur musun", "kurdî bizivîne") — hoechste Prioritaet.
2. Schriftsystem (arabish/kurdisch-sorani, kyrillisch, Devanagari, CJK …).
3. Eindeutige Wortmarker (aufsteigend nach Treffern, Diakritika gefaltet).
4. Erst danach die UI-Sprache des Frontends als Fallback.

Regeln des Auftrags: Auf Tuerkisch gestellt heisst auf Tuerkisch
geantwortet; explizite Sprachwuensche schlagen Browser-, Konto- und
Oberflaechensprache.
"""

from __future__ import annotations

import re
import unicodedata

from app.ai.language_register import language_name, registered_language_codes

#: Regieblock der Oberflaeche abschneiden (siehe chat.question_for_research):
#: "[Voice language: German (de). …]\n\nMerhaba" darf nicht als Deutsch
#: erkannt werden, nur weil der Block deutsche Woerter enthaelt.
_INSTRUCTION_PREFIX_RE = re.compile(r"\A\s*(?:\[[^\]]*\]\s*)+", re.DOTALL)


def strip_instruction_prefix(message: str) -> str:
    stripped = _INSTRUCTION_PREFIX_RE.sub("", message).strip()
    return stripped or message.strip()


# ─── 1. Schriftsysteme (voreilig nach Unicode-Bloecken, dann Feinunterscheidung) ───

#: Sorani-typische Arabisch-Zeichen, die Hocharabisch NICHT nutzt:
#: ە (U+06D5 ae), ڵ (U+06B5 lam mit V-Sporn), ڕ (U+0695 r mit V-Sporn),
#: ۆ (U+06C6 o), ێ (U+06CE y mit kleiner V). Persisch nutzt ک/ی, aber nie
#: ڵ/ڕ — damit ist Sorani vom Hocharabischen und Persischen trennbar.
_SORANI_MARKERS = "ڵڕۆێ"


def _detect_by_script(text: str) -> str | None:
    if re.search(r"[\u0600-\u06ff\ufb50-\ufdff\ufe70-\ufeff]", text):
        if any(ch in text for ch in _SORANI_MARKERS):
            return "ckb"
        if re.search(r"[\u06d5]", text):  # einsilbiges kurdisches e
            return "ckb"
        return "ar"  # Feinunterscheidung fa/ur ueber Wortmarker weiter unten
    if re.search(r"[\u0400-\u04ff]", text):
        return "ru"
    if re.search(r"[\u0980-\u09ff]", text):
        return "bn"
    if re.search(r"[\u0900-\u097f]", text):
        return "hi"
    if re.search(r"[\u3040-\u30ff]", text):
        return "ja"
    if re.search(r"[\uac00-\ud7af]", text):
        return "ko"
    if re.search(r"[\u4e00-\u9fff]", text):
        return "zh"
    if re.search(r"[\u0370-\u03ff]", text):
        return "el"
    if re.search(r"[\u0590-\u05ff]", text):
        return "he"
    if re.search(r"[\u0e00-\u0e7f]", text):
        return "th"
    if re.search(r"[\u10a0-\u10ff]", text):
        return "ka"
    if re.search(r"[\u0530-\u058f]", text):
        return "hy"
    if re.search(r"[\u1000-\u109f]", text):
        return "my"
    if re.search(r"[\u1780-\u17ff]", text):
        return "km"
    if re.search(r"[\u0d80-\u0dff]", text):
        return "si"
    if re.search(r"[\u0a00-\u0a7f]", text):
        return "pa"
    if re.search(r"[\u0b80-\u0bff]", text):
        return "ta"
    if re.search(r"[\u0c00-\u0c7f]", text):
        return "te"
    if re.search(r"[\u0a80-\u0aff]", text):
        return "gu"
    # Nur eindeutig tuerkische Buchstaben (ı/İ punktlos, ğ, ş) — wie im
    # Frontend; ç/ö/ue sind mehrdeutig (de/fr/pt).
    if re.search(r"[ğışİĞŞ]", text):
        return "tr"
    if re.search(r"[ßẞ]", text):
        return "de"
    return None


# ─── 2. Wortmarker (diakritikagefaltet, ASCII-vertraeglich) ───────────────

def _fold(text: str) -> str:
    normalized = unicodedata.normalize("NFD", text.lower())
    stripped = "".join(ch for ch in normalized if unicodedata.combining(ch) == 0)
    # Python-re kennt keine \p{L}-Klassen: \w+UNICODE deckt Buchstaben,
    # Ziffern und Unterstrich ab — fuer Wortmarker reicht das.
    return re.sub(r"[^\w\s]", " ", stripped, flags=re.UNICODE)


def _fold_ascii(text: str) -> set[str]:
    """Wortmenge mit Diakritika-Faltung fuer Marker-Vergleiche."""
    return set(_fold(text).split())


# Pro Sprache NUR Woerter, die innerhalb der Marker-Mengen eindeutig sind.
# Kurmandschi (ku) bekommt eigene Marker — es fiel bisher komplett durch
# und wurde als Deutsch/Englisch fehlklassifiziert. frozenset, damit
# versehentliche Doppelnennungen den Score nicht aufblaehten.
_WORD_MARKERS: dict[str, frozenset[str]] = {
    "de": frozenset({"der", "die", "das", "und", "nicht", "ich", "du", "bitte", "danke", "warum", "was", "wie", "ist", "ein", "eine", "mit", "hallo", "erzahl", "erklir", "sag", "mir", "dir", "mich", "dich", "wer", "wo", "wann", "kann", "kannst", "bist", "sind", "hast", "habe", "haben", "dein", "mein", "sehr", "heute", "jetzt", "noch", "schon", "dann", "oder", "aber", "auch", "fur", "uber", "auf", "aus", "bei", "nach", "von", "zum", "zur"}),
    "en": frozenset({"the", "and", "please", "what", "how", "why", "hello", "thanks", "you", "your", "are", "does", "did", "can", "could", "will", "would", "should", "this", "that", "tell", "about", "who", "which", "have", "has", "not", "with", "from", "when", "where"}),
    "tr": frozenset({"merhaba", "tesekkur", "ederim", "nasilsin", "nasilsiniz", "ben", "sen", "bir", "icin", "degil", "lutfen", "cok", "neden", "guzel", "onemli", "kadar", "evet", "hayir", "nedir", "nasil", "konus", "konusabilir", "cevap", "yanit", "yaz", "musun", "misin", "var", "yok", "olarak", "sizi", "sana", "bana", "beni", "peki", "tamam", "cumhuriyet", "millet", "devlet"}),
    "ku": frozenset({"cawa", "chon", "dayik", "bave", "xwe", "nabe", "ziman", "kurdi", "kurdistan", "heval", "dilsoz", "kin", "bun", "ere", "na", "min", "te", "me", "ev", "gundi", "cide", "bese", "spas", "zor", "buke", "bray"}),
    "es": frozenset({"que", "como", "por", "para", "hola", "gracias", "usted", "quiero", "esta", "quien", "cuando", "donde", "dime", "cuentame", "puedes", "eres", "soy", "muy", "tambien", "porque", "si", "no", "mas"}),
    "fr": frozenset({"bonjour", "merci", "comment", "pourquoi", "avec", "vous", "etre", "dans", "est", "oui", "salut", "quel", "quelle", "quoi", "moi", "toi", "votre", "notre", "raconte", "parle", "peux", "suis", "je", "le", "la", "les", "des", "une"}),
    "it": frozenset({"ciao", "grazie", "come", "perche", "sono", "voglio", "con", "chi", "dove", "cosa", "sei", "dimmi", "puoi", "raccontami", "parlami", "molto", "bene"}),
    "pt": frozenset({"ola", "obrigado", "obrigada", "como", "porque", "voce", "para", "com", "muito", "sim", "nao", "quem", "onde", "conte", "pode", "sou", "fale", "falar", "esta"}),
    "id": frozenset({"halo", "terima", "kasih", "bagaimana", "saya", "untuk", "dengan", "tidak", "adalah", "apa", "yang", "bisa", "kamu", "kami"}),
    "nl": frozenset({"hallo", "dank", "je", "hoe", "wat", "waarom", "met", "niet", "een", "de", "het", "kan", "kunt", "ben", "bent", "mijn", "jouw", "graag"}),
    "pl": frozenset({"czesc", "dziekuje", "jak", "czemu", "jestem", "jest", "nie", "tak", "co", "gdzie", "kiedy", "moge", "mozesz", "prosze", "bardzo"}),
    "fa": frozenset({"سلام", "چه", "چطور", "چرا", "با", "است", "خوب", "من", "تو", "ما", "شما"}),
    "ur": frozenset({"ہے", "کیا", "کیوں", "ساتھ", "میں", "آپ", "ہوں", "نہیں", "کی"}),
    "vi": frozenset({"xin", "chao", "cam", "on", "khong", "co", "la", "gi", "tai", "sao", "ban", "toi", "cua"}),
    "sw": frozenset({"habari", "asante", "karibu", "nzuri", "sana", "kwa", "nini", "vipi", "hapana", "ndiyo"}),
}

#: Einzeltreffer, die allein schon P0-Sprache beweisen (hoch eindeutig).
_SINGLE_MATCH_PROOF: frozenset[str] = frozenset({
    "merhaba", "tesekkur", "nasilsin", "nasilsiniz", "cumhuriyet", "millet",
    "cawa", "dayik", "kurdistan", "kurdi", "heval", "spas", "dilsoz",
})


def _detect_by_markers(text: str) -> str | None:
    words = _fold_ascii(text)
    if not words:
        return None
    best_lang: str | None = None
    best_score = 0
    for lang, markers in _WORD_MARKERS.items():
        score = len(markers & words)
        if score > best_score:
            best_lang = lang
            best_score = score
    # Erst ab 2 Treffern vertrauen: ein einzelnes Lehnwort ist kein Beweis.
    # 1 Treffer reicht nur bei hoch-eindeutigen Woertern der P0-Sprachen.
    if best_score >= 2:
        return best_lang
    if best_score == 1 and best_lang in {"tr", "ku"}:
        if _WORD_MARKERS[best_lang] & words <= _SINGLE_MATCH_PROOF:
            return best_lang
    return None


# ─── 3. Explizite Sprachwünsche (Name + Verb) ────────────────────────────

#: Sprachnamen mehrsprachig (Wortmatch im Lateinischen, Teilstring bei
#: nicht-lateinischen Schriften). Erweitert um Kurdisch und Tuerkisch-
#: Eigenbezeichnungen ("türkçe", "kurdî") — die Frontend-Liste kannte nur
#: "turkce" ohne Umlaut-Varianten wie "türkçe".
_LANGUAGE_REQUEST_NAMES: dict[str, tuple[str, ...]] = {
    "en": ("englisch", "english", "ingles", "anglais", "inglese", "ingilizce", "انجليزية", "الإنجليزية", "英語", "英语", "영어", "अंग्रेजी", "ইংরেজি", "inggris"),
    "zh": ("chinesisch", "chinese", "chino", "chinois", "cinese", "chines", "cince", "китаис", "صينية", "中文", "中国語", "중국어", "चीनी", "চীনা", "mandarin"),
    "es": ("spanisch", "spanish", "espanol", "español", "espagnol", "spagnolo", "espanhol", "ispanyolca", "испанс", "إسبانية", "スペイン語", "西班牙语", "스페인어", "स्पेनिश", "স্প্যানিশ"),
    "ar": ("arabisch", "arabic", "arabe", "arabo", "arapca", "arapça", "арабс", "عربية", "العربية", "アラビア語", "阿拉伯语", "아랍어", "अरबी", "আরবি"),
    "fr": ("franzosisch", "französisch", "french", "frances", "français", "francais", "francese", "fransizca", "французс", "فرنسية", "フランス語", "法语", "프랑스어", "फ्रेंच", "ফরাসি"),
    "de": ("deutsch", "german", "aleman", "allemand", "tedesco", "alemao", "almanca", "немецк", "ألمانية", "ドイツ語", "德语", "독일어", "जर्मन", "জার্মান"),
    "pt": ("portugiesisch", "portuguese", "portugues", "português", "portugais", "portoghese", "portekizce", "португальс", "برتغالية", "ポルトガル語", "葡萄牙语", "포르투갈어", "पुर्तगाली", "পর্তুগিজ"),
    "ru": ("russisch", "russian", "ruso", "russe", "russo", "rusca", "русский", "روسية", "ロシア語", "俄语", "러시아어", "रूसी", "রুশ"),
    "tr": ("turkisch", "türkisch", "turkish", "turco", "turc", "turkce", "türkçe", "турецк", "تركية", "トルコ語", "土耳其语", "터키어", "तुर्की", "তুর্কি"),
    "ja": ("japanisch", "japanese", "japones", "japonais", "giapponese", "japonca", "японс", "يابانية", "日本語", "日语", "일본어", "जापानी", "জাপানি"),
    "ko": ("koreanisch", "korean", "coreano", "coreen", "korece", "корейс", "كورية", "韓国語", "韩语", "한국어", "कोरियाई", "কোরিয়ান"),
    "it": ("italienisch", "italian", "italiano", "italien", "italyanca", "итальянс", "إيطالية", "イタリア語", "意大利语", "이탈리아어", "इतालवी", "ইতালীয়"),
    "hi": ("hindi", "хинди", "هندية", "ヒンディー語", "印地语", "힌디어", "हिंदी", "हिन्दी", "হিন্দি"),
    "id": ("indonesisch", "indonesian", "indonesio", "indonesien", "indonesiano", "endonezce", "индонезийс", "إندونيسية", "インドネシア語", "印尼语", "인도네시아어", "इंडोनेशियाई", "ইন্দোনেশীয়"),
    "bn": ("bengalisch", "bengali", "bengali", "бенгальс", "بنغالية", "ベンガル語", "孟加拉语", "벵골어", "बंगाली", "বাংলা"),
    "ku": ("kurdisch", "kurdish", "kurde", "curdo", "kurtce", "kürtçe", "kurdi", "kurdî", "kurmanci", "kurmancî", "kurmanji", "کوردی", "kurdistanice"),
    "ckb": ("sorani", "soranca", "sorani-kurdisch", "soranî", "کوردیی سۆرانی", "soranie"),
}

#: Sprech-/Antwort-Verben (diakritikagefaltet) — analog Frontend, um
#: "tuerkische Musik" (kein Verb) nicht als Sprachwunsch zu werten.
_SPEAK_VERB_MARKERS = (
    "red", "rede", "reden", "redest", "sprich", "sprichst", "sprechen", "sprech",
    "antworte", "antworten", "antwortest", "schreib", "schreibe", "schreiben",
    "wechsle", "wechseln", "umschalten",
    "speak", "talk", "answer", "reply", "respond", "write", "switch", "chat",
    "habla", "hablar", "hablas", "responde", "responder", "escribe",
    "fala", "falar", "fale", "parla", "parlare", "parlami", "rispondi",
    "parle", "parler", "parles", "reponds", "ecris",
    "konus", "konusur", "konusabilir", "konusalim", "konusur", "cevap", "yanit", "yaz",
    "bicara", "berbicara", "jawab", "tulis",
    "bizivire", "beje", "welle", "binivise",
)

_NON_LATIN_NAME = re.compile(r"[^a-z]")


def detect_explicit_language_request(text: str) -> str | None:
    """Expliziter Sprachwunsch (Name + Sprech-Verb) oder None."""
    value = text.strip()
    if not value:
        return None
    normalized = _fold(value)
    words = set(normalized.split())
    compact = re.sub(r"\s+", "", normalized)
    requested: str | None = None
    for lang, names in _LANGUAGE_REQUEST_NAMES.items():
        for name in names:
            folded = re.sub(r"\s+", "", _fold(name))
            if not folded:
                continue
            hit = compact.find(folded) >= 0 if _NON_LATIN_NAME.search(folded) else folded in words
            if hit:
                if requested and requested != lang:
                    return None  # mehrdeutig ("uebersetze deutsch nach tuerkisch")
                requested = lang
    if not requested:
        return None
    if any(verb in words for verb in _SPEAK_VERB_MARKERS):
        return requested
    if re.search(r"話し|話せ|말해|말할|تكلم|تحدث|говор|بگو|بنويس", value):
        return requested
    return None


# ─── 4. Aufloesung ────────────────────────────────────────────────────────

def detect_message_language(text: str) -> str | None:
    """Sprache des Nachrichtentexts (Schrift, dann Wortmarker)."""
    value = strip_instruction_prefix(text).strip()
    if not value:
        return None
    by_script = _detect_by_script(value)
    if by_script == "ar":
        # Arabisch-Schrift: fa/ur per Markern verfeinern (ckb erkannte schon
        # die Schriftstufe anhand sorani-exklusiver Buchstaben).
        refined = _detect_by_markers(value)
        if refined in {"fa", "ur"}:
            return refined
        return "ar"
    if by_script:
        return by_script
    return _detect_by_markers(value)


def resolve_chat_language(
    frontend_language: str | None, message: str
) -> tuple[str | None, str]:
    """Antwortsprache nach Auftrags-Prioritaet.

    Rangfolge (Auftrag 24.09.2026, Abschnitt 3):
      1. expliziter Sprachwunsch in der Nachricht      -> "explicit"
      2. erkannte Sprache des Nachrichtentexts         -> "message"
      3. UI-/Voice-Sprache des Frontends (bereinigt)   -> "frontend"
    Nur registrierte Codes verlassen die Funktion — Fremdtext aus dem
    Feld `language` gelangt nie in den Prompt.
    """
    clean = strip_instruction_prefix(message)
    explicit = detect_explicit_language_request(clean)
    if explicit:
        return explicit, "explicit"
    detected = detect_message_language(message)
    if detected:
        return detected, "message"
    base = (frontend_language or "").strip().lower().replace("_", "-").split("-", 1)[0]
    if base and base in registered_language_codes():
        return base, "frontend"
    return None, "none"


def language_name_for_prompt(code: str | None) -> str | None:
    return language_name(code)
