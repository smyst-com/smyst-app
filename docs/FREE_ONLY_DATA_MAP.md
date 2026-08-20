# smyst.com Data Map

Stand: 2026-08-20. Status: verbindliche Production-Datenlandkarte.

Diese Datei hiess frueher "Free-Only Data Map" und beschrieb eine
Cloudflare-KV-Architektur mit `s:{sessionId}`- und `meta:*`-Schluesseln. Diese
Architektur wurde nie so gebaut. Der Dateiname bleibt, weil andere Dokumente
darauf verweisen.

## Production-Bausteine

| Ebene | Dienst | Aufgabe | Gespeicherte Daten |
|---|---|---|---|
| Code | GitHub Free | Repository, Versionierung, CI/CD, Dokumentation | Quellcode, Markdown-Doku, Workflows, Release-Notizen |
| Web/PWA | GitHub Pages | Vite/React-Build ausliefern | statische Assets aus `dist/`, HTML, CSS, JS, Manifest, Sitemap, `robots.txt`, `llms.txt`, prerenderte Profilseiten, statische JSON-API |
| API | Zeabur (`smyst-backend`) | Auth, Storage-Signing, Chat, Suche, TTS/ASR, Admin | keine dauerhafte Datenhaltung, nur Laufzeit und Service-Variablen |
| Daten | IDrive e2 | zentraler Objektspeicher UND Persistenz | Nutzerdokumente, Chat-Archive, Feedback, Pipeline-Artefakte, Stimmproben, Trainings-Evals |
| LLM | OpenRouter / Groq | Inferenz | keine dauerhafte Speicherung von Nutzerdaten beim Provider |

Es gibt in Production keine relationale Datenbank und keinen Redis. Alle
Stores unter `backend/app/integrations/` schreiben JSON-Objekte per S3-API
nach IDrive e2. PostgreSQL und Redis existieren nur im Profil `legacy-local`
von `docker-compose.yml` fuer lokale Entwicklung.

Arbeitsbucket: `IDRIVE_E2_BUCKET`, Default `smyst-memories`
(`backend/app/core/config.py`).

## Objekt-Praefixe in IDrive e2

Verbindlich, aus dem Code (`backend/app/integrations/`, `backend/app/workers/`):

```text
user-mvp/{sha-sicherer-user-sub}.json      Nutzerdokument: Profil, Twins, Memories
                                           max. 400 KB pro Nutzer
voice-samples/...                          private Stimmprobe je Nutzer
chat-archives/{chatId}.json                Chat-Archiv
chat-feedback/{twinId}/{messageId}.json    Daumen hoch/runter je Nachricht
auth/email-accounts/v1/{digest}.json       E-Mail-Konten der Auth-Schicht

pipeline/candidates/{QID}.json             Kandidat, Wikidata-QID als Dedup-Anker
pipeline/status/{status}/{QID}             Status-Marker der State Machine
pipeline/research/{QID}.json               Rechercheergebnis
pipeline/sources/{QID}/{filename}          Quell-Snapshots
pipeline/capsules/...                      generierte Persona-Kapseln
pipeline/changelogs/{YYYY-MM-DD}.json      Lauf-Changelog
pipeline/ingest/cursor.json                Cursor des Ingest-Workers
pipeline/published/index.json              Index der freigegebenen Profile
pipeline/published/sitemap-fragment.json   Sitemap-Fragment fuer den Pages-Build
pipeline/quality/summary.json              Ergebnis der Qualitaetsschleife

training-evals/...                         Eval-Laeufe und Modellvergleiche
```

Der Pages-Build laedt `pipeline/published/index.json` aus IDrive e2 und merged
die freigegebenen Profile in die statische JSON-API, die prerenderten
`/t/{slug}`-Seiten und die Sitemap (`scripts/merge-pipeline-published.mjs`).
Fehlt der Index, ist der Schritt ein No-op.

## Nicht in Production speichern

- Keine privaten Dateien in GitHub.
- Keine IDrive-e2-Secrets im Browser.
- Keine permanenten Tokens im Client.
- Keine Produktdaten in externen Analytics- oder Translation-Diensten.
- Keine Production-Daten in Legacy-Server-, Docker- oder Datenbankpfaden.

## Sessions

Sessions sind zustandslos: Nach dem Google-OAuth-Callback setzt das Backend
ein signiertes HttpOnly Secure SameSite Cookie. Es gibt keinen Session-Store.
`POST /auth/logout` und `POST /auth/logout-all` invalidieren ueber das
Cookie/Secret, nicht ueber eine Session-Tabelle.

Der Browser sieht nur das Cookie; JavaScript liest die Session nicht direkt.

Wichtig: `smyst.com` (GitHub Pages) und `api.smyst.com` (Zeabur) sind
verschiedene Origins. Jeder Frontend-Aufruf mit Session braucht
`credentials: 'include'` und muss ueber `fetchService` aus
`src/lib/serviceEndpoints.ts` laufen.

## Rollen und Rechte

Owner/Admin-Zuordnung erfolgt ueber Service-Variablen auf Zeabur:

```text
SMYST_OWNER_EMAILS
SMYST_OWNER_GITHUB_IDS
SMYST_ADMIN_EMAILS
SMYST_ADMIN_GITHUB_IDS
```

Rollen: `member`, `admin`, `owner`.

## Upload Flow

1. Client fragt beim Backend eine Upload-URL an.
2. Backend prueft Auth, Dateityp, Dateigroesse und Quotas.
3. Backend gibt eine signierte PUT-URL fuer IDrive e2 zurueck.
4. Client laedt direkt zu IDrive e2 hoch.
5. Client meldet den Abschluss.
6. Backend verifiziert das Objekt per signiertem `HEAD` und schreibt den
   Status als JSON-Objekt.
7. Downloads laufen ueber das Backend und pruefen Besitz und Status.

Direct-PUT ist der aktive Pfad. Chunk Upload und bytegenaue Wiederaufnahme
sind nicht aktiviert und werden in der Upload-URL-Antwort als
`supportsChunkUpload: false` und `supportsResume: false` gemeldet.

## Chat

Chat-Verlaeufe liegen als JSON unter `chat-archives/`, Bewertungen unter
`chat-feedback/`. Antworten entstehen ueber die LLM-Provider-Kette
(`backend/app/ai/llm_router.py`); vor jedem Modellaufruf greift eine
deterministische Krisen-Schutzschicht. Faellt die gesamte Kette aus, antwortet
ein deterministischer Not-Fallback (`mode=local`) - ein Stoerungssignal, kein
Normalbetrieb.

Ohne konfigurierte IDrive-e2-Keys laufen Nutzer- und Chat-Stores auf einen
In-Process-RAM-Fallback, damit die API auch dann antwortet. In Produktion ist
das kein zulaessiger Dauerzustand.

## Oeffentliche und private Profile

Oeffentliche Profile:

```text
/t/{slug}                        prerendert im Pages-Build
GET /api/public/twins/{slug}     statische JSON-API aus dist/
pipeline/published/index.json    Quelle der Pipeline-Profile
```

Oeffentliche Profile enthalten Name, Bildreferenz, Beschreibung, Kategorien,
Sprachen, Sichtbarkeit, Chat-Pfad, Canonical-URL und Schema.org-ProfilePage-
Daten. Nur `visible` und `qa_passed` Profile werden gemerged; bei
Slug-Kollisionen gewinnen kuratierte Profile.

Private Profile liegen im Nutzerdokument unter `user-mvp/` und werden nur fuer
den authentifizierten Owner gelesen. Sie muessen `noindex,nofollow` setzen.

## Backup

- Pipeline-Stand: Branch `pipeline-backup` im Repository
  (`.github/workflows/pipeline-backup.yml`).
- IDrive-e2-Objekte: siehe `docs/runbooks/backup-recovery.md`.
- Nutzerbezogene Backups liegen als Objekte im Arbeitsbucket.

## Speicherlimits

Geprueft werden erlaubte Kategorie, erlaubter MIME-Type pro Kategorie,
Extension passend zum MIME-Type, maximale Dateigroesse pro Kategorie,
monatliche User- und Global-Uploadlimits sowie aktive Speicherlimits. Das
Nutzerdokument ist auf 400 KB begrenzt (`MAX_DOC_BYTES`).

Dokumente, Backups und Twin-Daten werden beim Abruf als Attachment
ausgeliefert. Bilder, Videos, Audio und Avatare duerfen inline streamen.

## Skalierungsgrenze

Diese Datenlandkarte minimiert Kosten und externe Abhaengigkeiten. Ein
Objektspeicher ohne Index ersetzt keine Datenbank: Listen-Operationen ueber
viele Objekte werden mit wachsender Datenmenge teuer. Fuer globale Massenlast
braucht smyst.com spaeter dedizierte Daten-, Compute-, Retrieval- und
AI-Kapazitaeten.
