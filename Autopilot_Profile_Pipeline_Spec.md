# smyst.com – Autopilot-Pipeline für historische Profile (Spezifikation)

Version 1.0 · 2026-07-02 · Status: Entwurf zur Umsetzung durch Codex-Agent

Diese Spezifikation folgt dem smyst.com Master Prompt: Control Server minimal, IDrivee2.com als Object Brain, Salad.com für Rechenarbeit, GitHub.com Free nur für Code, PostgreSQL als Source of Truth. Schreibweise immer **smyst.com**.

---

## 1. Architektur

Der Autopilot erzeugt Profile verstorbener historischer Personen als öffentliche Twin Capsules. Grundprinzip: **viel sammeln, wenig veröffentlichen** – nur geprüfte Profile gehen live.

**Kernentscheidungen (Abweichungen vom ursprünglichen ChatGPT-Vorschlag, bewusst):**

1. **PostgreSQL ist Source of Truth für Status und Metadaten.** Der Pipeline-Status wird NICHT über Ordnerpfade in IDrivee2.com kodiert (Datei-Verschieben ist kein atomarer Statuswechsel, nicht transaktional, nicht abfragbar). IDrivee2.com speichert nur Blobs: Quellen-Snapshots, Bilder, Prompts, Exporte, Backups.
2. **Wikidata ist die primäre Kandidatenquelle.** Statt freier Websuche liefert Wikidata (SPARQL) strukturierte Sterbedaten, eindeutige QIDs (löst Deduplizierung), Sitelink-Anzahl als Bekanntheits-Proxy und verlinkte Wikimedia-Commons-Bilder inkl. Lizenzinfo.
3. **Risiko-Check umfasst mehr als die 70-Jahre-Regel.** Werk-Gemeinfreiheit, Bildrechte (Todestag des Fotografen!), postmortale Publicity Rights / Markenrechte (Blacklist) und postmortaler Ehrschutz sind vier getrennte Prüfungen.
4. **Tageslimit ist konfigurierbar und durch Review-Kapazität begrenzt**, nicht nur durch eine Zahl.

**Datenfluss:**

```
Wikidata (SPARQL, täglich via Salad-Cronjob)
  → candidate (PostgreSQL)
  → research-Worker (Salad): Quellen sammeln → Snapshots nach IDrivee2.com
  → researched
  → risk-Worker (Salad): 4-stufiger Risiko-Check
  → verified  (oder rejected mit Grund)
  → build-Worker (Salad): Twin Capsule bauen (Prompt, Persona, RAG, SEO, Bild)
  → generated
  → qa-Worker (Salad): automatische Qualitätstests
  → reviewed  (Warteschlange im Admin-UI für menschliche Freigabe)
  → published (Livegang inkl. Sitemap-/SEO-/API-Update)
```

Jeder Statuswechsel schreibt einen Eintrag in `audit_logs`. Jeder Worker-Lauf ist ein `processing_jobs`-Eintrag. Alle Worker sind stateless; Artefakte gehen nach IDrivee2.com, Metadaten nach PostgreSQL.

---

## 2. Datenmodell (neue Migration `0007_historical_pipeline.sql`)

```sql
CREATE TYPE pipeline_status AS ENUM (
  'candidate','researched','verified','generated',
  'reviewed','published','rejected','unpublished'
);

CREATE TABLE IF NOT EXISTS historical_candidates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wikidata_qid      TEXT UNIQUE NOT NULL,          -- Dedup-Anker
  name              TEXT NOT NULL,
  name_variants     JSONB DEFAULT '[]',
  birth_date        DATE,
  death_date        DATE NOT NULL,
  country           TEXT,
  language          TEXT,
  category          TEXT NOT NULL,                 -- Kunst, Wissenschaft, ...
  sitelink_count    INT DEFAULT 0,                 -- Bekanntheits-Proxy
  status            pipeline_status NOT NULL DEFAULT 'candidate',
  status_reason     TEXT,                          -- Pflicht bei rejected
  risk_score        NUMERIC(4,2),                  -- 0.00–10.00
  risk_flags        JSONB DEFAULT '{}',            -- Detailergebnis Risiko-Check
  source_count      INT DEFAULT 0,
  sources           JSONB DEFAULT '[]',            -- [{url, title, snapshot_key, fetched_at}]
  image_status      TEXT,                          -- commons_ok | generated | none
  image_key         TEXT,                          -- IDrivee2.com Object Key
  prompt_key        TEXT,                          -- IDrivee2.com Object Key
  seo_key           TEXT,                          -- SEO/AEO/GEO/AIO-Paket
  qa_report         JSONB,
  twin_id           UUID REFERENCES twins(id),     -- gesetzt ab generated
  reviewed_by       UUID REFERENCES users(id),
  published_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON historical_candidates (status);
CREATE INDEX ON historical_candidates (death_date);

-- Blacklist kommerziell verwalteter Nachlässe (Publicity Rights / Marken)
CREATE TABLE IF NOT EXISTS estate_blacklist (
  wikidata_qid  TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  reason        TEXT NOT NULL,       -- z. B. "HUJ/Greenlight lizenziert Namensrechte"
  severity      TEXT NOT NULL,       -- block | manual_review
  added_at      TIMESTAMPTZ DEFAULT now()
);

-- Konfigurierbare Limits (kein Hardcoding)
CREATE TABLE IF NOT EXISTS pipeline_config (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL
);
-- Seeds: daily_publish_limit=10, daily_candidate_limit=100,
-- min_sources=3, max_death_year=1955, min_sitelinks=15
```

Erlaubte Statusübergänge werden im Backend als State Machine erzwungen (kein direkter Sprung `candidate → published`). Rückwärts nur: `published → unpublished` (mit Grund + Audit-Log).

---

## 3. IDrivee2.com Struktur (nur Blobs, kein Status)

```
/profiles/{qid}/sources/          Quellen-Snapshots (HTML/PDF, ≥3 pro Profil)
/profiles/{qid}/images/           Original + Derivate + Lizenznachweis (license.json)
/profiles/{qid}/prompts/          Persona-Prompt, versioniert (v1.json, v2.json ...)
/profiles/{qid}/seo/              SEO/AEO/GEO/AIO-Paket (JSON)
/profiles/{qid}/qa/               QA-Berichte, Screenshots
/profiles/{qid}/exports/          API-Datensatz, Backup der Capsule
/pipeline/changelogs/             tägliche Pipeline-Berichte
/pipeline/backups/                DB-Dumps der Pipeline-Tabellen
```

Alle Keys werden in PostgreSQL referenziert. Kein Blob ohne DB-Referenz, keine DB-Referenz ohne Blob (Integritäts-Cronjob prüft wöchentlich).

---

## 4. Pipeline-Stufen im Detail

### 4.1 Kandidaten sammeln (Salad-Cronjob, täglich)

SPARQL-Query gegen Wikidata: Menschen mit `death_date ≤ 1955-12-31`, `sitelinks ≥ min_sitelinks`, aus den Zielkategorien (Kunst, Wissenschaft, Philosophie, Politik, Literatur, Musik, Religion, Erfinder, Entdecker, Unternehmer, Medizin, Mathematik, Architektur, Militärgeschichte, Kultur, Bildung). Insert mit `ON CONFLICT (wikidata_qid) DO NOTHING` – Dedup ist damit erledigt. Limit: `daily_candidate_limit`.

### 4.2 Recherche (research-Worker)

Pro Kandidat: Wikipedia-Artikel (beste verfügbare Sprachen), Wikidata-Claims, mindestens 3 unabhängige Quellen. Jede Quelle als Snapshot nach IDrivee2.com. Pflichtfelder befüllen: Kurzbeschreibung, Lebenswerk, bekannte Werke, Denkweise, Schreibstil. Widersprüche zwischen Quellen explizit als `conflicting` markieren (Master Prompt: widersprüchliche Quellen niemals unmarkiert speichern).

### 4.3 Risiko-Check (risk-Worker) – vier getrennte Prüfungen

| Prüfung | Regel | Ergebnis |
|---|---|---|
| **Werke** | Sterbejahr ≤ `max_death_year` (1955)? Nur dann dürfen Originalzitate/Werkauszüge verwendet werden. Sonst: Profil nur mit paraphrasierten biografischen Fakten (Fakten sind nie urheberrechtlich geschützt). | pass / restricted / block |
| **Bild** | Commons-Bild vorhanden UND Lizenz `PD` oder `CC0`/`CC-BY`? Achtung: maßgeblich ist der Todestag des **Fotografen**, nicht der Person. Bei unklarer Lizenz: Bild verwerfen, KI-generiertes Porträt mit Kennzeichnung "KI-generierte Darstellung" verwenden. | commons_ok / generated / none |
| **Publicity Rights / Marke** | Abgleich gegen `estate_blacklist` (z. B. Albert Einstein → HUJ/Greenlight; Marilyn Monroe → ABG; Elvis Presley → EPE). `block` = nicht veröffentlichen; `manual_review` = nur mit menschlicher Freigabe + ggf. Rechtsberatung. | pass / manual_review / block |
| **Ehrschutz / Ethik** | Kürzlich Verstorbene mit lebenden nahen Angehörigen? Kontroverse Figuren (NS-Täter u. Ä.)? Religiös sensible Figuren? Flag setzen → immer manuelle Freigabe. | pass / manual_review / block |

Risiko-Score = gewichtete Summe. `block` in irgendeiner Prüfung → `rejected` mit Grund. Die `estate_blacklist` wird initial mit den ~50 bekanntesten kommerziell verwalteten Nachlässen befüllt und ist im Admin-UI pflegbar.

### 4.4 Twin Capsule bauen (build-Worker)

Erzeugt eine vollständige Twin Capsule gemäß Master Prompt: Persona-Prompt (Denkweise, Antwortstil, Sprachregeln, Sicherheitsregeln), RAG-Daten + Embeddings aus den Quellen-Snapshots, SEO/AEO/GEO/AIO-Paket, API-Datensatz, Bild. Pflicht-Sicherheitsregeln im Prompt jedes historischen Profils:

- Das Profil kennzeichnet sich als KI-Rekonstruktion, täuscht nie, die echte Person zu sein (Master Prompt: keine Täuschung).
- Antwortet in der Sprache des Nutzers.
- Keine Aussagen über Ereignisse nach dem eigenen Todesdatum als eigene Erinnerung (nur als "das war nach meiner Zeit").
- Keine erfundenen Zitate, keine erfundenen biografischen Fakten; bei Unsicherheit sagt das Profil das.

### 4.5 Automatische QA (qa-Worker)

Kein Profil erreicht `reviewed` ohne bestandene Tests:

1. Pflichtfelder vollständig (Name, Daten, Kategorie, Beschreibung, Quellen ≥ 3, Bildstatus, Risiko-Score, Prompt, SEO-Paket).
2. Sterbedatum konsistent zwischen Wikidata und mindestens einer weiteren Quelle.
3. Kein Duplikat (QID-Check + Namens-Fuzzy-Match gegen `published`).
4. Chat-Smoke-Test: 5 Standardfragen (Identität, Lebenswerk, Ereignis nach Todesdatum, Sprache wechseln, Fangfrage mit falscher Behauptung). Bewertung durch LLM-Judge gegen Rubrik; Ergebnis in `qa_report` und `ai_evaluations`.
5. Halluzinations-Stichprobe: 3 Faktenaussagen des Profils gegen Quellen-Snapshots verifiziert.
6. SEO-Paket valide (Schema.org Person-Markup, Meta, Canonical).

### 4.6 Menschliche Freigabe (Admin-UI)

Review-Queue im bestehenden `admin`-Bereich: Profilvorschau, Quellen, Risiko-Flags, QA-Report, Chat-Testfenster. Aktionen: freigeben / zurückweisen (mit Grund) / Blacklist-Eintrag anlegen. **Das Tageslimit für `published` ist zweitrangig gegenüber der Regel: nichts geht live ohne menschliche Freigabe.**

### 4.7 Veröffentlichung (publish-Schritt, Control Server orchestriert)

Atomar: `twins`-Eintrag auf öffentlich, `twin_versions`-Version anlegen, Sitemap regenerieren, SEO-Dateien nach IDrivee2.com/CDN, API-Index aktualisieren, `published_at` setzen, Audit-Log. Rollback = `unpublished`: Sichtbarkeit zurück, Sitemap-Update, Capsule bleibt erhalten (keine Löschung von Profildaten – Master Prompt).

---

## 5. Mengensteuerung

| Phase | published/Tag | Kandidaten/Tag |
|---|---|---|
| Woche 1–2 | 5 | 50 |
| Woche 3–4 | 10 | 100 |
| ab Monat 2 | 20 | 100 |
| nur bei stabiler QA-Quote ≥ 95 % | 30–50 | 150 |

Werte in `pipeline_config`, änderbar ohne Deployment. Zusätzliche automatische Bremse: Wenn die Review-Queue > 3 Tage Rückstand hat oder die QA-Fehlerquote > 10 % liegt, halbiert der Autopilot `daily_candidate_limit` automatisch und meldet dies im täglichen Changelog. Qualität vor Masse ist die Systemregel, nicht nur eine Empfehlung.

---

## 6. Datenschutz & Sicherheit

- Ausschließlich verstorbene Personen des öffentlichen Lebens; keine Daten lebender Personen in Profilen (Erwähnungen lebender Angehöriger werden im build-Schritt neutralisiert).
- Jedes Profil trägt sichtbare Kennzeichnung als KI-Rekonstruktion.
- Meldefunktion pro Profil (nutzt bestehende `moderation_flags`); Meldung → automatisch `manual_review`.
- Alle Statuswechsel, Freigaben und Unpublish-Aktionen in `audit_logs`.
- Worker erhalten nur signierte, zeitlich begrenzte IDrivee2.com-URLs; keine Dauer-Credentials auf Workern.
- Kein Löschen von Profilen, Medien oder Chatdaten; Rückzug nur via `unpublished`.

---

## 7. Tests (Verification Pipeline)

Vor Merge: Build, Typecheck, Lint, Unit Tests (State Machine, Risiko-Check-Logik, Dedup), Integration Tests (Pipeline-Durchlauf mit 3 Fixture-Kandidaten: einer sauber, einer Blacklist, einer mit Bildproblem), API-Test, Migrations-Rollback-Test. Nach Deploy: Live-Smoke-Test mit einem Testkandidaten bis `reviewed` (nicht published).

## 8. Deployment & Rollback

Migration `0007` mit Down-Script. Feature-Flag `pipeline.enabled` in `pipeline_config` (Start: false). Cronjobs auf Salad.com registrieren, erst nach manueller Freigabe des ersten Durchlaufs aktivieren. Rollback: Flag aus, Cronjobs stoppen, Migration bleibt (additiv, zerstört nichts).

## 9. Memory Update

Nach validierter Umsetzung in Memory_Bank.md: Architekturentscheidung "Status in PostgreSQL, Blobs in IDrivee2.com", "Wikidata-QID als Dedup-Anker", "Vier-Stufen-Risiko-Check inkl. estate_blacklist".

## 10. Nächster Schritt

1. Migration `0007_historical_pipeline.sql` + State Machine im Backend implementieren.
2. `estate_blacklist` initial befüllen (Top ~50 verwaltete Nachlässe).
3. Wikidata-SPARQL-Cronjob als ersten Worker bauen und mit `daily_candidate_limit=10` trocken testen (kein Publish).
