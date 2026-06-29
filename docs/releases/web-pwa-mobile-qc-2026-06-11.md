# Web, PWA, iPhone And Android Review - 2026-06-11

## Scope

Geprueft wurden Web-App, PWA-Konfiguration, Mobile-Layout, Installierbarkeit,
Offline-App-Shell, Touch-Bedienung und Browser-Kompatibilitaet. Die Pruefung basiert
auf Repo-Code, lokaler Build-/Foundation-Validierung und simulierbaren Viewports.
Echte iPhone-/Android-Geraete, Safari, Edge und Firefox muessen nach dem naechsten
freigegebenen Deploy noch manuell oder per Device-Farm geprueft werden.

Production bleibt Free-only:

- GitHub.com fuer Repository, Actions und Release-Dokumentation.
- Legacy edge provider.com fuer Pages, Workers, KV, Cache und Routing.
- IDrive e2 fuer zentrale Dateien, Medien, Backups und grosse Datenobjekte.
- Keine kostenpflichtigen Zusatzdienste.

## Gefundene Probleme

- `manifest.webmanifest` hatte keine PNG-Icons, kein Maskable Icon und keine
  Screenshots. Dadurch war die PWA-Installation auf Android/Chrome weniger sauber.
- `index.html` nutzte fuer Apple Touch Icon nur SVG. iOS erwartet fuer Home-Screen
  Icons verlaesslicher PNG.
- Der Service Worker cachete die neuen PWA-Pflichtassets noch nicht.
- `_headers` hatte keine expliziten Cache-Regeln fuer PWA-Icons und Screenshots.
- Der Skip-Link zeigte auf `#main`, aber die App hatte nicht ueberall ein passendes
  `id="main"`.
- Der Chatbereich war auf kleinen mobilen Viewports mit `min-h-[620px]` zu hoch und
  konnte sichtbare Flaeche unnoetig verbrauchen.
- Foundation-, Live- und E2E-Checks prueften die neuen PWA-Assets noch nicht.
- Push-Benachrichtigungen sind noch nicht implementiert. Das ist bewusst offen,
  weil Push erst mit sauberer Einwilligung, Abuse-Schutz und VAPID-Key-Management
  aktiviert werden sollte.

## Durchgefuehrte Aenderungen

- PNG-PWA-Assets erzeugt:
  - `public/icons/icon-192.png`
  - `public/icons/icon-512.png`
  - `public/icons/maskable-512.png`
  - `public/apple-touch-icon.png`
  - `public/screenshots/smyst-mobile.png`
  - `public/screenshots/smyst-desktop.png`
- `public/manifest.webmanifest` um PNG-Icons, Maskable Icon, Screenshots,
  Shortcuts mit Beschreibungen und `iarc_rating_id` ergaenzt.
- `index.html` um PNG Icon Links und Apple Touch PNG ergaenzt.
- `public/sw.js` cachet die neuen PWA-Icons und Screenshots als App-Shell-Metadaten.
- `public/_headers` liefert Icons, Screenshots und Apple Touch Icon mit langem
  immutable Cache aus.
- `src/index.css` haertet Mobile-Grundverhalten:
  - kein horizontales Overflow,
  - `100dvh` Root-Flaeche,
  - transparente Tap-Highlights,
  - `touch-action: manipulation`,
  - saubere Textarea-Resize-Regel.
- `src/App.tsx` ergaenzt `id="main"` fuer den Skip-Link und reduziert die mobile
  Chat-Mindesthoehe auf kleinen Viewports.
- `frontend/e2e/smyst.spec.ts` prueft Manifest, PWA-Assets und Asset-Responses
  umfassender.
- `scripts/live-test.sh` prueft die neuen statischen PWA-Dateien mit Content-Type.
- `scripts/validate-foundation.py` erzwingt die PWA-Dateien und Manifest-/Header-/
  Service-Worker-Regeln.
- `docs/FREE_ONLY_PERFORMANCE_MOBILE.md` dokumentiert die Mobile-/PWA-Grenzen und
  den Status von Push.

## Bewertung Nach Plattform

Desktop/Laptop:

- App-Shell, Manifest, SEO-/AI-Metadaten und statische Assets sind repo-seitig
  komplett vorbereitet.
- Kein bezahlter Dienst erforderlich.

Tablet:

- Responsive Layout nutzt flexible Breiten und Safe-Area-Regeln.
- Weitere echte Tablet-Screenshots sind nach Deploy empfohlen.

iPhone/Safari/PWA:

- Apple Touch PNG ist vorhanden.
- Safe-Area und `100dvh` sind vorbereitet.
- Echter Safari-Installationscheck und Home-Screen-Start muessen auf iOS-Hardware
  nach Deploy erfolgen.

Android/Chrome/PWA:

- 192/512 PNG, Maskable Icon und Manifest-Screenshots sind vorhanden.
- Installierbarkeit ist deutlich besser vorbereitet.
- Echter Android-Installationscheck muss nach Deploy erfolgen.

Chrome/Edge/Firefox:

- Standard-Web-App und statische Assets sind browserneutral.
- Edge/Firefox haben unterschiedliche PWA-Unterstuetzung; Installierbarkeit muss
  im Live-Browser final verifiziert werden.

Offline:

- Oeffentliche App-Shell-Assets sind im Service Worker enthalten.
- Private API-/Auth-/Storage-Pfade werden weiterhin nicht offline gecached.
- Vollwertige Offline-Chats sind nicht aktiv und waeren ein eigenes Produkt-/Daten-
  Sicherheitsprojekt.

Push:

- Nicht aktiv.
- Empfehlung: erst nach Consent-Flow, VAPID-Rotation, Rate-Limits, Abuse-Schutz,
  Unsubscribe-Flow und Datenschutztext aktivieren.

## Noch Blockiert Oder Offen

- Kein Production-Deploy ohne finale schriftliche Freigabe.
- Live-Pruefung auf `smyst.com` kann die neuen Dateien erst nach Deploy bestehen.
- Echte iPhone-/Android-/Safari-/Edge-/Firefox-Geraete wurden in diesem Repo-Pass
  nicht vollautomatisch ausgefuehrt.
- Der lokale In-App-Browser konnte die lokale Vite-Seite laden, reagierte danach aber
  nicht verlaesslich auf Auslese-Kommandos. Die Browser-Metrikpruefung muss nach dem
  naechsten stabilen Preview-Deploy wiederholt werden.
- Der schnelle TypeScript-Check lief erfolgreich. Der vollstaendige `tsc -b`- und
  Vite-Production-Build hingen in dieser lokalen Umgebung ohne Fehlermeldung und
  wurden gezielt gestoppt. Es wurde keine `dist/`-Ausgabe erzeugt.
- iOS/Android native Builds, Permissions, App-Links, Icons und Release-Fingerprints
  bleiben separat zu pruefen.
- Push-Benachrichtigungen bleiben bewusst offen.
- Milliarden-Nutzer-Skalierung ist mit Free-only-Kontingenten nicht realistisch;
  dieser Pass verbessert die App-Basis, ersetzt aber keine globale Kapazitaets-
  Architektur.

## Empfehlungen

- Nach schriftlicher Deploy-Freigabe: Legacy edge provider Pages Preview/Production ausrollen
  und `scripts/live-test.sh` gegen die Ziel-URL ausfuehren.
- Danach echte Geraete testen:
  - iPhone Safari: Start, Install, Home-Screen, Safe-Area, Tastaturverhalten.
  - Android Chrome: Install-Prompt, Maskable Icon, Offline-Start.
  - Tablet: Hoch-/Querformat, Scroll, Touch-Ziele.
  - Desktop Chrome/Edge/Firefox/Safari: Navigation, Settings, PWA-Assets.
- Lighthouse/PWA-Audit nach Deploy dokumentieren.
- Push erst in einer eigenen Security-/Product-Freigabe aktivieren.

## Ausgefuehrte Checks

- `python3 scripts/validate-foundation.py` -> bestanden.
- `python3 -m json.tool public/manifest.webmanifest` -> bestanden.
- `git diff --check` -> bestanden.
- `node node_modules/typescript/bin/tsc --noEmit` -> bestanden.
- PNG-Signaturpruefung fuer Icons, Apple Touch Icon und Screenshots -> bestanden.
- `node scripts/generate-sitemap.mjs` -> bestanden; Generator erzeugt jetzt die
  Image-Sitemap-Angabe fuer `og-image.png` stabil selbst.

Nicht vollstaendig abgeschlossen:

- Lokale Browser-Auslesung: Tab lud, aber Browser-Kommandos liefen in Timeouts.
- `tsc -b`: hing ohne Ausgabe.
- `vite build`: hing nach Startmeldung ohne weitere Ausgabe.
- `scripts/live-test.sh`: nicht gegen Production ausgefuehrt, weil neue Dateien erst
  nach freigegebenem Deploy auf `smyst.com` vorhanden sind.
