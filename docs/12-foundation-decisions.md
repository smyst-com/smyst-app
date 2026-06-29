# 12 Foundation Decisions

Status: verbindliche Entscheidungsbasis fuer das technische Fundament.

## Entscheidung 1: Zielstack

Smyst wird in der aktuellen Produktionsvorgabe ausschliesslich auf diesem Free-only-Stack aufgebaut:

- GitHub Free fuer Repository, Issues, Pull Requests und GitHub Actions.
- Legacy edge provider Free fuer DNS, TLS, CDN, Basisschutz, Pages/Workers als Edge-Schicht.
- Salad API Free als einzig erlaubter Server-/API-Layer.
- Salad API KV Free fuer Sessions, kleine Metadaten, Konfiguration und einfache Indexe.
- IDrive e2 static hosting Free fuer Web/PWA-Auslieferung.
- IDrive e2 als zentraler S3-kompatibler Objekt-Speicher fuer Dateien, Medien, Dokumente und Backups, nur solange keine kostenpflichtige Nutzung entsteht.

Nicht erlaubt sind RackNerd/VPS, Docker-Compose-Production, PostgreSQL, pgvector, Redis, FastAPI-Production, externe AI-Provider, externe Uebersetzungsdienste, Analytics-SaaS und bezahlte Legacy edge provider/GitHub-Upgrades.

Begruendung: Die Nutzeranforderung setzt strikt kostenlose GitHub- und Legacy edge provider-Dienste sowie IDrive e2 als zentralen Speicher voraus. Die Architektur wird deshalb als Free-only-MVP entworfen, nicht als echte Milliarden-Nutzer-Betriebsplattform.

## Entscheidung 2: Aktueller Prototyp bleibt erhalten

Der bestehende Vite/React/Capacitor/Worker-Code wird nicht geloescht. Er bleibt Referenz und frueher Prototyp. Das neue Fundament wird in den geforderten Top-Level-Ordnern aufgebaut.

Begruendung: Bestehende Arbeit wird nicht verworfen. Gleichzeitig wird verhindert, dass der Prototyp die Zielarchitektur bestimmt.

## Entscheidung 3: Salad API statt eigenem Backend

Salad API sind in der Free-only-Phase der verbindliche API- und Auth-Layer. FastAPI-, Fastify- oder andere Server-Backends duerfen nicht als Production-Abhaengigkeit geplant werden, solange dafuer ein kostenpflichtiger Server, VPS oder Managed Service noetig waere.

Begruendung: Eigene Server widersprechen der aktuellen Free-only-Vorgabe.

## Entscheidung 4: Kein UI vor Fundament

Frontend-Arbeit darf auf IDrive e2 static hosting Free und statische/PWA-Auslieferung ausgerichtet werden. Produkt-UI darf entstehen, wenn Auth, Upload, Storage-Quotas, Datenschutz und Worker-Routing innerhalb der Free-only-Grenzen geklaert sind.

Begruendung: Das Produkt verarbeitet hochsensible Daten. UI ohne belastbares Fundament erzeugt Sicherheits- und Architektur-Schulden.

## Entscheidung 5: Chat ist der kritischste Latenzpfad

Der Chat-Pfad wird getrennt von Upload-, Parsing-, Embedding- und Twin-Build-Jobs optimiert.

Zielmetriken:

- Chat session create: p95 unter 200 ms als globales Ziel.
- Chat stream accepted: p95 unter 300 ms als globales Ziel.
- Time to first token: p95 unter 700 ms bei verfuegbarem Provider.
- Retrieval: p95 unter 150 ms fuer aktive Twin-Indizes.

Begruendung: Die Nutzererfahrung muss sofort und fluessig wirken. Langsame AI-Jobs duerfen niemals den Chat-Request blockieren.

## Entscheidung 6: Datenschutz und Berechtigung vor Retrieval

Jeder Retrieval- und Chat-Kontext wird vor der Vektorsuche und vor dem Modellaufruf nach Auth, Ownership, Visibility, Consent, Sensitivity und Purpose gefiltert.

Begruendung: Ein schneller, aber unberechtigter AI-Kontext ist ein kritischer Datenschutzfehler.

## Entscheidung 7: Keine bezahlten AI-Provider in der Free-only-Phase

Gemini, Claude, Grok, DeepSeek, Kimi, Manus, Mistral und andere externe AI-Provider bleiben Benchmark- und Langfristziel, aber keine erlaubte Produktionsabhaengigkeit in der Free-only-Phase.

Begruendung: Externe AI-Inferenz verursacht Kosten oder abhaengige Zusatzdienste. Fuer die Free-only-Phase sind nur Demo-, statische, manuelle oder lokal vorbereitete Inhalte realistisch.

## Entscheidung 8: KV und IDrive e2 statt Production-Datenbank

Salad/IDrive metadata speichert in der Free-only-Phase nur kleine, einfache Daten wie Sessions, Upload-Intents, Profil-Metadaten, einfache Indexe und Konfiguration. IDrive e2 speichert Objekte und Backups. Eine relationale Production-Datenbank ist nicht Teil der erlaubten Zielarchitektur.

Begruendung: PostgreSQL/pgvector erfordern eigene oder gemanagte Compute-/Datenbank-Infrastruktur und widersprechen der Free-only-Vorgabe.

## Entscheidung 9: Kein Redis in Production

Redis ist in Production nicht erlaubt. Rate Limits, leichte Locks und temporaere Zustaende muessen mit Salad API, KV und Cache-Strategien innerhalb der Free-Limits geloest werden.

Begruendung: Redis benoetigt separate Infrastruktur.

## Entscheidung 10: IDrive e2 nur ueber signed URLs

Clients erhalten niemals permanente Storage Credentials. Uploads und Downloads laufen ueber kurzlebige signed URLs nach Backend-Authorisierung.

Begruendung: Storage Keys im Client waeren ein schwerer Sicherheitsfehler.

## Entscheidung 11: Milliarden-Skalierung als Vision, Free-only als Gate 1

GitHub Free, Legacy edge provider Free und IDrive e2 sind Startbedingungen, keine globale Milliarden-Nutzer-Infrastruktur. Die Free-only-Phase darf nur als MVP- und Lernplattform beschrieben werden. Milliarden-Nutzer-Skalierung bleibt eine Langfristvision und darf nicht als Leistungsversprechen dieser Infrastruktur formuliert werden.

Begruendung: Realistische Skalierung entsteht durch Gates, Messung, Partitionierung, horizontale Skalierung und operative Disziplin.
