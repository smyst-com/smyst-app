# smyst language autopilot — Runbook

**Auftrag:** Inhaber 24.09.2026 (vollständige Mehrsprachigkeit, 24/7-Sprach-
Autopilot, Icon-Tests, Live-Verifikation, Änderungsschutz).

## Was der Autopilot ist

Ein dauerhaft verfügbarer Hintergrunddienst, der **Profil × Sprache × Funktion
× Plattform** systematisch gegen das echte System prüft und Ergebnisse
nachweisbar im Object Brain (IDrive e2) festhält. Er ist **kein neues System**,
sondern in die vorhandene Autopilot-Architektur integriert (GitHub-Actions-
Zeitpläne + stateless Python-Worker + e2-Persistenz + Admin-API).

## Komponenten

| Baustein | Ort |
|----------|-----|
| Zeitplan (24/7) | `.github/workflows/language-autopilot.yml` (cron alle 6 h + manuell) |
| Worker | `backend/app/workers/language_autopilot.py` |
| Testmatrix-/Status-Speicher | `backend/app/integrations/language_report_store.py` → e2 `language-autopilot/` |
| Admin-API | `backend/app/api/v1/routes/admin_language.py` (`/api/admin/language/autopilot*`) |
| Admin-UI | smyst.com/admin → „Überblick → 1.3 Sprachen" |
| Icon-E2E | `frontend/e2e/language-icons.spec.ts` (Playwright, Desktop + Mobil) |
| Sprachregister | `backend/app/ai/language_register.py` + `docs/LANGUAGE_REGISTER.md` |

## Lastkontrolle (keine ungebremsten Dauerschleifen)

- Standardlimit **16 Tests pro Lauf** (Workflow-Input `limit`, max. 8 bei
  manuellen Admin-Laeufen), 2 s Pause zwischen Anfragen, sequenziell.
- Harte Timeouts: 25 min pro Workflow-Job, 90 s pro Chat-Test.
- 1 Wiederholung auf HTTP-Ebene (Router), keine Endlos-Retrys.
- `concurrency: language-autopilot` — nie zwei Laeufe parallel.
- **Produktionschats haben Vorrang**: geringe Frequenz, Gast-Tests einzeln;
  der Chat-Priority-Gate (PR #853) bleibt unberuehrt.
- Aus-Zustand: ein deaktivierter Lauf schreibt nur ein Herzschlag und testet nichts.

## Testverifikation (Messen, nicht Behaupten)

- **Text:** echte Chat-Antwort in Zielsprache, geprueft mit derselben
  Spracherkennung wie im Chat (`detect_message_language`) PLUS
  Verweigerungs-Muster („ich kann kein X sprechen" in de/en/tr/ku/ckb) PLUS
  Mindestlaenge. Latenz + Modell (`mode`) werden festgehalten.
- **TTS:** Stimmenliste + Synthese-Smoke (HTTP 200, WAV-Header, > 1000 Bytes).
- **ASR:** Sprachfaehigkeit `/api/asr/status`; Audioroundtrip nur mit TTS-Stimme.
- **Icons:** Playwright gegen das echte Frontend-Bundle (Preview-Server),
  5 Icon-Gruppen A–F, Desktop- und Mobil-Projekt.

## Abdeckung und Berichte

- Rotation: jeder Lauf nimmt die **am laengsten nicht geprueften**
  Kombinationen, P0 (de/tr/en/ku/ckb) zuerst. Neue Profile (Autopilot-
  Publikationen) und neue Register-Sprachen fallen automatisch in den Plan.
- Persistenz: `language-autopilot/matrix/<profil>__<sprache>__<funktion>__<plattform>.json`
  mit lastTestedAt/result/attempts/history; `status.json` (Ein/Aus, Herzschlag,
  Laufzaehler, Audit der Umschaltungen); `reports/<datum>.json`.
- Admin-UI zeigt: Ein/Aus + „Jetzt testen", Lebenszeichen, Sprachen
  registriert/bestanden/ungeprueft (mit vollem Nenner), Matrix-Zaehler,
  Fehlerliste mit Repro-Schritten, Latenz ø/max.
- **Eine Stichprobe gilt nie als Beweis fuer alle** — der Bericht nennt immer
  den vollen Nenner und die ungepruefte Restmenge.

## Sprachrouting (Ursache-Fix des Live-Fehlers)

Ursache 24.09. (Screenshot: Atatuerk tuerkisch gefragt, deutsche Antwort +
„ich kann kein Türkisch"): Frontend-Erkennung versagte bei ASCII-Tuerkisch,
Prompt zwang auf UI-Sprache Deutsch, das kleine smyst-1.1 leugnete die
Faehigkeit. Fix in drei Schichten:

1. **Serverseitige Aufloesung** (`app/ai/language_detection.py`):
   expliziter Sprachwunsch > erkannte Nachrichtensprache (Schrift + Marker,
   inkl. Kurmandschi/Sorani) > UI-Sprache. Gilt fuer /messages und /stream.
2. **Sprachbewusstes Modell-Routing** (`llm_router.py`): Deutsch/Englisch
   bleibt exakt smyst_llm-zuerst (Funktions-Freeze unberuehrt); andere
   Sprachen fuehren die bewaehrte Cloud-Kette (OpenRouter/Groq) an,
   smyst_llm bleibt Not-Fallback vor dem lokalen Ende. Env:
   `SMYST_LLM_LANGUAGES` (Default `de,en`) — ohne Redeploy umkehrbar.
3. **Prompt-Haertung**: bei erkanntem/expplizitem Sprachwunsch steht die
   Zielsprache als hoechste Prioritaet im Prompt UND im Recency-Anker;
   „never claim you can only speak one language" bleibt.

## Betrieb

- **Einschalten/ausschalten:** Admin-UI (Sprachen-Sektion) oder
  `POST /api/admin/language/autopilot/toggle {"enabled": bool}`.
- **Einzeltest:** Admin-UI „Jetzt testen" (Profil/Sprache/Funktion wählbar);
  veraendert den Ein-/Aus-Zustand nicht (Auftrag Abschnitt 7).
- **Manueller Workflow-Lauf:** Actions → Language Autopilot → Run workflow
  (Inputs: limit, profile, language, force).
- **Monitoring:** Admin-Sektion 1.3; GitHub-Actions-Historie; e2-Objekte.

## Rollback

`git revert` des PR-Merges setzt Code zurueck; das Routing ist zusaetzlich
per Env `SMYST_LLM_LANGUAGES=de,en,tr,ku,ckb,...` steuerbar, ohne Code.
Matrix/Berichte in e2 bleiben unberuehrt (nur anhängend, nie löschend).
