# smyst.com Master Audit & Final Review

Datum: 2026-06-10  
Scope: gesamtes Repository, lokale Konfigurationen, aktive Source-Dateien, Worker, PWA-Dateien, Native-Konfigurationen, Dokumentation und vorhandene Build-Artefakte.  
Regel: Production darf nur GitHub Free, Cloudflare Free und IDrive e2 verwenden. Kostenpflichtige Zusatzdienste sind nicht erlaubt. IDrive e2 ist zentraler Objekt-Speicher fuer Dateien, Medien, Dokumente, Uploads, Backups und Twin-Daten.

## 1. Pruefgrundlage

Gepruefte lokale Basis:

- Arbeitsverzeichnis: `smyst.com app`
- Audit-relevante Dateien ohne `node_modules`, `dist`, `dev-dist`, `.git`: 299
- Audit-relevante Zeilen ohne `node_modules`, `dist`, `dev-dist`, `.git`: 44.942
- Zusaetzlich geprueft: vorhandene Build-Artefakte in `dist/`, `android/app/src/main/assets/public/`, `ios/App/App/public/`

Ausgefuehrte Checks:

- `python3 scripts/validate-foundation.py`: bestanden
- `git diff --check`: bestanden
- `node node_modules/typescript/bin/tsc --noEmit`: bestanden
- `sh scripts/test-all.sh`: bestanden, mit lokalem Node-Fallback
- Worker-Bundles via esbuild: `workers/api.ts`, `workers/auth-github.ts`, `workers/storage-idrive.ts`, `workers/translate.ts`, `workers/warmup-translations.ts` erfolgreich gebuendelt
- PWA-Dateien: `public/sw.js`, `public/manifest.webmanifest`, Locale-JSON, `public/sitemap.xml`, `public/robots.txt`, `public/llms.txt` syntaktisch geprueft
- iOS/Android XML/Plist: syntaktisch geprueft
- Repo-Suche nach verbotenen Diensten: durchgefuehrt

Nicht live verifiziert:

- Kein Zugriffstest gegen echte Cloudflare Pages/Workers Deployments
- Kein echter GitHub OAuth Callback gegen Production
- Kein echter IDrive-e2 Upload/Download/Delete gegen Bucket
- Kein Android-Build, weil lokal keine Java Runtime verfuegbar war
- Kein iOS-Build, weil lokal kein vollstaendiges Xcode/CocoaPods Setup verfuegbar war
- Kein Lighthouse, keine Browser-E2E-Screenshots gegen frisches Production-Build, weil der direkte lokale Vite-Build in dieser Umgebung haengt

## 2. Gesamtbewertung

| Bereich | Bewertung | Status |
|---|---:|---|
| Gesamtprojekt als MVP | 78% | Gute Free-only-Basis, aber noch nicht produktionsfertig |
| Free-only-Architektur | 88% | Aktive Zielarchitektur passt, Altlasten und Build-Artefakte stoeren |
| Milliarden-Skalierungs-Vorbereitung | 35% | Architektur ist sauber modular, aber Free-Tier/KV/IDrive sind keine Milliardenplattform |
| Web | 80% | Source gut, lokaler finaler Build nicht erfolgreich verifiziert |
| PWA | 78% | Manifest/SW/Offline vorhanden, aber Build-/Browser-Abnahme offen |
| iPhone/iOS | 62% | Capacitor/Info.plist vorhanden, Build und Universal Links offen |
| Android | 64% | Manifest/Permissions vorhanden, Build und App Links offen |
| Sicherheit/Datenschutz | 82% | Gute Baseline, aber CSRF-Token, KV-Race-Controls und Live-Abnahme fehlen |
| Performance | 72% | Lazy Loading und Edge-Architektur vorhanden, Build/Lighthouse/Native-Assets offen |
| SEO/AEO/GEO/KI-Suche | 76% | robots/sitemap/llms/schema/i18n vorhanden, OG-Asset und dynamische Profil-Indexierung offen |

Ehrliche Kernaussage: smyst.com ist als Free-only-MVP technisch deutlich vorstrukturiert, aber noch nicht 100 Prozent bereit fuer Production. Der groesste Abstand entsteht nicht durch fehlende Konzepte, sondern durch stale Build-Artefakte, nicht live getestete Cloudflare-/IDrive-Flows, KV-Grenzen, fehlende Native-Link-Dateien und fehlende echte KI.

## 3. Architektur-Audit

### Funktioniert vollstaendig

- Zielstack ist klar definiert: GitHub Free, Cloudflare Pages/Workers/KV Free, IDrive e2.
- Aktive Worker liegen in `workers/` und brauchen keinen VPS, kein FastAPI-Backend, keine externe Datenbank und keine Redis-Instanz.
- `scripts/validate-foundation.py` blockiert Production-Verstoesse gegen verbotene Dienste.
- `docs/FREE_ONLY_INFRASTRUCTURE.md`, `docs/FREE_ONLY_DATA_MAP.md`, `docs/ARCHITECTURE.md` und `docs/12-foundation-decisions.md` beschreiben die Free-only-Regel korrekt.
- `wrangler.toml` setzt API, Auth, Storage und Translation als Cloudflare Workers auf.

### Funktioniert teilweise

- Cloudflare KV wird fuer Sessions, OAuth-State, Quotas, Upload-Status, kleine Twin-Metadaten und oeffentliche Snapshots verwendet. Das passt fuer ein MVP, ist aber keine dauerhaft starke Datenbank.
- IDrive e2 ist als S3-kompatibler Speicher angebunden, aber der echte Bucket-Flow wurde lokal nicht live verifiziert.
- Deployment ueber GitHub Actions und Wrangler ist vorbereitet, aber nicht in dieser lokalen Umgebung end-to-end deployed.

### Funktioniert nicht oder ist kritisch offen

- `wrangler.toml` nutzt fuer `SESSIONS` und `METADATA` dieselbe KV-ID in `env.storage` und `env.api`:
  - `wrangler.toml:149-154`
  - `wrangler.toml:179-188`
  Das ist kein direkter Free-only-Verstoss, aber ein Architektur- und Datenschutzrisiko. Sessions und Metadaten muessen getrennte KV-Namespaces haben.
- Stale Production-Artefakte in `dist/`, `android/app/src/main/assets/public/` und `ios/App/App/public/` enthalten alte Mobile-only-UI, Google-Fonts-Preconnects und alten Google-Login-Text. Diese Artefakte duerfen nicht als aktueller Production-Stand ausgeliefert werden.
- Legacy-Ordner `backend/`, `frontend/`, `database/`, `docker/`, `vector/`, `monitoring/` enthalten weiterhin FastAPI, PostgreSQL, Redis, pgvector, Docker/Caddy oder aehnliche Altlasten. Sie sind dokumentiert bzw. teilweise blockiert, bleiben aber Verwechslungsrisiko.

### Free-only-Verstoesse oder Rest-Risiken

Aktive Zielarchitektur: keine harte aktive Production-Pflicht auf VPS, PostgreSQL, Redis, FastAPI, DeepL, Google Translate, Google OAuth, GA4 oder Search Console gefunden.

Rest-Risiken im Repository:

- `backend/pyproject.toml`: FastAPI/Redis/PostgreSQL-nahe Dependencies fuer Legacy-Backend
- `backend/app/main.py`: FastAPI-App
- `backend/app/core/config.py`: Default `DATABASE_URL` und `REDIS_URL`
- `backend/app/integrations/redis_client.py`: Redis Client
- `database/` und `vector/indexes.sql`: SQL/pgvector Legacy
- `docker-compose.yml` und `docker/`: Docker/Postgres/Redis/Caddy Legacy lokal
- `frontend/`: Legacy-Next-/Docker-Referenz
- `monitoring/`: Prometheus/Alerting Legacy
- `scripts/deploy-vps.sh`, `scripts/rollback-vps.sh`, `scripts/backup-postgres.sh`, `scripts/restore-postgres.sh`: blockieren bereits, sollten aber klar unter Legacy einsortiert bleiben

Empfehlung: Altlasten nicht blind loeschen, aber in `legacy/` verschieben oder mit einem top-level `LEGACY_NOT_PRODUCTION.md` und CI-Regeln noch schaerfer von Production trennen.

## 4. Sicherheits-Audit

### Funktioniert vollstaendig

- Security Headers in `workers/_shared.ts`: CSP fuer API-Antworten, `frame-ancestors 'none'`, `X-Content-Type-Options`, `Referrer-Policy`, HSTS.
- CORS ist hostbasiert und schraenkt Browser-Origin auf Canonical Host und Pages-Origin ein.
- Cookie-basierte Sessions sind `HttpOnly`, `Secure`, `SameSite=Lax`.
- Auth nutzt GitHub OAuth statt Google OAuth.
- Rollen/Rechte existieren in `workers/auth-github.ts` und werden in `workers/api.ts`/`workers/storage-idrive.ts` geprueft.
- Uploads gehen nicht durch den Worker als Datei-Proxy, sondern per kurzlebiger IDrive-e2-Signed-URL direkt zum Objekt-Speicher.
- Upload-Worker prueft Kategorie, Dateigroesse, Content-Type, Dateiname, User-Prefix, Quotas und Upload-Completion per IDrive-e2-HEAD.
- Oeffentliche Twin-Snapshots entfernen private Felder wie `userSub`, `imageKey`, Media-Keys und Wissenstexte.

### Funktioniert teilweise

- CSRF-Schutz existiert ueber Origin/Referer-Pruefung in `requireSameOrigin`, aber es gibt keinen echten CSRF-Token oder Double-Submit-Token. Der Header `X-Smyst-CSRF` ist in CORS erlaubt, wird aber nicht als Token validiert.
- Rate Limits und Quotas sind KV-basiert. Das ist fuer MVP okay, aber wegen Read-then-Put nicht atomar.
- Datei-Typpruefung nutzt Content-Type und Limits. Es gibt keine Malware-/Content-Analyse.
- IDrive-e2 Server-Side-Encryption wird als manuelle Bucket-Konfiguration beschrieben, aber nicht programmatisch erzwungen.
- GitHub OAuth ist funktional vorbereitet, aber ohne PKCE und ohne sichtbare Session-Verwaltung/Revocation-UI.

### Sicherheitsprobleme

1. `workers/_shared.ts`: KV-Rate-Limit ist nicht atomar. Bei parallelen Requests kann es unterzaehlen.
2. `workers/storage-idrive.ts`: Upload-Quota und aktive Speicherzaehler sind ebenfalls nicht atomar.
3. `workers/storage-idrive.ts`: Quota wird bei Upload-URL-Erstellung reserviert; wenn ein Upload nie abgeschlossen wird, braucht es Cleanup/Expiry-Strategie fuer reservierte Bytes.
4. `workers/api.ts`: KV als Metadaten-Store mit langen TTLs ist fuer MVP okay, aber kein dauerhaft konsistentes Datenmodell.
5. `wrangler.toml`: `SESSIONS` und `METADATA` teilen sich dieselbe KV-ID. Das erhoeht Risiko von Key-Kollisionen, Fehlern und Datenschutzproblemen.
6. `dist/`, `android/app/src/main/assets/public/`, `ios/App/App/public/`: veraltete Artefakte enthalten Google-Fonts-Preconnects und alten Google-Login-Text.

### Empfohlene Sicherheits-Fixes

- Eigene KV-Namespaces fuer `SESSIONS`, `OAUTH_STATE`, `METADATA`, `TRANSLATIONS`.
- CSRF-Token mit Double-Submit Cookie oder sessiongebundenem Token fuer alle mutierenden Requests.
- Quota- und Rate-Limit-Strategie mit idempotenten Upload-Intents, strengeren Limits, Cleanup-Job und Konfliktvermeidung.
- Bucket-Policy, CORS und Encryption in IDrive e2 als Release-Check dokumentieren und live pruefen.
- Session-Management: Logout-all, Session-List, Admin-MFA/Passkey optional.
- Native und Web-Artefakte frisch aus aktuellem Source bauen und stale Dateien ersetzen.

## 5. Performance-Audit

### Funktioniert vollstaendig

- Frontend nutzt Vite/React und lazy geladene Feature-Komponenten.
- Landing-Auth-Request wird im Source vermieden, solange die Landing-View aktiv ist.
- PWA Service Worker cached App Shell und statische SEO-Dateien.
- API/Storage/Chat liegen am Cloudflare Edge.
- Uploads laufen direkt zu IDrive e2 und belasten Worker-Bandbreite nicht.
- Worker-Bundles sind klein genug fuer MVP:
  - `workers/api.ts`: ca. 33,3 KB
  - `workers/auth-github.ts`: ca. 15,7 KB
  - `workers/storage-idrive.ts`: ca. 29,2 KB
  - `workers/translate.ts`: ca. 23,0 KB
  - `workers/warmup-translations.ts`: ca. 22,2 KB

### Funktioniert teilweise

- Vorhandene gebaute Native-/Dist-Assets sind nicht aktuell. Sie sind technisch klein genug, aber inhaltlich falsch.
- Caching ist vorhanden, aber keine Lighthouse-/Web-Vitals-Abnahme wurde lokal erfolgreich durchgefuehrt.
- Cloudflare KV ist global schnell fuer einfache Reads, aber nicht fuer hohe Schreiblast, Listen/Indizes oder Milliarden-Nutzer-Datenmodelle geeignet.

### Performance-Probleme

- Lokaler direkter Vite-Build haengt in dieser Umgebung nach Start der Production-Build-Phase. Ohne gruenen CI-/Production-Build ist der Web/PWA-Release nicht final freigegeben.
- Stale Native-Builds koennen alte UI und unnoetige externe Requests enthalten.
- Dynamic Profile/Chat/Twin-Daten liegen in KV und werden einfach gelesen/geschrieben. Fuer grosse Nutzermengen fehlt Sharding, Eventing, Backpressure, durable queueing und echte Datenmodellierung.
- Kein gemessener Lighthouse-Wert, keine TTI/LCP/CLS-INP-Messung, keine Mobile-Screenshots.

## 6. SEO / AEO / GEO / KI-Suche

### Funktioniert vollstaendig

- `public/robots.txt` vorhanden.
- `public/sitemap.xml` vorhanden.
- `public/llms.txt` vorhanden.
- Schema.org-Basisdaten in `index.html` vorhanden.
- OpenGraph/Twitter-Metadaten in `index.html` vorhanden.
- Mehrsprachige statische Landingpages vorhanden: `public/de`, `public/en`, `public/tr`, `public/fr`, `public/es`, `public/pt`, `public/ar`, `public/zh`, `public/ja`, `public/ko`.
- Statische Locale-Dateien in `public/locales/*.json` vorhanden.
- Keine Google Search Console als Pflichtdienst.

### Funktioniert teilweise

- Oeffentliche Twin-Profile existieren als API-/SPA-Konzept, aber echte SEO-Crawler brauchen entweder statisch generierte Profilseiten oder Worker-HTML fuer public Slugs.
- `index.html` referenziert `https://smyst.com/og-image.png`, aber `public/og-image.png` fehlt.
- Dynamic Sitemap fuer oeffentliche Twin-Profile ist noch nicht nachweisbar umgesetzt.

### SEO-Probleme

- Fehlendes `public/og-image.png` verursacht kaputte Social Preview.
- App Links / Universal Links fehlen als Web-Dateien:
  - `public/.well-known/assetlinks.json`
  - `public/.well-known/apple-app-site-association`
- Private Profile duerfen nicht indexiert werden. Das ist im Konzept vorhanden, muss aber per Live-Routing und Header/Meta final getestet werden.

## 7. Mobile-Audit

### Funktioniert vollstaendig

- `capacitor.config.ts` definiert App-ID, App-Name, Web-Dir und Scheme.
- Android Manifest ist vorhanden, nutzt `allowBackup=false`, FileProvider, Deep-Link/Intent-Filter und relevante Medien-/Kamera-Permissions.
- iOS `Info.plist` enthaelt URL Scheme und Usage Descriptions fuer Kamera, Mikrofon und Fotos.
- Netzwerk-Security fuer Android ist eingeschraenkt und enthaelt smyst/IDrive-e2 Domains.

### Funktioniert teilweise

- Uploads/Kamera/Dateizugriff sind konzeptionell in Permissions und Frontend-Hooks angelegt.
- PWA-Verhalten ist vorbereitet, aber Native-Shell wurde nicht frisch aus aktuellem Source synchronisiert.

### Funktioniert nicht oder ist offen

- Android Build konnte lokal nicht laufen, da Java Runtime fehlt.
- iOS Build konnte lokal nicht laufen, da vollstaendiges Xcode/CocoaPods Setup fehlt.
- Native-Webassets sind stale:
  - `android/app/src/main/assets/public/index.html`
  - `ios/App/App/public/index.html`
- Universal/App Links koennen nicht voll funktionieren, weil `assetlinks.json` und `apple-app-site-association` fehlen.
- Native Icons/Splashscreen wurden nicht visuell final geprueft.

## 8. KI-Zwilling-Audit

### Funktioniert vollstaendig

- Phase-1-MVP ist bewusst regelbasiert und nutzt keine bezahlten KI-Provider.
- Twin-Metadaten, Sichtbarkeit, Kategorien, Sprachen, Beschreibung und Wissenstexte sind in `workers/api.ts` und `src/lib/useTwinMvp.ts` vorgesehen.
- Medien/Dateien werden als IDrive-e2-Referenzen gedacht, nicht als grosse KV-Daten.
- Public-Snapshots sind entschärft und fuer SEO/API nutzbar.

### Funktioniert teilweise

- Twin-Erstellung und Chat sind MVP-tauglich, aber noch keine echte KI.
- Suche/Auswahl ist UI-seitig vorhanden, aber nicht als global skalierbarer Suchindex.
- Dokumenten-/Medien-Inhalte werden nicht semantisch extrahiert, indexiert oder zusammengefasst.

### Funktioniert nicht oder fehlt

- Keine echte LLM-Inferenz.
- Keine Embeddings, kein Retrieval, keine sichere Dokumentenanalyse.
- Kein produktionsreifer Memory-Import/Export/Loeschprozess ueber alle Objekte.
- Keine Beweisfuehrung, dass private Twin-Daten niemals in oeffentlichen Profilen landen, ausser durch Code-Review der Snapshot-Logik.

## 9. UX/UI-Audit

### Funktioniert vollstaendig

- Startseite ist im Source minimalistisch auf Suche/Auswahl/Chat ausgerichtet.
- Chat startet sofort mit lokaler/simulierter Antwortlogik.
- Mobile-first Klassen und responsive Layouts sind im React-Source sichtbar.
- Upload-, Profil- und Twin-Flows sind als MVP-Oberflaechen vorhanden.

### Funktioniert teilweise

- UI wirkt im Source modern und reduziert, aber es fehlt die visuelle Abnahme per Browser-Screenshot.
- Accessibility-Grundlagen sind teilweise vorhanden, aber kein Axe-/Screenreader-Test wurde ausgefuehrt.
- Native Safe Areas sind konfiguriert, aber nicht auf echten Geraeten getestet.

### UX-Probleme

- Stale gebaute Artefakte zeigen alte Mobile-only-/Google-Texte und entsprechen nicht dem aktuellen Source.
- Einige Flows sind noch Demo-/MVP-Zustaende und nicht vollstaendig mit Live-API verbunden.
- Kein verifizierter Empty/Error/Offline-Zustand fuer jeden kritischen Flow.

## 10. Was funktioniert vollstaendig, teilweise, nicht

### Vollstaendig

- Free-only-Zielarchitektur in aktiver Dokumentation
- Foundation-Validator
- TypeScript-Check
- Worker-Bundling
- Statische Mehrsprachigkeit ohne DeepL/Google Translate
- Security-Header-Basis
- GitHub-OAuth statt Google-OAuth im aktiven Auth-Worker
- IDrive-e2 Signed-URL-Konzept mit Upload-Schutz
- PWA-Dateien syntaktisch
- SEO-Grunddateien

### Teilweise

- Auth Live-Flow
- Upload End-to-End
- Twin-Erstellung/Speicherung
- Public/Private Profile
- Chat-UX und simuliertes Streaming
- Native iOS/Android
- PWA Offline-Experience
- Performance-Messung
- SEO fuer dynamische Profile
- Dokumentation, weil einige Legacy-Referenzen weiter sichtbar sind

### Nicht fertig

- Finaler Production-Build in dieser Umgebung
- Android/iOS Builds
- Live Cloudflare Deploy/Smoke-Test
- Live IDrive-e2 Upload/Download/Delete
- Real AI/LLM-Schicht
- Milliarden-Skalierung
- Vollstaendige Datenschutz-/DSGVO-Funktionen wie Export, Loeschung, Consent, Audit Log, Aufbewahrung
- Echte Suchinfrastruktur fuer globale Twin-Suche

## 11. Priorisierte offene Punkte

### Kritisch

1. Stale Web-/Native-Artefakte ersetzen
   - Dateien: `dist/`, `android/app/src/main/assets/public/`, `ios/App/App/public/`
   - Problem: enthalten alte Mobile-only-UI, Google-Fonts-Preconnects und alten Google-Login-Text.
   - Loesung: frischen `npm ci && npm run build` in GitHub Actions oder funktionierender lokaler Node-Umgebung ausfuehren, danach Capacitor Sync fuer Android/iOS.

2. KV-Namespaces trennen
   - Datei: `wrangler.toml`
   - Problem: `METADATA` und `SESSIONS` nutzen dieselbe KV-ID in `env.storage` und `env.api`.
   - Loesung: separaten `METADATA` Namespace erstellen und IDs ersetzen.

3. Echten Cloudflare/IDrive/GitHub Live-Smoke-Test ausfuehren
   - Dateien: `.github/workflows/deploy.yml`, `wrangler.toml`, `workers/*`
   - Problem: Code ist vorbereitet, aber Production-Flow wurde lokal nicht live verifiziert.
   - Loesung: Preview-Deploy, Login, `/auth/me`, Upload-URL, IDrive PUT, Upload-Complete, GET, DELETE, Twin-Create, Public-Profile testen.

4. Direkten Production-Build stabilisieren
   - Dateien: `vite.config.ts`, `package.json`, `scripts/test-all.sh`
   - Problem: direkter Vite-Build haengt lokal in dieser Umgebung.
   - Loesung: GitHub Actions als Build-Quelle nutzen oder lokale Node/npm-Umgebung reparieren; Release nur mit gruener CI.

### Hoch

5. Fehlendes OG-Bild ergaenzen
   - Datei: `public/og-image.png`
   - Problem: `index.html` referenziert `https://smyst.com/og-image.png`, Datei fehlt.
   - Loesung: 1200x630 PNG erzeugen und committen.

6. App Links / Universal Links fertigstellen
   - Dateien: `public/.well-known/assetlinks.json`, `public/.well-known/apple-app-site-association`
   - Problem: Android `autoVerify` und iOS Universal Links koennen ohne diese Dateien nicht sauber funktionieren.
   - Loesung: mit finalen Package-/Team-/Certificate-Daten erzeugen.

7. CSRF-Token implementieren
   - Dateien: `workers/_shared.ts`, `workers/api.ts`, `workers/auth-github.ts`, `workers/storage-idrive.ts`, `src/lib/*`
   - Problem: aktuell nur Origin/Referer-Pruefung.
   - Loesung: sessiongebundenen CSRF-Token ausgeben und bei mutierenden Requests validieren.

8. KV-Quota/Rate-Limit-Race reduzieren
   - Dateien: `workers/_shared.ts`, `workers/storage-idrive.ts`
   - Problem: Read-then-Put ist nicht atomar.
   - Loesung: idempotente Intents, kurze TTLs, konservative Limits, Cleanup-Worker, Key-Sharding und Live-Load-Test.

9. Vollstaendige Loesch-/Exportlogik
   - Dateien: `workers/api.ts`, `workers/storage-idrive.ts`, `src/lib/useTwinMvp.ts`
   - Problem: Datenschutz braucht belegbare Loeschung/Export ueber KV und IDrive-e2-Objekte.
   - Loesung: API fuer Twin/Delete, Data Export, Upload Cleanup, public snapshot invalidation.

10. Legacy-Ordner noch schaerfer isolieren
    - Dateien/Ordner: `backend/`, `frontend/`, `database/`, `docker/`, `vector/`, `monitoring/`
    - Problem: nicht aktive Production, aber Verwechslungs- und Audit-Risiko.
    - Loesung: nach `legacy/` verschieben oder CI-Regel erzwingen, dass diese Pfade nicht in Production-Deploys einfliessen.

### Mittel

11. Dynamische SEO-Profile serverlesbar machen
    - Dateien: `workers/api.ts`, `src/App.tsx`, `public/sitemap.xml`
    - Problem: Public Profiles sind noch nicht sicher als statische/SSR-aehnliche HTML-Seiten crawlbar.
    - Loesung: Worker-Route `/t/:slug` mit HTML + Schema.org oder statische Snapshot-Generierung.

12. Browser-E2E und visuelle Tests ergaenzen
    - Dateien: `tests/`, `.github/workflows/foundation-ci.yml`
    - Problem: UI/Responsive/A11y nicht automatisch abgenommen.
    - Loesung: Playwright Smoke-Test fuer Landing, Chat, Login-State, Upload-Form, Profile.

13. Lighthouse/Web-Vitals einfuehren
    - Dateien: `.github/workflows/*`, `docs/FREE_ONLY_PERFORMANCE_MOBILE.md`
    - Problem: Performance ist architektonisch optimiert, aber nicht gemessen.
    - Loesung: Lighthouse CI oder freier lokaler Report in GitHub Actions mit Budget.

14. Auth-Haertung
    - Dateien: `workers/auth-github.ts`, `src/lib/useAuth.ts`
    - Problem: keine PKCE, keine Session-Liste, keine Admin-MFA/Passkey-Schicht.
    - Loesung: PKCE ergaenzen, Session-Revocation, optional Passkeys fuer Admins.

15. Translation-Kommentare aktualisieren
    - Dateien: `workers/translate.ts`, `workers/README.md`
    - Problem: Kommentare sprechen noch von Hybrid/Cache-Hit-Zielen, obwohl Free-only statische Uebersetzungen Basis sind.
    - Loesung: Dokumentation an die tatsaechliche statische Phase-1-Funktion angleichen.

### Niedrig

16. Konzept-PDFs/alte Mockups archivieren
    - Dateien: `Smyst_App_Mockup.pdf`, alte HTML-Konzeptdateien
    - Problem: enthalten teils alte externe Referenzen oder unklare Zielaussagen.
    - Loesung: `legacy/concepts/` oder `docs/archive/`.

17. Doppelte/alte Assets bereinigen
    - Dateien: root `logo.svg`, `public/logo.svg`, alte generated assets
    - Problem: potenzielle Verwechslung.
    - Loesung: eine Quelle definieren, Build-Artefakte nicht als Source behandeln.

18. Observability-Free-Grenzen dokumentieren
    - Datei: `wrangler.toml`, `docs/07-deployment-architecture.md`
    - Problem: Cloudflare Observability kann je nach Plan/Funktion Grenzen haben.
    - Loesung: Release-Check: nur kostenlose Cloudflare-Funktionen aktivieren.

## 12. Dateien, die konkret geaendert werden muessen

- `wrangler.toml`: separate KV-ID fuer `METADATA`, optional `nodejs_compat` pruefen, Observability-Free-Check dokumentieren.
- `public/og-image.png`: neu erstellen.
- `public/.well-known/assetlinks.json`: neu erstellen, sobald Android Release-Fingerprint feststeht.
- `public/.well-known/apple-app-site-association`: neu erstellen, sobald Apple Team-ID final feststeht.
- `dist/`: frisch generieren oder nicht als Source-of-Truth behandeln.
- `android/app/src/main/assets/public/`: mit aktuellem Build synchronisieren.
- `ios/App/App/public/`: mit aktuellem Build synchronisieren.
- `workers/_shared.ts`: echten CSRF-Token und robustere Rate-Limit-Strategie ergaenzen.
- `workers/storage-idrive.ts`: Quota-Cleanup, Reservierungs-Expiry, idempotente Upload-Completion schaerfen.
- `workers/api.ts`: Delete/Export/Public-Profile-HTML und vollstaendige Datenschutzpfade ergaenzen.
- `src/lib/useMemoryUpload.ts`: CSRF-Header ergaenzen, sobald serverseitig eingefuehrt.
- `src/lib/useTwinMvp.ts`: Delete/Export/Public-Profile-Flows anbinden.
- `docs/BUILD_TEST_REPORT.md`: nach echter CI-/Live-Abnahme aktualisieren.
- `docs/FINAL_100_PERCENT_CHECK.md`: Prozentwerte nach diesem Audit nachziehen.

## 13. Fehlende Funktionen

- Echte KI-Inferenz und austauschbare AI-Provider-Schicht ohne bezahlte Pflichtdienste.
- Semantische Dokumentenverarbeitung, Retrieval und Quellenanzeige.
- Global skalierbare Twin-Suche.
- Vollstaendige Nutzer-Datenloeschung.
- Vollstaendiger Nutzer-Datenexport.
- Live Admin-/Moderationswerkzeuge.
- Abuse-/Spam-Schutz ueber einfache Rate Limits hinaus.
- Malware-/Content-Sicherheitspruefung fuer Uploads.
- Vollstaendige Public-Profile-HTML-Ausgabe fuer Crawler.
- Native Universal/App Links.
- Release-Blocking E2E-Tests.

## 14. Fazit

Die Richtung stimmt: Die aktive Architektur ist ein ernsthafter Free-only-MVP auf GitHub, Cloudflare und IDrive e2. Sie ist bewusst nicht als echte Milliarden-Nutzer-Plattform zu bewerten. Fuer Milliarden Nutzer pro Tag braucht es langfristig andere Daten-, Compute-, Queue-, Search-, AI- und Observability-Schichten. Innerhalb der aktuellen Regel ist das Projekt aber sinnvoll auf maximale Disziplin, niedrige Kosten, Edge-Auslieferung, Direkt-Uploads und kleine KV-Metadaten ausgerichtet.

Vor einem echten smyst.com-MVP-Release muessen vor allem vier Dinge passieren:

1. Frischen Build erzeugen und stale Web/Native-Artefakte ersetzen.
2. KV-Namespaces sauber trennen.
3. Live Cloudflare/GitHub/IDrive-e2 End-to-End testen.
4. CSRF, Quota-Cleanup, OG-Bild und App-Link-Dateien nachziehen.

Danach kann der MVP realistisch von etwa 78 Prozent auf 88 bis 92 Prozent steigen. 100 Prozent sind erst nach Live-Abnahme, Native Builds, Browser-E2E, Datenschutz-Export/Loeschung und stabilen Release-Gates erreichbar.
