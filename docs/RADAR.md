# smyst radar — zweite Wissens-Schiene (ab 23.09.2026)

„smyst radar" ist die klar GETRENNTE zweite Schiene neben der Modell-Trainingsschiene
(Retrain-Autopilot). Er recherchiert, prüft, versioniert und stellt Wissen per RAG
bereit — er verändert NICHT automatisch Modellgewichte und übergibt nichts ungeprüft
an die Trainingsschiene.

## Kette (ein Lauf, täglich 06:37 Berlin / 04:37 UTC)

1. **Recherche** (`scripts/radar/research.py`): ausschließlich KOSTENLOSE offizielle
   Quellen — arXiv-API, Hugging-Face-API, CISA KEV, offizielle Blogs (OpenAI,
   DeepMind, Google AI), GitHub-Releases (llama.cpp, ollama). Budget: max. 50
   API-Aufrufe/Lauf, Tagesdeckel 200, Monatsdeckel 3000 (budget.json).
2. **Prüfung + Versionierung** (`scripts/radar/verify_store.py`): Duplikat-Erkennung
   (URL + Titel-Ähnlichkeit), Kreuz-Quell-Bestätigung, Vertrauensniveau,
   Aktualität, Relevanz-Kategorien, Widerspruchskandidaten (nur gekennzeichnet),
   Injection-Verdachtsmuster (Inhalt bleibt DATEN, nie Anweisung).
   Zustände: found → analyzed → verified|rejected → stored|updated|outdated →
   rag_ready → used_in_answer. `training_approved` wird NIE automatisch gesetzt.
3. **RAG + Tests** (`scripts/radar/rag.py`): BM25-artiges, deterministisches
   Retrieval (keine Embedding-Kosten) mit Vertrauens-/Aktualitätsfiltern;
   definierte Testfragen; ECHTE Testantwort vom eigenen smyst-1.1-Modell
   (llama-server, Q4_K_M aus Release v-smyst-1.1-gguf, im Workflow auf dem Runner).
   Verwendete Einträge werden als used_in_answer markiert.
4. **Speicherung**: Object Brain e2 (`radar/…`) + öffentlicher Spiegel-Branch
   `radar-data` (liest das Admin-Frontend über raw.githubusercontent.com).
5. **Tagesbericht**: `radar/reports/<Datum>.json` — Titel:
   „Was hat smyst radar heute dazugelernt?" Nur echte Messwerte; bei keinen
   Funden steht genau das dort; bei Fehlern der echte Fehler.

## Admin-Bereich (/admin → Betrieb → smyst radar)

Status-Kacheln (Ein/Aus, „Jetzt recherchieren", Budget, Kosten 0 €, Queue),
Tagesbericht mit Datumsauswahl, klickbare Erkenntnisse mit allen Pflichtfeldern
(Quelle, Datum, Prüfstatus, Vertrauen, Versionierung, RAG-Nutzung), lokaler
Testbereich (Retrieval im Browser über dieselbe Ranking-Logik), Konfigurations-
und Quellenübersicht, Notaus-Beschreibung.

„Jetzt recherchieren" dispatcht über `/api/admin/autopilot/rerun` (Backend-Kennung
`smyst-radar.yml` in AUTOPILOT_WORKFLOWS); bis zum nächsten Backend-Deploy zeigt
der Knopf ehrlich den GitHub-Fallback („Run workflow").

## Schutzregeln

- Notaus: `control.json` am radar-data Branch (`"enabled": false`).
- Keine parallelen Läufe (concurrency group), Timeout 30 min, fail-soft je Quelle.
- Keine privaten Nutzerdaten/Chats/Keys — Recherche nutzt nur öffentliche APIs.
- Internetinhalte sind grundsätzlich nicht vertrauenswürdige DATEN
  (Anti-Prompt-Injection; Injection-Verdacht sperrt Einträge vom RAG).
- Produktionsbetrieb unberührt: Workflow läuft auf eigenem GitHub-Runner;
  smyst.com wird vorher/nachher gemessen (Lauf-Log).
- Rollback: Wissenseinträge versioniert (alte+neue Version je Eintrag);
  radar-data Branch revertierbar; Workflow-Entfernung = git revert des Merges.

## Nachweis E2E (erster Lauf)

Erster vollständiger Lauf: siehe GitHub-Actions „smyst radar" und Memory_Bank
(Eintrag 23.09.2026). Die Kette Recherche → Prüfung → Speicherung → RAG →
Testantwort (smyst-1.1) → Tagesbericht wurde vorab zusätzlich lokal auf der
Mac-Workstation mit dem echten Modell nachgewiesen (smyst-1.1-v4, Port 8081).
