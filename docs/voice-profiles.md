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

## Stufe 2a – umgesetzt (kuratierte Piper-Stimme pro Twin, PR #233, live 22.07.2026)

- `src/data/curated-voice-hints.ts`: kuratierter Stimmen-Eintrag für alle 100 kuratierten
  Twins (plus Aliase für Namensvarianten wie "Atatürk"/"Atatuerk"): Geschlecht, `pitch`/`rate`
  (Geräte-Fallback-Stimme) und `voiceIds` pro Sprachbasis (`de`/`en`, `tr` für Atatürk und
  Mimar Sinan). Nur synthetische Piper-Stimmen, keine Klone realer Personen.
- `src/lib/voiceProfiles.ts`: `remoteVoiceIdFor` nutzt den kuratierten `voiceIds`-Eintrag der
  Sprachbasis; ohne Eintrag deterministischer Hash-Fallback im Geschlecht-Sprach-Pool.
  `normalizeKey` entfernt Diakritika, damit Namensvarianten dieselbe Stimme treffen.
- Verfügbare Piper-Stimmen (gebündelt im Voice-Worker, siehe `voice-worker/app.py`):
  de: thorsten/karlsson/pavoque (m), kerstin/ramona/eva (w); en: ryan/joe/lessac/hfc-male (m),
  amy/hfc-female (w); tr: dfki (einzige tr-Stimme).
- Fallback-Kette unverändert: Remote-Audio → Stufe-1-System-Stimme → Text ohne Audio.

## Stufe C – umgesetzt (Sprechtempo pro Twin im Remote-TTS, PR #235, live 23.07.2026)

- Frontend sendet das kuratierte `rate` des Twins (`remoteRateFor`) bei `POST /api/tts` mit –
  auch im Streaming-Satz-TTS (`playRemoteSpeech`, `startSentenceSpeech`, `fetchSpeechUrl`).
- Control Server (`backend/app/api/v1/routes/tts.py`): `rate` validiert (0.5–1.5) und an den
  Voice-Worker durchgereicht; lokaler Piper-Fallback nutzt `--length_scale = 1/rate`.
- Voice-Worker (`voice-worker/app.py`): `/synthesize` akzeptiert `rate` und setzt Piper
  `--length_scale`. Abwärtskompatibel: `rate` ist auf allen Ebenen optional.
- Deploy: Frontend automatisch; Backend und Worker über die Actions-Workflows
  "Salad Backend Deploy" und "Voice Worker Deploy" (approval-Feld exakt "Ja OK").
- Live verifiziert 23.07.2026: gleicher Text mit rate 0.7/1.0/1.3 → 169/156/128 KB WAV
  (monoton fallend); ohne `rate` unverändert; `tr-dfki` mit rate 0.93 ok.

## Offen (bewusst nicht umgesetzt)

- Kein Klonen realer Stimmen für historische Profile (Nutzer-Entscheid 22.07.2026;
  rechtlicher Rahmen oben, für Atatürk zusätzlich Gesetz 5816/Türkei beachten).
- Vorgerendertes Begrüßungs-Caching auf IDrive e2/CDN (aktuell Session-Cache im Client).

## Test-Checkliste (bei jeder Voice-Änderung)

- Chrome, Safari, iOS Safari, Android Chrome: Begrüßung hörbar, Schleife läuft, Abbruch sauber.
- Firefox: Hinweis statt Crash (keine SpeechRecognition).
- PWA installiert: Mikrofon-Berechtigung, Hintergrund-Verhalten.
- Zwei Profile nacheinander: unterscheidbare Stimmen, stabil pro Profil.
- Remote-TTS: `X-Voice-Id` entspricht der kuratierten Stimme des Twins; gleicher Text mit
  unterschiedlichem `rate` liefert unterschiedlich lange Audios; Request ohne `rate` bleibt ok.
