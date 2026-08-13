# smyst 1.0 — Trainingsdaten & Eval

Bausteine fuer das eigene Modell (Continued Pretraining auf Apache-2.0-Basis,
Fahrplan siehe Memory_Bank). Dieses Verzeichnis enthaelt **keine Nutzerdaten** —
nur das eingefrorene Eval-Set und Dokumentation.

## Trainings-Export (Chat-Archive -> JSONL)

Die App archiviert bereits jeden Twin-Chat nach IDrive e2 (`chat-archives/`)
inklusive Daumen-hoch/runter-Feedback. Der Export-Worker verdichtet das zu
Trainingsdateien:

```
cd backend
python -m app.workers.export_training_data --dry-run       # nur zaehlen
python -m app.workers.export_training_data --out ../training-export
```

Ergebnis (lokal, NICHT einchecken — enthaelt Nutzereingaben):

- `sft-<datum>.jsonl` — je Record ein User->Twin-Austausch mit Verlauf
  (`twinId`, `language`, `history`, `prompt`, `response`)
- `preference-<datum>.jsonl` — nur bewertete Antworten (`rating: up/down`),
  Rohmaterial fuer DPO-Paare

## Eval-Set (eval/smyst-eval-v1.jsonl)

**Eingefroren.** Dieses Set ist der Massstab, mit dem Trainings-Checkpoints
verglichen werden. Regeln:

1. Bestehende Zeilen werden NIE geaendert oder geloescht — sonst sind alte
   und neue Scores nicht mehr vergleichbar.
2. Erweiterungen nur als neue Datei (`smyst-eval-v2.jsonl`), v1 bleibt liegen.
3. Bewertung per LLM-as-Judge: `expect` beschreibt dem Judge, was eine gute
   Antwort auszeichnet (Skala 0–2: verfehlt / teilweise / erfuellt).

Schema pro Zeile:

```json
{"id": "persona-001", "category": "persona|fakten|sprache|grenzen",
 "language": "de", "twin_name": "Albert Einstein",
 "question": "...", "expect": "..."}
```

`twin_name` wird zur Laufzeit gegen die publizierten Profile aufgeloest;
fehlt der Twin, wird die Frage uebersprungen (und im Report ausgewiesen).
Kategorien: `persona` (Rollen-Treue), `fakten` (Faktentreue mit
Profil-Kontext), `sprache` (Deutsch-Qualitaet, Sprachwechsel),
`grenzen` (Ablehnung unangemessener Anfragen, Ethik-Watchlist).

v1 startet mit 40 Seed-Fragen (10 je Kategorie); Ziel laut Fahrplan sind
200 in v2, generiert + handkuratiert, sobald v1 im Einsatz ist.

## Eval-Runner (Baseline & Checkpoints)

Stellt jede Frage dem Live-Twin (aktuelle Provider-Kette) und bewertet per
LLM-as-Judge (0-2). Der erste Lauf mit `--tag baseline` ist der Massstab,
den smyst 1.0 spaeter schlagen muss:

```
cd backend
python -m app.workers.run_model_eval --eval-set ../training/eval/smyst-eval-v1.jsonl --dry-run
python -m app.workers.run_model_eval --eval-set ../training/eval/smyst-eval-v1.jsonl --tag baseline
```

Report: lokal unter `training-export/model-eval-<tag>-<zeit>.json` und
(wenn e2 konfiguriert) dauerhaft unter `training-evals/` im Object Brain.
Degradierte Provider brechen den Lauf ab — eine halb-degradierte Baseline
waere wertlos.

## Phase 1: Korpus (Continued Pretraining)

Stellt den deutschen Pretraining-Korpus zusammen (Ziel 10–15 Mrd Token) und
mischt einen englischen Replay-Anteil bei (Standard 15 %) — ohne ihn vergisst
das Basismodell beim Weitertrainieren, was es vorher konnte.

```
cd backend
python -m app.workers.prepare_corpus --plan-only     # Budget-Verteilung zeigen
python -m app.workers.prepare_corpus --sample --out ./korpus
```

**NICHT auf dem Entwickler-Mac im Vollmodus laufen lassen** — der Vollkorpus
sind ~40 GB Text nach Filterung, der Rohdurchsatz ein Vielfaches davon. Der
Volllauf gehoert auf dieselbe gemietete Maschine, auf der danach trainiert wird.

Installation dort (genau diese Kombination ist verifiziert — die Tests laufen
damit durch, inklusive echter Dokument-Filterung):

```
pip install 'datatrove[io,processing]' spacy
```

`io` liefert orjson fuer den Writer, `spacy` die deutsche Wort-Tokenisierung.
Letztere wird erst beim ERSTEN Dokument geladen, nicht beim Aufbau der
Pipeline — ohne sie bricht ein Lauf also erst nach dem Start ab. Genau das
prueft `test_german_filters_run_on_real_document`.

Zwei Fallen, die im Code bewusst adressiert sind (und die der Test
`test_datatrove_pipeline_wiring` absichert):

- `streaming=True` am HuggingFace-Reader — ohne das laedt er den KOMPLETTEN
  Datensatz statt nur des Limits (bei fineweb-2 mehrere TB)
- `language=deu` an den Gopher-Filtern — die Defaults sind englisch, deutsche
  Komposita fallen sonst durchs Wortlaengen-Gate (`max_avg_word_length` von
  10 auf 12 erhoeht)

Nach dem Lauf fehlen noch zwei Schritte (Phase 1b): MinHash-Dedup ueber ALLE
Quellen zusammen (14×8 Buckets, 5-Gramm) und der Tokenizer-Lauf, der die
echte Token-Zahl liefert — die Zahlen aus `--plan-only` sind Schaetzungen
(3,3 Zeichen/Token).
