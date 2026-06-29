# 15 Security And GDPR Implementation

Status: Free-Only-Security- und Datenschutzbasis fuer Phase 1.

## Implementierte Production-Basis

- Legacy edge provider-Worker-Security-Headers.
- Strenge CORS-Preflights.
- Same-Origin/CSRF-Schutz fuer Cookie-basierte Mutationen.
- HttpOnly Secure SameSite Session-Cookies.
- KV-basierte Sessions, Rollen und kurzlebiger Auth-State.
- Upload-Intent-Pruefung mit Dateityp, Dateigroesse, Kategorie, Ablaufzeit und Quotas.
- IDrive-e2-Uploadbestaetigung per Metadatenpruefung.
- Oeffentliche Twin-Snapshots ohne private Storage-Keys, User-Sub oder Rohwissen.
- Statische Translation ohne externe Uebersetzungs-API.
- Consent-/Analytics-No-Op-Adapter ohne Pflichtdienst.

## Datenschutzprinzipien

- Private by default.
- Oeffentlich nur nach expliziter Sichtbarkeit.
- Keine sensiblen Daten in statischen Dateien.
- Keine permanenten Storage Credentials im Client.
- Keine Secrets im Repository.
- Fehlerantworten enthalten keine internen Details.
- Loeschung muss KV-Snapshots und IDrive-e2-Objekte beruecksichtigen.

## Zugriffskontrolle

Worker muessen vor jeder Mutation pruefen:

- gueltige Session,
- Rolle/Recht,
- Owner oder erlaubte Sichtbarkeit,
- CSRF/Same-Origin,
- Rate Limit,
- Eingabevalidierung.

## Upload-Schutz

Pflicht:

- erlaubte MIME-Typen und Dateiendungen,
- Groessenlimits pro Kategorie,
- User- und globale Quotas,
- kurzlebige Upload-Signaturen,
- sichere Objektpfade,
- keine Public-Listing-Abhaengigkeit,
- sichere Fehlerbehandlung.

Malware-Scanning ist in Phase 1 kein kostenlos verfuegbarer Pflichtdienst. Riskante Dateitypen bleiben deshalb blockiert oder streng limitiert.

## DSGVO-MVP

Phase 1 braucht mindestens:

- Consent-Hinweise fuer Account, Upload, Twin-Erstellung und oeffentliche Profile.
- Sichtbarkeit `private` als Standard.
- Loeschfunktion fuer eigene Uploads/Twins.
- Exportpfad ueber IDrive-e2-Backupobjekte oder lokale Datei.
- Audit-Minimum ohne sensible Inhalte.
- Keine Indexierung privater Profile.

## Nicht Teil der Free-Only-Production

Lokale Backend-, SQL-, Container- oder Vektor-Experimente koennen als Referenz bleiben. Sie sind keine Production-Pflicht und duerfen nicht als Sicherheitsvoraussetzung fuer Phase 1 beschrieben werden.

## Offene Security-Gates

- Vollstaendige negative Zugriffstests fuer Auth, Upload, Twin-Sichtbarkeit und Chat-Kontext.
- CSRF/CORS Browser-Smoke-Test gegen Legacy edge provider Preview.
- IDrive-e2-Loesch- und Restore-Test.
- Dokumentierter Incident- und Deindexing-Prozess.
- Passkey/WebAuthn als spaetere Free-Only-Alternative zu OAuth.
