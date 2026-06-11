# Smyst Active Architecture

Status: verbindliche Free-Only-Architektur fuer Phase 1.

## Grundregel

Production verwendet ausschliesslich:

- GitHub.com Free fuer Code, Issues, Pull Requests, Dokumentation und GitHub Actions.
- Cloudflare.com Free fuer DNS, TLS, CDN, Pages, Workers, KV, Security Headers, Caching und Edge-Auslieferung.
- IDrive e2 als zentralen S3-kompatiblen Speicher fuer Dateien, Medien, Dokumente, Uploads, Backups und Twin-Daten, nur mit harten Quotas und Kostenbremse.

Alle anderen Server-, Datenbank-, Cache-, Uebersetzungs-, Analytics-, AI- oder Monitoring-Dienste sind keine Production-Abhaengigkeit.

## Phase 1

Phase 1 ist ein Free-Only-MVP. Ziel ist eine saubere, sichere, schnelle und erweiterbare Plattformbasis, nicht ein echtes Milliarden-Nutzer-Betriebssystem.

Die Milliarden-Nutzer-Skalierung bleibt die Langfristvision. Sie darf in dieser Phase nicht als Leistungsversprechen der kostenlosen Infrastruktur beschrieben werden.

## Zielbild

```text
Web / PWA / Capacitor iOS / Capacitor Android
        |
        | HTTPS
        v
Cloudflare Pages Free
        |
        +--> statisches Vite/React-Frontend
        +--> Manifest, Service Worker, SEO-Dateien
        |
        v
Cloudflare Workers Free
        |
        +--> Auth und Sessions
        +--> API fuer Profile, Twins, Chat und Suche
        +--> Upload-Signing und Storage-Gates
        +--> Translation aus statischen Repository-Dateien
        +--> Security Headers, CORS, Rate Limits
        |
        +--> Cloudflare KV Free
        |    Sessions, OAuth-State, Quotas, kleine Metadaten, Upload-Status
        |
        +--> IDrive e2
             Dateien, Bilder, Videos, Audio, Dokumente, Backups, Twin-Daten
```

## Datenablage

- GitHub: Quellcode, Dokumentation, statische Uebersetzungsdateien, CI/CD-Konfiguration.
- Cloudflare Pages: gebautes Frontend, PWA-Artefakte, statische SEO/AEO/GEO-Dateien.
- Cloudflare Workers: API-, Auth-, Upload-, Chat- und Storage-Logik.
- Cloudflare KV: kleine, kurzlebige oder einfache Daten wie Sessions, Quotas, Upload-Intents, Upload-Status, Rollen und oeffentliche Index-Snapshots.
- IDrive e2: alle grossen, nutzerbezogenen und dauerhaften Objekte.

Details stehen in `docs/FREE_ONLY_DATA_MAP.md`.

## Upload Flow

```text
Client
  -> fragt Cloudflare Worker nach Upload-Intent
Worker
  -> prueft Session, Rolle, Sichtbarkeit, Dateityp, Dateigroesse und Quota
  -> erstellt kurzlebige IDrive-e2-Signatur
Client
  -> laedt direkt zu IDrive e2 hoch
Worker
  -> bestaetigt Upload per HEAD/Metadatenpruefung
  -> speichert Status und sichere Metadaten in KV
```

Clients erhalten niemals permanente Storage Keys.

## Auth

Erlaubte Free-Only-Optionen:

- GitHub OAuth mit HttpOnly Secure SameSite Session-Cookies.
- Passkey/WebAuthn ueber Cloudflare Workers und KV.
- Sicheres Demo-Login nur fuer MVP/Preview, klar als Demo markiert.

Google-basierte Auth ist keine Production-Pflicht und darf nicht als notwendige Login-Bedingung dokumentiert werden.

## AI Twin MVP

Der erste KI-Zwilling ist ein regelbasierter oder simulierter MVP:

- Profil, Name, Beschreibung und Sichtbarkeit.
- Wissenstexte und hochgeladene Inhalte.
- Einfacher Twin-Kontext aus KV-Metadaten und IDrive-e2-Objekten.
- Chat-Antworten ohne kostenpflichtige externe AI-Inferenz.

Spaetere echte AI-Modelle muessen ueber austauschbare Adapter angebunden werden und brauchen eine neue Architektur- und Kostenfreigabe.

## Performance

Phase 1 optimiert auf:

- statisches Frontend ueber Cloudflare Pages,
- kleine JS-Bundles,
- lazy geladene UI,
- lokale/statische Uebersetzungen,
- Service Worker fuer App-Shell und Offline-Fallback,
- Worker-Antworten mit klaren Timeouts,
- harte Upload- und Storage-Limits.

## Sicherheit

Pflicht fuer alle Production-Pfade:

- sichere Headers und CSP,
- strenge CORS-Regeln,
- CSRF-Schutz fuer Cookie-basierte Mutationen,
- Input-Validation,
- Rate Limits,
- Upload-Dateityp- und Groessenpruefung,
- private Sichtbarkeit als Standard,
- keine sensiblen Felder in oeffentlichen KV-Snapshots,
- keine Secrets im Repository.

## SEO, AEO, GEO und KI-Suche

Erlaubte Grundlagen:

- `robots.txt`
- `sitemap.xml`
- `llms.txt`
- OpenGraph und Twitter Cards
- Schema.org/JSON-LD
- statische mehrsprachige Landingpages
- SEO-freundliche oeffentliche Twin-URLs

Private Profile und private Uploads duerfen nicht indexierbar sein.

## Skalierungsrealitaet

Die Architektur haelt Modulgrenzen sauber, damit spaeter horizontal erweitert werden kann. Kostenlos nutzbare Kontingente koennen aber keine Milliarden Nutzer pro Tag garantieren.

Langfristige globale Skalierung erfordert eigene Entscheidungen zu Datenbanken, AI-Inferenz, Realtime, Observability, Multi-Region-Betrieb, Kostenkontrolle und Compliance. Diese Entscheidungen sind nicht Teil der Free-Only-MVP-Freigabe.
