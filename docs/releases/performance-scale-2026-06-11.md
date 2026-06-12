# Performance And Scaling Review - 2026-06-11

## Scope

Geprueft wurden Frontend, PWA/Service Worker, Cloudflare Worker APIs, Cloudflare KV,
IDrive e2 Storage, Suche und KI-Komponenten. Diese Analyse ist eine Architektur- und
Codepfad-Simulation; es wurde keine echte Last mit Millionen oder Milliarden Nutzern
gegen Live-Systeme erzeugt. Production bleibt Free-only auf GitHub.com,
Cloudflare.com und IDrivee2.com.

## Aktueller Performance-Stand

Frontend:

- Vite/React App mit lazy geladenem Cookie-Banner, Mobile Navigation und GitHub Login.
- Statische Assets werden ueber Cloudflare Pages/CDN ausgeliefert.
- Service Worker cached App-Shell, Locale-Dateien und oeffentliche Standarddateien.
- Private Pfade `/api/`, `/auth/`, `/storage/`, `/private/` werden nicht offline gecached.

APIs:

- Cloudflare Workers fuer Auth, API/Chat/Twins, Storage und Translation.
- Private JSON-Antworten sind `no-store`.
- Public Twin API ist kurzzeitig edge-cachebar.
- Rate-Limits sind KV-basiert und liefern HTTP-Rate-Limit-Header.

Daten:

- Cloudflare KV fuer kleine Metadaten, Sessions, Rollen, Quotas, Upload-Intents,
  Chats und Twin-Metadaten.
- IDrive e2 fuer grosse Dateien, Medien, Backups und Twin-Datenobjekte.
- Kein aktiver SQL-/GraphQL-/Search-/KI-Backenddienst in Production.

## Automatisch Umgesetzte Optimierungen

- `workers/storage-idrive.ts` nutzt jetzt `meta:upload-by-key:{userSub}:{sha256(key)}`
  als direkten KV-Index fuer Dateiabrufe und Deletes.
- `workers/storage-idrive.ts` vermeidet dadurch Listen-Scans beim
  `GET /storage/file/{key}` Hot Path.
- `workers/api.ts` begrenzt Chat-/Twin-Index-Reads explizit auf kleine Fenster.
- `docs/FREE_ONLY_PERFORMANCE_MOBILE.md`,
  `docs/FREE_ONLY_DATA_MAP.md` und `scripts/validate-foundation.py` dokumentieren
  und pruefen die neuen Performance-Grenzen.

## Skalierungs-Simulation

| Nutzerstufe | Erwartung im Free-only-MVP | Hauptengpass | Bewertung |
|---|---|---|---|
| 1.000 Nutzer | Realistisch fuer MVP, wenn Quotas niedrig bleiben | OAuth/Login, erste Uploads, KV-Latenz | Gruen |
| 10.000 Nutzer | Moeglich mit disziplinierter Nutzung und kleinen Dateien | KV-Reads/Writes, Upload-Quotas | Gelb |
| 100.000 Nutzer | Nur mit sehr begrenzter Aktivitaet pro User | KV-Schreiblast, Rate-Limits, IDrive-e2-Budget | Orange |
| 1 Million Nutzer | Free-only nicht verlaesslich planbar | KV-Kontingente, Abuse-Schutz, Observability | Rot |
| 10 Millionen Nutzer | Nicht realistisch auf reinen Free-Kontingenten | Datenhaltung, globale Quotas, Bot-Schutz | Rot |
| 100 Millionen Nutzer | Nicht realistisch ohne neue Architektur | Multi-Region, Queues, atomare Counter, AI/Compute | Rot |
| 1 Milliarde Nutzer | Vision, nicht aktuelle Plattformfaehigkeit | Alles: Compute, Storage, Network, Security, Support | Rot |

## Engpaesse

Frontend:

- Ein grosser Single-Page-App-Hauptbundle kann bei schwachen Mobilgeraeten zum
  Start-Engpass werden, auch wenn Vite chunked.
- Viele visuelle States in `src/App.tsx` bleiben in einer grossen Datei gebuendelt.

APIs:

- Cloudflare KV ist eventual consistent und nicht fuer atomare Milliarden-Schreiblast
  gebaut.
- Rate-Limits und Quotas sind KV-basiert und damit fuer extreme Parallelitaet nur
  MVP-tauglich.
- Chat-/Twin-MVP ist regelbasiert; echte KI-Inferenz existiert nicht.

Storage:

- Direct-to-IDrive-e2 reduziert Worker-Bandbreite, aber IDrive-e2-Quotas/Kosten
  bleiben harter Grenzfaktor.
- Kein Multipart/Chunk Upload fuer grosse Videos.
- Kein asynchrones Processing fuer Thumbnails, Transcoding oder Malware-Scanning.

Suche:

- Keine Production-Suchmaschine.
- Aktuelle Suche ist UI-/KV-/MVP-orientiert, nicht global indexiert.

KI:

- Keine externe LLM-API und kein eigener Inferenz-Cluster.
- Milliarden-Nutzer-KI-Erlebnis ist damit aktuell nicht vorhanden, sondern nur
  langfristige Zielrichtung.

## Empfehlungen Fuer Naechste Stufen

Kurzfristig, innerhalb Free-only:

- Authenticated E2E gegen GitHub + IDrive e2 live ausfuehren.
- Bundle-Groessen messen, nach Route/View splitten und grosse UI-Bereiche weiter lazy
  laden.
- Weitere direkte KV-Indexe nur dort einfuehren, wo Hot Paths entstehen.
- Cloudflare Pages Production Deploy strikt manuell freigeben.

Mittelfristig:

- Eine atomare Konsistenzschicht fuer Quotas/Rate-Limits planen.
- Hintergrundjobs fuer Medienverarbeitung und Cleanup definieren.
- Public Profile und Suchindex getrennt von privaten User-Daten halten.
- Observability, Audit-Events und Abuse-Runbooks einfuehren, ohne private Daten zu
  leaken.

Langfristig fuer Milliarden Nutzer:

- Free-only-Kontingente reichen nicht. Es braucht eine freigegebene Architektur fuer
  globale Datenhaltung, Queueing, Anti-Abuse, AI-Inferenz, Storage Lifecycle,
  Multi-Region-Failover, Monitoring und Incident Response.
- Das Ziel ist technisch erreichbar nur mit einer anderen Kapazitaets- und
  Kostenplanung. Die aktuelle Arbeit bereitet saubere Schnittstellen vor, ersetzt
  aber keine Milliarden-Plattform.
