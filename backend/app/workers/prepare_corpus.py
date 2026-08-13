"""smyst.com Korpus-Vorbereitung: deutscher Pretraining-Korpus fuer smyst 1.0.

Phase 1 des Modell-Fahrplans. Stellt aus oeffentlichen Quellen einen
deduplizierten deutschen Korpus zusammen (Ziel 10-15 Mrd Token) und mischt
einen englischen Replay-Anteil bei — ohne ihn vergisst das Basismodell beim
Continued Pretraining, was es vorher konnte ("katastrophales Vergessen").

Dieses Modul enthaelt die REINE Planungs- und Filterlogik (testbar, ohne
Abhaengigkeiten). Die eigentliche Verarbeitung laeuft ueber datatrove, das
NUR im CLI-Teil importiert wird — so bleibt der Import hier leichtgewichtig
und die Tests laufen ohne datatrove-Installation.

Ausfuehrung NICHT auf dem Entwickler-Mac (mehrere hundert GB Download):
Sample-Modus zum Verifizieren der Pipeline, Vollmodus auf der gemieteten
Maschine, auf der spaeter auch trainiert wird.

Start:
    python -m app.workers.prepare_corpus --plan-only
    python -m app.workers.prepare_corpus --sample --out ./korpus
    python -m app.workers.prepare_corpus --target-tokens 12e9 --out /mnt/data/korpus
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict, dataclass
from typing import Iterable

#: Deutsche Texte brauchen mit einem deutsch-tauglichen BPE-Tokenizer rund
#: 3,3 Zeichen je Token (Komposita!). Nur eine Schaetzung fuer die Planung —
#: die echte Zahl liefert der Tokenizer-Lauf am Ende der Pipeline.
CHARS_PER_TOKEN_DE = 3.3

#: Anteil englischer Daten am Gesamtkorpus. Unter ~10 % verliert das
#: Basismodell messbar Faehigkeiten, ueber ~20 % verwaessert das Deutsch.
DEFAULT_REPLAY_RATIO = 0.15

DEFAULT_TARGET_TOKENS = 12_000_000_000

#: Sample-Modus: gross genug, dass Filter- und Dedup-Quoten aussagekraeftig
#: sind, klein genug fuer einen Lauf ueber Nacht auf einem Laptop.
SAMPLE_TARGET_TOKENS = 300_000_000

#: MinHash-Parameter (datatrove-Konvention): 5-Gramm-Shingles, 14 Buckets a
#: 8 Hashes ~ Jaccard-Schwelle 0,75. Bewaehrt fuer Web-Korpora.
MINHASH_NGRAM = 5
MINHASH_BUCKETS = 14
MINHASH_HASHES_PER_BUCKET = 8

#: Grobe Dokumentgroesse zur Umrechnung Token-Budget -> Reader-Limit
#: (datatrove begrenzt in DOKUMENTEN, nicht in Token). Bewusst konservativ
#: niedrig: lieber etwas mehr laden als das Budget verfehlen. Die echte
#: Token-Zahl steht erst nach dem Tokenizer-Lauf fest.
AVG_TOKENS_PER_DOCUMENT = 600

#: Eindeutig deutsche Funktionswoerter (keine englischen Homographen wie
#: "in", "an", "es"): trennt echtes Deutsch von fremdsprachigem Beifang,
#: der in jedem "deutschen" Web-Dump steckt.
GERMAN_STOPWORDS = frozenset(
    """der die das und ist den von mit sich des auf fuer für nicht ein eine
    auch werden aus hat dass sie nach wird bei oder aber wie nur noch schon
    wenn war sind haben wurde durch ueber über zwischen gegen ohne""".split()
)

MIN_STOPWORD_RATIO = 0.05
MIN_DOCUMENT_CHARS = 200
MIN_ALPHA_RATIO = 0.60
MAX_DUPLICATE_LINE_RATIO = 0.30


@dataclass(frozen=True)
class SourceSpec:
    """Eine Korpus-Quelle mit Token-Budget.

    epochs ist der Nutzungsgrad der Quelle: 2.0 = jedes Dokument zweimal
    (lohnt nur bei kleinen, sehr guten Quellen), 0.5 = nur die Haelfte des
    Bestands wird gebraucht.
    """

    name: str
    dataset: str
    language: str
    token_budget: int
    epochs: float = 1.0
    subset: str | None = None

    @property
    def estimated_chars(self) -> int:
        return int(self.token_budget * CHARS_PER_TOKEN_DE)


#: Verfuegbare Token je Quelle (Schaetzungen), in Qualitaetsreihenfolge —
#: die besten Quellen werden zuerst ausgeschoepft, Web-Daten fuellen den Rest.
GERMAN_SOURCES: tuple[tuple[str, str, int, float], ...] = (
    # (name, dataset, verfuegbare Token, epochs)
    ("wikipedia_de", "wikimedia/wikipedia:20231101.de", 1_200_000_000, 2.0),
    ("wikisource_de", "wikimedia/wikisource:20231201.de", 300_000_000, 2.0),
    ("gutenberg_de", "manu/project_gutenberg:de", 200_000_000, 2.0),
    ("smyst_profile", "local:profile-texte", 20_000_000, 3.0),
    ("fineweb2_deu", "HuggingFaceFW/fineweb-2:deu_Latn", 50_000_000_000, 1.0),
)

ENGLISH_REPLAY_SOURCE = ("fineweb_edu_en", "HuggingFaceFW/fineweb-edu:sample-10BT")


def build_source_plan(
    target_tokens: int = DEFAULT_TARGET_TOKENS,
    *,
    replay_ratio: float = DEFAULT_REPLAY_RATIO,
) -> list[SourceSpec]:
    """Verteilt das Token-Budget auf die Quellen (rein, testbar).

    Gute Quellen zuerst bis zu ihrer Verfuegbarkeit (inkl. erlaubter
    Wiederholungen), der Rest kommt aus dem Web-Dump. Der englische
    Replay-Anteil wird immer zusaetzlich als eigene Quelle gefuehrt.
    """
    if target_tokens <= 0:
        raise ValueError("target_tokens muss positiv sein")
    if not 0.0 <= replay_ratio < 1.0:
        raise ValueError("replay_ratio muss in [0, 1) liegen")

    german_budget = int(target_tokens * (1.0 - replay_ratio))
    plan: list[SourceSpec] = []
    remaining = german_budget

    for name, dataset, available, epochs in GERMAN_SOURCES:
        if remaining <= 0:
            break
        usable = min(int(available * epochs), remaining)
        if usable <= 0:
            continue
        plan.append(
            SourceSpec(
                name=name,
                dataset=dataset,
                language="de",
                token_budget=usable,
                epochs=round(usable / available, 2),
            )
        )
        remaining -= usable

    replay_budget = target_tokens - german_budget
    if replay_budget > 0:
        name, dataset = ENGLISH_REPLAY_SOURCE
        plan.append(
            SourceSpec(name=name, dataset=dataset, language="en", token_budget=replay_budget)
        )
    return plan


def plan_summary(plan: Iterable[SourceSpec]) -> dict:
    """Verdichtet einen Plan zu Kennzahlen fuer den Log/Report."""
    entries = list(plan)
    total = sum(source.token_budget for source in entries)
    german = sum(source.token_budget for source in entries if source.language == "de")
    return {
        "sources": len(entries),
        "tokens_total": total,
        "tokens_german": german,
        "tokens_replay": total - german,
        "replay_ratio": round((total - german) / total, 4) if total else 0.0,
        "estimated_gb": round(total * CHARS_PER_TOKEN_DE / 1_000_000_000, 1),
    }


def _tokens(text: str) -> list[str]:
    return [word for word in "".join(
        char.lower() if char.isalpha() or char.isspace() else " " for char in text
    ).split() if word]


def german_stopword_ratio(text: str) -> float:
    """Anteil eindeutig deutscher Funktionswoerter [0..1]."""
    words = _tokens(text)
    if not words:
        return 0.0
    return sum(1 for word in words if word in GERMAN_STOPWORDS) / len(words)


def duplicate_line_ratio(text: str) -> float:
    """Anteil wiederholter Zeilen — hoch bei Navigations-/Boilerplate-Seiten."""
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if len(lines) < 2:
        return 0.0
    return 1.0 - (len(set(lines)) / len(lines))


def is_quality_german(text: str) -> tuple[bool, str | None]:
    """Qualitaets-Gate fuer EIN Dokument; (ok, Ablehnungsgrund).

    Faengt die drei haeufigsten Muellsorten in deutschen Web-Dumps ab:
    zu kurze Schnipsel, fremdsprachiger Beifang und Boilerplate-Seiten.
    Reihenfolge = billigste Pruefung zuerst.
    """
    if len(text) < MIN_DOCUMENT_CHARS:
        return False, "zu_kurz"
    alpha = sum(1 for char in text if char.isalpha() or char.isspace())
    if alpha / len(text) < MIN_ALPHA_RATIO:
        return False, "zu_wenig_text"
    if german_stopword_ratio(text) < MIN_STOPWORD_RATIO:
        return False, "nicht_deutsch"
    if duplicate_line_ratio(text) > MAX_DUPLICATE_LINE_RATIO:
        return False, "boilerplate"
    return True, None


def document_limit(token_budget: int) -> int:
    """Rechnet ein Token-Budget in ein Reader-Limit um (datatrove zaehlt
    DOKUMENTE). Mindestens 1, damit kein Lauf versehentlich unbegrenzt liest."""
    return max(1, int(token_budget / AVG_TOKENS_PER_DOCUMENT))


def build_pipeline(source: SourceSpec, out_dir: str) -> list:  # pragma: no cover - datatrove-Verdrahtung
    """Baut die datatrove-Pipeline fuer EINE Quelle.

    datatrove wird bewusst hier lazy importiert (siehe Modul-Docstring).
    Signaturen gegen datatrove 0.6 geprueft; zwei Fallen sind hier bewusst
    adressiert: streaming=True (ohne das laedt der Reader den KOMPLETTEN
    Datensatz, nicht nur das Limit) und language=deu (Gopher-Defaults sind
    englisch, deutsche Komposita fallen sonst durchs Wortlaengen-Gate).
    """
    from datatrove.pipeline.filters import (
        GopherQualityFilter,
        GopherRepetitionFilter,
        LambdaFilter,
    )
    from datatrove.pipeline.readers import HuggingFaceDatasetReader, JsonlReader
    from datatrove.pipeline.writers.jsonl import JsonlWriter
    from datatrove.utils.typeshelper import Languages

    limit = document_limit(source.token_budget)
    if source.dataset.startswith("local:"):
        reader = JsonlReader(source.dataset.removeprefix("local:"), limit=limit, text_key="text")
    else:
        dataset, _, subset = source.dataset.partition(":")
        reader = HuggingFaceDatasetReader(
            dataset,
            dataset_options={"name": subset or None, "split": "train"},
            streaming=True,
            limit=limit,
            text_key="text",
        )
    language = Languages.german if source.language == "de" else Languages.english
    return [
        reader,
        GopherRepetitionFilter(language=language),
        GopherQualityFilter(
            language=language,
            max_avg_word_length=12,  # deutsche Komposita: Default 10 filtert zu hart
            stop_words=sorted(GERMAN_STOPWORDS) if source.language == "de" else None,
        ),
        LambdaFilter(
            lambda document: is_quality_german(document.text)[0]
            if source.language == "de"
            else True
        ),
        JsonlWriter(f"{out_dir}/{source.name}", max_file_size=2 * 1024**3),
    ]


def main(argv: list[str] | None = None) -> int:  # pragma: no cover - CLI-Verdrahtung
    parser = argparse.ArgumentParser(description="smyst 1.0 Korpus-Vorbereitung (Phase 1)")
    parser.add_argument("--out", default="./korpus", help="Zielverzeichnis fuer JSONL-Shards")
    parser.add_argument("--target-tokens", type=float, default=DEFAULT_TARGET_TOKENS)
    parser.add_argument("--replay-ratio", type=float, default=DEFAULT_REPLAY_RATIO)
    parser.add_argument("--sample", action="store_true", help=f"Sample-Modus (~{SAMPLE_TARGET_TOKENS/1e6:.0f}M Token)")
    parser.add_argument("--plan-only", action="store_true", help="nur den Plan zeigen, nichts laden")
    parser.add_argument("--workers", type=int, default=8, help="Parallele datatrove-Tasks")
    args = parser.parse_args(argv)

    target = SAMPLE_TARGET_TOKENS if args.sample else int(args.target_tokens)
    plan = build_source_plan(target, replay_ratio=args.replay_ratio)
    summary = plan_summary(plan)

    print(json.dumps({"summary": summary, "plan": [asdict(s) for s in plan]}, indent=2, ensure_ascii=False))
    if args.plan_only:
        return 0

    try:
        from datatrove.executor.local import LocalPipelineExecutor
    except ImportError:
        print(
            "datatrove fehlt. Verifizierte Installation: "
            "pip install 'datatrove[io,processing]' spacy "
            "(io = orjson fuer den Writer, spacy = deutsche Wort-Tokenisierung)",
            file=sys.stderr,
        )
        return 1

    for source in plan:
        steps = build_pipeline(source, args.out)
        print(
            f"-> {source.name}: Ziel {source.token_budget/1e6:.0f}M Token "
            f"(~{document_limit(source.token_budget):,} Dokumente)"
        )
        LocalPipelineExecutor(pipeline=steps, tasks=args.workers, logging_dir=f"{args.out}/logs/{source.name}").run()

    print(
        f"\nFertig. Naechster Schritt: Dedup ueber ALLE Quellen zusammen "
        f"(MinHash {MINHASH_BUCKETS}x{MINHASH_HASHES_PER_BUCKET}, {MINHASH_NGRAM}-Gramm), "
        f"dann Tokenizer-Lauf zur echten Token-Zaehlung."
    )
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
