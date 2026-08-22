"""Vergleicht Modelle in Tempo UND Qualitaet auf demselben Fragenset.

Warum es das braucht: Die Wartezeit im Chat ist zu ~100 % der Vorlauf des
Modells (gemessen 16.08.2026: 455 ms gesamt, davon 454 ms Modell). Am eigenen
Code ist nichts mehr zu holen — der einzige Hebel ist das Modell. Ein Wechsel
tauscht aber Tempo gegen Persona-Treue, und ohne Zahlen fuer BEIDE Seiten waere
das ein Blindtausch.

Aufbau:
- Fragenset, Twin-Aufloesung, Judge und Auswertung kommen unveraendert aus
  run_model_eval — verglichen wird also gegen denselben Massstab wie die
  Baseline.
- Gefragt wird NICHT ueber die Live-API (die kennt nur ein Modell), sondern
  direkt beim Anbieter mit exakt dem Prompt, den die Produktion baut
  (_build_llm_request). Produktion bleibt unangetastet.
- Der Judge ist fuer ALLE Kandidaten derselbe und laeuft mit temperature=0.
  Ein je Kandidat wechselnder Judge wuerde Modelle und Pruefer vermischen.

Rauschen: Zwei Laeufe auf IDENTISCHEM Code ergaben 95,00 % und 93,75 %
(14.08.2026). Unterschiede unter ~1,5 Prozentpunkten sind NICHT deutbar —
darum --repeats und die ausgewiesene Streuung. Der Bericht sagt das auch dazu.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import statistics
import sys
from collections import Counter
from pathlib import Path
from time import perf_counter
from typing import Any

from app.ai.github_oidc import ActionsIdTokenSource
from app.ai.llm_router import SmystGatewayProvider, build_openrouter_provider
from app.core.config import get_settings
from app.workers.qa_candidates import build_chat_fn
from app.workers.run_model_eval import (
    DEFAULT_API_BASE,
    aggregate,
    build_judge_fn,
    fetch_twins,
    load_eval_set,
    resolve_twins,
    run_eval,
)

OPENROUTER_BASE = "https://openrouter.ai/api/v1"

# Unterschiede unterhalb dieser Schwelle sind Rauschen, kein Befund.
NOISE_THRESHOLD_PP = 1.5


def build_ask_fn(provider, latencies: list[float], *, streaming: bool = True):
    """Baut ask_fn fuer run_eval und misst nebenbei die Antwortzeit.

    Der Prompt kommt aus der Produktion (_build_llm_request), damit der
    Vergleich das misst, was Nutzer tatsaechlich bekommen — und nicht einen
    kuenstlichen Testprompt.

    streaming=True misst die Zeit bis zum ERSTEN Token (direkt beim Anbieter).
    streaming=False misst die GESAMTE Antwortzeit — noetig ueber das
    CI-Gateway, das eine fertige Antwort zurueckgibt und nicht streamt. Welche
    Groesse gemessen wurde, sagt der Bericht in der Spaltenueberschrift.
    """
    # Import hier, nicht oben: die Route zieht die halbe App nach sich, und
    # dieser Worker soll auch importierbar sein, wenn nur Teile stehen.
    from app.api.v1.routes.chat import _build_llm_request

    def ask(twin_id: str, question: str, language: str | None) -> tuple[str, str | None]:
        async def run() -> tuple[str, str | None]:
            chat = {"twinId": twin_id}
            request = await _build_llm_request(chat, question, language)
            started = perf_counter()
            if not streaming:
                response = await provider.complete(request)
                latencies.append((perf_counter() - started) * 1000)
                return response.text, provider.name

            parts: list[str] = []
            first_token_at: float | None = None
            async for delta in provider.stream(request):
                if first_token_at is None:
                    first_token_at = perf_counter()
                parts.append(delta)
            if first_token_at is not None:
                latencies.append((first_token_at - started) * 1000)
            return "".join(parts), provider.name

        return asyncio.run(run())

    return ask


def summarise(model: str, rows: list[dict], latencies: list[float]) -> dict[str, Any]:
    """Fasst einen Kandidaten zusammen. Qualitaet kommt aus aggregate(),
    damit dieser Vergleich denselben Massstab benutzt wie die Baseline."""
    # Die Abbruchgruende gehoeren in den Bericht. Der erste Lauf am 16.08.2026
    # meldete nur "0 bewertet, 10 uebersprungen" — warum, stand nirgends, und
    # die Ursache liess sich nur durch Log-Archaeologie finden. Ein
    # Diagnosewerkzeug, das seine eigenen Fehlschlaege verschweigt, ist keins.
    reasons = Counter(str(row["skip"]) for row in rows if row.get("skip"))
    return {
        "model": model,
        "quality": aggregate(rows),
        "skip_reasons": dict(reasons.most_common()),
        "first_token_ms": {
            "median": round(statistics.median(latencies), 1) if latencies else None,
            "min": round(min(latencies), 1) if latencies else None,
            "max": round(max(latencies), 1) if latencies else None,
            "samples": len(latencies),
        },
    }


def _percent(entry: dict[str, Any]) -> float | None:
    """Qualitaet in Prozent; None, wenn der Kandidat nichts beantwortet hat.

    aggregate() liefert bei null bewerteten Fragen 0.0 — das sieht wie ein
    katastrophales Ergebnis aus, ist aber schlicht 'keine Daten'. Der
    Unterschied muss im Bericht sichtbar bleiben.
    """
    quality = entry["quality"]
    if not quality.get("questions_scored"):
        return None
    return round(quality["score"] * 100, 2)


def build_markdown(
    results: list[dict[str, Any]], baseline_model: str, *, latency_label: str = "1. Token (Median)"
) -> str:
    lines = [
        "## Modell-Vergleich: Tempo und Qualitaet",
        "",
        (
            f"Massstab ist **{baseline_model}** (aktuell produktiv). Gleiches "
            "Fragenset, gleicher Judge (temperature 0), gleiche Wiederholungen."
        ),
        "",
        f"| Modell | Qualitaet | {latency_label} | schnellste | langsamste | bewertet | uebersprungen |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    baseline_score: float | None = None
    for entry in results:
        score = _percent(entry)
        quality = entry["quality"]
        if entry["model"] == baseline_model:
            baseline_score = score
        latency = entry["first_token_ms"]
        marker = " *(aktuell)*" if entry["model"] == baseline_model else ""
        lines.append(
            f"| `{entry['model']}`{marker} "
            f"| {f'{score} %' if score is not None else 'keine Daten'} "
            f"| {latency['median'] if latency['median'] is not None else '—'} ms "
            f"| {latency['min'] if latency['min'] is not None else '—'} "
            f"| {latency['max'] if latency['max'] is not None else '—'} "
            f"| {quality['questions_scored']} | {quality['questions_skipped']} |"
        )

    lines += [
        "",
        (
            f"> **Unterschiede unter {NOISE_THRESHOLD_PP} Prozentpunkten sind nicht "
            "deutbar.** Zwei Laeufe auf identischem Code ergaben am 14.08.2026 "
            "95,00 % und 93,75 %. Nur Abstaende darueber sind ein Befund."
        ),
        "",
    ]

    if baseline_score is not None:
        for entry in results:
            if entry["model"] == baseline_model:
                continue
            score = _percent(entry)
            if score is None:
                lines.append(f"- `{entry['model']}`: keine bewerteten Antworten — kein Urteil moeglich")
                continue
            diff = score - baseline_score
            verdict = (
                "im Rauschen" if abs(diff) < NOISE_THRESHOLD_PP
                else ("besser" if diff > 0 else "SCHLECHTER")
            )
            lines.append(f"- `{entry['model']}`: {diff:+.2f} pp gegenueber der Baseline — {verdict}")

    problems = [
        (entry["model"], reason, count)
        for entry in results
        for reason, count in (entry.get("skip_reasons") or {}).items()
    ]
    if problems:
        lines += ["", "### Warum Fragen uebersprungen wurden", ""]
        for model, reason, count in problems:
            lines.append(f"- `{model}`: {count}x {reason}")
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:  # pragma: no cover - CLI-Verdrahtung
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--models", required=True, help="Kommaliste, erstes = Baseline")
    parser.add_argument("--eval-set", required=True)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--repeats", type=int, default=3)
    parser.add_argument("--api-base", default=DEFAULT_API_BASE)
    parser.add_argument("--out", default="model-compare")
    parser.add_argument(
        "--via-gateway",
        metavar="URL",
        help=(
            "Ueber das CI-Gateway statt direkt zu OpenRouter. Nutzt den "
            "funktionierenden Schluessel des Servers (Ausweis per GitHub-OIDC) "
            "und braucht kein Repo-Secret. Misst dann die GESAMTE Antwortzeit, "
            "weil das Gateway nicht streamt."
        ),
    )
    args = parser.parse_args(argv)

    # Schluessel bewusst NUR aus der Umgebung: als Kommandozeilen-Argument
    # stuende er in Prozesslisten und in jedem Log, das den Aufruf zeigt.
    api_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if not args.via_gateway and not api_key:
        print("FEHLER: OPENROUTER_API_KEY nicht gesetzt (oder --via-gateway nutzen).")
        return 1
    if args.via_gateway and not ActionsIdTokenSource.available():
        print("FEHLER: --via-gateway braucht GitHub-Actions-OIDC (permissions: id-token: write).")
        return 1

    models = [m.strip() for m in args.models.split(",") if m.strip()]
    if not models:
        print("FEHLER: keine Modelle angegeben.")
        return 1

    questions = load_eval_set(Path(args.eval_set))
    if args.limit:
        questions = questions[: args.limit]
    twins = resolve_twins(
        fetch_twins(args.api_base), {q["twin_name"] for q in questions}
    )

    # EIN Judge fuer alle Kandidaten. Waechst der Judge mit dem Kandidaten,
    # vergleicht man Modelle und Pruefer gleichzeitig — wertlos.
    judge_base = build_chat_fn({}, temperature=0)
    if judge_base is None:
        print("FEHLER: kein Judge-Provider konfiguriert.")
        return 1
    judge_fn = build_judge_fn(judge_base)

    results: list[dict[str, Any]] = []
    for model in models:
        print(f"\n== {model}", flush=True)
        if args.via_gateway:
            provider = SmystGatewayProvider(
                args.via_gateway, ActionsIdTokenSource(get_settings().ci_gateway_audience)
            )
            # Das Gateway waehlt das Modell anhand dieses Feldes — es muss in
            # dessen Allowlist stehen (CI_GATEWAY_ALLOWED_MODELS).
            provider.model = model
        else:
            # Gemeinsamer Helfer statt Handarbeit: er setzt die
            # Attributions-Header, ohne die OpenRouter 403 liefert — genau
            # daran scheiterte der erste Vergleichslauf, und ich hielt es
            # faelschlich fuer einen ungueltigen Schluessel.
            provider = build_openrouter_provider(
                get_settings().model_copy(update={"openrouter_api_key": api_key}), model
            )
            provider.name = model
        latencies: list[float] = []
        try:
            rows = run_eval(
                questions,
                twins,
                ask_fn=build_ask_fn(provider, latencies, streaming=not args.via_gateway),
                judge_fn=judge_fn,
                repeats=args.repeats,
            )
        except Exception as error:
            print(f"  uebersprungen: {type(error).__name__}: {error}")
            continue
        entry = summarise(model, rows, latencies)
        entry["rows"] = rows
        results.append(entry)
        print(
            f"  Qualitaet {_percent(entry)} % | "
            f"1. Token {entry['first_token_ms']['median']} ms | "
            f"bewertet {entry['quality']['questions_scored']}, "
            f"uebersprungen {entry['quality']['questions_skipped']}"
        )

    if not results:
        print("FEHLER: kein Kandidat lieferte Ergebnisse.")
        return 1

    markdown = build_markdown(
        results,
        models[0],
        latency_label=(
            "Antwortzeit gesamt (Median)" if args.via_gateway else "1. Token (Median)"
        ),
    )
    print()
    print(markdown)

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "model-compare.json").write_text(
        json.dumps({"results": results}, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (out_dir / "model-compare.md").write_text(markdown, encoding="utf-8")
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
