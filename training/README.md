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
