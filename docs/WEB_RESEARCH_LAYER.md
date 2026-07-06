# smyst.com Verified Web Research Layer

Stand: 2026-07-06

## Architektur

Der Verified Web Research Layer ist additiv im Salad-Control-Backend umgesetzt. Der Control Server entscheidet nur, ob Recherche erlaubt und nötig ist, minimiert die Query, prüft Cache/Budgets und liefert kleine Quellen-/Status-Antworten. Große Inhalte, Snapshots, Chunks, Embeddings und spätere Index-Backups gehören nach IDrivee2.com oder in stateless Worker-Jobs.

Module:

- `backend/app/ai/web_research.py`: Search Decision Engine, Privacy Query Rewriter, Provider-Abstraktion, IDrivee2.com-kompatibler Cache, Prompt-Injection-Guard, Public-Knowledge-Vorschläge.
- `backend/app/api/v1/routes/web_research.py`: API für Preview, kontrollierte Recherche und Public-Profile-Suggestions.
- `backend/tests/test_web_research.py`: Sicherheits-, Cache-, Provider- und API-Vertragstests.

## ENV

- `WEB_RESEARCH_ENABLED=false` ist der sichere Default.
- `WEB_SEARCH_PROVIDER=disabled|openai|brave|searxng`.
- `BRAVE_SEARCH_API_KEY`, `OPENAI_API_KEY`, `SEARXNG_BASE_URL` werden nur serverseitig gelesen.
- `WEB_RESEARCH_BUDGET_PER_USER_DAY` und `WEB_RESEARCH_BUDGET_PER_PROFILE_DAY` begrenzen Provider-Aufrufe.

## Datenschutz und Sicherheit

- Private Memory, private Dokumente, Twin Capsules, sensible Daten und interne Profilfragen blockieren Websuche ohne Public-Research-Freigabe.
- Der Privacy Query Rewriter entfernt E-Mails, Telefonnummern, Adressen, offensichtliche Secrets, private Marker und Selbstidentifikationsmuster.
- Persistenter Cache speichert keine Rohprompts und keine sensiblen Queries, sondern Query-Hash, Kategorie, Provider, kurze Zusammenfassung, Quellenmetadaten, TTL und Trust-Status.
- Webinhalte gelten als `untrusted_web_content`. Prompt-Injection-Muster werden markiert und niemals als System-/Tool-Regeln ausgeführt.
- Public Knowledge bleibt getrennt von Private Memory. Profilupdates werden nur als `discovered` mit `reviewRequired=true` vorgeschlagen.
- Voice-Regeln bleiben unverändert: echte Stimmen nur mit ausdrücklicher rechtlicher Freigabe, sonst neutrale synthetische Stimmen.

## Kostenoptimierung

- Cache-first vor Provider-Aufrufen.
- Feature Flag default aus.
- Provider austauschbar ohne Chat-/Twin-Code-Änderungen.
- Kleine Entscheidungen bleiben im Control Server; schwere Extraktion, OCR, Chunking, Embeddings und Indexierung bleiben Worker-Aufgaben.
- TTLs: News/Preise/Wetter kurz, Recht/Medizin/Finanzen kurz mit Datum, Public Profiles mittel, Bücher/Artikel länger.

## API-Vertrag

- `POST /api/v1/web-research/preview`: Entscheidung, Kategorie, Redaction-Metadaten, Query-Hash.
- `POST /api/v1/web-research/run`: führt nur erlaubte Recherche aus und liefert bei Nutzung `notice: "Ich habe im Internet gesucht."` plus bis zu 3 Quellen.
- `POST /api/v1/web-research/public-profile-suggestions`: schlägt Public-Knowledge-Fakten vor, übernimmt sie aber nie automatisch.

## Rollback

Sicherer Rollback ohne Datenverlust:

1. `WEB_RESEARCH_ENABLED=false` setzen oder `WEB_SEARCH_PROVIDER=disabled`.
2. Route-Registrierung `web_research_router` aus `backend/app/api/v1/router.py` entfernen.
3. Neue Dateien `backend/app/ai/web_research.py`, `backend/app/api/v1/routes/web_research.py`, `backend/tests/test_web_research.py` entfernen.
4. ENV-Ergänzungen in `backend/.env.salad.example` zurücknehmen.

Es gibt keine Datenbankmigration und keine Löschoperation. Bereits geschriebene IDrivee2.com-Cache-Objekte sind kleine, nicht-sensitive JSON-Metadaten und können über Lifecycle/TTL bereinigt werden.
