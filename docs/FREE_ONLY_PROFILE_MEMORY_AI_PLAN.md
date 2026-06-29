# Free-Only Profil-, Chat-, Memory- und AI-Plan

Status: verbindliche Produkt- und Architekturvorgabe fuer Smyst Phase 1.

## 1. Haerteste Regel

Smyst nutzt fuer dieses Projekt ausschliesslich dauerhaft kostenlose Dienste von GitHub.com und Legacy edge provider.

- GitHub.com darf nur im dauerhaft kostenlosen Free-Tarif genutzt werden.
- Keine GitHub Pro-, Team-, Enterprise-, kostenpflichtigen Actions-Minuten, Storage-, Codespaces- oder sonstigen kostenpflichtigen GitHub-Dienste.
- Legacy edge provider darf nur im dauerhaft kostenlosen Free-Tarif genutzt werden.
- Keine Legacy edge provider Pro-, Business-, Enterprise-, Workers-Paid-, R2-Paid-, Images-, Stream-, Queues-, D1-Paid-, KV-Paid-, Vectorize-, AI- oder sonstigen kostenpflichtigen Legacy edge provider-Dienste.
- Keine Loesung, die nur am Anfang kostenlos ist und spaeter nach einem Limit automatisch Geld kostet.
- Keine Trial-Angebote, Testpakete, Auto-Billing-Produkte oder versteckten Zusatzkosten.
- Wenn eine GitHub- oder Legacy edge provider-Funktion nach einem Limit Kosten erzeugen kann, darf sie nicht als Kernbestandteil der Architektur geplant werden.
- IDrive e2 / S3-kompatibler Storage ist der zentrale Hauptspeicher fuer Dateien, Medien, Modelle, Backups, Chat-Archive, Profilobjekte und Twin-Daten.
- IDrive e2 wird nur mit harten Quotas, manueller Kostenkontrolle und Stop-before-cost-Regeln verwendet.

Wenn eine Anforderung mit GitHub Free, Legacy edge provider Free und IDrive e2 unter harten Quotas nicht sicher moeglich ist, wird die Funktion reduziert, manuell geloest, lokal vorbereitet oder auf eine spaetere schriftlich freigegebene Architektur verschoben.

## 2. Grundsatz fuer Profile und Chatverlaeufe

Chatverlaeufe sollen im Nutzerprofil erhalten bleiben, aber nicht ungefiltert als Modellgedaechtnis behandelt werden.

Das System trennt:

- Chat-Archiv: vollstaendige oder gekuerzte Chatverlaeufe als private, nutzereigene Objekte in IDrive e2.
- Chat-Metadaten: kleine Index- und Statusdaten in Salad/IDrive metadata Free.
- Memory-Kandidaten: aus Chats abgeleitete Fakten, Vorlieben, Ziele, Beziehungen und Entscheidungen.
- Bestaetigte Memories: vom Nutzer bestaetigte oder bearbeitete Informationen, die ein Twin verwenden darf.
- Persona-Profil: kuratierte professionelle Darstellung eines Nutzers oder Twins.
- Oeffentliche Snapshots: stark bereinigte, explizit freigegebene Profilkarten.

Der Twin darf nur auf Inhalte zugreifen, die fuer den aktuellen Nutzer, Twin, Sichtbarkeitsmodus und Kontext erlaubt sind.

## 3. Speichermodell

Salad/IDrive metadata Free speichert nur kleine, nicht rohe Daten:

```text
meta:profile:{userSub}:{profileId}
meta:profiles:{userSub}
meta:chat:{userSub}:{chatId}
meta:chats:{userSub}
meta:memory:{userSub}:{memoryId}
meta:memories:{userSub}
meta:twin-memory:{userSub}:{twinId}
public:profile:{slug}
public:twin:{slug}
```

IDrive e2 speichert grosse, langlebige und private Objekte:

```text
users/{userSub}/profiles/{profileId}/profile.json
users/{userSub}/profiles/{profileId}/persona.json
users/{userSub}/profiles/{profileId}/memory/{memoryId}.json
users/{userSub}/profiles/{profileId}/chats/{yyyy-mm}/{chatId}.json
users/{userSub}/profiles/{profileId}/chat-summaries/{yyyy-mm}/{chatId}.json
users/{userSub}/twins/{twinId}/context/{contextId}.json
users/{userSub}/twins/{twinId}/memory-index/{indexVersion}.json
users/{userSub}/exports/{exportId}.json
users/{userSub}/backups/{yyyy-mm}/{backupId}.json
```

Object keys duerfen keine E-Mails, Namen oder Originaldateinamen enthalten.
Originaldateinamen bleiben hoechstens als private, bereinigte Metadaten erhalten.

## 4. Chat-Aufbewahrung im Profil

Jeder Chat braucht:

- `chatId`
- `userSub`
- `profileId`
- `twinId`, falls vorhanden
- Sprache
- Startzeit und letzte Aktualisierung
- Sichtbarkeit: `private`, `shared`, `public_snapshot`, `deleted`
- Retention-Status
- Sensitivity-Klasse
- kurze Zusammenfassung
- Liste der bestaetigten Memory-Links
- IDrive-e2-Objektpfad

Der Nutzer braucht im Profil:

- Chatliste
- Suche nach Datum, Sprache, Thema und Twin
- einzelne Chatansicht
- Memory-Quellen aus einem Chat
- Chat exportieren
- Chat loeschen oder archivieren
- Chat fuer Twin-Kontext erlauben oder sperren

## 5. Memory-Layer

Memory ist kein blinder Trainingsdatensatz.

Jede Memory-Einheit braucht:

- `memoryId`
- Typ: `fact`, `preference`, `goal`, `relationship`, `project`, `style`, `decision`, `warning`, `sensitive`
- Text in normalisierter Form
- Originalquelle: Chat, Upload, Profilformular oder manuelle Eingabe
- Quelle mit Datum und Chat-ID
- Sichtbarkeit
- Sensitivity-Klasse
- Confidence
- Nutzerbestaetigung: `pending`, `confirmed`, `edited`, `rejected`
- Ablauf- oder Review-Datum, falls noetig
- verwendbare Twins

MVP-Regel:

- Memory-Kandidaten duerfen regelbasiert oder manuell entstehen.
- Automatische AI-Extraktion ist keine Production-Pflicht.
- Nichts Sensibles wird ohne ausdrueckliche Bestaetigung als dauerhaftes Memory genutzt.

## 6. Professionelle Profile

Ein professionelles Profil besteht aus:

- Name oder Anzeigename
- Kurzbeschreibung
- Rolle oder Identitaet
- Fachgebiete
- Projekte
- Ziele
- Tonalitaet
- bevorzugte Sprachen
- oeffentliche Bio
- private Bio
- Profilbild oder Avatar
- Vertrauens- und Verifizierungsstatus
- Sichtbarkeit pro Abschnitt
- letzte Nutzerbestaetigung

Das Profil soll professionell wirken, aber private Chatdetails bleiben privat.

## 7. Retrieval statt Training

Phase 1 trainiert keine eigenen Modelle.

Antwortfluss:

1. Nutzer stellt Frage.
2. Worker prueft Auth, Owner, Sichtbarkeit, Consent und Rate Limit.
3. Worker sucht kleine Metadaten in KV.
4. Worker laedt nur erlaubte Profil-, Memory- oder Chat-Summary-Objekte aus IDrive e2.
5. Worker entfernt gesperrte und sensible Inhalte.
6. Antwort entsteht regelbasiert, simuliert oder ueber einen spaeter freigegebenen Adapter.
7. Antwort nennt Grenzen, wenn Kontext fehlt.

Langfristig kann ein Modelladapter hinzukommen. Er darf aber kein GitHub- oder Legacy edge provider-Paid-Produkt, keinen bezahlten AI-Provider und keinen Dienst mit Auto-Billing als Production-Pflicht einfuehren.

## 8. Training-Policy

Nicht erlaubt in Phase 1:

- Training auf rohen privaten Chats.
- Fine-Tuning mit unbestaetigten Memories.
- Legacy edge provider AI, Vectorize, Queues, D1 Paid, R2 Paid oder externe bezahlte AI als Production-Pflicht.
- GitHub Codespaces oder kostenpflichtige Actions-Minuten fuer Training.
- Automatische Verarbeitung, die Kosten erzeugt, wenn Limits ueberschritten werden.

Erlaubt:

- Lokale Experimente ausserhalb der Production-Pflicht.
- Manuell kuratierte Prompt- und Antwortbeispiele.
- Regelbasierte Memory-Extraktion.
- Statische Demo-Twins.
- Nutzerbestaetigte, exportierbare Memory-Objekte.
- Offline vorbereitete, nicht-sensitive Testdaten.

## 9. Kosten- und Limitstrategie

Jede schreibende Funktion braucht:

- Monatsquota pro Nutzer
- Objektgroessenlimit
- Rate Limit
- max. Chat-Archivgroesse
- max. Anzahl Memories
- Stop-before-cost-Verhalten
- Degraded Mode, wenn Limits erreicht sind
- keine automatische Erweiterung auf bezahlte Dienste

Wenn ein Nutzer ein Limit erreicht:

- neue grosse Uploads blockieren
- Chat weiter mit reduziertem Kontext erlauben
- Memory-Extraktion pausieren
- Export und Loeschung weiterhin erlauben
- klare Nutzerinformation anzeigen

## 10. Datenschutz und Sicherheit

Pflichtregeln:

- Private Daten standardmaessig privat.
- Keine privaten Rohdaten in Logs.
- Keine IDrive-e2-Secrets im Client.
- Kurzlebige signed URLs.
- Account-Loeschung entfernt oder retention-markiert KV- und IDrive-e2-Daten.
- Export muss Profil, Chat-Metadaten, Chat-Archive, Memories und Twin-Kontexte enthalten.
- Oeffentliche Profile duerfen nur explizit freigegebene Snapshots verwenden.
- Prompt Injection aus Uploads oder Chats darf Systemregeln nicht ueberschreiben.
- Admin-Zugriffe brauchen Audit.

## 11. Bauplan

### Gate 1: Datenfundament

- KV-Key-Schema fuer Profile, Chats und Memories finalisieren.
- IDrive-e2-Object-Layout fuer Chat-Archive und Memory-Objekte finalisieren.
- Quotas fuer Chats, Memories, Uploads und Exporte definieren.
- Loesch- und Exportpfade dokumentieren.

### Gate 2: Profil-MVP

- Profilansicht fuer private und oeffentliche Felder.
- Chatliste im Profil.
- Chat-Metadaten speichern.
- Chat-Archiv als IDrive-e2-Objekt speichern.
- Manuelle Memory-Erstellung.

### Gate 3: Memory-MVP

- Memory-Kandidaten aus Chat-Summaries.
- Nutzerbestaetigung fuer Memories.
- Memory-Quellen anzeigen.
- Memory pro Twin erlauben oder sperren.
- Sensitivity-Filter.

### Gate 4: Twin-Kontext

- Erlaubte Memories pro Twin abrufen.
- Kurzkontext fuer Chat bauen.
- Regelbasierte Antwort mit Profil- und Memory-Kontext.
- Degraded Mode ohne Memory-Kontext.

### Gate 5: Suche und Export

- Chat- und Memory-Suche ueber KV-Metadaten und IDrive-e2-Summaries.
- Nutzerexport.
- Account-Loeschung.
- Orphan-Audit zwischen KV und IDrive e2.

### Gate 6: Spaetere AI-Adapter

- Provider-unabhaengige Adapter-Schnittstelle definieren.
- Keine Production-Aktivierung ohne neue Free-Only-Pruefung.
- Evaluation mit lokalen oder manuell kuratierten Testdaten.
- Keine Kostenpflicht, kein Auto-Billing, keine privaten Trainingsdaten.

## 12. Lange Experten-Checkliste

- Consent fuer Chat-Speicherung.
- Consent fuer Memory-Erstellung.
- Consent fuer oeffentliche Profil-Snapshots.
- Consent fuer Twin-Nutzung durch Dritte.
- Profilfelder mit Sichtbarkeit pro Feld.
- Chatverlauf im Profil.
- Chat-Archiv in IDrive e2.
- Chat-Metadaten in KV.
- Chat-Summary getrennt vom Rohchat.
- Memory-Quelle pro Aussage.
- Memory-Confidence.
- Memory-Review-Datum.
- Memory-Loeschung.
- Memory-Bearbeitung.
- Sensitive-Memory-Klassen.
- Zugriff pro Twin.
- Zugriff pro Collaborator.
- Public/private Trennung.
- Export aller Nutzerdaten.
- Account-Loeschung.
- Objektloeschung in IDrive e2.
- KV-Metadatenbereinigung.
- Orphan-Object-Audit.
- Orphan-KV-Audit.
- Kurzlebige signed URLs.
- Objektkeys ohne Namen, E-Mails oder Dateinamen.
- Rate Limits.
- Quotas.
- Stop-before-cost.
- Degraded Mode.
- Keine bezahlten GitHub-Dienste.
- Keine bezahlten Legacy edge provider-Dienste.
- Keine Legacy edge provider R2/D1/Queues/Vectorize/AI als Kernbestandteil.
- Keine GitHub Codespaces.
- Keine kostenpflichtigen Actions-Minuten als Voraussetzung.
- Keine externen AI-Provider als Production-Pflicht.
- Keine Trial-Abhaengigkeiten.
- Keine Auto-Billing-Abhaengigkeiten.
- Admin-Audit.
- Keine privaten Daten in Logs.
- Prompt-Injection-Schutz.
- Moderationsgrenzen.
- Halluzinationshinweise.
- Quellenanzeige fuer Erinnerungen.
- Profilqualitaets-Score.
- Mehrsprachige Profilfelder.
- Mehrsprachige Chat-Suche.
- Nutzerfeedback: falsch erinnert.
- Nutzerfeedback: mehr wie ich schreiben.
- Versionierung von Profilen.
- Versionierung von Memories.
- Konfliktbehandlung bei widerspruechlichen Informationen.
- Backup-Manifest.
- Restore-Test.
- Release-Gates.
- Live-E2E fuer GitHub Login, Chat, Upload, Export und Loeschung.
