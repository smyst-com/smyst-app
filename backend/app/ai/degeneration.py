"""Erkennung degenerierter Modell-Antworten (Wiederholungs-Schleifen).

Das kleine eigene Modell (smyst_llm, llama.cpp auf CPU) faellt bei knapp
bemessenem Sampling gelegentlich in eine Token-Schleife: dieselbe kurze
Phrase wird bis zum max_tokens-Limit wiederholt (live 06.09.2026,
Atatuerk-Twin auf eine tuerkische Frage: dieselben fuenf Woerter rund
zwanzigmal als komplette "Antwort"). Fuer den Nutzer ist das unbrauchbar —
der llm_router (AntiLoopProvider) wechselt in dem Fall zum naechsten
Provider, statt die Schleife auszuliefern.
"""

from __future__ import annotations

import re

# Satzzeichen raus, Woerter klein: "Zeit," und "zeit" sind dasselbe Wort.
_WORD_RE = re.compile(r"[\w'’]+", re.UNICODE)

#: Ab dieser Menge reiner Schleifen-Woerter ist die Antwort degeneriert.
MIN_LOOP_WORDS = 20
#: ... oder wenn die Haelfte der Antwort ein und dieselbe Phrase ist.
LOOP_SHARE = 0.5
#: Laengste Phrase (in Woertern), die als Schleife ueberhaupt gezaehlt wird.
MAX_PHRASE_SPAN = 8


def _words(text: str) -> list[str]:
    return [word.lower() for word in _WORD_RE.findall(text)]


def _longest_loop(words: list[str]) -> int:
    """Laengste Phrase (in Woertern), die unmittelbar hintereinander kettet.

    ["a", "b", "a", "b", "a", "b"] -> Phrase (a, b) dreimal = 6 Woerter.
    Nur UNMITTELBAR aufeinanderfolgende Wiederholungen zaehlen: ein Kehrreim
    in Gedichten oder eine Aufzaehlung mit zurueckkehrenden Woertern wird so
    nicht falsch als Schleife erkannt.
    """
    longest = 0
    total = len(words)
    for span in range(1, MAX_PHRASE_SPAN + 1):
        start = 0
        while start + span <= total:
            phrase = tuple(words[start : start + span])
            repeats = 1
            cursor = start + span
            while cursor + span <= total and tuple(words[cursor : cursor + span]) == phrase:
                repeats += 1
                cursor += span
            if repeats >= 3:
                longest = max(longest, repeats * span)
            start = cursor if repeats > 1 else start + 1
    return longest


def is_degenerate_answer(text: str) -> bool:
    """True, wenn der Text im Wesentlichen eine Wiederholungs-Schleife ist.

    Kurze Antworten (unter MIN_LOOP_WORDS Woerter) sind nie degeneriert —
    auch dann nicht, wenn sie ein Wort bewusst wiederholen.
    """
    words = _words(text)
    if len(words) < MIN_LOOP_WORDS:
        return False
    loop = _longest_loop(words)
    if loop >= MIN_LOOP_WORDS:
        return True
    return loop >= LOOP_SHARE * len(words)
