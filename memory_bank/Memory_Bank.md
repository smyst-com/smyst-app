# Memory Bank

## Update 2026-07-04 III: VOLL-AUTOMATIK — Publish + Deploy laufen jetzt komplett auf GitHub (PR #71)

- Adams Anforderung: alles automatisch, OHNE dass sein Rechner/die Claude-App an ist. Umsetzung (PR #71, gemergt, Checks gruen): pipeline-run.yml publiziert bei scheduled Cron-Laeufen (06:00 Berlin) nach der QA automatisch ALLE reviewed-Profile (publish --all-reviewed, approved_by=smyst247@gmail.com, dokumentierte Pauschal-Freigabe 04.07.2026) und triggert danach den GitHub Pages Deploy via gh workflow run (job permissions: actions: write). Alle Publisher-Schutzmechanismen (qa_passed, Tageslimit 5, Duplikat-Schutz, Audit-Trail) bleiben aktiv.
- Damit laeuft die komplette Kette Wikidata -> ... -> QA -> Publish -> Deploy -> smyst.com jede Nacht serverseitig auf GitHub. Der Cowork-Task 'smyst-pipeline-morgenlauf' (07:00, nur bei offener App) ist jetzt AUFSICHT: prueft ob der Cron gruen war, fixt Fehler via PR, berichtet Adam. Er publiziert nur noch Reste (z.B. wenn der Cron rot war); doppeltes Publizieren ist harmlos (Publisher lehnt bereits published ab).
- Morgen (05.07.) erwartet: Cron publiziert Q131018 Rabelais + Q22670 Schiller (gestern Tageslimit) + bis zu 3 neue reviewed; Q529 Pasteur wird vom Duplikat-Schutz abgelehnt (bewusst, bei Gelegenheit rejecten).
- OFFENE PUNKTE (Adam will alles ueber Agenten laufen lassen, nichts selbst tun): (1) Pasteur rejecten + Alt-Duplikate Pascal Q1290/Galilei Q307 unpublishen, (2) juristische Risiko-Analyse Blacklist als Dokument, (3) KI-Portraits fuer Profile ohne Commons-Bild, (4) /en/-i18n + Kachel-onError-Falle, (5) Tageslimit erst nach juristischer Pruefung erhoehen.

## Update 2026-07-04 II: DAUERHAFTE PAUSCHAL-FREIGABE von Adam + Publish-Welle 3 (113 Twins live)

- WICHTIG — NEUE PUBLISH-REGEL: Adam King hat am 04.07.2026 schriftlich eine dauerhafte Pauschal-Freigabe erteilt ("Ich gebe dir einmaliger Freigabe fuer jedes Mal ohne mich fragen ... kannst du jeden Tag neue Profile hinzufuegen"). Ab jetzt publiziert der taegliche Morgenlauf ALLE reviewed-Profile mit qa_passed automatisch (qids explizit setzen), ohne Einzelfreigabe. Ausnahmen: Duplikate kuratierter Profile (Q529 Pasteur) und ethics block/manual_review — nur melden. Scheduled Task 'smyst-pipeline-morgenlauf' entsprechend aktualisiert.
- Publish-Lauf #16 (qids=Q1001,Q11758,Q125249,Q131018,Q22670, approved_by=smyst247@gmail.com auf Adams Anweisung 'alle freigeben'): 3 published — Q1001 Gandhi (mohandas-karamchand-gandhi), Q11758 Zamenhof (ludwik-lejzer-zamenhof), Q125249 William James (william-james). Q131018 Rabelais + Q22670 Schiller abgelehnt: Tageslimit 5/Tag erreicht (heute schon Hokusai/Matisse) -> MORGEN ZUERST publizieren.
- Deploy #105 gruen, LIVE VERIFIZIERT: /api/public/twins/?cb= = 113 Twins, alle 3 neuen mit Commons-imageUrl; /t/william-james rendert.
- Q529 Louis Pasteur bleibt reviewed, wird bewusst NICHT publiziert (Duplikat kuratiertes Live-Profil); bei Gelegenheit rejecten/unpublishen.
- Hinweis App-Anzeige: Adam sah nur 108 Profile — Fastly/CDN cached /api/public/twins einige Minuten (App laedt ohne Cache-Buster); kein Bug, nach Cache-Ablauf korrekt.

## Update 2026-07-04: Morgenlauf — Hokusai/Matisse live, selektiver Publish (PR #66), tts.py-Hotfix (PR #67)

- CRON FEHLTE: Der Scheduled-Lauf 06:00 Berlin kam bis ~07:15 nicht (GitHub-Cron-Verzoegerung). Manueller run-small #12 GRUEN (1m58s). Status-Lauf #13: published 10, reviewed 8, candidate 48, rejected 2.
- GEFAHR ERKANNT + BEHOBEN: mode=publish-reviewed rief bisher IMMER publish --all-reviewed auf. Mit 8 reviewed haette das bis zu 5 Profile publiziert, auch NICHT freigegebene (u.a. Gandhi Q1001, publicity=manual_review). FIX (PR #66, gemergt): neuer optionaler Workflow-Input qids (kommagetrennt) — wenn gesetzt, publiziert der Publish-Step NUR diese QIDs via publish --qid; leer = Verhalten unveraendert.
- MAIN WAR KAPUTT: Publish-Lauf #14 rot — IndentationError in backend/app/api/v1/routes/tts.py:48 (Datei mit durchgehend zerstoerter Einrueckung auf main, brach die komplette pytest-Collection). FIX (PR #67, gemergt): Datei mit identischer Logik und sauberer 4-Space-Einrueckung wiederhergestellt. Hinweis: Paralleler Agent hat direkt danach PR #68 (claude/fix-tts-...) gemergt — Koordination weiter beachten.
- PUBLISH (Lauf #15 GRUEN, approved_by=smyst247@gmail.com, qids=Q5586,Q5589 — schriftliche Freigabe Adam 03.07. 'Ja'): Q5586 Katsushika Hokusai (slug katsushika-hokusai) + Q5589 Henri Matisse (slug henri-matisse) published. KEINE weiteren Profile publiziert.
- DEPLOY + LIVE VERIFIZIERT: Pages-Deploy #103 (manuell) gruen; /api/public/twins/?cb= liefert 110 Twins (100 kuratiert + 10 Pipeline), Hokusai + Matisse mit Commons-imageUrl, 0 Beschreibungen <40; /t/katsushika-hokusai rendert mit Portrait, Lebensdaten, KI-Kennzeichnung.
- WARTEN AUF FREIGABE (6 reviewed, qa_passed, NICHT publiziert): Q1001 Mohandas Gandhi (Literatur, Risk 1.74, publicity manual_review), Q11758 Ludwik Zamenhof (Medizin, 0.0), Q125249 William James (Medizin, 0.0), Q131018 Francois Rabelais (Medizin, 0.0), Q22670 Friedrich Schiller (Medizin, 0.0), Q529 Louis Pasteur (Wissenschaft, 0.0 — Duplikat kuratiertes Profil, Publisher wuerde ablehnen; besser rejecten statt publizieren).

## Update 2026-07-03 VII: Startlisten-Fix (Beschreibung >=40) + taeglicher Betreuungs-Task

- BEFUND: 4 von 8 Pipeline-Profilen (Hilbert, Velázquez, Blake, +1) fehlten in der App-Startliste — isCompletePublicProfile in App.tsx filtert description < 40 Zeichen; Wikidata-Kurzbeschreibungen ('deutscher Mathematiker' = 22) fielen durch. Profilseiten /t/<slug> waren nie betroffen.
- FIX (PR #31, gemergt, Deploy #64 gruen, live verifiziert): cardDescription() in scripts/merge-pipeline-published.mjs reichert kurze Beschreibungen deterministisch an: 'deutscher Mathematiker (1862–1943) — Historisches KI-Profil mit dokumentierten Quellen.' Kuratierte Profile unberuehrt. Live-API: 108 Twins, 0 mit description < 40.
- Kachel-Initialen statt Bild in der Liste = nur Ladeverzoegerung der Commons-Thumbnails + CDN-Cache (App laedt /api/public/twins ohne Cache-Buster, Fastly cached einige Minuten) — kein Bug. ACHTUNG Falle in App.tsx: onError eines Kachel-Bilds ENTFERNT das Profil komplett aus der Liste (removeProfileWithBrokenImage).
- AUTOMATISIERUNG: Taeglicher Cowork-Scheduled-Task 'smyst-pipeline-morgenlauf' (07:00, laeuft nur bei geoeffneter Claude-App): prueft Cron-Lauf, publiziert NUR bereits freigegebene Profile (Stand: Q5586/Q5589, Freigabe Adam 03.07. 'Ja'), Pages-Deploy + Live-Check, Memory-Sync, Bericht. Neue reviewed-Profile werden nur GEMELDET (Master Prompt: keine Veroeffentlichung ohne Freigabe).
- Hinweis: Paralleler Agent merged eigene PRs (#25, #27, #29, #30) — bei roten Pages-Deploys erst pruefen, wessen Commit; transiente 'Deployment failed, try again later' einfach re-runnen.

## Update 2026-07-03 VI: Publish-Welle 2 — 8 Pipeline-Profile live, Duplikat-Schutz bewaehrt

- Publish-Run #11 (schriftliche Freigabe Adam 'Ja', approved_by=smyst247@gmail.com): 5 published (Diego Velázquez, William Blake, Khalil Gibran, Francisco de Goya, Vincent van Gogh). Q529 Louis Pasteur vom NEUEN Duplikat-Schutz korrekt abgelehnt ('existiert bereits als kuratiertes Live-Profil'). Q5586/Q5589 abgelehnt wegen Tageslimit 5 -> morgen publizieren.
- BEFUND Pages-Deploys #55-#58 rot: Build jeweils GRUEN, nur der GitHub-Deploy-Schritt scheiterte transient ('Deployment failed, try again later' — GitHub-seitig). Deploy #59 (nach Merge PR #25 — PARALLELER AGENT arbeitet im Repo!) lief danach gruen und enthielt bereits den neuen Publish-Index. Lehre: Bei rotem Pages-Deploy erst Build/Deploy-Schritt unterscheiden; transiente Deploy-Fehler einfach re-runnen.
- LIVE VERIFIZIERT: /api/public/twins = 108 Twins (100 kuratiert + 8 Pipeline, ALLE mit Commons-Bild); https://smyst.com/t/vincent-van-gogh rendert komplett (Selbstportraet, KI-Kennzeichnung, Quellen).
- Die 2 Alt-Duplikate im Index (Blaise Pascal Q1290, Galileo Galilei Q307 — published, aber nie gemergt, kollidieren mit kuratierten Slugs) bleiben harmlos; bei Gelegenheit unpublish --reason 'Duplikat kuratiertes Profil'.

## Update 2026-07-03 V: Erster Cron-Tag — 502-Ausfall behoben, Tageslauf gruen, 8 reviewed warten auf Freigabe

- Cron-Lauf #7-Aequivalent (manueller Nachholversuch 09:2x) scheiterte an WDQS 502 (Kunst: Maler/Bildhauer = riesige Ergebnismengen). FIX (PR #24, gemergt): fetch_bindings mit 3 Versuchen (Backoff 10s/30s) bei 5xx/Timeout; run_ingest toleriert Kategorie-Fehler (Report-Feld 'errors', Lauf geht weiter); exit 1 nur wenn ALLE Kategorien scheitern. 12 Ingest-Tests gruen. Sandbox-Hinweis: httpx fehlt lokal — Stub unter /tmp/hp_stubs noetig.
- Der echte Cron-Lauf #8 'Scheduled' kam VERSPAETET (~09:2x statt 06:00 — GitHub-Cron-Verzoegerung bei neuen Workflows ueblich) und war GRUEN; Nachhol-Lauf #9 ebenfalls gruen. Kein Publish (bleibt manuell).
- Status (Run #10): published 5, reviewed 8 (u.a. Diego Velázquez Q297, Galileo Galilei Q307, William Blake Q41513 — Risk 0.0, QA passed), candidate 28, rejected 2 (u.a. Sarah Bernhardt: Sterbedatum widerspruechlich — Konsistenz-Check hat korrekt gegriffen).
- NAECHSTER SCHRITT (braucht Adams schriftliche Freigabe): publish-reviewed fuer die 8 reviewed-Profile (Tageslimit 5/Tag greift), danach Pages-Deploy.

## Update 2026-07-03 IV: A-Z-Livetest bestanden + Duplikat-Schutz gegen kuratierte Profile

- A-Z-LIVETEST (auf schriftliche Anweisung Adam King) BESTANDEN: Startseite laedt, Pipeline-Profile erscheinen in Sektion NEU; https://smyst.com/t/carl-von-linne rendert mit Commons-Portrait, Lebensdaten, KI-Kennzeichnung, Quellen; Chat mit Pipeline-Profil funktioniert end-to-end (Frage 'Wer bist du...' -> korrekte, gekennzeichnete Antwort inkl. Systema Naturae). Statische API liefert 103 Twins (100 kuratiert + 3 Pipeline, alle mit Bild).
- BEFUND: Von 5 published Profilen wurden nur 3 live gemergt (Linné Q1043, Alfred Nobel, David Hilbert). 2 (u.a. Blaise Pascal Q1290) kollidieren per Slug mit kuratierten Profilen — der Merge-Slug-Schutz hat sie korrekt uebersprungen (nichts kaputt), aber der QA-Duplikat-Check kannte nur Pipeline-Profile, nicht die 100 kuratierten.
- FIX (validiert, 9 Publisher-Tests gruen): publish_profiles.fetch_live_slugs() laedt https://smyst.com/api/public/twins/ und publish_one lehnt Slugs ab, die als kuratiertes Live-Profil existieren (eigene Re-Publishes bleiben erlaubt; bei Netzfehler greift weiterhin der Merge-Schutz als zweite Linie). Die 2 bestehenden Duplikat-Eintraege im Publish-Index bleiben stehen (harmlos, werden nie gemergt) — bei Gelegenheit per unpublish --reason 'Duplikat kuratiertes Profil' bereinigen.
- Kleiner Schoenheitsfehler (offen, niedrig): Profil-Kachel in der Startseiten-Liste zeigt fuer Linné Initialen statt Commons-Bild, obwohl imageUrl gesetzt ist und die Profilseite das Bild zeigt — vermutlich Kachel-Komponente laedt Bild lazy/anders. Kein Funktionsverlust.
- SCHUTZ BESTAETIGT: Branch-Schutz auf main aktiv (Aenderungen nur via PR mit gruenen Checks). AENDERUNGSSTOPP gilt: keine Aenderungen ohne schriftliche Bestaetigung von Adam King.

## Update 2026-07-03 III: TAEGLICHER AUTOMATIK-LAUF AKTIV (PR #22, auf ausdrueckliche Anweisung Adam King)

- pipeline-run.yml hat jetzt schedule-Trigger: cron "0 4 * * *" (06:00 Berlin Sommerzeit). Cron laeuft immer als run-small (MODE-Default via inputs.mode || 'run-small'): Ingest MIT taeglicher Kategorien-Rotation (2 Kategorien/Tag, --category-Flag entfernt) -> Research 5 -> Risk 5 -> Capsule 5 -> QA 5. Erster automatischer Lauf: morgen frueh.
- PUBLISH BLEIBT MANUELL (Master Prompt: keine Veroeffentlichung ohne Freigabe): Adam King fuehrt Actions -> Pipeline Run -> publish-reviewed + E-Mail aus, danach GitHub Pages Deploy. Empfohlener Rhythmus: taeglich oder alle paar Tage; Tageslimit 5 published/Tag greift automatisch.
- Betriebs-Monitoring: schlaegt der Cron-Lauf fehl, erscheint er rot unter Actions; GitHub mailt dem Owner bei fehlgeschlagenen scheduled runs. Hinweis: GitHub deaktiviert scheduled Workflows nach 60 Tagen ohne Repo-Aktivitaet — bei aktiver Entwicklung irrelevant.

## Update 2026-07-03 II: Profilbilder live (PR #21, Pages-Deploy #54) — Pipeline-Profile jetzt vollstaendig

- merge-pipeline-published.mjs erweitert: Pipeline-Profile mit image.mode=commons (Lizenz vom risk-Worker geprueft: PD/CC0/CC-BY*) bekommen imageUrl via Commons Special:FilePath (?width=512) + imageCredit-Feld; og:image und JSON-LD Person.image auf der prerenderten Seite; quality.ok=true. Profile ohne freies Bild bleiben imageUrl=null (KI-Portrait-Anweisung liegt in der Capsule, Generierung bewusst nicht automatisiert).
- LIVE VERIFIZIERT (Cache-Buster noetig, Pages-CDN cached einige Minuten): /api/public/twins/carl-von-linne liefert imageUrl auf Commons, mediaCount 1, quality ok.
- OFFEN (niedrig prioritaer): KI-Portrait-Generierung fuer Profile ohne Commons-Bild; juristische Kurzpruefung Blacklist vor Skalierung >5/Tag; optional taeglicher Cron fuer Pipeline-Run (Empfehlung: erst nach 1-2 Wochen manueller Freigabe-Routine).

## Update 2026-07-03: ERSTE PIPELINE-PROFILE LIVE AUF SMYST.COM (Freigabe Adam King)

- Neu (PR #20): app/workers/report_status.py (read-only Statusreport), publish_profiles --all-reviewed, Workflow-Modes 'status' und 'publish-reviewed' (approved_by-Input Pflicht, wird als actor im Audit-Trail dokumentiert). 8 Publisher-Tests gruen.
- Status-Report (Run #5): 5 Kandidaten reviewed mit qa_passed (echte LLM-Chat-Tests bestanden), Risk-Score 0.0, u.a. Carl von Linné (Q1043), Blaise Pascal (Q1290); 21 candidates in der Warteschlange.
- Publish (Run #6, approved_by=smyst247@gmail.com auf schriftliche Freigabe 'Ja, Weiter' zur exakt beschriebenen Publish-Frage): 5 Profile published; Publish-Index, profile.json und Sitemap-Fragment in IDrive e2 geschrieben.
- Pages-Deploy #53: Merge-Script hat die 5 Profile in die Live-Site uebernommen. LIVE VERIFIZIERT: https://smyst.com/t/carl-von-linne (prerenderte Seite, Title/Canonical/Schema korrekt) und /api/public/twins/carl-von-linne (vollstaendiger Datensatz inkl. 6 Quellen mit e2-Snapshot-Keys, KI-Disclosure, rightsPosture). Suchindex des Profils sauber (nur Name/Slug/Kategorie/Beschreibung).
- Bekannte Nacharbeit: Pipeline-Profile haben noch kein Profilbild (quality.issues=missing_profile_image; image-Anweisung 'generated' liegt in der Capsule — Bildgenerierung ist bewusst noch nicht automatisiert). Unpublish-Rollback: python -m app.workers.publish_profiles unpublish --qid <QID> --reason ... --approved-by ... --enabled, danach Pages-Deploy.
- Damit ist der komplette Kreislauf produktiv: Wikidata -> Research -> Risk -> Capsule -> QA -> menschliche Freigabe -> smyst.com.

## Update 2026-07-03: Frontend-Anbindung LIVE (PR #19, Pages-Deploy #51 gruen) — Pipeline vollstaendig verdrahtet

- Neu: scripts/merge-pipeline-published.mjs — laeuft im Pages-Build NACH generate-profile-pages.mjs. Merged menschlich freigegebene Pipeline-Profile (pipeline-published-index.json, vom Workflow aus IDrive e2 pipeline/published/index.json geladen) in: statische JSON-API (dist/api/public/twins/), Einzelprofil-API, prerenderte /t/<slug>-Seiten (SEO/JSON-LD) und sitemap.xml. DEFENSIV: fehlender/leerer Index = No-op; nur visible+qa_passed; Slug-Kollisionen: kuratierte Profile gewinnen. Mit Fixtures getestet (Merge, QA-Filter, Slug-Schutz, No-op).
- Erweitert: .github/workflows/github-pages.yml — Steps 'Fetch published pipeline profiles (optional)' (aws s3 cp aus IDrive e2, non-fatal) und 'Merge published pipeline profiles' vor dem Artifact-Upload. Basis exakt gegen aktuelles main gebaut (nur +16 Zeilen Diff, nichts ueberschrieben).
- Verifiziert: Pages-Deploy #51 gruen (37s, No-op-Pfad), smyst.com laedt unveraendert mit 100 kuratierten Profilen.
- DAMIT KOMPLETT: Sobald Adam King den ersten Publish freigibt (publish_profiles CLI), erscheint das Profil beim naechsten Pages-Deploy automatisch auf smyst.com — API, Profilseite, SEO und Sitemap inklusive. Pages-Deploy laesst sich manuell triggern (workflow_dispatch) oder kommt mit jedem main-Push.
- Hinweis: Paralleler Agent hat AGENTS.md und weitere PRs (#10, #14) gemergt — Koordination weiter ueber PRs.

## Update 2026-07-03: END-TO-END-LAUF ERFOLGREICH — Pipeline lief komplett mit echten Credentials (Run #4 gruen)

- Neuer Workflow .github/workflows/pipeline-run.yml (workflow_dispatch, mode dry-run|run-small): installiert backend, laeuft komplette pytest-Suite (88 Tests, BEWUSST ohne Provider-Keys — Bestands-Tests erwarten local-Provider), dann Worker 1-5 sequenziell mit echten Secrets (IDrive e2; LLM-Keys nur fuer QA-Step). KEIN Auto-Publish.
- Run #4 (run-small) SUCCESS in 1m47s: Unit-Tests gruen, Ingest 33s (echte Wikidata-SPARQL), Research 9s (Wikipedia/EntityData + Snapshots nach e2), Risiko 3s, Capsule-Build 4s, QA 30s (echte LLM-Chat-Smoke-Tests via konfigurierte Provider, u.a. Groq). Kandidaten/Artefakte liegen jetzt in IDrive e2 unter pipeline/.
- Behobene Befunde auf dem Weg (PRs #16/#17/#18): fehlende Dateien auf main nachgeliefert (candidate_store.py, workers/__init__.py, ingest_candidates.py, research_candidates.py, assess_risk.py — stille Upload-Verluste); build_chat_fn an echte LLMRouter-API angebunden (build_default_router + LLMRequest, None wenn nur local-Fallback); SPARQL-Query von P106/P279*-Subklassenpfad (WDQS-60s-Timeout, Befund Run #3) auf direkte VALUES-Occupation-Listen umgestellt.
- Wichtig fuer Agenten: Nach jedem Web-Upload-Commit die Ziel-Datei auf dem Branch VERIFIZIEREN (tree-Ansicht), Klicks auf Commit/Propose brauchen die Position aus einem frischen Screenshot.
- NAECHSTER SCHRITT (Mensch): reviewed-Kandidaten in e2 pruefen (pipeline/candidates/, qa_report) und ersten Publish freigeben: python -m app.workers.publish_profiles publish --qid <QID> --approved-by smyst247@gmail.com --enabled. Danach Frontend-Anbindung (CDN-API aus pipeline/published/index.json).

## Update 2026-07-03: publish-Schritt (Schritt 7) validiert + gemergt (PR #13, b04ba09) — PIPELINE KOMPLETT

- Neu: backend/app/ai/publisher.py — Publish-Record (inkl. ai_disclosure, Capsule-/Quellen-Referenzen, approved_by), Publish-Index mit Slug-/Namens-Konfliktschutz, Sitemap-Fragment, Tageszaehler. Unpublish entzieht nur Sichtbarkeit (kein Loeschen, Master Prompt).
- Neu: backend/app/workers/publish_profiles.py — BEWUSST KEIN Cronjob: Mensch fuehrt aus nach Pruefung der reviewed-Kandidaten. --approved-by Pflicht (uuid5-actor im Audit-Trail), nur Status reviewed+qa_passed, Tageslimit + pipeline.enabled erzwungen, Index-Konflikte brechen vor jedem Schreiben ab. Artefakte: pipeline/published/{qid}/profile.json, index.json (Quelle fuer statische CDN-API), sitemap-fragment.json.
- Verifiziert: 6 neue Tests, 65 gesamt gruen (7 Suiten), py_compile ok, PR #13 mit 8 gruenen Checks.
- PIPELINE-STAND: alle 7 Bausteine fertig — candidate -> researched -> verified -> generated -> reviewed -> published/unpublished. Die menschliche Freigabe ist der publish-CLI-Aufruf (Interim bis Review-Queue-UI existiert).
- Verbleibend (operativ, braucht Adam King): (1) Salad-Dry-Runs aller Worker (Runbook weiter unten), (2) LLM-Provider-Keys auf Salad fuer den Chat-Smoke-Test, (3) juristische Kurzpruefung Blacklist, (4) optional Review-Queue-UI im Admin (UI-Aenderung -> voller Browser-Testpfad), (5) Frontend-Anbindung: statische CDN-API aus pipeline/published/index.json speisen (Prerender-Erweiterung).

## Update 2026-07-02 (Nacht II): qa-Worker (Schritt 6) validiert + auf main gemergt (PR #12, a972c97)

- Neu: backend/app/ai/qa_checks.py — QA gemaess Spec 4.5: Vollstaendigkeit (Pflichtfelder Kandidat+Capsule, >=3 Quellen), Sterbedatum-Konsistenz Kandidat vs. Capsule/SEO, Duplikat-Schutz (QID + normalisierter Name gegen published), Chat-Smoke-Test mit 5 Standardfragen (Identitaet, Lebenswerk, Ereignis nach Tod, Sprachwechsel, Fangfrage) — regelbasierte Bewertung (KI-Kennzeichnung Pflicht, Taeuschungsformeln verboten, Nach-Tod-Einordnung Pflicht, Fangfrage muss zurueckgewiesen werden) plus optional injizierbarer LLM-Judge.
- Neu: backend/app/workers/qa_candidates.py — generated -> reviewed (qa_passed) / rejected (Duplikat) / bleibt generated mit gespeichertem QA-Report (Issues nachvollziehbar). WICHTIG: ohne konfigurierten Chat-Provider ist qa_passed NICHT erreichbar (chat_smoke_test=skipped) — keine Freigabe ohne Chat-Pruefung. Anbindung an app/ai/llm_router vorbereitet (build_chat_fn), im Test injiziert.
- Verifiziert: 9 neue Tests, 59 gesamt gruen (alle 6 Suiten), py_compile ok. PR #12 mit 8 gruenen Checks gemergt.
- Pipeline-Stand: candidate -> researched -> verified -> generated -> reviewed KOMPLETT. Offen: Review-Queue im Admin-UI (menschliche Freigabe), Publish-Schritt (kuratierte Profildaten + Sitemap/SEO/API + Unpublish), Salad-Dry-Runs, LLM-Provider-Keys fuer den Chat-Smoke-Test auf Salad setzen, juristische Pruefung Blacklist.

## Update 2026-07-02 (Nacht): build-Worker (Schritt 5) validiert + auf main gemergt; E2E-Fix; Branch-Schutz aktiv

- Neu auf main (PR #11, 8 Checks gruen, Merge 3d530ef): backend/app/ai/capsule_builder.py (Persona-Prompt mit Pflicht-Sicherheitsregeln inkl. Zitatverbot bei works=restricted, RAG-Chunks, SEO/JSON-LD Person, Bild-Anweisung commons/generated, TwinCapsule versioniert), backend/app/workers/build_capsules.py (verified -> generated, Artefakte nach pipeline/capsules/{qid}/), backend/tests/test_capsule_builder.py. Lokal: 6/6 neue Tests, 50 gesamt gruen.
- Ausserdem auf main: kompletter Pipeline-Code (Spec, Migration 0007, Domain-Module, Store, Worker 1-3, 44 Tests, Memory Bank) via Web-Uploads + PRs #8/#9; E2E-Fix in frontend/e2e/smyst.spec.ts ('Profil waehlen' fehlte im Locator-Regex — Browser-E2E war dadurch dauerhaft rot, jetzt gruen).
- Branch-Schutz auf main ist seit heute aktiv: Aenderungen nur noch via PR; Browser-E2E ist Pflicht-Check.
- Prozess-Hinweis fuer Agenten: Im lokalen Repo arbeitet parallel ein anderer Agent (Codex); .git/index.lock-Kollisionen moeglich — lokale Commits vermeiden, wenn Lock vorhanden; GitHub-Web-Uploads als Weg in die Versionierung nutzen. Beim GitHub-Upload-Formular landen Textfeld-Eingaben nicht immer — vor dem Commit-Klick per Screenshot verifizieren; Commit-Messages optional (Default akzeptabel).
- Pipeline-Stand: candidate -> researched -> verified -> generated fertig implementiert und getestet. Offen: qa-Worker (Chat-Smoke-Test + LLM-Judge), Review-Queue im Admin, Publish-Schritt (Sitemap/SEO/API), Salad-Dry-Runs mit echten Credentials, juristische Pruefung Blacklist.

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
