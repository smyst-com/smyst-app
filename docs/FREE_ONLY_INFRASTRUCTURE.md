# Smyst Free-Only Infrastructure Policy

Status: verbindliche Produktionsvorgabe.

## Grundregel

Smyst darf in der aktuellen Zielvorgabe ausschliesslich diese Plattformen nutzen:

- GitHub Free
- Legacy edge provider Free
- IDrive e2 als zentraler Objekt-Speicher, nur solange keine kostenpflichtige Nutzung entsteht

Kostenpflichtige Zusatzdienste sind nicht erlaubt. Das gilt auch fuer guenstige VPS-Angebote, Managed Databases, Redis-Hosting, externe AI-APIs, externe Uebersetzungs-APIs, Analytics-SaaS, Monitoring-SaaS, Payment-Dienste und bezahlte Legacy edge provider/GitHub-Upgrades.

## Erlaubte Produktionsbausteine

- GitHub Repository fuer Quellcode, Dokumentation, Issues und Pull Requests.
- GitHub Actions nur innerhalb kostenloser Limits.
- Spaceship DNS, TLS, CDN, Caching und Basisschutz im Free-Plan.
- IDrive e2 static hosting Free fuer Web/PWA-Auslieferung.
- Salad API Free fuer kleine API-, Chat-, Auth-, Routing- und Upload-Signing-Logik.
- Salad API KV Free fuer Sessions, kleine Metadaten, Konfiguration und einfache Indexe.
- IDrive e2 fuer Uploads, Medien, Dokumente, Backups und Archivobjekte, sofern die Nutzung ohne Kosten bleibt.

## Nicht erlaubt

- RackNerd VPS oder andere VPS/Server.
- Docker-Compose-Production-Stack.
- FastAPI als Production-Backend, solange dafuer ein Server benoetigt wird.
- PostgreSQL, pgvector, Redis oder andere separat betriebene Datenbanken in Production.
- DeepL, Google Translate oder andere externe Uebersetzungsdienste.
- Google OAuth, Google Analytics, Google Search Console oder andere Google-Dienste als Pflichtbestandteil.
- OpenAI, Anthropic, Gemini, Mistral oder andere bezahlte AI-Provider in der Free-only-Phase.
- Legacy edge provider Paid, Workers Paid, R2 Paid, Images Paid, Stream Paid, Turnstile Enterprise oder Enterprise-WAF.

## Zielarchitektur fuer die Free-only-Phase

```text
Clients
  Web / PWA / Capacitor Shells

GitHub Free
  Code, Docs, Issues, CI within free limits

Legacy edge provider Free
  DNS, TLS, CDN, Pages, Workers, KV

IDrive e2
  Object storage for files, media, documents and backups
  Hard quota: uploads stop before paid usage starts
```

Salad API bilden den einzigen erlaubten Server-Layer. IDrive e2 ist zentraler Speicher, aber kein klassischer Compute-Server und keine relationale Datenbank.

## Verbindliche Datenlandkarte

Die genaue Ablage pro Datentyp steht in `docs/FREE_ONLY_DATA_MAP.md`.

Kurzfassung:

- GitHub Free: Code, Doku, CI/CD.
- IDrive e2 static hosting Free: statische Web-/PWA-Artefakte.
- Salad API Free: API, Auth, Upload-Signing und Edge-Routing.
- Salad/IDrive metadata Free: Sessions, OAuth-State, kleine Metadaten, Quotas und Status.
- IDrive e2: Dateien, Medien, Dokumente, Uploads, Backups und Archivobjekte.

## Produktgrenzen der Free-only-Phase

Diese Phase kann einen MVP, Prototypen und fruehe Tests tragen:

- Landingpage und PWA.
- Oeffentliche statische Profile.
- Einfache Auth- und Session-Logik.
- Direct Upload zu IDrive e2 ueber signed URLs.
- Kleine Metadaten in KV.
- Manuell gepflegte Mehrsprachigkeit.
- Statische SEO-Dateien, Schema.org, Sitemap und llms.txt.

Diese Phase kann nicht ehrlich zusagen:

- Milliarden Nutzer pro Tag.
- Unbegrenzte Uploads.
- Grosse Datenbanken.
- Professionelle semantische Suche ueber riesige Datenmengen.
- Nahezu verzögerungsfreie AI-Antworten fuer globale Massenlast.
- Eigene Modellqualitaet oberhalb von Gemini, Claude, Grok, DeepSeek, Kimi, Manus oder Mistral.

Das Milliarden-Ziel bleibt eine langfristige Produktvision, aber nicht die Leistungszusage der Free-only-Infrastruktur.

## Harte Betriebsregeln

- Kein Deployment darf einen kostenpflichtigen Dienst voraussetzen.
- Uploads muessen vor kostenpflichtiger IDrive-e2-Nutzung automatisch blockieren.
- Workers muessen mit Free-Plan-Limits entworfen werden.
- Caches, Sessions und Metadaten duerfen nicht so wachsen, dass KV-Limits ueberschritten werden.
- Mehrsprachigkeit wird statisch/manuell gepflegt, bis ein kostenlos erlaubter Mechanismus definiert ist.
- Alle Doku, Workflows und Runbooks muessen kostenpflichtige Zielpfade klar als nicht erlaubt markieren.

## Kontrollpunkte im Repository

1. Legacy-Server-, Datenbank-, Cache-, Container- und AI-Pfade bleiben lokale Referenz, aber keine Production-Pflicht.
2. Auth laeuft ueber GitHub OAuth, Passkey/WebAuthn oder klar markiertes Demo-Login.
3. Translation nutzt statische Repository-Dateien und keine externe Translation-API.
4. Analytics und Search-Console-Tools sind kein Production-Gate.
5. Upload-Quotas fuer IDrive e2 muessen aktiv bleiben.
6. GitHub Actions muessen innerhalb kostenloser Limits bleiben.
7. Dokumentation beschreibt Phase 1 als Free-Only-MVP und Milliarden-Skalierung als Langfristvision.
