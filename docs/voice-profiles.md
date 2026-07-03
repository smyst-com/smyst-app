# Profil-Stimmen für smyst.com

Ziel: Jedes KI-Profil spricht mit einer eigenen, passenden Stimme – natürlich, stabil, glaubwürdig.
Rechtlicher Rahmen: Nur rechtlich sichere Quellen und erlaubte Verfahren. Voice-Profile nur mit
Zustimmung. Keine Nachahmung realer Stimmen ohne klare Freigabe. KI-Zwillinge dürfen nicht als
echte Person täuschen (siehe Master-Prompt, Datenschutz & Sicherheit).

## Stufe 1 – umgesetzt (Web Speech API, on-device, kostenlos)

- `speakText(text, lang, onDone, voiceKey)` in `src/App.tsx`: Der Profilname dient als
  deterministischer Seed. Daraus werden gewählt: System-Stimme aus dem Sprach-Pool
  (natural/premium/neural bevorzugt), Sprechtempo (0.92–1.00) und Tonhöhe (0.90–1.10).
- Gleiches Profil klingt immer gleich; verschiedene Profile klingen unterscheidbar.
- Läuft auf Web, PWA, iOS und Android mit den Stimmen des Geräts. Keine Kosten, keine Server.
- Grenzen: Stimmqualität und -auswahl hängen vom Gerät ab; keine echte Charakter-Stimme.

## Stufe 2 – geplant (Open-Source-TTS auf Salad, kuratierte Stimmen)

Architektur (gemäß Infrastruktur-Regeln: GitHub Pages statisch, Salad nur echte Rechenarbeit,
IDrive e2 als Object Brain):

1. Stimmen-Metadaten pro Profil in `src/data/curated-public-twin-data.ts` erweitern:
   `voiceProfile: { engine: 'piper', voiceId: string, rate: number, pitch: number }`.
   Kuratiert nach Alter, Herkunft, Sprache, Charakter des Profils – synthetische Stimmen,
   keine Klone realer Personen.
2. Salad-Worker mit Open-Source-TTS (Piper; Alternativ-Kandidat: Coqui XTTS nur bei geklärter
   Lizenz). Stateless: Text rein, Audio (opus/mp3) raus. Endpoint `POST /api/tts`
   (Text, voiceId, lang) → signierte, zeitlich begrenzte Audio-URL.
3. Caching: Häufige Sätze (z. B. Begrüßungen) vorgerendert als statische Dateien auf
   IDrive e2/CDN; dynamische Antworten gestreamt vom Worker.
4. Frontend-Fallback-Kette: Stufe-2-Audio → Stufe-1-System-Stimme → Text ohne Audio.
   Kein Bruch der Live-Gesprächsschleife.
5. Consent & Compliance: Für nutzererstellte Twins eigene Stimme nur nach dokumentierter
   Zustimmung (Zustimmungshistorie auf IDrive e2). Für kuratierte historische Profile
   ausschließlich synthetische, ähnlich wirkende Stimmen mit klarer KI-Kennzeichnung.

## Test-Checkliste (bei jeder Voice-Änderung)

- Chrome, Safari, iOS Safari, Android Chrome: Begrüßung hörbar, Schleife läuft, Abbruch sauber.
- Firefox: Hinweis statt Crash (keine SpeechRecognition).
- PWA installiert: Mikrofon-Berechtigung, Hintergrund-Verhalten.
- Zwei Profile nacheinander: unterscheidbare Stimmen, stabil pro Profil.
