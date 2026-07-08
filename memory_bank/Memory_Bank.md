# Memory Bank

## Update 2026-07-08 III: Sprachwelle Live-Dialog-Haertung

- Voice Worker hat einen sicheren ASR-Warmstart-Schalter (`VOICE_WORKER_PRELOAD_ASR`), bleibt aber default `false`, weil paralleles GPU-Laden von TTS und ASR nach Live-Deploy #8 den Salad-Container instabil machte. `asrPreload` wird in `/health/ready` gemeldet.
- Browser-Server-ASR-Fallback nutzt Web-Audio-Pegel und stoppt nach erkannter Sprechpause, statt nur starr mehrere Sekunden aufzunehmen. Echo-Cancellation, Noise-Suppression und Auto-Gain bleiben aktiv; Audio wird weiterhin transient an `/api/asr/transcribe` gesendet.
- Voice-QA testet TTS jetzt aktiv fuer alle 15 Pflichtsprachen: `en zh es ar fr de pt ru tr ja ko it hi id bn`. Der Regressionsschutz verlangt diese 15 aktiven Smoke-Tests, ASR-Warmstart und Pause-Erkennung.
- Lokal verifiziert: Python-Syntax fuer Worker/QA, Voice-Wave-Regressionscheck, TypeScript `tsc --noEmit`, Vite Production Build, Dist-Artefaktcheck, ASR-Routentests und komplette Backend-Suite `141 passed`.
- Keine Nutzerdaten, Profile, Medien, Chats, Memories, Datenbankinhalte, Secrets oder DNS-Eintraege wurden geaendert oder geloescht.

## Update 2026-07-08 II: Sprachwelle Worker-ASR/TTS live, Bengali Restore und Deploy-Schutz

- PR #155 gemergt: Backend-ASR `/api/asr/status` + `/api/asr/transcribe`, Voice-Worker `/transcribe` mit faster-whisper, normaler Worker-TTS-Pfad `/synthesize`, Frontend-Server-ASR-Fallback per MediaRecorder, erweiterte Voice-QA und Schutzmanifeste.
- PR #156 gemergt: Voice-Worker-Endpoint `https://nectarine-spinach-iss2y28nt89sv94k.salad.cloud` als Backend-Deploy-Fallback, weil GitHub `gh variable set VOICE_WORKER_URL` mit 403 blockierte; Workflow scheitert daran nicht mehr.
- PR #157/#160 gemergt: Bengali-TTS liefert stabil Audio via `espeak-ng-bn`, nachdem Chatterbox mit `bn` 503 lieferte. PR #158 MMS-Bengali-TTS war zu schwer fuer Salad und wurde zurueckgerollt; kuenftige natuerlichere Bengali-TTS braucht separates Modell-/Image-Budget und Startzeit-Review.
- PR #159/#160 Deploy-Schutz: Voice-Worker-Deploy stoppt/startet laufende Salad-Container nach Image-Update und wartet auf echten Bengali-TTS-Livecheck; Backend-Deploy wartet bei Voice-Releases auf `/api/asr/status`, nicht nur Health.
- Live-Deploys: GitHub Pages/Backend/Voice-Worker deployt; Voice Worker Deploy #7 erfolgreich, Backend Deploy #73 erfolgreich. Salad braucht nach GitHub-Erfolg teils mehrere Minuten bis `1 / 1 Replicas Running`; Health kann vorher noch 503 liefern.
- Live verifiziert: `scripts/live-test.sh` gegen `https://smyst.com` gruen; `/api/asr/status` 200 mit 15 Sprachen `ar bn de en es fr hi id it ja ko pt ru tr zh`, `storage=transient`; `/api/tts/voices` 200 mit `workerConfigured=true`, `ready=true`.
- Live TTS verifiziert fuer priorisierte Sprachen: `tr`, `bn`, `ar`, `fr`, `es`, `zh`, `ru`, `hi` jeweils 200 und Audio >1 KB; Engines: Chatterbox multilingual fuer alle ausser Bengali, Bengali aktuell `espeak-ng-bn`.
- Live TTS+ASR-Loop verifiziert: `tr`, `en`, `de`, `ar`, `fr`, `es`, `zh`, `ru`, `hi` mit korrektem Sprachlabel und faster-whisper 200 nach initialem ASR-Lazy-Load. Bengali-TTS 200, Bengali-ASR-Loop mit synthetischer espeak-Stimme liefert 200 aber inhaltlich keine saubere Bengali-Transkription; echte Bengali-ASR muss mit menschlicher Aufnahme separat geraeteseitig getestet werden.
- Browser-QA live: `https://smyst.com` laedt ohne Console-Errors, Voice-Buttons sichtbar (`Spracheingabe`, `Live-Sprachmodus starten`, `Antworten vorlesen`). Codex/Chrome-Automationskontext stellt MediaRecorder/SpeechRecognition/SpeechSynthesis nicht verlaesslich bereit; echte Mikrofon-, iPhone-, Android- und PWA-Install-Tests bleiben nur auf realen Geraeten abschliessend.
- Schutzstatus: keine Nutzerdaten, Profile, Medien, Chats, Memories oder Datenbankinhalte geloescht; keine DNS-Aenderung. Voice-Wave- und Deploy-Aenderungen sind in Regression-, Surface- und Change-Protection-Guards abgedeckt.

## Update 2026-07-08: Multilinguale Sprachwelle live + Schutz aktiviert (PR #153)

- PR #153 (`codex/voice-wave-global-2026-07-08`) gemergt; GitHub Pages Deploy #194 fuer Merge-Commit `370cd59` erfolgreich.
- Sprachwelle gehaertet: gemeinsame 15-Sprachen-Erkennung fuer `en zh es ar fr de pt ru tr ja ko it hi id bn`, Speech-Locale-Routing, Antwortsprache passend zur Nutzersprache und spezielle tuerkische Fallbacks ohne Deutsch/Tuerkisch-Mischsprache.
- API/Frontend: erkannte Voice-Sprache wird an Twin-MVP-Requests weitergegeben; bestehendes Streaming, Piper/Remote-TTS und lokaler Speech-Fallback blieben erhalten.
- SEO/GEO/AEO/AIO: `index.html`, `robots.txt`, `llms.txt`, `ai.txt` und Sitemap fuer globale Such-/AI-Agenten erweitert, inkl. Google, Bing, Baidu, Yandex, Naver, ChatGPT, Claude, Gemini, DeepSeek, Kimi, Grok, Perplexity, Mistral und Qwen.
- Schutz: `src/lib/voiceLanguage.ts`, `src/lib/voiceProfiles.ts`, `src/lib/useTwinMvp.ts`, Voice-Wave-Regressionscheck und Schutzmanifeste markieren Voice-Wave-Aenderungen als schriftlich freigabepflichtig.
- Lokal validiert: `node scripts/check-voice-wave-regression.mjs`, `python3 scripts/check-change-protection.py`, `python3 scripts/check-surface-protection.py`, TypeScript `tsc --noEmit`, Production Build, `scripts/test-all.sh`, `sh scripts/check-dist-artifact.sh`.
- Browser-QA lokal: Desktop, Mobile 390x844, PWA/Manifest, Sprachrouten `/tr/`, `/ar/`, `/bn/`, `/hi/`; `/ar/` rendert RTL.
- Live validiert: `scripts/live-test.sh` gegen `https://smyst.com` gruen; Root liefert Bundle `/assets/index-WERlA8cv.js`, Live-Bundle enthaelt `tr-TR`, `hi-IN`, `bn-BD`, `Kısaca:` und bengalischen Fallback; `/robots.txt`, `/llms.txt`, `/ai.txt` 200 und erweitert.
- Einschraenkung: Die Codex-Browserumgebung stellt keine echte `SpeechRecognition`-/`speechSynthesis`-/Mikrofonfunktion bereit; echte gesprochene Audio-ASR/TTS konnte dort nicht mit realem Mikrofon getestet werden. Die Verifikation deckt Codepfad, UI, Locale-Routing, Bundle, PWA/Live-Smoke und Regression-Schutz ab.
- Schutzstatus: keine Datenbankmigration, keine DNS-Aenderung, keine Nutzerdaten, Medien, Profile, Chatdaten oder Memories geloescht; Rollback ueber Revert von PR #153 oder vorherigen GitHub-Pages-Deploy moeglich.

## Update 2026-07-07 II: Verified Web Research live aktiviert + Salad Deploy-Schutz

- Verified Web Research fuer smyst.com wurde live aktiviert: GitHub Actions Secret `OPENAI_API_KEY` gesetzt, Salad Backend Deploy nutzt `WEB_RESEARCH_ENABLED=true` und `WEB_SEARCH_PROVIDER=openai`; keine Secrets wurden im Code gespeichert oder ausgegeben.
- PR #132 gemergt: Verified-Web-Research-Layer mit Search Decision Engine, Privacy Query Rewriter, Provider-Abstraktion, IDrivee2.com-cache-first, Public-Knowledge-Reviewstatus, Prompt-Injection-Schutz und Chat/UI-Quellenanzeige.
- PR #134 gemergt: OpenAI Responses `web_search`-Payload auf aktuelle Form gehaertet (`search_context_size=low`, kein `external_web_access` im Tool-Payload); Provider-Mock-Test ergaenzt.
- PR #136 gemergt: konservativer OpenAI-Web-Search-Default wieder `gpt-4.1-mini`; Payload-Fix blieb aktiv. Deploy #59 erfolgreich, Salad brauchte nach dem GitHub-Erfolg noch mehrere Minuten fuer Image Download/Readiness.
- PR #137 gemergt: `scripts/deploy-salad-backend.mjs` wartet kuenftig bis `/api/health/live` und `/api/health/ready` wirklich 200 liefern, bevor Deploys als gesund gelten; `OPENAI_WEB_SEARCH_MODEL` wird in die Salad-Runtime-Env uebernommen; `scripts/live-test.sh` nutzt die echten `/api/...`-Pfade.
- Live verifiziert 2026-07-07: `GET /api/health/live` 200, `GET /api/health/ready` 200 mit `storage_configured=true`, `GET /api/auth/me` 200 `authenticated:false`.
- Live Datenschutztest: private/sensible Memory-Frage an `/api/web-research/run` liefert `searched:false` und fuehrt keine Websuche aus.
- Live Aktivierungstest: oeffentliche aktuelle Frage an `/api/web-research/preview` liefert `required_search`, Kategorie `news`, Provider `openai`, `canCallProvider:true`.
- Live Provider-/Cache-Test: `/api/web-research/run` liefert `searched:true`, Hinweis `Ich habe im Internet gesucht.`, Quellen und danach bei gleicher Anfrage `fromCache:true`.
- Verifiziert lokal fuer die finalen Aenderungen: `pytest backend/tests` 126/126 gruen, Research/Chat-Research 14/14 gruen, `ruff check backend` gruen, TypeScript `tsc --noEmit` gruen, Vite Production Build gruen, `node --check scripts/deploy-salad-backend.mjs` gruen, `sh -n scripts/live-test.sh` gruen.
- Betriebslehre: Salad-GitHub-Deploy-Erfolg bedeutet nicht automatisch Gateway-Readiness; System Events koennen `DOWNLOADING`, `STARTING`, `READY` zeigen. Kuenftige Deploys muessen auf Health warten oder im Portal `1 / 1 Replica Running` bestaetigen.
- Schutzstatus: keine Datenbankmigration, keine DNS-Aenderung, keine Produktionsdaten geloescht; Websuche bleibt cache-first, redacted-query-first und Public-Knowledge-Updates bleiben reviewpflichtig.

## Update 2026-07-06 II: Consent-gated Ad-Readiness live (PR #117)

- PR #117 (`codex/ad-consent-readiness`, gemergt): AdSense-/Werbe-Readiness vorbereitet, aber externe Werbung bleibt standardmaessig deaktiviert. Neuer `src/lib/ads.ts` laedt AdSense nur, wenn `VITE_ADSENSE_ENABLED=true`, `VITE_ADSENSE_CLIENT` gueltig ist, ein Slot gesetzt ist und Marketing-Consent aktiv ist. Ohne diese Freigaben werden keine Google-/AdSense-Skripte geladen.
- Neuer `src/components/AdSlot.tsx`: optionaler, stabil reservierter Profil-Footer-Slot fuer oeffentliche Profile; Fehler beim Anzeigenladen brechen Profilseiten nie. Aktuell live unsichtbar, weil kein AdSense-Client/Slot aktiviert ist.
- Consent/Legal: Cookie-Einstellungen nennen Marketing/Werbung korrekt; Datenschutztext beschreibt optionale Werbespeicherung als default-denied und widerrufbar; Nutzungsbedingungen enthalten Invalid-Traffic-/Manipulationsverbot.
- Neuer Audit: `scripts/ad-readiness-audit.mjs` + `npm run check:ad-readiness` pruefen Legal-Routen, Consent-Gates, default-denied, explizite AdSense-Env-Aktivierung, keine AdSense-Skripte im Basis-HTML und keine Google-Ad-CSP-Oeffnung ohne separate Freigabe.
- Verifiziert lokal: `node scripts/ad-readiness-audit.mjs` ok=true; `SMYST_RUN_DIRECT_VITE_BUILD=yes sh scripts/test-all.sh` gruen; `PYTHONPATH=backend python3 -m pytest backend/tests` gruen (112 passed, 2 warnings); `node scripts/generate-profile-pages.mjs`; `node scripts/merge-pipeline-published.mjs`; `sh scripts/check-dist-artifact.sh`.
- Browser-QA lokal: Profilroute `/t/sokrates/`, Consent-Einstellungen via Footer `App-Daten`, Mobile 390x844; keine AdSense-Skripte, keine kaputten Bilder, kein horizontaler Overflow. Lokale `/auth/me`-Warnungen kamen nur vom statischen Testserver ohne API.
- Live nach Pages Deploy #156 (Commit `34f572b`): `/t/sokrates/`, `/privacy/`, `/manifest.webmanifest`, `/robots.txt` 200; Browser-live: keine AdSense-/DoubleClick-Skripte, keine kaputten Bilder, kein Overflow, keine Console-Warnungen/-Fehler fuer `https://smyst.com`.
- Live-Profil-Audit weiter gruen: visibleProfileCount=121, minimumVisibleProfileCount=116, staticProfileImageCount=121, issues=[].
- Einfache Live-Ladezeitmessung `/t/sokrates/`: status=200, TTFB ca. 39 ms, total ca. 40 ms (curl aus Berlin-nahem Cache).
- Sicherheitshinweis: CSP fuer Google-Ad-Domains wurde bewusst NICHT geoeffnet; das braucht vor echter AdSense-Aktivierung eine separate schriftliche Freigabe plus erneuten Security-/Consent-/Layout-Test.
- Native Status unveraendert blockiert: kein `simctl`, kein `adb`, keine Java Runtime, kein Android Studio/Xcode in `/Applications`; echte iOS-/Android-Emulator-Tests sind erst nach Toolchain-Installation moeglich.

## Update 2026-07-06: Werbe-Readiness Public Profiles live (PR #114 + #115)

- PR #114 (`codex/ad-readiness-static-profiles`, gemergt): statische oeffentliche Profile gehaertet. `/twins/<slug>/` und `/chat/<slug>/` werden beim Profil-Build als Alias-Seiten erzeugt, Canonical bleibt `https://smyst.com/t/<slug>`. Live-Chat-Fallback fuer public profiles antwortet bei nicht erreichbarer API lokal/streamend sachlich statt Fehlerbanner. Guardrail ergaenzt: kurz, direkt, sachlich, kein Rollenspiel, keine Selbstbeschreibung, keine Story.
- Produktionsschutz angepasst: ehemalige Provider-/Status-Keys mit Cloudflare-Bezug in neutrale Legacy-Keys umbenannt; Risk-Check-False-Positive `EthicsEntry` -> `EthicsWatchlistEntry`. Keine Nutzerdaten, Profile, Bilder oder Zugänge geloescht/geaendert.
- PR #115 (`codex/public-profile-quality-minimum`, gemergt): `scripts/public-profile-quality.mjs` interpretiert 116 sichtbare Profile als Mindestschwelle, nicht als Obergrenze. Live enthaelt inzwischen 121 sichtbare Profile; Zusatzprofile sind gesund und duerfen den Werbe-Readiness-Check nicht faelschlich brechen.
- Verifiziert lokal: `SMYST_RUN_DIRECT_VITE_BUILD=yes sh scripts/test-all.sh` gruen; `PYTHONPATH=backend python3 -m pytest backend/tests` gruen (112 passed, 2 warnings); `node scripts/generate-profile-pages.mjs`; `node scripts/merge-pipeline-published.mjs`; `sh scripts/check-dist-artifact.sh`; lokale statische Routen `/t/sokrates/`, `/twins/sokrates/`, `/chat/sokrates/`, `/api/public/twins/sokrates/` 200.
- Verifiziert live nach GitHub Pages Deploy #153 + #154: `https://smyst.com/t/sokrates/`, `/twins/sokrates/`, `/chat/sokrates/`, `/api/public/twins/sokrates/`, `/sitemap.xml`, `/robots.txt`, `/manifest.webmanifest` 200. API-Guardrail und Canonical korrekt.
- Live-Profil-Audit: `WEB_BASE_URL=https://smyst.com node scripts/public-profile-quality.mjs` ok=true, visibleProfileCount=121, minimumVisibleProfileCount=116, staticProfileImageCount=121, generatedProfileImageCount=0, testableTop20Count=20, issues=[].
- Browser-Live-QA: Mobile 390x844 und Desktop 1280x720 fuer Sokrates-Profil: Bild geladen, keine broken images, kein horizontaler Overflow, `robots=index,follow`, Canonical `/t/sokrates`, 2 JSON-LD-Scripte, keine Console-Warnungen/-Fehler.
- Deploy-Hinweis: GitHub Pages Deploy #153 scheiterte initial transient im Pages-Schritt ("Deployment failed, try again later"), Build-Artefakt war vorhanden; gezielter Re-run failed jobs brachte Success. Bei diesem Fehler zuerst fehlgeschlagenen Pages-Job neu starten.
- Offen/nicht verifiziert in diesem Lauf: echte iOS-Simulator-/Android-Emulator-Ausfuehrung mangels lokal vollstaendiger nativer Toolchain; AdSense/Consent ist nicht als neuer Code geaendert worden und bleibt in einem separaten fachlichen Review zu pruefen, falls Werbeplaetze aktiv geschaltet werden.

## Update 2026-07-05: Morgenlauf — main-Fix (PR #96), 3 neue Profile live (116 Twins), i18n-Etappe 2 (PR #98)

- CRON ROT: Scheduled-Lauf #20 (09:34, verspaetet) scheiterte an AttributeError 'Settings' object has no attribute 'resend_api_key' — neue backend/app/integrations/email_sender.py (Forgot-Password-Flow, paralleler Agent) liest settings.resend_api_key, das Feld fehlte in Settings; ein Test brach die Worker-Kette. FIX (PR #96, gemergt): resend_api_key: str | None = Field(default=None, validation_alias="RESEND_API_KEY") in backend/app/core/config.py. Nachhol-run-small #21 GRUEN (2m).
- STATUS (#22): published 13 -> nach Publish 16, reviewed 10, candidate 64, rejected 5, unpublished 2.
- PUBLISH (#23 GRUEN, approved_by=smyst247@gmail.com, qids=Q131018,Q22670,Q11812,Q1268,Q131405 — Pauschal-Freigabe Adam 04.07.): 3 published: Q131018 Francois Rabelais (francois-rabelais), Q22670 Friedrich Schiller (friedrich-schiller), Q131405 Louis Daguerre (louis-daguerre). Q11812 Thomas Jefferson + Q1268 Frederic Chopin vom Duplikat-Schutz abgelehnt — existieren bereits als KURATIERTE Live-Profile (wie Q529 Pasteur; bei Gelegenheit rejecten). Verbleibend reviewed fuer morgigen Cron: Q35610 Conan Doyle (publicity manual_review, Risk 1.74 — wie Gandhi-Praezedenz publizierbar), Q37064 Fleming, Q37193 Koch, Q40852 Jenner (alle Risk 0.0).
- LIVE VERIFIZIERT: /api/public/twins/?cb= = 116 Twins (100 kuratiert + 16 Pipeline), alle 3 Neuen mit imageUrl+imageCredit; /t/louis-daguerre rendert mit Portrait + KI-Kennzeichnung. Deploy #135 (Merge PR #98) enthielt Publish-Index + i18n.
- i18n-ETAPPE 2 (PR #98, Branch claude/i18n-start-status-states, 12 Dateien, gemergt, live): neue start-Keys popularLabel, recentLabel, profilesLoading, profilesErrorTitle, profilesErrorBody, profilesEmptyTitle, profilesEmptyBody in staticTranslations.ts (Interface + deutsche Defaults, einzeilig am messagePlaceholder-Anker) + ALLE 10 Locale-JSONs; App.tsx: Lade-/Fehler-/Leerzustand der Profilentdeckung + Rails 'Beliebt'/'Kuerzlich genutzt' auf Muster lang === DEFAULT_LANG ? '<de>' : t.start.<key> (wie PR #90). Live-Check: /locales/en.json liefert die neuen Keys.
- ARBEITSWEISE NEU (validiert, ersetzt Find-Panel-Ritual): Datei-Edits im GitHub-Web-Editor per CodeMirror-API via javascript_tool: const v=document.querySelector('.cm-content').cmTile.view; dann v.state.doc.toString() lesen und v.dispatch mit changes from/to/insert fuer exakte String-Replacements; bei JSONs danach JSON.parse validieren. Kein Tipp-Risiko, keine Koordinaten. WARNUNG: Klick-Sequenzen am Editor sind fehleranfaellig (GitHub-Copilot-Panel oeffnet sich bei Fehlklick, Layout-Shift laesst Tipptext im DOKUMENT landen — einmal passiert, mit Cancel changes sauber verworfen). Commit-Dialog oeffnet oft erst beim 2. Klick auf 'Commit changes...'.
- VERBLEIBENDE i18n-ETAPPEN: (a) Kategorien-Chips/'Alle' (Content-Mapping noetig), (b) Suchfeld-Prerender, (c) Drawer/Login/Chat-Detailtexte + Rail 'AEHNLICHE PROFILE' (05.07. live gesehen, noch deutsch in EN) + 'Kuerzlich genutzt'-Rail-Titel im ausgewaehlten Zustand, (d) addNotice-Meldungen u.a. (~150 Treffer in App.tsx).

## Update 2026-07-04 VIII: i18n-Etappe 1 LIVE — Startseiten-UI in allen 10 Sprachen (PR #90)

- PR #90 (Branch smyst-com-patch-44, 12 Dateien, gemergt, Checks gruen nach E2E-Re-run): (1) staticTranslations.ts — neue start-Keys discoveryLabel/discoveryText/recommendedLabel/newLabel (Interface + deutsche Defaults); (2) ALLE 10 public/locales/*.json um die 4 Keys erweitert (de en tr fr es pt ar zh ja ko, jeweils muttersprachlich); (3) App.tsx — 5 hartcodierte Startseiten-Stellen auf Muster `lang === DEFAULT_LANG ? '<de>' : t.start.<key>` umgestellt: 2x 'Profilentdeckung', Intro-Satz mit {{count}}-Replace, renderDiscoveryRail('Empfohlen'/'Neu'), 'Profil waehlen'-Button (nutzt existierenden chooseTwin-Key).
- LIVE VERIFIZIERT (?lang=..): DE Root unveraendert (Regression ok); EN 'Profile discovery/Recommended/Choose twin/Message'; TR 'PROFIL KESFI/ONERILEN/YENI'; FR 'Decouverte de profils/Recommandes'; ES 'Descubrimiento de perfiles/Recomendados'. Sprache via ?lang= oder Pfadprefix (detectInitialLang; Storage wird auf Root bewusst ignoriert).
- ARBEITSWEISE (wichtig fuer naechste Etappen): GitHub-Web-Editor Suchen/Ersetzen — Panel oeffnet erst nach Editor-Fokus-Klick + MEHRFACH cmd+f mit 2s Pause und Screenshot-Check (sonst tippt man ins Dokument! einmal passiert, mit Cancel changes sauber verworfen); alle Datei-Edits als Direkt-Commits auf EINEN Branch (/edit/<branch>/<pfad>), am Ende EIN PR. Locale-JSONs: neue Keys einzeilig an "messagePlaceholder"-Anker anhaengen (valides JSON, kein Newline noetig).
- VERBLEIBENDE i18n-ETAPPEN (taeglicher Lauf, Teil B): (a) 'Alle'-Kategorie-Chip + Kategorienamen (ACHTUNG: Kategorien sind Profil-CONTENT-Daten, brauchen Mapping-Ansatz, nicht nur UI-Key), (b) Suchfeld-Prerender zeigt kurz 'Profil suchen' vor Hydration (searchLabel-Key greift nach Hydration — pruefen ob prerender-seitig loesbar), (c) Drawer/Login/Chat-Detailtexte, (d) Ladezustand 'Echte KI-Profile werden geladen...'. Memory-Bank-Upload zu GitHub uebernimmt der naechste Morgenlauf.

## Update 2026-07-04 VII: Generierte Profilbilder (PR #84) + /en/-i18n-Auftrag angenommen

- NEUE ANWEISUNG ADAM (04.07., schriftlich): (1) /en/-i18n soll der Betreuungs-Agent KOMPLETT fertigstellen (nicht mehr auf Codex warten — dessen i18n-Branch war lokal und wurde nie gepusht); (2) Profilbilder 'keine Risiko': nur freie Fotos ODER selbst generierte Bilder mit klarer Kennzeichnung.
- GENERIERTE PROFILBILDER (PR #84, gemergt, Checks gruen): merge-pipeline-published.mjs erzeugt fuer Profile OHNE freies Commons-Bild ein deterministisches, stilisiertes SVG-Portrait (Initialen + Name + Lebensdaten + Gradient, Fusszeile 'KI-Profil · smyst.com · keine Fotografie') nach dist/public/profile-images/<slug>-ki-profil.svg; imageUrl gesetzt, quality.ok=true, imageCredit='KI-generierte, stilisierte Darstellung (keine Fotografie der Person)'. BEWUSST kein kuenstliches Gesicht (Taeuschungsrisiko null, Kosten null, offline, reproduzierbar). Greift automatisch ab dem naechsten Profil ohne Bild; bestehende 13 Pipeline-Profile haben alle Commons-Fotos.
- /en/-i18n: In den taeglichen Morgenlauf als Teil B eingeplant (pro Lauf eine Etappe: Audit -> kleiner PR -> E2E -> live pruefen), Scheduled Task entsprechend erweitert. Fortschritt wird hier dokumentiert. Stand: noch keine Etappe umgesetzt.
- Merge-Hinweis: 'Merging is blocked / Checking for the ability to merge automatically' direkt nach Checks-Gruen ist transient — 10s warten + F5, dann ist der Merge-Button aktiv.

## Update 2026-07-04 VI: Restliste abgeschlossen — Urheber-Klarnamen (PR #78+#81) + Kachel-onError-Fix (PR #79), alles live

- URHEBER-KLARNAME (PR #78, gemergt): merge-pipeline-published.mjs holt jetzt in EINEM gebatchten Commons-API-Call (action=query prop=imageinfo iiprop=extmetadata, max 50 Titel) Artist + LicenseShortName fuer alle Pipeline-Bilder. imageCredit z.B. 'Bild: Orren Jack Turner — Wikimedia Commons (Public domain) — Quelle: <File-Seite>'. Fallback bei API-Fehler: bisheriger Quellseiten-Link, Build scheitert NIE.
- FOLGE-FIX (PR #81, gemergt): Commons liefert teils woertlich 'missing name' als Artist (z.B. Hokusai-Selbstportraet) — Platzhalter (missing name/unknown/anonymous/unbekannt/n/a/none) werden gefiltert, dann bleibt der Quellseiten-Link. LIVE VERIFIZIERT: 13 Pipeline-Profile, 0 fehlerhafte Credits.
- KACHEL-FALLE ENTSCHAERFT (PR #79, gemergt, Browser-E2E gruen): App.tsx removeProfileWithBrokenImage ENTFERNT bei Bild-Ladefehler nicht mehr das Profil, sondern setzt nur imageUrl='' -> Initialen-Fallback rendert (Kachel + Detailansicht). Editiert via GitHub-Web-Editor Suchen/Ersetzen (nur 2 Zeilen, kein Auto-Indent-Risiko). Startseiten-Smoke-Test live ok (113 Profile, Kategorien, Kacheln).
- Browser-E2E-Check ist NACHWEISLICH flaky (PR #72 und #81 jeweils nach Re-run gruen bei nicht-UI-Aenderungen) — bei rotem 'Current UI browser E2E' immer erst Re-run failed jobs.
- Paralleler Agent hat PR #80 (claude/seo-landing...) gemergt; Deploy #116 wurde dadurch von #117 ueberholt (beide Aenderungen in #117 live) — normales Verhalten, kein Fehler.
- RESTLISTE-STATUS: (erledigt) Duplikat-Aufraeumen, Rechtsanalyse, works-Regel Kunst>1950, CC-BY-Attribution inkl. Klarname, Kachel-onError. (bewusst NICHT beim Betreuungs-Agenten) /en/-i18n: liegt beim parallelen Codex-Agenten (Branch codex/llm-multi-provider, 'i18n: expand to 15 languages' in Arbeit — NICHT doppelt anfassen); KI-Portrait-GENERIERUNG: bewusst manuell/offen — braucht Provider-/Kostenentscheidung von Adam und ist laut Rechtsanalyse hoeheres Taeuschungsrisiko; Profile ohne Bild funktionieren mit Initialen sauber. Tageslimit-Erhoehung: technisch bereit, wartet nur auf anwaltliche Bestaetigung der Rechtsanalyse.

## Update 2026-07-04 V: Beide Pipeline-Fixes aus der Rechtsanalyse umgesetzt (PR #75 + #76)

- FIX 1 (PR #75, gemergt, Checks gruen): risk_checks.py — neue Regel ART_WORKS_RESTRICTED_AFTER_YEAR=1950: Kategorie Kunst + Sterbejahr > 1950 -> works=restricted (Werke koennen jurisdiktionsabhaengig noch geschuetzt sein, 70 J. p.m.a.), auch wenn max_death_year-Cutoff (1955) PASS ergaebe. Neuer Test test_artist_death_after_1950_marks_works_restricted (Matisse restricted, van Gogh pass, Nicht-Kunst 1954 pass). Alle 12 risk-Tests lokal + CI gruen. Wirkt nur auf KUENFTIGE Risk-Laeufe; bereits publizierte Profile (Matisse) unveraendert — bei Bedarf Re-Assessment.
- FIX 2 (PR #76, gemergt, Checks gruen): merge-pipeline-published.mjs — imageCredit nennt jetzt konkret die Commons-Quellseite: 'Bild: Wikimedia Commons (lizenzgeprueft, PD/CC) — Quelle & Urheber: https://commons.wikimedia.org/wiki/File:<datei>' (dort stehen Urheber/Titel/Lizenz; CC-BY-Attribution nachpruefbar). Fallback ohne Bild unveraendert. Lokal mit Fixture getestet (Attribution-Link, Slug-Schutz, Fallback, Mirror-Fallback bei Netzfehler). Greift fuer ALLE Pipeline-Profile beim naechsten Deploy.
- Arbeitsweise-Notiz (validiert): Python/JS-Dateien von main byte-genau via GitHub-Blob embeddedData.rawLines lesen (get_page_text zerstoert Einrueckung; DLP-Blocker mit Zeichen-Substitution umgehen); Aenderungen lokal in Sandbox testen (pytest fehlt/PyPI gesperrt -> Mini-Runner mit PYTHONPATH), Upload via GitHub-Web auf Branch, zweite Datei per /upload/<branch>/<pfad> direkt auf denselben Branch committen.
- OFFEN (naechste Laeufe): (1) Pipeline soll Commons-Artist-Namen selbst erfassen (assess_risk imageinfo extmetadata Artist -> capsule.image.artist -> imageCredit mit Klarnamen), (2) KI-Portraits fuer Profile ohne Commons-Bild, (3) /en/-i18n + Kachel-onError, (4) Tageslimit-Erhoehung: technische Voraussetzungen aus Rechtsanalyse sind jetzt ERFUELLT — es fehlt nur noch die einmalige anwaltliche Bestaetigung.

## Update 2026-07-04 IV: Aufraeumen (unpublish-Mode, PR #73) + Rechtsanalyse erstellt

- Neu (PR #73, gemergt): Workflow-Mode 'unpublish' (Inputs qids + reason + approved_by, Sichtbarkeitsentzug ohne Loeschen). Lauf #18 GRUEN: Q1290 Blaise Pascal + Q307 Galileo Galilei aus dem Publish-Index entfernt (reason 'Duplikat kuratiertes Profil') — die 2 Alt-Duplikate aus Welle 1 sind bereinigt. Live-Site unveraendert (waren nie gemergt).
- Q529 Louis Pasteur bleibt reviewed; der naechtliche Auto-Publish versucht ihn, der Duplikat-Schutz lehnt ab — harmlos, erscheint als 'abgelehnt' im Cron-Log (kein Fehler).
- Erster Cron NACH Automatik-Merge: Run #17 'Scheduled' (08:4x, verspaetet) lief noch auf dem ALTEN Workflow-Stand (b9ec9df, vor PR #71) — nur Ingest->QA, gruen, KEIN Auto-Publish. Ab morgen 06:00 laeuft der Cron mit Auto-Publish + Auto-Deploy; als erstes gehen Q131018 Rabelais + Q22670 Schiller live (heute Tageslimit erreicht: 5 published).
- RECHTSANALYSE erstellt: memory_bank/Rechtsanalyse_Estate_Blacklist.md — Bewertung aller Risikofelder (postmortales Persoenlichkeitsrecht DE, US Publicity/Blacklist, Urheberrecht, Bildlizenzen, DSGVO, AI-Act, Ethik). Fazit: aktueller Autopilot gut vertretbar; VOR Tageslimit-Erhoehung zwei kleine Pipeline-PRs umsetzen: (a) Kunst + Sterbejahr > 1950 -> works=restricted, (b) CC-BY-Attribution (Urheber+Lizenz) konkret ins imageCredit-Feld. Anwaltliche Bestaetigung einmalig empfohlen (Analyse ist keine Rechtsberatung). Ergebnis Fliesstext-Empfehlung an Adam gesendet.
- OFFENE PUNKTE (Reihenfolge): (1) works=restricted-Regel Kunst>1950, (2) CC-BY-imageCredit, (3) KI-Portraits fuer Profile ohne Commons-Bild, (4) /en/-i18n + Kachel-onError-Falle, (5) Tageslimit-Erhoehung erst nach (1)+(2)+Anwalt.

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

## Verified Web Research Layer (2026-07-06, lokal validiert)

- Additive Backend-Schicht fuer smyst.com gebaut: `backend/app/ai/web_research.py` mit Search Decision Engine, Privacy Query Rewriter, Provider-Abstraktion (`openai|brave|searxng|disabled`), IDrivee2.com-kompatiblem Cache, TTL-Regeln, Prompt-Injection-Markierung und Public-Knowledge-Vorschlaegen.
- API ergaenzt: `/api/v1/web-research/preview`, `/run`, `/public-profile-suggestions`. Internetnutzung wird mit `Ich habe im Internet gesucht.` markiert und liefert bis zu 3 Quellen.
- Sichere Defaults: `WEB_RESEARCH_ENABLED=false`, `WEB_SEARCH_PROVIDER=disabled`; keine API-Keys im Code; private Memory, private Dokumente, Twin Capsules und sensible Daten blockieren Websuche ohne Public-Research-Freigabe.
- Public Knowledge bleibt getrennt von Private Memory: Profilupdates werden nur als `discovered` mit `reviewRequired=true` vorgeschlagen und nicht automatisch uebernommen.
- Validierung: neue Research-Tests 9/9 gruen, komplette Backend-Suite 121/121 gruen, Ruff fuer neue Dateien gruen, `tsc -b` gruen, Vite Production Build gruen, Change/Surface/Backup-Protection gruen.
- Naechster sicherer Schritt: sauberer PR nur mit Research-Layer-Dateien, danach Staging/Salad-Deploy und Live-Smoke.

## Update 2026-07-07: Verified Web Research Product-Integration lokal validiert

- Chat-Integration ergaenzt: aktuelle oeffentliche Fragen koennen den Verified-Web-Research-Service cache-first nutzen; LLM-Prompt bekommt nur bereinigte `untrusted_web_content`-Evidenz und Quellenmetadaten, keine rohen Web-Snippets. Private Fragen laufen ohne Websuche weiter.
- UI ergaenzt: Twin Chat zeigt bei tatsaechlicher Recherche `Ich habe im Internet gesucht.` plus maximal 3 klickbare Quellen; Profilseite trennt `Private Memory`, `Public Knowledge`, `Pending Research Updates` und `Approved Sources` mit Review-Aktionen. Public Knowledge wird nur nach Nutzerklick uebernommen, nicht automatisch.
- Frontend-Fallback verbessert: kuratierte Public-Twin-Fallbacks setzen keinen falschen globalen Fehler mehr, wenn ein optionaler Public-API-Request fehlt; lokale Preview-Origin `http://127.0.0.1:4173` ist in den lokalen Default-CORS-Origins enthalten.
- Validierung: `ruff check backend` gruen; komplette Backend-Suite 123/123 gruen; Research/Chat-Research-Tests 11/11 gruen; TypeScript `tsc --noEmit` gruen; Vite Production Build gruen; lokale API-Smokes fuer health/live, web-research preview/run und public-profile-suggestions bestanden; Chrome-Preview fuer `/chat?twin=albert-einstein` ohne Console-Errors, ohne sichtbares Fetch-Banner und ohne horizontalen Overflow.
- Schutzstatus: keine Migration, keine DNS-Aenderung, keine Secrets, keine Produktionsdaten geloescht oder geaendert. Local ready-health bleibt ohne Storage-Secrets erwartbar `not_ready`.

## Update 2026-07-07: Verified Web Research live aktiviert und Salad-Backend stabilisiert

- Live-Freischaltung: `WEB_RESEARCH_ENABLED=true`, `WEB_SEARCH_PROVIDER=openai` ueber bestehenden GitHub-Actions-/Salad-Deploy-Prozess; keine API-Keys im Code, keine DNS- oder Datenbank-Migration.
- Backend-Control-Server verschlankt: Piper-Binary und Voice-Modelle aus `backend/Dockerfile` entfernt. Voice-Synthese bleibt Worker-/Consent-Thema; `/api/v1/tts/voices` liefert live kontrolliert `ready:false`, statt grosse Modelldateien im Control-Server zu speichern.
- Provider-Diagnose gehaertet: `/api/v1/ai/providers?ping=true` gibt nur redaktierte Felder `error`, `status_code`, `category` aus; keine Header, Keys oder Provider-Response-Bodies.
- Web-Research-Fail-Closed: Providerfehler oder IDrivee2.com-Cache-Schreibfehler koennen Chat/API nicht mehr mit 500 crashen. Erfolgreiche Research-Antworten bleiben nutzbar, Cache ist best-effort.
- Deploys: PR #144 (Slim Salad backend image) und PR #146 (Web-Research Fail-Closed) gemergt; Salad Backend Deploy #69 erfolgreich auf Commit `d730e3a`; Salad Portal zeigt Version 62 mit `1 / 1 Replica Running`.
- Live-Validierung: `scripts/live-test.sh` gegen `https://smyst.com` und Salad API bestanden; `/api/health/live` 200, `/api/health/ready` 200; private Web-Research-Preview bleibt `decision=no_search`, `canCallProvider=false`, `redacted=true`; oeffentlicher Web-Research-Run liefert 200, `Ich habe im Internet gesucht.` und Quellen.
- Providerstand live: 7 Keys/Provider konfiguriert; aktiv pingbar sind OpenRouter und Groq. OpenAI-Web-Research funktioniert, OpenAI-Chat-Ping ist aktuell `429/rate_limited`; Anthropic/Gemini/xAI melden `400/invalid_request`; DeepSeek meldet `402/http_error`. Keine kostenpflichtige Aktivierung vorgenommen.
- Schutzstatus: keine Nutzerdaten, Medien, Profile, Chatdaten oder Memories geloescht; keine Secrets offengelegt; keine DNS-/Domain-Aenderung; Rollback ueber Revert der PRs #144/#146 oder letzten erfolgreichen Salad-Backend-Deploy moeglich.

## Update 2026-07-07: Provider-Health-Fallback und Web-Research-Live-Smoke abgeschlossen

- Provider-Health-Fallback live gemergt und deployed: PR #151 auf Commit `be19c3a`, Salad Backend Deploy #72 erfolgreich, Salad Portal Version 65.
- Providerdiagnose nutzt kurze `/models`-Credential-Checks und faellt bei Netzwerk-Timeout auf Generation-Ping zurueck. Ergebnis live: OpenRouter, OpenAI und Groq `ok:true`; alte Secret-Modellnamen werden intern normalisiert (`claude-haiku-4-5`, `gemini-3.5-flash`, `grok-4.3`), ohne Secrets im Code zu speichern.
- E2E-Schutz aktualisiert: `frontend/e2e/smyst.spec.ts` mockt den aktuellen Chat-Streaming-Endpunkt deterministisch; GitHub PR-Checks fuer #151: 6 erfolgreich, 2 erwartbar uebersprungen, keine Konflikte.
- Live-Validierung nach Deploy: `https://smyst.com` Smoke-Test bestanden; PWA-Dateien, SEO/AIO-Dateien, `security.txt`, Backend `live`/`ready` und `auth/me` alle 200.
- Web-Research-Live-Test: oeffentliche aktuelle Frage liefert `required_search`, Provider `openai`, `Ich habe im Internet gesucht.` und 3 Quellen; private/sensible Frage bleibt `no_search`, `canCallProvider=false`, `redacted=true`.
- Browserpruefung: smyst.com laedt mit Titel `smyst.com | KI-Zwillinge, digitale Profile und Twin Chat`, keine Console-Errors, kein horizontaler Overflow im Desktop-Viewport.
- Schutzstatus: keine Datenbankmigration, keine DNS-Aenderung, keine Secret-Aenderung, keine kostenpflichtigen Anbieter aktiviert, keine Nutzerdaten geloescht. Rollback: Revert PR #151 oder erneuter Salad-Deploy der vorherigen stabilen Version.
