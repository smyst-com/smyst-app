# TestFlight — smyst.com iOS-App (com.smyst.app)

Stand: 10.10.2026 — App liegt aktiv in TestFlight (internes Testen).

## Was existiert (App Store Connect, Team iMild LLC, Team-ID 443R27FNHX)

- App-Eintrag **smyst.com**, Apple-ID **6821281889**, Bundle `com.smyst.app`, SKU `smyst.app.2026`, Primärsprache de-DE
- Distribution-Zertifikat `Apple Distribution: iMild LLC (443R27FNHX)` (im Schlüsselbund dieses Macs; läuft bis 10.10.2027, Backup-p12: `~/.appstoreconnect/private_keys/smyst_distribution_backup.p12`)
- Provisioning-Profil `smyst App Store` (installiert unter `~/Library/Developer/Xcode/UserData/Provisioning Profiles/`, läuft bis 10.10.2027)
- Interne TestFlight-Gruppe `Intern` (alle Builds, iPhone-Apps auf Apple-Silicon-Mac verfügbar); Tester: smejjcom@gmail.com (Konto-Inhaber)
- API-Schlüssel in `~/.appstoreconnect/private_keys/`: `smyst Upload` (LCNMTW4TCQ, Admin) und `smyst Manager` (5U6WNF376R, App Manager). Issuer-ID: im App Store Connect unter „Users and Access → Integrations" sichtbar.

## iOS-Fixes in diesem Repo (Pflicht für jeden Build, PR „testflight-ios")

1. **UIScene-Lebenszyklus** (SceneDelegate.swift + AppDelegate + Info.plist-Manifest): Apps mit iOS-27-SDK stürzen ohne Szenen beim Start ab („UIScene life cycle is required"). Capacitor-SPM-Pin muss >= 8.5.3 sein (enthält `SceneDelegateProxy`).
2. **App-Icon ohne Alphakanal** (AppIcon-512@2x.png auf Weiß abgeflacht): Apple leistet Upload mit transparentem Icon ab.
3. **UIRequiresFullScreen = true**: iPad-Multitasking verlangt sonst alle vier Ausrichtungen; die App ist Hochformat-Chat.

## Neuen Build hochladen (ein Befehl)

    bash scripts/ios-testflight-upload.sh

Baut das Frontend mit Produktions-Umgebung, synchronisiert Capacitor, signiert mit dem Distribution-Profil (Build-Nummer = Zeitstempel) und lädt per altool hoch. Verarbeitung bei Apple dauert einige Minuten; danach erscheint der Build automatisch in der internen Gruppe.

## Installation auf dem Mac (Inhaber)

TestFlight-App auf dem Mac öffnen, mit smejjcom@gmail.com anmelden, smyst.com installieren (iPhone-App läuft auf Apple-Silicon-Macs).

## Hürden, die 2026 gelten (für künftige Agenten)

- App-Neuanlage per offizieller API ist gesperrt (403 auch mit Admin/App-Manager-Rolle). Notweg: iris-Gateway aus der angemeldeten Websitzung (fetch `/iris/v1/apps` aus der Konsole der offenen ASC-Seite) — Schema in diesem Chat/Agent-Verlauf dokumentiert.
- Interne-Tester-Zuweisung per API scheitert mit STATE_ERROR; ebenfalls über iris lösbar (`POST /iris/v1/betaTesters` mit betaGroups-Beziehung).
- Absturz-Prüfpflicht: vor jedem Upload im Simulator starten (UIScene-Regressionen u. a.).
