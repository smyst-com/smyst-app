"""Tests fuer serverseitige Spracherkennung und -aufloesung (Fix 24.09.2026).

Der Live-Fehler (Screenshot Inhaber): Atatuerk auf Tuerkisch gefragt,
Antwort deutsch + "ich kann kein Tuerkisch". Ursache war die alleinige
Frontend-Erkennung — hier pruefen wir die autoritative Server-Aufloesung.
"""

from __future__ import annotations

from app.ai.language_detection import (
    detect_explicit_language_request,
    detect_message_language,
    resolve_chat_language,
    strip_instruction_prefix,
)
from app.ai.language_register import (
    ETHNOLOGUE_LIVING_LANGUAGES_2026,
    is_registered,
    language_name,
    priority_languages,
    register_summary,
)


class TestLiveFehler:
    """Der gemeldete Fall und seine Varianten."""

    def test_ascii_tuerkisch_mit_frage_nach_tuerkisch(self):
        # Exakt der Live-Fall: kein Sonderzeichen, UI-Sprache de
        resolved, source = resolve_chat_language(
            "de", "Sen beni anliyor musun? Turkce konusabilir misin?"
        )
        assert (resolved, source) == ("tr", "explicit")

    def test_ascii_tuerkische_frage_ohne_sprachwunsch(self):
        resolved, source = resolve_chat_language(
            "de", "Merhaba, cumhuriyet hakkinda bir sorum var beni anliyor musun"
        )
        assert resolved == "tr"
        assert source == "message"

    def test_deutsche_frage_bleibt_deutsch(self):
        resolved, _source = resolve_chat_language(
            "de", "Was war deine wichtigste Reform und warum hast du sie gemacht?"
        )
        assert resolved == "de"

    def test_regieblock_verfaelscht_erkenntnis_nicht(self):
        message = (
            "[Voice language: German (de). Answer in German by default. "
            "Highest priority: never claim you can only speak one language.]\n\n"
            "Merhaba dunya, nasilsin?"
        )
        assert strip_instruction_prefix(message).startswith("Merhaba")
        resolved, _ = resolve_chat_language("de", message)
        assert resolved == "tr"


class TestExplicitRequests:
    def test_deutscher_sprachwunsch_aus_englischem_ui(self):
        assert detect_explicit_language_request("kannst du mit mir türkisch reden?") == "tr"
        assert detect_explicit_language_request("please speak english with me") == "en"
        assert detect_explicit_language_request("türkçe konuşur musun?") == "tr"

    def test_kurdisch_erkannt(self):
        assert detect_explicit_language_request("kurdî binivîse ji bo min") == "ku"
        assert detect_explicit_language_request("sorani bizivire") == "ckb"

    def test_ohne_verb_kein_wunsch(self):
        # "tuerkische Musik" ist kein Sprachwunsch
        assert detect_explicit_language_request("Ich hoere gern türkisch Musik") is None

    def test_mehrdeutig_liefert_none(self):
        assert detect_explicit_language_request("uebersetze deutsch nach türkisch bitte") is None


class TestMessageDetection:
    def test_schriftsysteme(self):
        assert detect_message_language("مرحبا كيف حالك") == "ar"
        assert detect_message_language("Привет, как дела?") == "ru"
        assert detect_message_language("こんにちは、お元気ですか") == "ja"
        assert detect_message_language("안녕하세요 어떻게 지내세요") == "ko"
        assert detect_message_language("你好，你好吗") == "zh"
        assert detect_message_language("नमस्ते, कैसे हैं आप") == "hi"

    def test_sorani_von_hocharabisch_unterschieden(self):
        # Sorani nutzt ڵ/ڕ/ە — Hocharabisch nicht.
        assert detect_message_language("سڵاو چۆنی بەڕێز") == "ckb"
        assert detect_message_language("بەڵێ من کوردی قسە دەکەم") == "ckb"

    def test_kurmandschi_marker(self):
        assert detect_message_language("Ew çawa ye? Min dayik û bavî xwe dizanim, spas") == "ku"

    def test_tuerkische_sonderzeichen(self):
        assert detect_message_language("Yaşam güzel, önemlidir") == "tr"

    def test_ein_lehnwort_ist_keine_sprache(self):
        assert detect_message_language("Ich habe ein Auto und ein Haus") == "de"
        # "merhaba" allein in deutschem Satz reicht nicht zum Umschalten
        assert detect_message_language("Ich sage nur merhaba und sonst nichts") == "de"


class TestRegister:
    def test_p0_nach_auftrag(self):
        assert priority_languages() == ["de", "tr", "en", "ku", "ckb"]

    def test_register_quelle_und_umfang(self):
        summary = register_summary()
        assert summary["ethnologueLivingLanguages"] == ETHNOLOGUE_LIVING_LANGUAGES_2026
        assert summary["registered"] >= 50
        assert summary["restTargetUntested"] == ETHNOLOGUE_LIVING_LANGUAGES_2026 - summary["registered"]
        assert "Ethnologue" in str(summary["source"])

    def test_namen_fuer_prompt(self):
        assert language_name("tr") == "Turkish"
        assert language_name("ku") == "Kurdish (Kurmanji)"
        assert language_name("ckb") == "Kurdish (Sorani)"
        assert language_name("xx") is None
        assert is_registered("de") and not is_registered("xx")


class TestResolutionPriority:
    """Auftrag Abschnitt 3: expliziter Wunsch > Nachrichtensprache > UI."""

    def test_nachrichtenschlag_ui(self):
        resolved, source = resolve_chat_language("de", "Hello there, how are you?")
        assert (resolved, source) == ("en", "message")

    def test_ui_fallback_bei_unerkennbar(self):
        resolved, source = resolve_chat_language("de", "ok")
        assert (resolved, source) == ("de", "frontend")

    def test_unregistriertes_ui_fallt_auf_none(self):
        assert resolve_chat_language("xx", "ok") == (None, "none")
