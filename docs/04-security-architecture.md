# 04 Security Architecture

> Status: Partially superseded by the Free-Only architecture. Google-service references are legacy/historical only and must not be required in production.

## Ziel

Smyst verarbeitet extrem sensible personenbezogene Daten. Sicherheit, Datenschutz, Consent und Missbrauchsschutz sind Kernanforderungen, nicht Compliance-Anhaenge.

## Schutzprinzipien

- Private by default.
- Least privilege.
- Defense in depth.
- Kein permanenter Storage-Key im Browser oder in mobilen Apps.
- Server-seitige Zugriffskontrolle vor jedem Retrieval.
- Auditierbare Admin- und Systemaktionen.
- Explizite Einwilligung fuer Twin-Erstellung, Stimme, Gesicht, sensible Erinnerungen und oeffentliche Nutzung.

## Authentifizierung

Erlaubt in Production:

- GitHub OAuth oder Passkey/WebAuthn ueber Salad API/KV.
- Sicheres Demo-Login nur fuer klar markierte MVP-/Preview-Umgebungen.
- HttpOnly Secure SameSite Cookies.
- Worker-seitige Sessionvalidierung.
- CSRF-Schutz fuer Cookie-basierte Mutationen.

Spaeter:

- Apple Login.
- Email Magic Link.
- MFA fuer Admins und Creator.
- Passkeys.
- Device Sessions und Session Revocation.

## Autorisierung

Kombination aus RBAC und ABAC:

- RBAC: `guest`, `user`, `creator`, `moderator`, `admin`, `system`.
- ABAC: owner, twin visibility, consent, sensitivity, region, purpose, payment state.

Jede Domain-Funktion prueft Berechtigungen in der Service-Schicht, nicht nur im Router.

## Datenklassifizierung

- Public: oeffentlich sichtbare Twin-Profile.
- Private: normale Uploads und Erinnerungen.
- Sensitive: Gesundheit, Religion, Politik, intime Informationen, finanzielle Daten.
- Highly Sensitive: biometrische Daten, Stimme, Ausweisdaten, Inhalte ueber Dritte.

Highly Sensitive darf nicht fuer oeffentliche Antworten verwendet werden, ausser es gibt explizite Policy, Consent und Audit.

## Storage Security

- Uploads nur ueber kurzlebige signed URLs.
- Downloads nur ueber kurzlebige signed URLs.
- Objektpfade enthalten keine erratbaren Nutzerdaten.
- Checksums fuer Integritaet.
- Malware-Scan als Pflicht-Gate vor Verarbeitung.
- Private Buckets ohne Public Listing.

## AI Security

- Prompt-Injection-Erkennung fuer Dokumente, Webseiteninhalte und Chat-Eingaben.
- Retrieval nur nach Berechtigungsfilter.
- Moderation vor und nach Modellaufrufen.
- Keine Systemprompts oder internen Policies im Output.
- Quellen und Confidence werden intern verfolgt.
- Sensible Memories koennen aus Antworten ausgeschlossen werden.

## Datenschutz und Consent

Erforderliche Records:

- Einwilligung fuer Account.
- Einwilligung fuer Upload-Verarbeitung.
- Einwilligung fuer Twin-Erstellung.
- Einwilligung fuer Public Twin.
- Widerrufe mit Zeitstempel.
- Loeschanfragen und Exportanfragen.

Loeschung:

- Soft Delete fuer Wiederherstellbarkeit.
- Hard Delete fuer DSGVO-Anfragen nach definiertem Prozess.
- Storage-Objekte, Chunks, Vektoren und abgeleitete Memories muessen loeschbar sein.

## Secrets

- Keine Secrets im Repository.
- GitHub Secrets fuer CI.
- `.env` nur lokal, nicht committed.
- Rotation fuer Auth-, Storage- und Session-Secrets.
- Separate Secrets fuer dev, staging und production.

## Audit

Auditpflichtige Aktionen:

- Login, Logout, Session Refresh.
- Upload create/delete/download.
- Twin visibility changes.
- Admin actions.
- Moderation actions.
- Consent changes.
- Permission changes.
- AI answer blocked or downgraded.

## Threat Model Startliste

- Account Takeover.
- Impersonation und unautorisierte Twin-Erstellung.
- Deepfake- und Voice-Missbrauch.
- Prompt Injection in Uploads.
- Data Exfiltration ueber Chat.
- Public Bucket Misconfiguration.
- Token- und Modellkostenmissbrauch.
- Scraping oeffentlicher Twins.
- Admin-Privilege-Missbrauch.

## Security Gates

Kein Produktfeature geht live ohne:

- Auth- und Berechtigungscheck.
- Logging und Audit fuer kritische Aktionen.
- Rate Limit.
- Input Validation.
- Error Handling ohne Datenlecks.
- Test fuer mindestens einen negativen Zugriffspfad.
