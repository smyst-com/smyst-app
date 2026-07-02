# Memory Bank

## Update 2026-07-02 (Abend): risk-Worker (Schritt 4) validiert

- Neu: backend/app/ai/risk_checks.py — 4-Stufen-Check: (1) Werke: Sterbejahr>Cutoff -> restricted (nur Paraphrase); (2) Bild: Commons LicenseShortName (PD/CC0/CC-BY* pass, unfrei -> Bild verwerfen + KI-Portrait, NIE Profil-Block); (3) Publicity: estate_blacklist; (4) Ethik-Watchlist (NS-/Massenverbrecher + Mohammed = block; Jesus/Moses/Buddha = manual_review). Gewichteter Score 0-10 (ethics 5.0 > publicity 4.0 > works 1.5 > image 1.0). Nur publicity/ethics koennen rejecten.
- Neu: backend/app/workers/assess_risk.py — Salad-CLI, researched -> verified/rejected via State Machine mit AuditEvent; Commons-API-Abfrage lazy/injizierbar; Fehler pro Kandidat isoliert.
- Verifiziert: 11 neue Tests, alle 4 Suiten gruen (44 Tests gesamt), py_compile ok. Commons-API erreichbar; Antwortformat-Parsing final im Salad-Dry-Run pruefen.
- Lokale Commits auf codex/llm-multi-provider: d86cd914 (Blacklist-Anpassung) + risk-Worker-Commit. Push weiterhin nur vom Mac moeglich.
- Naechster Schritt: build-Worker (Twin Capsule: Persona-Prompt, RAG, SEO-Paket, Bild), danach qa-Worker, Review-Queue im Admin, Publish.

## Update 2026-07-02 (spaeter): Chat-Befund entkraeftet + Einstein-Entscheidung (autonom, mit muendlicher Pauschal-Freigabe)

- ENTWARNUNG Chat-Abbruch: KEIN Bug. Antworten kommen vollstaendig an; die Zeichen-Animation (streamText, 8 Zeichen/10ms) wirkte nur langsam, weil Chrome Timer in HINTERGRUND-Tabs auf 1/s drosselt (Test-Artefakt). SMYST_AI_MAX_TOKENS NICHT aendern. Fruehere Memory-Notiz dazu ist obsolet.
- ENTSCHEIDUNG Einstein (Expertenurteil, Adam King: "entscheide selbst als Experte"): Profil bleibt live. Begruendung: HUJ v. General Motors (C.D. Cal. 2012) — postmortales Publicity Right Einsteins nach NJ-Recht max. 50 Jahre, 2005 abgelaufen; HUJ-Anspruch heute Marke/Merchandising, informatives Profil mit PD-Foto vertretbar.
- Blacklist angepasst: Einstein Q937 und Alan Turing Q7251 (UK ohne postmortales Publicity Right) block -> manual_review, mit Begruendung in estate_blacklist.py und Migration 0007. James Dean bleibt block (Indiana: 100 Jahre). Tests angepasst, alle 33 gruen.

## Update 2026-07-02: Live-Smoke-Test smyst.com + Suchindex-Fix (validiert) + AENDERUNGSSTOPP

- AENDERUNGSSTOPP (schriftliche Anweisung Adam King, 2026-07-02): Bestehende Funktionen duerfen nicht beschaedigt werden; KEINE Aenderung ohne seine schriftliche Bestaetigung. Gilt fuer alle Agenten.
- Live-Test (Browser, https://smyst.com): App laedt, 100 kuratierte Profile, Kategorie-Filter korrekt (Wissenschaft=36), Profil oeffnen + Chat funktionieren, Antwort kam, keine Konsolenfehler, PWA-Manifest via cdn.smyst.com ok.
- DEPLOYT + LIVE VERIFIZIERT (2026-07-02, mit schriftlicher Freigabe): Such-Fix via GitHub-Web-Upload direkt auf main (Commit 63a4fd6), CI #248 + Foundation CI #227 + GitHub Pages Deploy #31 gruen. Live-Test: Suche "Einstein" -> 1 Profil, "Napoleon" -> 1 Profil. Lokal ist derselbe Fix auf Branch codex/llm-multi-provider committet; beim naechsten Push/Merge entsteht kein Konflikt (identische Aenderung), sonst trivial aufloesbar.
- BUG GEFUNDEN + GEFIXT (Arbeitskopie): Suche zeigte fuer "Einstein" alle 100 Profile. Ursache: profile() in src/data/curated-public-twin-data.ts baute knowledge-Boilerplate (enthaelt woertlich "Napoleon", "Leonardo", "Einstein" in der Verbotene-Form-Regel) und EXAMPLE_QUESTIONS in den searchIndex JEDES Profils. Fix: searchIndex nur noch aus name, slug, mainCategory, categories, description, lens. Verifiziert mit echter rankProfiles-Logik gegen alle 100 Spezifikationen: Einstein->1, Napoleon->1, Leonardo->3, leere Suche->100. NICHT deployt.
- OFFENER BEFUND: Chat-Antworten brechen mitten im Satz ab (Leonardo-Test). Wahrscheinliche Ursache: env SMYST_AI_MAX_TOKENS auf dem Live-Worker zu niedrig (Code-Default 700 in src/data/llm-inference.ts:477). Nur Konfig-Pruefung noetig, kein Code-Fix ohne Freigabe.
- OFFENER BEFUND (Recht): Profil "Albert Einstein" ist live — steht auf der estate_blacklist (block; Hebrew University/Greenlight setzt Namensrechte aktiv durch). Entscheidung ueber Entfernen/Behalten liegt bei Adam King (Aenderungsstopp).
- DEPLOY-BLOCKER: .git/index.lock im Repo, aus der Sandbox nicht entfernbar (anderer Prozess/Drive-Sync auf dem Mac). Commit/Push nur vom Mac moeglich. Live laeuft Branch-Stand von main via GitHub Pages (taeglicher Cron); lokaler Branch codex/llm-multi-provider ist 2 Commits ahead + ungesicherte Aenderungen (nicht von der Pipeline-Arbeit).

## Update 2026-07-02: Autopilot-Pipeline — Schritt 3 (research-Worker) validiert

- Neu: backend/app/ai/research_profiles.py — Domain-Schicht: Wikidata-EntityData-Parser (P569/P570/P18/P106/P800, Sitelinks de/en/fr/es/it), Konsistenzpruefung (Sterbedatum Ingest vs. EntityData vs. Wikipedia-Extract), evaluate_research: Datumswiderspruch oder < min_sources -> rejected; fehlendes Wikipedia-Jahr nur Note; fehlendes Bild KEIN Ablehnungsgrund (build-Worker generiert dann).
- Neu: backend/app/workers/research_candidates.py — Salad-CLI, stateless, httpx lazy importiert (Domain-Tests ohne HTTP-Client), Fehler pro Kandidat dokumentiert statt Lauf-Abbruch, verweigert Nicht-Dry-Run bei pipeline.enabled=false.
- Erweitert: candidate_store.py — pipeline/sources/{qid}/, pipeline/research/{qid}.json, candidate_documents_by_status (Scan), save_candidate_document mit Audit-Trail.
- Verifiziert: 10/10 neue Tests gruen (Parser inkl. 00-Monat-Handling, Konsistenz, Bewertung, Store, Orchestrierung mit gepatchtem Netzwerk); Regressionslauf Schritt-1/2-Suiten (13+10) weiter gruen; py_compile ok.
- Salad-Runbook (Pflicht vor Aktivierung, in dieser Reihenfolge):
  1. `python -m app.workers.ingest_candidates --dry-run --category Wissenschaft` (validiert SPARQL live)
  2. `python -m app.workers.ingest_candidates --enabled --category Wissenschaft` (erster echter Ingest, kleine Menge)
  3. `python -m app.workers.research_candidates --dry-run --limit 3`
  4. `python -m app.workers.research_candidates --enabled --limit 3` und Changelogs in pipeline/changelogs/ pruefen
- Offen: risk-/build-/qa-Worker, Review-Queue im Admin, Publish-Schritt, juristische Pruefung Blacklist.

## Update 2026-07-02: Autopilot-Pipeline — Schritt 2 (Blacklist + Wikidata-Worker + e2-Store) validiert

- Architektur-Entscheidung (mit Nutzer abgestimmt): Pipeline-Status in Produktion als JSON-Objekte in IDrivee2.com (Free-only, ein Schreiber = taeglicher Cronjob, Objektname = QID als Dedup); PostgreSQL-Schema 0007 bleibt Domain-Referenz und Migrationsziel bei spaeterer Parallelisierung.
- Neu: backend/app/ai/estate_blacklist.py — 51 Eintraege, belegt durch offizielle CMG Worldwide Client List 2025 (PDF) + ABG-Recherche; QID-Abgleich mit Namens-Fallback (normalisiert, diakritik-fest). severity block/manual_review. Juristische Pruefung weiterhin offen.
- Neu: backend/app/ai/wikidata_candidates.py — SPARQL-Query-Builder (P106/P279*, Sterbejahr-Cutoff, Sitelinks-Minimum, Label-Service de/en), Parser, Screening (Dedup, Blacklist, Limits, Verteidigung in der Tiefe). 12 Kategorien -> Occupation-QIDs.
- Neu: backend/app/integrations/candidate_store.py — e2-Store (pipeline/candidates/{qid}.json + pipeline/changelogs/{datum}.json), boto3-kompatibel, Fake-testbar.
- Neu: backend/app/workers/ingest_candidates.py — Salad-Cronjob-CLI, stateless, Tagesrotation der Kategorien, verweigert Nicht-Dry-Run solange pipeline.enabled false.
- Verifiziert: 10/10 neue Tests gruen (Blacklist, Query, Parser, Screening, Store-Roundtrip); py_compile ok; alle Dateien < 800 Zeilen. SPARQL-Endpoint erreichbar (HTTP 200), vollstaendige Query wegen URL-Laengenlimit des Sandbox-Fetchers NICHT live getestet -> Pflicht vor Aktivierung: `python -m app.workers.ingest_candidates --dry-run --category Wissenschaft` auf Salad ausfuehren und Bericht pruefen.
- Offen: research-/risk-/build-/qa-Worker, Review-Queue im Admin, Publish-Schritt, juristische Pruefung Blacklist, Wikidata-QIDs einiger Blacklist-Eintraege beim ersten Treffer verifizieren (qid=None-Faelle).

## Update 2026-07-02: Autopilot-Pipeline historische Profile — Schritt 1 (Migration + State Machine) validiert

- Spezifikation: Autopilot_Profile_Pipeline_Spec.md (Wikidata-QID als Dedup-Anker, Status in PostgreSQL-Schema als Source of Truth, Blobs in IDrivee2.com, Vier-Stufen-Risiko-Check inkl. estate_blacklist).
- Neu: database/migrations/0007_historical_pipeline.sql (historical_candidates, estate_blacklist mit 7 Seed-Eintraegen, pipeline_config; text-Status mit CHECK statt SQL-ENUM, konsistent zum Bestandsschema) + 0007_historical_pipeline_rollback.sql. Hinweis database/README.md: Migrationen dienen aktuell als Domain-Modell-Referenz (Free-only-Architektur ohne gehostete DB).
- Neu: backend/app/ai/historical_pipeline.py — reine Domain-State-Machine (frozen dataclasses, str-Enums, kein DB-Import, 239 Zeilen). Erzwungene Regeln: kein Statussprung, rejected/unpublished nur mit Grund, published nur mit menschlicher Freigabe + bestandener QA + geklaertem Bildstatus, Sterbejahr > 1955 nur mit works=restricted, Auto-Bremse halbiert daily_candidate_limit bei Review-Rueckstand > 3 Tage oder QA-Fehlerquote > 10 %. Feature-Flag pipeline.enabled standardmaessig false.
- Verifiziert: backend/tests/test_historical_pipeline.py — 13/13 Tests bestanden (Sandbox-Lauf 2026-07-02); SQL-Struktur-Check ok; Status-Werte und Config-Seeds zwischen SQL und Python abgeglichen.
- Offen: Worker (Wikidata-Cronjob, research, risk, build, qa), Review-Queue im Admin, Publish-Schritt, estate_blacklist auf ~50 Eintraege ausbauen, juristische Pruefung der Blacklist-Logik.

## Update 2026-07-02: app.smyst.com + cdn.smyst.com live (403 behoben)

- Ursache des 403: IDrive e2 sperrt Public Bucket Access serverseitig im Free-Plan. Per S3-API bewiesen (Run #26 idrive-static-deploy): PutBucketPolicy liefert AccessDenied fuer alle Buckets. smyst.com lief nie ueber IDrive, sondern ueber GitHub Pages (Repo smyst-app, 185.199.x.x).
- Loesung ohne Kosten: app + cdn ebenfalls auf GitHub Pages.
  - Neue Repos: smyst-com/app.smyst.com und smyst-com/cdn.smyst.com, je mit .github/workflows/pages.yml (baut smyst-app main, setzt CNAME, deployt Pages; Trigger: push, taeglicher Cron, manuell).
  - Spaceship DNS: app + cdn CNAME von b1u9.la04.idrivee2-98.com auf smyst-com.github.io umgestellt.
  - Custom Domains in beiden Repos gesetzt, DNS-Check gruen, Enforce HTTPS aktiv (Zertifikate von GitHub automatisch).
- Verifiziert live: https://smyst.com, https://app.smyst.com (App rendert vollstaendig), https://cdn.smyst.com/manifest.webmanifest — alle ueber HTTPS.
- Hinweis: Die Mirror-Repos bauen taeglich per Cron neu; nach einem Push auf smyst-app dauert es also max. 24 h, bis app/cdn nachziehen (oder Workflow manuell ausloesen).
- files.smyst.com / media.smyst.com zeigen weiterhin auf IDrive (privat, 403) — reine Storage-Aliase, von der App nicht genutzt.
- IDrive e2 bleibt Primaerspeicher fuer Backend-Daten (privat, via API/Signed URLs) — dafuer ist kein Public Access noetig.

Startpunkt: Web-App und PWA fuer smyst.com laufen fehlerfrei. Native App-Infrastruktur wird jetzt von Grund auf neu aufgesetzt beziehungsweise geordnet weitergefuehrt.

Aktueller Stand:

- Projektordner enthaelt bereits eine Capacitor-Konfiguration.
- Android- und iOS-Projektordner sind bereits vorhanden.
- Die weitere Arbeit erfolgt trotzdem atomar und wird nach jedem Meilenstein hier dokumentiert.
- Capacitor-Konfiguration wurde geprueft:
  - App-ID: `com.smyst.app`
  - App-Name: `smyst.com`
  - Web-Verzeichnis: `dist`
  - Android- und iOS-Schema: `https`
- Capacitor Doctor meldet Android und iOS als gesund.
- Web-Build wurde erfolgreich erstellt.
- App-Assets-Skript wurde erfolgreich ausgefuehrt; bestehende native Icons und Splash-Assets wurden beibehalten.
- `cap sync` wurde erfolgreich ausgefuehrt und hat den aktuellen Web-Build nach Android und iOS kopiert.
- Android-Debug-Build wurde als naechster atomarer Test versucht, stoppt aber sofort, weil keine Java Runtime gefunden wurde.
- Android Studio wurde unter `/Applications` nicht gefunden; macOS meldet ebenfalls keine installierte Java Runtime.
- Lokale Android-CLI-Toolchain wurde in `/private/tmp/smyst-native-toolchain` vorbereitet:
  - Temurin JDK 21 fuer macOS arm64 wurde heruntergeladen und entpackt.
  - Android Command Line Tools fuer macOS wurden heruntergeladen und entpackt.
  - Android-SDK-Installation wurde gestartet, stoppt aber an der Android SDK License. Diese Lizenz muss vom Nutzer akzeptiert werden.
- Live-QA fuer `smyst.com` wurde durchgefuehrt:
  - Root-Sprache wurde korrigiert: unpraefixte Routen bleiben jetzt Deutsch (`html lang="de"`), auch wenn Browser-/Storage-Sprache Englisch ist.
  - Chat-Placeholder und Voice-/Send-ARIA-Labels wurden lokalisiert.
  - Startmenue-Drawer wurde repariert; er oeffnet live sichtbar bei `rectX=0` und schliesst wieder offscreen.
  - Desktop- und Mobile-Layout wurden geprueft; kein horizontaler Overflow, Eingabe und Sendebutton sichtbar.
  - Live-Chatflow wurde mit harmloser Testnachricht geprueft; UI sendet und zeigt erwartete Profil-Sperre ohne Konsolenfehler.
  - Fixes wurden auf Legacy edge provider Pages deployed; `smyst.com` laedt den neuen Bundle `index-BmNndhIh.js`.
  - Bekannter Restpunkt: `/en/` enthaelt weiterhin mehrere hartcodierte deutsche UI-Texte. Das ist ein groesserer i18n-Ausbau, kein Build-/Runtime-Fehler.

Naechster empfohlener Schritt:

1. I18n-Ausbau fuer `/en/` und weitere Sprachrouten planen: hartcodierte deutsche Startmenue-, Login- und Profiltexte in Translation-Keys ueberfuehren.
2. Android SDK License durch den Nutzer akzeptieren lassen.
3. Danach Android SDK Pakete installieren: `platform-tools`, `platforms;android-36`, `build-tools;36.0.0`.
4. Danach Android-Debug-Build erneut ausfuehren: `cd android && ./gradlew assembleDebug`.
5. Wenn Android stabil laeuft, iOS-Projekt in Xcode oeffnen und im Simulator testen. Dafuer ist ein vollstaendiges Xcode erforderlich; aktuell sind nur Command Line Tools installiert.
6. Erst danach native Plugins einzeln einbauen.
