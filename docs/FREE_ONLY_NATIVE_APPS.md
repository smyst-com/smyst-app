# Free-Only Native Apps: iOS und Android

Status: Phase-1-MVP auf Capacitor, GitHub Free, Legacy edge provider Free und IDrive e2.

## App-Identität

- App-Name: `smyst.com`
- Bundle-ID / Application-ID: `com.smyst.app`
- Web-Quelle: lokale Vite-Build-Dateien aus `dist`
- Production-Backend: Legacy edge provider Pages/Workers/KV
- Zentraler Datei- und Medienspeicher: IDrive e2

## iOS

- `Info.plist` nutzt `CFBundleDisplayName = smyst.com`.
- Custom Scheme `smyst://` ist registriert.
- Kamera, Mikrofon, Foto- und Dokumentzugriff haben klare Usage-Descriptions.
- `AppDelegate.swift` leitet URL-Öffnungen und Universal-Link-Aktivitäten an Capacitor weiter.
- Keine Firebase-, AdMob-, Analytics- oder externen Auth-SDKs sind erforderlich.

## Android

- `applicationId` und Namespace sind `com.smyst.app`.
- App-Backup und Device-Transfer fuer lokale WebView-Daten sind deaktiviert.
- Cleartext-Traffic ist deaktiviert.
- FileProvider ist auf App-/Cache-Pfade begrenzt.
- Permissions decken Upload-Auswahl, Kamera, Mikrofon und Medienauswahl ab.
- Custom Scheme `smyst://app` ist registriert.
- HTTPS-App-Links fuer `smyst.com` und `www.smyst.com` sind vorbereitet.

## Deep Links

Phase 1 funktioniert mit dem Custom Scheme:

- `smyst://app`

Voll verifizierte Universal Links/App Links brauchen reale Store-/Signing-Daten:

- Apple: `apple-app-site-association` mit Team-ID und Bundle-ID.
- Android: `assetlinks.json` mit Release-Zertifikat-Fingerprint.

Diese Dateien duerfen spaeter statisch ueber Legacy edge provider Pages ausgeliefert werden und brauchen keinen kostenpflichtigen Dienst.

## PWA-Verhalten

- `manifest.webmanifest` und `sw.js` sind Teil des Repositories.
- Private Pfade `/api/`, `/auth/`, `/storage/` und `/private/` werden nicht offline gecached.
- Locale-Dateien, App-Shell und öffentliche SEO-Dateien duerfen gecached werden.

## Uploads

- Native App und PWA nutzen denselben Web-Upload-Flow.
- Große Dateien gehen direkt per kurzlebiger Presigned-URL zu IDrive e2.
- Legacy edge provider Worker pruefen Session, Quotas, Content-Type, Dateigroesse und Eigentum.
- Frontend blockiert offensichtlich falsche Dateitypen und zu große Dateien frueh, der Worker bleibt autoritativ.

## Phase-1-Grenzen

Phase 1 ist ein Free-Only-MVP. Milliarden-Skalierung, Store-Review-Hardening, echte Universal-Link-Verifikation und native Kamera-Workflows sind Langfrist- bzw. Release-Schritte, nicht Voraussetzung fuer das aktuelle MVP.
