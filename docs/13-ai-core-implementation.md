# 13 AI Core Implementation

Status: Free-Only-MVP-Pfad. Alte Backend-/Vektor-Experimente sind nur lokale Referenz.

## Ziel fuer Phase 1

Der KI-Zwilling funktioniert ohne kostenpflichtige externe AI-Dienste. Er erstellt aus Profil, Beschreibung, Wissenstexten und Upload-Metadaten einen einfachen Twin-Kontext und beantwortet Chatfragen regelbasiert oder simuliert.

## Erlaubte Production-Komponenten

- Cloudflare Worker fuer Chat-API und Kontextauswahl.
- Cloudflare KV fuer kleine Twin-Metadaten, Slugs, Sichtbarkeit und kurze Chat-Sessiondaten.
- IDrive e2 fuer Wissenstexte, Dokumente, Medien, Backups und groessere Twin-Kontextobjekte.
- Statische oder lokal vorbereitete Regeln/Antwortvorlagen im Repository.

## Nicht Teil von Phase 1

- kostenpflichtige AI-Inferenz,
- externe Embedding-APIs,
- externe OCR-, Transkriptions- oder Videoanalyse-Provider,
- eigene Production-Vektor-Datenbank,
- schwergewichtige Hintergrundverarbeitung ausserhalb der Free-Only-Grenzen.

## MVP-Datenfluss

```text
Profil/Wissen/Upload
  -> Worker validiert Zugriff, Sichtbarkeit, Dateityp und Quota
  -> Datei oder Kontextobjekt liegt in IDrive e2
  -> kleine Metadaten liegen in KV
  -> Chat-Worker waehlt oeffentlichen oder eigenen Twin-Kontext
  -> Antwort wird regelbasiert/simuliert erzeugt
  -> sensible/private Inhalte werden vor Ausgabe gefiltert
```

## Erweiterbarkeit

Spaetere echte AI-Modelle muessen ueber Adapter angebunden werden:

- klarer Timeout,
- Kostenbremse,
- Datenschutzfilter vor jedem Modellaufruf,
- austauschbarer Provider,
- keine Pflicht fuer Phase 1.

Gemini, Claude, Grok, DeepSeek, Kimi, Manus und Mistral bleiben Benchmark und Langfristziel, aber keine Production-Abhaengigkeit im Free-Only-MVP.

## Validierung

Phase-1-Checks:

- Worker-Bundles bauen.
- Chat-MVP antwortet ohne externe Secrets.
- Private Twins werden nicht oeffentlich ausgegeben.
- Upload-Kontext wird nur nach Session-/Owner-Pruefung genutzt.
- Fehler liefern sichere, kurze Antworten ohne Datenleck.

## Skalierungsrealitaet

Der MVP trennt UI, Chat-API, Metadaten und Objektstorage sauber. Das bereitet spaetere Skalierung vor, garantiert aber keine globale AI-Inferenz fuer Milliarden Nutzer auf kostenlosen Kontingenten.
