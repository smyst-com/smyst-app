# Smyst A-bis-Z-Masterplan

Status: Architektur- und Fundamentplanung vor Feature-Entwicklung.

## 1. Ausgangsanalyse

Das Repository enthält aktuell eine Vite/React-Anwendung mit Capacitor-Shells für iOS/Android, Cloudflare Worker für Auth, Storage und Übersetzung sowie bestehende Setup- und Architekturhinweise. Das ist eine brauchbare frühe Produktbasis, entspricht aber nicht vollständig der neuen Zielarchitektur.

Neue Zielvorgabe:

- Frontend: Web/PWA auf Cloudflare Pages Free, bestehende Capacitor-Shells fuer mobile Tests.
- Backend/API: Cloudflare Workers Free als einziger erlaubter Server-Layer.
- Daten: Cloudflare Workers KV Free fuer kleine Sessions, Metadaten und einfache Indexe.
- Storage: IDrive e2 als zentraler S3-kompatibler Objekt-Speicher, nur solange keine kostenpflichtige Nutzung entsteht.
- Betrieb: GitHub Free fuer Repository/CI/CD, Cloudflare Free fuer DNS/CDN/TLS/Pages/Workers/KV.
- KI: In der Free-only-Phase nur Demo-, statische, manuell vorbereitete oder lokal erzeugte Inhalte. Keine kostenpflichtigen AI-Provider.

Wichtige technische Realität: GitHub Free, Cloudflare Free und IDrive e2 innerhalb kostenloser Nutzung können keine Milliarden gleichzeitigen Nutzer bedienen. Diese Vorgaben eignen sich als disziplinierte Free-only-MVP-Plattform. Das Milliarden-Ziel bleibt eine Langfristvision, aber kein Leistungsversprechen der aktuellen Infrastruktur.

## 2. Fehlende Komponenten

Aktuell fehlen oder sind noch nicht professionell definiert:

- Zielkonforme Monorepo-Struktur mit `/frontend`, `/backend`, `/database`, `/ai`, `/chat`, `/twins`, `/uploads`, `/storage`, `/auth`, `/admin`, `/search`, `/monitoring`, `/security`, `/docs`, `/tests`, `/scripts`, `/docker`, `/config`.
- Cloudflare-Worker-Servicearchitektur mit klaren Modulgrenzen.
- KV-Datenmodell fuer Sessions, kleine Metadaten, Upload-Intents und einfache Indexe.
- IDrive-e2-Keystrategie fuer Dateien, Medien, Dokumente, Backups und Statusobjekte.
- Free-Limit-Strategie fuer Workers Requests, KV-Lese-/Schreiblast, Pages-Deployments und IDrive-e2-Speicher.
- Security-Architektur fuer Auth, RBAC/ABAC, Secrets, Verschluesselung, Audit, Datenschutz, Consent und Abuse Prevention.
- KI-Architektur fuer Twin Builder, RAG, Memory Layer, LLM Router, Moderation, Guardrails und Evaluierungen.
- Storage-Architektur fuer signed URLs, private Buckets, Lifecycle, Checksums, Malware-Scans, Backups und Disaster Recovery.
- API-Kontrakte fuer Auth, Profile, Twins, Uploads, Chat, Search, Admin und Health.
- Deployment-Architektur fuer Cloudflare Pages/Workers, Releases, Rollbacks, Quotas und GitHub Actions.
- Monitoring mit den kostenlosen Cloudflare/GitHub-Mitteln, Health Checks und harter Kostenbremse.
- Coding Standards fuer Backend, Frontend, Datenbank, AI, Tests und Security.

## 3. North Star: globale AI-Plattform

Smyst wird nicht als einfache Chat-App geplant. Das Zielsystem soll langfristig auf Milliarden Nutzer pro Tag, globale gleichzeitige Nutzung und ein Qualitaetsniveau oberhalb fuehrender AI-Produkte ausgelegt sein. Gemini, Claude, Grok, DeepSeek, Kimi, Manus und Mistral sind technische Vergleichsmarken fuer Geschwindigkeit, Stabilitaet, Modellqualitaet, Sicherheit, Nutzererlebnis und Plattformbreite.

Dieser Anspruch bedeutet fuer die Architektur:

- Chats muessen sofort startbar sein. Auth, Session-Erzeugung, Twin-Kontext und erste Streaming-Antwort duerfen nicht durch langsame AI-Jobs blockieren.
- Antworten muessen nahezu verzögerungsfrei wirken. Retrieval, Modellrouting, Moderation und Streaming werden als Latenzpfad optimiert.
- Jede Interaktion muss fluessig bleiben. Uploads, Parsing, Embeddings, Twin-Aufbau, Moderation und Indexierung laufen asynchron.
- Das System muss Ausfaelle einzelner Provider, Modelle, Worker und Hosts tolerieren.
- Datenschutz, Consent, Zugriffskontrolle und Audit duerfen nie gegen Performance ausgespielt werden.
- Web, PWA, iPhone, Android und zukuenftige Plattformen muessen denselben API- und Identitaetskern nutzen.
- Jede Architekturentscheidung muss spaeter horizontal skalierbar, beobachtbar und austauschbar sein.

Die Startplattform mit GitHub Free, Cloudflare Free, Cloudflare Pages/Workers/KV und IDrive e2 ist deshalb bewusst als Free-only-Stufe definiert. Sie muss professionell gebaut werden, aber darf nicht als echte globale Hochlast-Infrastruktur beschrieben werden.

## 4. Architekturprinzipien

- API-First: Jede Funktion startet mit sauberem API- und Datenmodell.
- Security-First: Private Daten sind Standard. Zugriff wird explizit gewaehrt.
- AI-First: KI-Komponenten sind Kernsysteme, keine spaeten Add-ons.
- Event-Driven im Free-only-Rahmen: Uploads und Statuswechsel laufen asynchron, teure Parsing-/Embedding-Pipelines sind nicht Teil der erlaubten Production.
- Modular: Auth, Upload, Chat, Search, AI, Admin und Storage bleiben getrennte Domänen.
- Observable: Jede kritische Worker- und Storage-Aktion ist mit kostenlosen Mitteln nachvollziehbar.
- Cost-Aware: Speicher, Requests und KV-Operationen werden begrenzt; Uploads stoppen vor bezahlter Nutzung.
- Portable: Keine harte Kopplung an kostenpflichtige Zusatzdienste in der Free-only-Phase.
- Mobile-First: Frontend kommt spaeter, wird aber von Anfang an durch API-Latenz, Streaming und Offline-Faehigkeit vorbereitet.
- Latency-First im Chat: Time-to-first-byte, Time-to-first-token und Retrieval-Latenz sind Kernmetriken.
- Resilience-First: Jeder externe Provider braucht Timeout, Retry, Circuit Breaker, Fallback und Kostenlimit.

## 5. Bau-Reihenfolge

### Gate 0: Architekturgrundlage

Erstellen und pflegen:

1. `01-system-architecture.md`
2. `02-database-architecture.md`
3. `03-api-architecture.md`
4. `04-security-architecture.md`
5. `05-ai-architecture.md`
6. `06-storage-architecture.md`
7. `07-deployment-architecture.md`
8. `08-monitoring-architecture.md`
9. `09-folder-structure.md`
10. `10-coding-standards.md`

Kein Feature-Code vor Abschluss dieses Gates.

### Gate 1: Daten- und Infrastruktur-Fundament

- KV-Datenmodell entwerfen.
- IDrive-e2-Objektschluessel, Quotas und Statusobjekte definieren.
- Worker-basierte Rate Limits und einfache Locks planen.
- Rollen- und Berechtigungsmodell definieren.
- Cloudflare-Pages/Workers-Deployments planen.
- Health Checks und Rollback-Strategie definieren.

### Gate 2: Backend-Fundament

- Cloudflare-Worker-App-Struktur.
- Auth-Grundlage.
- API-Versionierung.
- OpenAPI-Schema.
- KV- und IDrive-e2-Zugriff.
- Background Jobs.
- Logging, Audit und Request IDs.

### Gate 3: AI-Fundament

- Upload Pipeline mit signed URLs.
- Demo-/statischer Twin Builder.
- Einfache Memory-Metadaten.
- Keine bezahlte Parsing-, Embedding-, RAG- oder LLM-Pipeline in Production.

### Gate 4: Produkt-Kern

- Auth.
- Profile.
- Twin Creator.
- Chat.
- Suche.
- Admin.

### Gate 5: Frontend und Experience

- Landing Page.
- Design System.
- PWA.
- Mobile Optimierung.
- Spaeter native iPhone/Android Apps oder Weiterentwicklung der bestehenden Capacitor-Shell.

## 6. Skalierungszielbild

Startarchitektur:

- Cloudflare Free fuer DNS, TLS, CDN, einfache WAF-Regeln.
- Cloudflare Pages Free fuer Web/PWA.
- Cloudflare Workers Free fuer API/Auth/Upload-Signing.
- Cloudflare Workers KV Free fuer Sessions und kleine Metadaten.
- IDrive e2 fuer Objekt-Speicher.
- GitHub Actions fuer CI/CD.

Wachstumsarchitektur:

- Mehrsprachige statische Inhalte.
- Bessere Worker-Kapselung.
- Harter Quota-Schutz und automatische Degradation.
- Weitere Skalierung erfordert eine neue Entscheidung, weil kostenpflichtige Dienste aktuell nicht erlaubt sind.

Globalarchitektur:

- Multi-Region API.
- Globales Edge-Routing.
- Regionale Datenschutz-Zonen.
- Datenpartitionierung nach Nutzerregion.
- Active/passive oder active/active Datenbank-Strategien.
- AI-Modellrouting nach Latenz, Kosten, Qualitaet, Sicherheit und Verfuegbarkeit.
- Edge-nahe Session- und Config-Caches.
- Regionale Vector/Retrieval-Kapazitaeten.
- Dedizierte Inferenz-Router mit Provider-Failover.
- SLO-gesteuerte automatische Degradation statt Komplettausfall.

## 7. Ziel-SLOs fuer das globale System

MVP-Werte duerfen niedriger liegen, aber das Design muss diese Zielwerte vorbereiten:

- Chat session create: p95 unter 200 ms.
- Chat stream accepted: p95 unter 300 ms.
- Time to first token: p95 unter 700 ms mit verfuegbarem Provider.
- Retrieval: p95 unter 150 ms fuer aktive Twin-Indizes.
- API availability: 99.99 Prozent als spaeteres Plattformziel.
- Kritische Datenpfade: keine unautorisierte Antwort auch bei Cache- oder Providerfehlern.
- Provider-Failover: automatische Umschaltung bei Timeouts oder Qualitaetsproblemen.
- Mobile UX: keine blockierenden Vollbild-Wartezustaende fuer Standardaktionen.

## 8. Master-Risiken

- Datenschutz: Hochsensible personenbezogene Daten, Stimme, Bilder, Videos und persoenliche Erinnerungen.
- Consent: Digitale Zwillinge duerfen nicht ohne klare Einwilligung, Rechte und Widerrufsmechanik betrieben werden.
- Halluzination: Antworten eines Twins muessen Quellen, Confidence und Grenzen respektieren.
- Latenz: Chat muss streamingfaehig sein; langsame AI-Jobs duerfen nie den Request-Pfad blockieren.
- Kosten: Modell-, Embedding-, Transkriptions- und Storage-Kosten koennen stark wachsen.
- Abuse: Impersonation, Deepfake-Missbrauch, Scraping und Prompt Injection muessen frueh eingeplant werden.
- Free-Tier-Grenzen: Cloudflare Free, GitHub Free und IDrive e2 innerhalb kostenloser Nutzung sind Startwerkzeuge, keine Milliarden-Nutzer-Infrastruktur.
- Architekturillusion: Milliarden-Skalierung entsteht nicht durch grosse Ziele, sondern durch messbare Gates, horizontale Skalierung, Datenpartitionierung, Provider-Redundanz und operative Exzellenz.

## 9. Naechste konkrete Schritte

1. Diese Architektur-Dokumente reviewen.
2. Zielstack bestaetigen: Free-only mit GitHub Free, Cloudflare Free und IDrive e2.
3. Danach KV-/Storage-/Quota-Modell und Cloudflare-Worker-Struktur als erstes technisches Fundament umsetzen.
4. Erst nach stabilen Health Checks, Quota-Schutz, Logging und Security-Baseline mit Produktfeatures beginnen.
