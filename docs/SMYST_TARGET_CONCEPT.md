# Smyst Target Concept

Status: verbindliche Zielarchitektur fuer smyst.com.

## Ziel

smyst.com soll ein eigenes KI-System werden, das auf Web, PWA, iPhone, Android und zukuenftigen Plattformen extrem schnell, stabil, sicher, intelligent, skalierbar und zuverlaessig arbeitet.

Langfristig soll Smyst in Nutzererlebnis, Geschwindigkeit, Qualitaet, Stabilitaet, Datenschutz und Plattformabdeckung mit fuehrenden KI-Systemen konkurrieren und diese uebertreffen. Chats sollen sofort starten, Antworten nahezu verzoegerungsfrei erscheinen und jede Interaktion hochwertig und fluessig wirken.

Die aktuelle Startarchitektur ist keine Milliarden-Nutzer-Infrastruktur. Sie muss aber so sauber gebaut werden, dass sie spaeter ohne Chaos in groessere Infrastruktur wachsen kann.

## Grundprinzip

Smyst wird als speicherstarkes und rechen-effizientes System geplant:

- IDrive e2 uebernimmt 99 % aller Speicheraufgaben.
- GitHub Free wird nur fuer Code, Versionierung, Releases, Issues und Dokumentation genutzt.
- Spaceship wird fuer Domain-Besitz, Registrar-Sicherheit und Nameserver-Verwaltung genutzt.
- Cloudflare DNS ist aktuell aktiv, weil Cloudflare Pages fuer die Apex-Domain `smyst.com` und Worker-Routes Cloudflare-Nameserver benoetigt.
- Salad wird nur fuer echte Rechenarbeit genutzt.

Der wichtigste Architekturgedanke: Speicher zuerst, Server nur bei Bedarf.

## Rollen

### Spaceship

Spaceship uebernimmt dauerhaft:

- Domain `smyst.com`
- Registrar-/Domain-Verwaltung
- Nameserver-Verwaltung
- Domain-Sicherheit
- 2FA-Schutz fuer Domain-Zugriff

Aktueller Produktionsstand: Die Nameserver von `smyst.com` zeigen auf Cloudflare (`anahi.ns.cloudflare.com`, `graham.ns.cloudflare.com`), damit Cloudflare Pages, TLS, Proxy und Worker-Routes fuer die Uebergangsphase korrekt funktionieren.

### GitHub Free

GitHub wird nur genutzt fuer:

- Quellcode
- Versionierung
- Commits
- Releases
- Issues
- Dokumentation
- kostenlose Automatisierung im erlaubten Free-Rahmen

GitHub ist kein Hauptspeicher fuer Medien, Modelle, App-Dateien oder Backups.

### IDrive e2

IDrive e2 ist der zentrale Hauptspeicher. Es speichert insbesondere:

- Bilder, Videos, Audio, PDFs und Profilbilder
- Nutzer-Uploads, Downloads, Exporte und Backups
- App-/PWA-Dateien, statische Website-Dateien und Offline-Dateien
- KI-Profilwissen, Prompt-Dateien, Chat-Archive, RAG-Dokumente und Embeddings
- Modell-Dateien, Trainingsdaten, Versionen, Release-Dateien und Rollback-Dateien
- Logs, Fehlerberichte, Audit-Logs, Testberichte, Screenshots und QA-Videos
- Design-Assets, Feature-Configs, SEO-Dateien, Hilfedateien und rechtliche Dokumente
- oeffentliche CDN-Dateien und private signierte Dateien

IDrive e2 ist Speicher, aber kein vollstaendiger Server-Ersatz. Login, Echtzeit-Chat, Live-Datenbank, Berechtigungslogik, Zahlungen, API-Logik, KI-Antwortgenerierung, Suche und Live-Admin-Dashboards laufen nicht direkt in IDrive e2.

### Salad

Salad wird nur fuer echte Rechenarbeit genutzt:

- API-Server bei Bedarf
- KI-Antwortgenerierung
- Bild-, Video-, Audio- und Stimmverarbeitung
- Suche, Indexierung, Embedding-Erstellung und RAG-Verarbeitung
- Cronjobs, Batch-Jobs, Datenaufbereitung, Importe, Exporte, Qualitaetspruefungen und automatische Tests

Salad speichert keine sensiblen Daten dauerhaft. Ergebnisse werden nach der Verarbeitung wieder in IDrive e2 gespeichert.

## Subdomains

Zielstruktur:

- `smyst.com`: Hauptwebsite, Landingpage und PWA-Einstieg
- `app.smyst.com`: Web-App und Nutzerbereich
- `api.smyst.com`: dynamische API ueber Salad
- `cdn.smyst.com`: oeffentliche Dateien und Downloads aus IDrive e2
- `media.smyst.com`: Videos, Audio, Thumbnails, Vorschauen und Profilbilder
- `backup.smyst.com`: private Backups, verschluesselte Sicherungen und Rollback-Dateien
- `admin.smyst.com`: Adminbereich mit sicherem Login und klaren Zugriffsrechten
- `assets.smyst.com`: PWA-Dateien, statische App-Dateien, Design-Assets und Konfigurationen

## Technische Strategie

1. Zuerst eine starke, installierbare PWA bauen.
2. Danach iOS-, Android- und Huawei-Apps als Wrapper oder native Apps anbinden.
3. Dateien, Medien, Profilwissen, Backups, Archive, Exporte, RAG und App-Dateien nach IDrive e2 legen.
4. Nur echte Logik und Rechenarbeit ueber Salad ausfuehren.
5. Profilwissen, Prompts, RAG-Dokumente, Embeddings, haeufige Antworten und Profil-DNA vorberechnen.
6. Statische Daten aus IDrive e2 ausliefern und Live-Rechenarbeit nur bei Bedarf starten.

## Skalierung in Stufen

- Stufe 1: PWA, oeffentliche Profile, statische Inhalte, IDrive-e2-Speicher.
- Stufe 2: Login, Nutzerprofile, Uploads, private Dateien, signierte URLs.
- Stufe 3: KI-Chat, RAG, Profilwissen, Suchindex, Embeddings.
- Stufe 4: iOS-, Android- und Huawei-App.
- Stufe 5: globale Optimierung, Caching, Warteschlangen, automatische Verarbeitung und Qualitaetspruefung.

## Sicherheit

- IDrive-e2-Buckets standardmaessig privat halten.
- Oeffentliche Dateien nur ueber klare oeffentliche Pfade ausliefern.
- Private Dateien nur ueber signierte URLs abrufen.
- API-Keys niemals im Code speichern.
- Secrets nur in GitHub Secrets oder Server-Umgebung speichern.
- Backups verschluesseln.
- Spaceship, GitHub und Admin-Zugaenge mit 2FA absichern.
- Salad ohne dauerhafte sensible Speicherung betreiben.
- Uploads pruefen, begrenzen und getrennt speichern.
- Audit-Logs und Fehlerberichte sicher archivieren.
- Regelmaessige Rollback-Dateien in IDrive e2 speichern.

## Aktueller Uebergang

Cloudflare ist aktuell aktiver Uebergang fuer DNS, Pages, TLS, Proxy und Workers. Das ist fuer die jetzige Cloudflare-Pages-Apex-Domain und API-Worker-Routes notwendig. Spaceship bleibt Registrar und Domain-Sicherheitsanker. Langfristig kann DNS wieder zu Spaceship wandern, wenn statische Auslieferung, API und Subdomain-Routing ohne Cloudflare Pages/Worker-Abhaengigkeit produktionsreif ueber IDrive e2 und Salad laufen. Neue Architekturentscheidungen duerfen Cloudflare nicht als Hauptspeicher oder dauerhafte Rechenplattform voraussetzen.
