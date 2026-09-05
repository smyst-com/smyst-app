# AGENTS.md – Arbeitsregeln für KI-Agenten in smyst-app

Diese Regeln gelten für alle KI-Agenten (Codex, Claude, andere) und menschliche Beiträge.
Produktions-Branch ist `main`. Jeder Push auf `main` deployt automatisch auf https://smyst.com.

## Schreibweise (Pflicht)

Die Plattform heißt immer und ausschließlich **smyst.com** – niemals SMYST, SMYST.COM oder Smyst.
Das gilt für Code, UI, Doku, APIs, Metadaten, SEO und Marketingtexte.

## Design-Freeze Startseite (Pflicht, 100 % geschützt)

Inhaber-Vorgabe 04.09.2026 (wörtlich): „Startseite soll gleich bleiben, wie Du
in Screenshots siehst […] diese Startseite […] ist unsere Chatbereich und muss
genau gleich bleiben, nicht ändern." Die START-SHELL ist und bleibt DIE
Startseite (Chatbereich): Header, Logo, Suchfeld, Kategorie-Chips, Profil-Grid,
Chat-Composer/Footer und Seitenmenü — bei Logo-Klick, Profil-Klick und jeder
Navigation immer sichtbar.

Die Landing-Anmeldeseite (Prototyp 20.08., PRs #632/#634, Freigabe 30.08.) ist
kein Ersatz, sondern NUR der Anmelde-Begrüßungsbildschirm für NICHT
angemeldete Besucher (Vorgabe 04.09., PR #641): sie erscheint nur bei
auth.status==='anonymous', einmal geschlossen bleibt sie für die ganze Sitzung
weg (sessionStorage smyst-landing-dismissed), angemeldete Nutzer sehen sie nie,
„Mit X chatten"-Deep-Links überspringen sie.

1. KEINE sichtbare Design-Änderung an der Startseite (Shell UND Landing) ohne
   ausdrückliche schriftliche Bestätigung des Inhabers (Adam King) im konkreten
   Auftrag. Keine Ausnahme.
2. Ohne Freigabe verboten: Elemente hinzufügen oder entfernen (z. B. Icon-Legenden,
   Erklärtexte, Banner), Layout, Farben, Abstände oder Typografie ändern.
   Geschützte Landing-Teile: src/components/SmystLanding.tsx, die landing-Gruppe
   in src/lib/staticTranslations.ts + public/locales/*.json, die Space-Grotesk-
   @font-face-Blöcke und die .smyst-landing-Overrides am Ende von src/index.css.
   Geschützt ebenfalls: die Login-Gate-Logik in SmystStartPage (landingVisible =
   landingOpen && auth.status === 'anonymous', LANDING_DISMISSED_KEY) und die
   E2E-Tests in frontend/e2e/smyst.spec.ts.
8. LOGIN-BEREICH (Inhaber-Foto 05.09., „genau eins zu eins"): Der helle
   Vollbild-Login src/components/SmystLoginGate.tsx (Anmelden oder
   registrieren; Google/Fingerabdruck/GitHub-Zeilen; E-Mail-Zeile mit
   schwarzem Pfeil-Knopf; Hinweistext; Nutzungsbedingungen/Datenschutz/
   Impressum) ist der freigegebene Login-Screen für Gäste (Aufruf: Einloggen
   auf der Landing). Nicht ohne schriftliche Freigabe ändern. GitHub-Zeile
   ist bewusst ein Alias auf den Google-Login (kein GitHub-OAuth-Backend —
   Übergangslösung wie GitHubSignInButton).
3. Gilt auch für Restores und Reverts: Vor jedem Restore prüfen, dass keine
   eingefrorenen Design-Elemente zurückkommen oder wegfallen. Vorfall: Die
   Icon-Legende im Footer wurde am 30.06.2026 (82b12da) auf Anweisung entfernt,
   kam durch Restore 187c6d8 zurück und wurde am 03.07.2026 (PR #25) erneut
   entfernt. Die Icon-Legende darf NIE wieder eingebaut werden.
4. Ohne Freigabe erlaubt: reine Bug- und Sicherheits-Fixes ohne sichtbare
   Design-Auswirkung auf die Startseite.
5. Deep-Link-Verhalten ist Teil des Designs: „Mit X chatten" (sessionStorage
   smyst-chat-open) überspringt die Landing (Chat öffnet sofort) — nicht entfernen.
6. Der Service-Worker-Stub im E2E-Test (frontend/e2e/smyst.spec.ts, beforeEach)
   verhindert den controllerchange-Reload-Race — nicht entfernen.
7. EINZIG freigegebene sichtbare Shell-Änderung (Inhaber 04.09., PR #641): Die
   Kompaktierung des oberen Bereichs (Logo-Zeile 74/86 px, Suchzeile 54/64 px
   mit text-2xl-Eingabe, engere Chips/Rails/Kopf-Abstände) — exakt dieser
   Zustand ist geschützt. Weitere Verdichtungen oder Vergrößerungen brauchen
   erneut schriftliche Freigabe.

## Funktions-Freeze Eigenes Modell im Live-Chat (Pflicht, 100 % geschützt, ab 04.09.2026)

Der Live-Chat läuft seit dem 04.09.2026 (PRs #638/#639) primär auf dem eigenen
Modell smyst-1.1 (llama-server im Backend-Container). Diese Konfiguration ist
live bewiesen (Runtime-Log: 127.0.0.1:8080 200 OK) und eingefroren:

1. Geschützt: backend/start-llm.sh (Modell-Kandidatenliste smyst-1.1 vor 1.0,
   --ctx-size 8192, --parallel 2, --alias smyst-1.0, nproc-Threads) und die
   apt-Zeile mit libgomp1 in backend/Dockerfile.
2. Zeabur baut mit einem GESPEICHERTEN Dockerfile-Override (Dashboard), NICHT
   automatisch aus backend/Dockerfile. Nach jeder Dockerfile/start-llm.sh-
   Änderung MUSS der Override per GraphQL updateDockerfile synchronisiert und
   redeployt werden — Prozedur siehe Memory_Bank.md 04.09.
3. Ohne schriftliche Freigabe des Inhabers verboten: ctx-size senken, Parallel-
   Slots ändern, libgomp1/llama-Blöcke entfernen, Alias entfernen, Router-
   Reihenfolge ändern (smyst_llm zuerst), den smyst_llm-Zweig aus llm_router.py
   entfernen.
4. Pflicht-Smoke nach jedem Backend-Deploy: /api/ai/providers?ping=true muss
   smyst_llm ok:true liefern UND ein Gast-Chat auf smyst.com muss eine echte
   Antwort liefern (nicht die Degraded-Meldung).

## Funktions-Freeze Sprachsystem (Pflicht, 100 % geschuetzt)

Der komplette Sprach-Stack ist eingefroren (Stand 2026-07-03, End-to-End live getestet:
Begruessung -> Zuhoeren -> Erkennung -> Antwort -> Vorlesen -> Weiterzuhoeren).

Geschuetzte Dateien/Bereiche:
- Frontend: speakText/speakLocal und die Live-Gespraechslogik in src/App.tsx
  (startDictation, handleToggleLiveVoice, handleSpeakInput, resumeListening),
  src/lib/ttsClient.ts, src/lib/voiceProfiles.ts
- Backend: backend/app/api/v1/routes/tts.py, public_twins.py, deren Registrierung
  in router.py sowie die Piper-Bloecke im backend/Dockerfile

Regeln:
1. KEINE Aenderung an diesen Bereichen ohne ausdrueckliche schriftliche
   Bestaetigung des Inhabers (Adam King). Keine Ausnahme.
2. Gilt auch fuer Restores, Reverts und Komplett-Ersetzungen von Dateien:
   Vor JEDEM Commit, der src/App.tsx oder backend/.../router.py beruehrt,
   pruefen, dass diese Marker erhalten bleiben: playRemoteSpeech,
   stopRemoteSpeech, unlockAudioPlayback, tts_router, public_twins_router.
   (Vorfaelle: tts_router 2x still entfernt, Fix-PRs #45/#48.)
3. Pflicht-Smoke nach jedem Backend-Merge/-Deploy: GET /api/tts/voices muss
   200 mit ready:true liefern. Nach jedem Frontend-Merge: Bundle muss
   '/api/tts' enthalten.
4. Ohne Freigabe erlaubt: reine Sicherheits-Fixes, die die Funktion
   nachweislich nicht veraendern (Smoke-Tests danach Pflicht).

## Branch- und PR-Regeln (Pflicht)

1. Kein direkter Push auf `main`. Jede Änderung läuft über einen Feature-Branch
   (`codex/<thema>` oder `claude/<thema>`) und einen Pull Request.
2. Vor JEDER Änderung den aktuellen `main`-HEAD abgleichen. Dateien niemals auf Basis
   eines veralteten Stands komplett ersetzen – parallel arbeiten mehrere Agenten.
3. Kleine, atomare Commits mit klarer Message. Maximal ein Thema pro PR.
4. Kein Force-Push, keine Branch-Löschung auf `main`.

## Pflicht vor jeder Änderung

- `AGENTS.md`, `Memory_Bank.md` (im Arbeitsordner), `Project_Goals.md`, `AI_Guidelines.md` lesen
- Betroffene Dateien auf aktuellem `main`-Stand analysieren
- Datenschutz-, Sicherheits- und Skalierungsfolgen bewerten
- Rollback-Weg benennen (git revert des PR-Merges)

## Pflicht nach jeder Änderung

- Build-Gate respektieren: `npm run build` (Sitemap + tsc + vite) muss grün sein
- Guards: `python3 scripts/check-profile-image-design-guard.py`,
  `check-profile-memory-contract.py`, `validate-foundation.py`
- Bei UI-Änderungen: Browser-/Responsive-/PWA-Prüfung und Live-Smoke-Test nach Deploy
- Doku aktualisieren, nur validierte Ergebnisse in Memory übernehmen

## Schutzregeln Qualitaetsschleife (Pflicht, ab 2026-08-01)

Die Qualitaetsschleife (PRs #303/#304/#305: Evals, Chat-Feedback, Freshness-Check,
Quality-Report, rebuild-one, Zeitreisenden-Modus) steht unter denselben
Schutzprinzipien wie die Pipeline:

1. Kein Worker der Qualitaetsschleife darf jemals Profile loeschen, unpublishen
   oder deren Status aendern. Evals/Freshness schreiben nur Berichte
   (eval_report, refresh, rebuild_report) in die Kandidaten-Dokumente.
2. rebuild-one ersetzt eine Live-Capsule NUR nach bestandener QA und behaelt
   twin_id und Slug bei. Ein QA-Fail laesst die Live-Capsule unangetastet.
   Diese QA-Gate-Logik darf nicht entfernt oder umgangen werden.
3. Chat-Feedback und Chat-Archive werden nur geschrieben, nie geloescht
   (chat-feedback/, chat-archives/ im Object Brain).
4. Der Zeitreisenden-Rahmen im Persona-Prompt (berichtetes Wissen statt
   erlebter Gegenwart, keine Echtzeit-Behauptungen, KI-Kennzeichnung) ist
   eine Ehrlichkeitsregel und darf ohne schriftliche Freigabe des Inhabers
   (Adam King) nicht aufgeweicht werden.
5. Produktions-Env-Variablen (Zeabur) aendern nur der Inhaber oder mit dessen
   schriftlicher Freigabe; Secrets/API-Keys traegt ausschliesslich der Inhaber ein.

## Rote Linien

- Keine Nutzerdaten, Medien, Chats oder Profile löschen
- Bestehende Funktionen nicht beschädigen; die 100 kuratierten Profile sind geschützt
- Startseiten-Design nicht ohne schriftliche Freigabe ändern (siehe Design-Freeze)
- PAUSCHALSCHUTZ (Inhaber-Anweisung 04.09.2026): Nichts darf kaputtgehen,
  gelöscht oder ohne schriftliche Freigabe des Inhabers geändert werden —
  bestehende Funktionen, Daten, Design, Einstellungen und Zugänge bleiben
  unverändert. Jede Änderung braucht einen konkreten schriftlichen Auftrag
  des Inhabers im Chat; Bug-/Sicherheits-Fixes ohne sichtbare Auswirkung
  bleiben erlaubt.
- Keine neuen Paid-Services einführen. Erlaubt sind nur: GitHub Free/Pages,
  Spaceship DNS, IDrive e2, Zeabur (Backend), OpenRouter und Groq (LLM),
  Resend (E-Mail). Alles andere braucht schriftliche Freigabe des Inhabers
  und einen Eintrag in `docs/FREE_ONLY_INFRASTRUCTURE.md`.
- Private Inhalte niemals öffentlich machen; `/private/` bleibt noindex
- Keine Secrets in Code, Logs oder Doku

## Architektur-Leitplanken

- GitHub Pages liefert alles Statische (App, Profilseiten, sitemap, robots, llms.txt,
  statisches JSON-API `/api/public/twins/`)
- IDrive e2 ist privater Objektspeicher (Object Brain) und zugleich die Persistenz;
  es gibt keine relationale Datenbank und keinen Redis in Produktion
- Zeabur (`smyst-backend`, `api.smyst.com`) macht die Rechenarbeit: API, Auth, Chat,
  TTS/ASR, Admin. Salad.com ist seit Ende Juli 2026 abgeschaltet
- Kuratierte Profildaten haben genau eine Quelle: `src/data/curated-public-twin-data.ts`
