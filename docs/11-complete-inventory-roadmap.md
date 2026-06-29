# 11 Complete Inventory And Roadmap

Status: Free-Only-Konsolidierung.

## Aktiver Production-Pfad

- Vite/React/TypeScript Root-App.
- Capacitor fuer mobile Shells.
- IDrive e2 static hosting fuer Web/PWA.
- Salad API fuer Auth, Storage, Translation und Edge-Routing.
- Salad/IDrive metadata fuer Sessions, OAuth-State, Translation Cache und Quotas.
- IDrive e2 fuer Dateien, Medien, Dokumente, Uploads, Backups und sonstige Daten.
- GitHub Actions fuer CI/CD.

## Deaktivierte Production-Pfade

- VPS/RackNerd.
- Docker-Production.
- Server-Backend.
- separat betriebene relationale Datenbank.
- separat betriebener Cache/Queue-Service.
- eigener Reverse Proxy.
- DeepL.
- Google Translate.
- Google OAuth.
- GA4.
- Google Search Console als Pflichtbestandteil.

## Legacy-Referenzen

Diese Ordner bleiben als lokale Entwicklungs- und Modellierungsreferenz erhalten:

- `backend/`
- `database/`
- `docker/`
- `vector/`
- Teile der alten Runbooks und Architekturhistorie

Sie duerfen nicht in Production-Deploy, CI-Pflicht oder Setup-Pflicht zurueckwandern.

## Naechste technische Schritte

1. Worker-Chat-Endpunkt als Free-Only-Prototyp entwerfen.
2. IDrive-e2-Metadaten/statusobjekte fuer Upload-Complete ergaenzen.
3. Harte Quotas und Missbrauchsschutz weiter ausbauen.
4. Statische SEO/AEO/GEO-Dateien aktuell halten.
5. Free-Only-Policy-Check in CI erweitern, sobald neue Production-Dateien entstehen.

## Skalierungsrealitaet

Die Architektur ist auf minimale Abhaengigkeiten und spaetere horizontale Erweiterung ausgerichtet. Milliarden Nutzer pro Tag sind nicht mit kostenlosen Kontingenten erreichbar. Der aktuelle Stand entfernt aber harte bezahlte Produktionsabhaengigkeiten und verhindert, dass alte Server-/Datenbankpfade versehentlich wieder Pflicht werden.

