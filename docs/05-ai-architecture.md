# 05 AI Architecture

Status: Free-Only-MVP-Architektur fuer digitale KI-Zwillinge.

## Ziel

Smyst baut aus Profilen, Wissenstexten, Dokumenten und Medien einen digitalen Twin-Kontext. In Phase 1 entstehen Antworten regelbasiert oder simuliert, damit keine kostenpflichtige AI-Inferenz als Production-Pflicht entsteht.

Gemini, Claude, Grok, DeepSeek, Kimi, Manus und Mistral bleiben Vergleichsmarken fuer die Langfristvision. Sie sind keine Production-Abhaengigkeit im Free-Only-MVP.

Der verbindliche Free-Only-Plan fuer Profile, Chatverlaeufe, Memory und spaetere AI-Erweiterung steht in `docs/FREE_ONLY_PROFILE_MEMORY_AI_PLAN.md`.

## Phase-1-Komponenten

- Twin-Profil: Name, Beschreibung, Sprache, Kategorien und Sichtbarkeit.
- Wissensdaten: manuell erfasste Texte und Upload-Metadaten.
- Chat-Archive: private Chatverlaeufe und Chat-Summaries in IDrive e2.
- Memory-Layer: bestaetigte, quellengebundene Erinnerungen mit Sichtbarkeit und Sensitivity.
- Dateiablage: IDrive e2.
- Kleine Metadaten: Cloudflare KV.
- Chat-API: Cloudflare Worker.
- Antwortlogik: statische Regeln, einfache Kontextauswahl und sichere Fallbacks.

## Datenfluss

```text
Nutzer erstellt Twin
  -> Worker validiert Session, Eingabe und Sichtbarkeit
  -> kleine Metadaten nach KV
  -> groessere Texte/Dateien nach IDrive e2
  -> Chat-Worker liest erlaubten Kontext
  -> regelbasierte/simulierte Antwort
  -> Ausgabe ohne private oder sensible Datenlecks
```

## Sicherheitsregeln

- Retrieval oder Kontextauswahl immer nach Auth, Owner, Sichtbarkeit, Consent und Sensitivity filtern.
- Private Uploads duerfen nie in oeffentlichen Antworten erscheinen.
- Prompt-Injection-Hinweise in Uploads duerfen keine internen Regeln ueberschreiben.
- Antworten muessen kontrolliert degradieren, wenn Kontext fehlt.
- Es gibt keine geheimen Modell- oder Provider-Schluessel im Client.

## Langfristige Erweiterung

Spaetere echte AI-Funktionen muessen ueber Adapter kommen:

- Parsing/OCR/Transkription.
- Embeddings und semantische Suche.
- Modellrouting.
- Moderation.
- Evaluation.
- Streaming-Antworten.

Jeder Adapter braucht Timeout, Kostenbremse, Datenschutzfilter und eine neue Freigabe, wenn er nicht innerhalb der Free-Only-Regel funktioniert.

Nicht erlaubt als Phase-1-Production-Pflicht sind Training auf rohen privaten Chats, bezahlte AI-Provider, Cloudflare AI, Cloudflare Vectorize, Cloudflare Queues, D1 Paid, R2 Paid, GitHub Codespaces oder kostenpflichtige GitHub-Actions-Minuten.

## Skalierungsrealitaet

Der Free-Only-MVP kann Architektur, UX und Sicherheitslogik validieren. Er kann keine globale AI-Qualitaet und Masseninferenz auf Milliarden-Nutzer-Niveau versprechen.
