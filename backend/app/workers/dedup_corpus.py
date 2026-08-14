"""smyst 1.0 Korpus Phase 1b: Dedup ueber ALLE Quellen + echte Token-Zaehlung.

Phase 1 (prepare_corpus) filtert jede Quelle FUER SICH. Damit bleiben genau
die Dubletten uebrig, die zwischen den Quellen entstehen — ein Wikipedia-
Artikel taucht im Web-Dump erneut auf, Gutenberg-Texte liegen auch bei
Wikisource. Beim Weitertrainieren sind das keine harmlosen Wiederholungen:
mehrfach gesehene Passagen werden auswendig gelernt statt verallgemeinert.

Danach steht die zweite offene Zahl an: Phase 1 plant mit der Schaetzung
3,3 Zeichen je Token. Ob das stimmt, weiss erst der Tokenizer, mit dem
spaeter wirklich trainiert wird — und davon haengt ab, ob der Korpus das
Token-Ziel ueberhaupt erreicht.

Ablauf auf der Korpus-Maschine (NICHT auf dem Entwickler-Mac):

    cd backend
    python -m app.workers.dedup_corpus --korpus ./korpus --out ./korpus-dedup
    python -m app.workers.dedup_corpus --korpus ./korpus-dedup --count-only \\
        --tokenizer <tokenizer-des-basismodells>

Installation wie in Phase 1 (`pip install 'datatrove[io,processing]' spacy`);
fuer die Token-Zaehlung zusaetzlich `tokenizers`.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field

from app.workers.prepare_corpus import (
    CHARS_PER_TOKEN_DE,
    MINHASH_BUCKETS,
    MINHASH_HASHES_PER_BUCKET,
    MINHASH_NGRAM,
)

#: Abweichung der gemessenen Zeichen/Token-Rate von der Planungsschaetzung,
#: ab der die Phase-1-Planung neu gerechnet werden muss. 15 % klingen wenig,
#: verschieben bei 12 Mrd Token aber die Quellen-Budgets um Milliarden.
CHARS_PER_TOKEN_TOLERANCE = 0.15

#: Plausibilitaetsfenster fuer die Dedup-Quote. Web-Korpora liegen erfahrungs-
#: gemaess bei 10-40 %. Faellt fast nichts weg, hat die Stufenverdrahtung
#: nicht gegriffen (haeufigster Fehler: falsche Aufgabenzahl, siehe
#: stage_task_counts); faellt fast alles weg, stimmt etwas mit den Quellen
#: nicht — beides ist teuer, wenn es erst nach dem Training auffaellt.
MIN_PLAUSIBLE_DUPLICATE_RATIO = 0.01
MAX_PLAUSIBLE_DUPLICATE_RATIO = 0.60


def stage_task_counts(*, input_tasks: int, num_buckets: int = MINHASH_BUCKETS) -> dict[str, int]:
    """Aufgabenzahl je MinHash-Stufe.

    Zwei Regeln, die datatrove selbst NICHT prueft und die stillschweigend
    falsche Ergebnisse liefern, statt zu scheitern:

    1. Die Bucket-Stufe braucht GENAU so viele Aufgaben, wie es Buckets gibt —
       jede Aufgabe bearbeitet einen Bucket. Mit weniger bleiben Buckets
       unbearbeitet, ihre Dubletten werden nie gefunden.
    2. Die Cluster-Stufe braucht GENAU EINE Aufgabe: sie fuehrt die Buckets zu
       zusammenhaengenden Gruppen zusammen. Parallel gestartet, sieht jede
       Aufgabe nur einen Teil und die Gruppen zerfallen.

    Zusaetzlich muss die Filter-Stufe dieselbe Aufgabenzahl haben wie die
    Signatur-Stufe: die Loeschlisten sind nach Aufgaben-Rang benannt und
    werden sonst dem falschen Eingabe-Shard zugeordnet.
    """
    if input_tasks < 1:
        raise ValueError("input_tasks muss mindestens 1 sein")
    if num_buckets < 1:
        raise ValueError("num_buckets muss mindestens 1 sein")
    return {
        "signatures": input_tasks,
        "buckets": num_buckets,
        "cluster": 1,
        "filter": input_tasks,
    }


@dataclass(frozen=True)
class TokenCount:
    """Ergebnis der Token-Zaehlung fuer eine Quelle."""

    source: str
    documents: int
    tokens: int
    characters: int


@dataclass
class DedupReport:
    documents_before: int
    documents_after: int
    warnings: list[str] = field(default_factory=list)

    @property
    def removed(self) -> int:
        return self.documents_before - self.documents_after

    @property
    def duplicate_ratio(self) -> float:
        if self.documents_before <= 0:
            return 0.0
        return self.removed / self.documents_before


def dedup_report(*, documents_before: int, documents_after: int) -> DedupReport:
    """Bewertet die Dedup-Quote und warnt bei unplausiblen Werten."""
    if documents_before < 0 or documents_after < 0:
        raise ValueError("Dokumentzahlen duerfen nicht negativ sein")
    if documents_after > documents_before:
        raise ValueError("nach dem Dedup koennen nicht mehr Dokumente uebrig sein als vorher")

    report = DedupReport(documents_before=documents_before, documents_after=documents_after)
    ratio = report.duplicate_ratio
    if documents_before and ratio < MIN_PLAUSIBLE_DUPLICATE_RATIO:
        report.warnings.append(
            f"Nur {ratio:.2%} Dubletten entfernt — pruefe die Aufgabenzahl der "
            f"Bucket- und Cluster-Stufe (siehe stage_task_counts)."
        )
    if ratio > MAX_PLAUSIBLE_DUPLICATE_RATIO:
        report.warnings.append(
            f"{ratio:.2%} der Dokumente entfernt — das ist zu viel fuer eine "
            f"reine Dublettenbereinigung, pruefe die Quellen-Auswahl."
        )
    return report


def token_report(counts: list[TokenCount], *, target_tokens: int) -> dict:
    """Fasst die gezaehlten Token zusammen und prueft die Planungsschaetzung.

    Die Planung in Phase 1 rechnet mit CHARS_PER_TOKEN_DE. Weicht die
    gemessene Rate deutlich ab, sind alle Quellen-Budgets falsch dimensioniert
    — dann muss die Planung neu gerechnet werden, BEVOR trainiert wird.
    """
    total_tokens = sum(count.tokens for count in counts)
    total_chars = sum(count.characters for count in counts)
    total_documents = sum(count.documents for count in counts)

    measured = (total_chars / total_tokens) if total_tokens else 0.0
    deviation = (
        abs(measured - CHARS_PER_TOKEN_DE) / CHARS_PER_TOKEN_DE if measured else 0.0
    )

    warnings: list[str] = []
    if measured and deviation > CHARS_PER_TOKEN_TOLERANCE:
        # Mehr Zeichen JE TOKEN heisst: derselbe Text ergibt WENIGER Token.
        richtung = "weniger" if measured > CHARS_PER_TOKEN_DE else "mehr"
        warnings.append(
            f"Gemessen {measured:.2f} Zeichen/Token statt geschaetzt "
            f"{CHARS_PER_TOKEN_DE} — der Korpus liefert {richtung} Token als "
            f"geplant. Phase-1-Budgets neu rechnen."
        )
    if target_tokens > 0 and total_tokens < target_tokens:
        fehlend = target_tokens - total_tokens
        warnings.append(
            f"Ziel verfehlt: {total_tokens/1e9:.2f} Mrd von {target_tokens/1e9:.2f} Mrd "
            f"Token ({fehlend/1e9:.2f} Mrd fehlen)."
        )

    return {
        "documents": total_documents,
        "tokens": total_tokens,
        "characters": total_chars,
        "measured_chars_per_token": round(measured, 3),
        "estimated_chars_per_token": CHARS_PER_TOKEN_DE,
        "target_tokens": target_tokens,
        "target_reached": target_tokens <= 0 or total_tokens >= target_tokens,
        "per_source": {count.source: count.tokens for count in counts},
        "warnings": warnings,
    }


def build_minhash_config():  # pragma: no cover - datatrove-Verdrahtung
    """MinHash-Parameter aus Phase 1, in datatrove-Form."""
    from datatrove.pipeline.dedup.minhash import MinhashConfig
    from datatrove.utils.hashing import HashConfig

    return MinhashConfig(
        hash_config=HashConfig(precision=64),
        num_buckets=MINHASH_BUCKETS,
        hashes_per_bucket=MINHASH_HASHES_PER_BUCKET,
        n_grams=MINHASH_NGRAM,
    )


def build_dedup_stages(korpus_dir: str, out_dir: str):  # pragma: no cover - datatrove-Verdrahtung
    """Die vier MinHash-Stufen, in Reihenfolge.

    Sie laufen NACHEINANDER — jede braucht die vollstaendige Ausgabe der
    vorigen. Die Zwischenergebnisse liegen unter <out>/minhash/.
    """
    from datatrove.pipeline.dedup import (
        MinhashDedupBuckets,
        MinhashDedupCluster,
        MinhashDedupFilter,
        MinhashDedupSignature,
    )
    from datatrove.pipeline.readers import JsonlReader
    from datatrove.pipeline.writers.jsonl import JsonlWriter
    from datatrove.utils.typeshelper import Languages

    config = build_minhash_config()
    work = f"{out_dir}/minhash"

    return [
        [
            JsonlReader(korpus_dir, text_key="text"),
            MinhashDedupSignature(
                output_folder=f"{work}/signatures", config=config, language=Languages.german
            ),
        ],
        [
            MinhashDedupBuckets(
                input_folder=f"{work}/signatures", output_folder=f"{work}/buckets", config=config
            )
        ],
        [
            MinhashDedupCluster(
                input_folder=f"{work}/buckets", output_folder=f"{work}/remove_ids", config=config
            )
        ],
        [
            JsonlReader(korpus_dir, text_key="text"),
            MinhashDedupFilter(
                input_folder=f"{work}/remove_ids",
                exclusion_writer=JsonlWriter(f"{work}/removed"),
            ),
            JsonlWriter(out_dir, max_file_size=2 * 1024**3),
        ],
    ]


def count_tokens(korpus_dir: str, tokenizer: str) -> list[TokenCount]:  # pragma: no cover - IO
    """Zaehlt Token je Quellverzeichnis mit dem echten Tokenizer.

    Bewusst ohne datatrove-Executor: die Zaehlung ist IO-gebunden und laeuft
    einmal, ein Parallel-Setup lohnt den Aufwand nicht — und der Bericht soll
    auch dann entstehen, wenn der Dedup-Lauf schon Tage her ist.
    """
    from pathlib import Path

    from tokenizers import Tokenizer

    encoder = Tokenizer.from_pretrained(tokenizer)
    counts: list[TokenCount] = []
    root = Path(korpus_dir)
    directories = sorted(p for p in root.iterdir() if p.is_dir()) or [root]

    for directory in directories:
        documents = tokens = characters = 0
        for shard in sorted(directory.rglob("*.jsonl*")):
            for line in _read_lines(shard):
                try:
                    text = json.loads(line).get("text") or ""
                except ValueError:
                    continue
                if not text:
                    continue
                documents += 1
                characters += len(text)
                tokens += len(encoder.encode(text, add_special_tokens=False).ids)
        if documents:
            counts.append(
                TokenCount(
                    source=directory.name, documents=documents, tokens=tokens, characters=characters
                )
            )
    return counts


def _read_lines(path):  # pragma: no cover - IO
    """Liest JSONL, auch gzip-komprimiert (datatrove schreibt .jsonl.gz)."""
    import gzip

    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8") as handle:
        yield from handle


def main(argv: list[str] | None = None) -> int:  # pragma: no cover - CLI-Verdrahtung
    parser = argparse.ArgumentParser(description="smyst 1.0 Korpus Phase 1b (Dedup + Token-Zaehlung)")
    parser.add_argument("--korpus", required=True, help="Eingabe: Phase-1-Ausgabe")
    parser.add_argument("--out", help="Ziel fuer den deduplizierten Korpus")
    parser.add_argument("--tasks", type=int, default=8, help="Parallele Aufgaben (Signatur/Filter)")
    parser.add_argument("--count-only", action="store_true", help="nur zaehlen, nicht deduplizieren")
    parser.add_argument("--tokenizer", help="Tokenizer des Basismodells (fuer --count-only)")
    parser.add_argument("--target-tokens", type=float, default=0, help="Soll-Token fuer den Bericht")
    args = parser.parse_args(argv)

    if args.count_only:
        if not args.tokenizer:
            print("--count-only braucht --tokenizer.", file=sys.stderr)
            return 2
        counts = count_tokens(args.korpus, args.tokenizer)
        report = token_report(counts, target_tokens=int(args.target_tokens))
        print(json.dumps(report, indent=2, ensure_ascii=False))
        for warning in report["warnings"]:
            print(f"WARNUNG: {warning}", file=sys.stderr)
        return 0

    if not args.out:
        print("Dedup braucht --out.", file=sys.stderr)
        return 2

    try:
        from datatrove.executor.local import LocalPipelineExecutor
    except ImportError:
        print(
            "datatrove fehlt. Verifizierte Installation: "
            "pip install 'datatrove[io,processing]' spacy",
            file=sys.stderr,
        )
        return 1

    tasks = stage_task_counts(input_tasks=args.tasks)
    stages = build_dedup_stages(args.korpus, args.out)
    names = ("signatures", "buckets", "cluster", "filter")

    previous = None
    for name, steps in zip(names, stages):
        print(f"-> Stufe {name}: {tasks[name]} Aufgaben")
        executor = LocalPipelineExecutor(
            pipeline=steps,
            tasks=tasks[name],
            depends=previous,
            logging_dir=f"{args.out}/logs/{name}",
        )
        previous = executor
    previous.run()

    print(
        "\nFertig. Naechster Schritt: Token zaehlen —\n"
        f"  python -m app.workers.dedup_corpus --korpus {args.out} "
        "--count-only --tokenizer <tokenizer-des-basismodells>"
    )
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
