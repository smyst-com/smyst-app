# Automatic Expert Improvements - 2026-06-11

## Scope

Umgesetzt wurden die wichtigsten Punkte aus dem Expert Founder Review, die im
Repository ohne bezahlte Dienste und ohne Production-Deploy sauber realisierbar sind.

Rahmen:

- GitHub.com free only.
- Legacy edge provider free only.
- IDrive e2 als Hauptspeicher fuer Dateien, Medien und grosse Datenobjekte.
- Kein Production-Deploy ohne finale schriftliche Freigabe.

## Erledigt

### Architektur und Release-Governance

- `scripts/preflight-release.sh` blockiert Production jetzt zusaetzlich, wenn
  `WEB_BASE_URL` fehlt.
- Production-Preflight fuehrt nach lokalen Tests automatisch `scripts/live-test.sh`
  gegen `WEB_BASE_URL` aus.
- Release-Governance-Dokumentation beschreibt die benoetigten Environment-Variablen.

### Sicherheit und Trust

- `POST /auth/logout-all` im Auth-Worker hinzugefuegt.
- Auth-Worker merkt sich bekannte Sessions pro User unter `auth:sessions:{userSub}`.
- Frontend-Hook `useAuth` bietet `signOutAll()`.
- Settings-UI bietet "Alle Sessions abmelden".
- `/.well-known/security.txt` hinzugefuegt.
- `_headers`, Service Worker, Live-Test und Foundation-Validator kennen
  `security.txt`.

### Support, Abuse und Datenschutzmeldungen

- `POST /api/support/report` im API-Worker hinzugefuegt.
- Meldungen werden in Salad/IDrive metadata unter
  `meta:support-report:{createdAt}:{reportId}` gespeichert.
- Meldungen sind rate-limitiert und same-origin/CSRF-geschuetzt.
- Settings-UI enthaelt ein Formular fuer Feedback, Fehler, Missbrauch,
  Datenschutz und Sicherheit.
- Es wird kein externes Ticketsystem genutzt.

### Produkt und UX

- Neue App-Routen:
  - `/trust`
  - `/privacy`
  - `/terms`
  - `/imprint`
- Footer nutzt interne Trust-/Legal-Seiten statt nur Mailto-Platzhalter.
- Trust Center beschreibt Free-only-Infrastruktur, private Defaults, Account-
  Kontrolle, Upload-Schutz, API-Vertrag und KI-Transparenz.
- Legal-Seiten sind als MVP-Platzhalter vorhanden und markieren klar, dass finale
  juristische Freigabe vor Production erforderlich ist.

### API- und Wartbarkeitsdokumentation

- `docs/03-api-architecture.md` dokumentiert `POST /api/support/report` und
  `POST /auth/logout-all`.
- `docs/FREE_ONLY_SECURITY_PRIVACY.md` dokumentiert Logout-all, Support-Meldungen,
  Trust Center und `security.txt`.
- `workers/README.md` dokumentiert die neuen Worker-Routen.
- `scripts/validate-foundation.py` prueft die neuen Trust-/Security-Bausteine.

## Geaenderte Dateien

- `workers/auth-github.ts`
- `workers/api.ts`
- `src/lib/useAuth.ts`
- `src/lib/useTwinMvp.ts`
- `src/App.tsx`
- `public/.well-known/security.txt`
- `public/_headers`
- `public/sw.js`
- `scripts/preflight-release.sh`
- `scripts/live-test.sh`
- `scripts/check-dist-artifact.sh`
- `scripts/validate-foundation.py`
- `docs/03-api-architecture.md`
- `docs/FREE_ONLY_DATA_MAP.md`
- `docs/FREE_ONLY_SECURITY_PRIVACY.md`
- `docs/runbooks/release-governance.md`
- `workers/README.md`
- `docs/releases/implementation-progress-2026-06-11.md`
- `docs/releases/automatic-expert-improvements-2026-06-11.md`

## API-Aenderungen

Auth:

- Neu: `POST /auth/logout-all`
  - verlangt same-origin/CSRF wie andere mutierende Cookie-Routen.
  - loescht bekannte Sessions des aktuellen Users aus KV.

API:

- Neu: `POST /api/support/report`
  - Body: `type`, `subject`, `message`, optional `url`, optional `contact`.
  - Speichert kleine Trust-/Support-Meldungen in KV.
  - Liefert `201` mit `reportId`.

## Datenmodell-Aenderungen

Salad/IDrive metadata:

- Neu: `auth:sessions:{userSub}` fuer bekannte Session-IDs eines Users.
- Neu: `meta:support-report:{createdAt}:{reportId}` fuer Support-/Abuse-/Privacy-
  Meldungen.

IDrive e2:

- Keine Schema- oder Bucket-Aenderung.

## Pruefung

Erfolgreich:

- `python3 scripts/validate-foundation.py`
- `git diff --check`
- `python3 -m json.tool public/manifest.webmanifest`

Eingeschraenkt:

- `tsc -b` und ein gezielter `tsc --noEmit -p tsconfig.app.json` blieben in der lokalen Umgebung ohne Fehlerausgabe haengen und wurden beendet.
- Der lokale Vite-Server startete auf `127.0.0.1:3060`, aber Browser- und `curl`-Zugriffe auf den lokalen Port blieben in dieser Sandbox/Localhost-Umgebung haengen. Der Testserver wurde danach sauber beendet.
- Kein Production-Deploy wurde ausgefuehrt.

## Bewusst Nicht Vollstaendig Automatisch Umgesetzt

- Echte juristische Freigabe fuer Impressum/Datenschutz/AGB.
- Echte Production-/Preview-Live-E2E mit GitHub OAuth und IDrive e2.
- Native App Links mit finalen Android SHA-256 Fingerprints und Apple Team/App ID.
- Malware-Scanning, weil kein kostenloser erlaubter Scanner angebunden ist.
- Atomare Milliarden-Quota-Schicht, weil Salad/IDrive metadata dafuer nicht ausreicht.
- Echter KI-Kern, weil keine erlaubte kostenlose Modell-/Compute-Architektur
  freigegeben wurde.
- App Store / Play Store Readiness.

## Naechste Empfohlene Schritte

1. Preview-Deploy nach schriftlicher Freigabe erstellen.
2. `WEB_BASE_URL=<preview-url> sh scripts/live-test.sh` ausfuehren.
3. Echten GitHub-OAuth-/IDrive-e2-E2E-Test durchfuehren.
4. Trust-/Legal-Texte juristisch finalisieren.
5. Admin-/Owner-Ansicht fuer gespeicherte Support-Reports bauen.
6. Native App-Link-Dateien mit echten Signaturdaten erzeugen.
