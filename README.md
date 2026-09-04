# smyst.com

smyst.com ist eine guenstige PWA-first Plattform fuer digitale AI Twins.

## Skalierungsziel

Das langfristige Ziel ist ein globales AI-System fuer Web, PWA, iPhone, Android und zukuenftige Plattformen, das Gemini, Claude, Grok, DeepSeek, Kimi, Manus und Mistral in Geschwindigkeit, Stabilitaet, Sicherheit, Intelligenz, Skalierbarkeit, Zuverlaessigkeit, Datenschutz, Verfuegbarkeit und Benutzerfreundlichkeit uebertrifft.

Chats sollen sofort starten, Antworten nahezu verzogerungsfrei erscheinen und jede Interaktion durchgehend fluessig wirken. Die Nutzererfahrung soll nahtlos, natuerlich und hochwertig sein, ohne Wartezeiten, Ausfaelle oder Unterbrechungen. Die langfristige Architektur muss auf Milliarden Nutzer pro Tag und weltweite parallele Nutzung ausgerichtet werden. Die guenstige Startarchitektur ist der erste Schritt, nicht die finale Milliarden-Infrastruktur.

## Architektur (Stand 2026-08-20)

- Spaceship: Domain `smyst.com`, DNS und Subdomains.
- GitHub Free: Quellcode, Versionierung, Releases und GitHub Actions.
- GitHub Pages: liefert Website und PWA aus (`smyst.com`, `app.`, `cdn.`).
- Zeabur: Backend-Container `smyst-backend` unter `api.smyst.com` - API, Auth,
  Chat, TTS/ASR, Admin.
- IDrive e2: Objektspeicher und zugleich Datenhaltung des Backends - Nutzer,
  Chats, Feedback, Profile, Pipeline-Artefakte, Uploads, Backups. Keine
  relationale Datenbank, kein Redis in Produktion.
- OpenRouter: LLM-Provider des Live-Twin-Chats. Groq: Free-Tier, erster
  Provider in Pipeline, QA und Evals.
- PWA: Web-App ueber `smyst.com`, installierbar auf Desktop, Android und iOS.
- iOS/Android/Huawei Apps: Capacitor-Shells, die API und Inhalte von
  `smyst.com` laden.

Nicht mehr im Betrieb: Salad.com (Compute bis Ende Juli 2026), Cloudflare
(frueherer Edge-Provider), IDrive e2 als Website-Host (Public Bucket Access im
Free-Plan gesperrt).

Details: `docs/INFRA_SETUP.md`, `docs/ARCHITECTURE.md`,
`docs/07-deployment-architecture.md`.

## Domainstruktur

- `smyst.com` -> GitHub Pages, Website/PWA.
- `app.smyst.com` -> GitHub Pages.
- `cdn.smyst.com` -> GitHub Pages.
- `api.smyst.com` -> Zeabur, Backend.
- `files.smyst.com`, `media.smyst.com` -> IDrive e2, privat, von der App nicht
  genutzt.

## IDrive e2 99%-Speicherregel

IDrive e2 uebernimmt 99 % aller Speicheraufgaben. Alles, was Datei, Medienobjekt, Archiv, Export, Log oder AI-Datenartefakt ist, gehoert zuerst nach IDrive e2:

- Bilder, Videos, Audio, PDFs und Profilbilder
- Nutzer-Uploads, temporaere Uploads und grosse Mediendateien
- App-/PWA-Dateien, statische Website-Dateien, Downloads und Release-Dateien
- Backups, Exporte, Admin-Exporte, Versionen und verschluesselte Sicherungen
- Logs, Fehlerberichte und Audit-Logs
- KI-Profilwissen, Prompt-Dateien, Chat-Archive und Wissensdaten
- Modell-Dateien, Trainingsdaten, Medien-Archiv, App-Builds, APK/AAB/IPA-Dateien, Update-Pakete, Rollback-Dateien, Thumbnails, Video-Vorschauen, Untertitel, Uebersetzungen, statische JSON-Daten, Profil-Datensaetze, Kategorien, Sitemap/SEO-Dateien, Hilfedateien, rechtliche Dokumente, Testberichte, Screenshots, QA-Videos, Datenbank-Backups, Suchindex-Backups, RAG-Dokumente, Embedding-Dateien, Import-/Export-Pakete, Design-Assets, Feature-Config-Dateien, Wartungsseiten, Offline-Dateien, Cache-Dateien, oeffentliche CDN-Dateien und private signierte Dateien

IDrive e2 ist nicht der richtige Ort fuer Login, aktive Datenbank-Abfragen, Zahlungen, Echtzeit-Chat, Live-Admin-Dashboards, AI-Inferenz, aktive Suche/Indexierung oder serverseitige API-Logik.

GitHub Free bleibt nur fuer Code, Versionierung, Releases und GitHub Actions. Spaceship verwaltet Domain und DNS. Zeabur uebernimmt die Rechenarbeit: API, KI-Aufrufe, Verarbeitung, Suche und Sprachdienste.

## Aenderungsregeln

Neue Deployments, DNS-Aenderungen, Speicherpfade und API-Pfade muessen ueber
Spaceship, GitHub, Zeabur und IDrive e2 geplant werden. Ein neuer Anbieter
braucht eine Freigabe des Inhabers und einen Eintrag in
`docs/FREE_ONLY_INFRASTRUCTURE.md`. Alte Edge-/CDN-Ressourcen gelten als
Abschaltbestand und duerfen nicht als Zielarchitektur erweitert werden.

Arbeitsregeln fuer Code-Aenderungen stehen in `AGENTS.md` (Design-Freeze
Startseite, Funktions-Freeze Sprachsystem, Branch- und PR-Pflicht).

## Modell-Versionen

- **smyst-1.1** (aktiv): Profil-Pipeline (pipeline-scale-2k) und Live-Chat-Container laden `models/smyst-1.0/2026-08-25/smyst-1.1-Q4_K_M.gguf` aus IDrive e2 (Score 575/600, promoted 24.08.2026). Aktiviert am 02.09.2026 via Release-Teile-Transport + Promotion-Workflow `model-promote-gguf.yml` (Qualitaets-Tor inklusive).
- **smyst-1.0** (Rueckfallebene): `models/smyst-1.0/2026-08-20/smyst-1.0-f16.gguf` — greift automatisch, falls 1.1 fehlt.
- Naechste Version (1.2): naechtliches Training auf dem Mac (Autopilot mit Eval-Gate); Aktivierung wie 1.1 ueber den Promotion-Workflow.
