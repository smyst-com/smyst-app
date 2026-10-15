# smyst.com — A-bis-Z-Prüfung 2026-10-10

> **KORREKTUR-NACHTRAG (gleicher Tag, nach Umsetzung):** Vier Diagnosen dieses
> Berichts haben sich bei der Umsetzung als FEHLDIAGNOSEN erwiesen und sind in
> docs/ABSCHLUSS_100PROZENT_2026-10-10.md korrigiert: (a) Sitemap ist
> VOLLSTÄNDIG — robots.txt listet sitemap-pipeline-1..10.xml (94.011 URLs ≥
> 93.654 Profile). (b) Profilzahl 31.226→93.654 = progressives Chunk-Laden.
> (c) /health existiert als /api/v1/health/{live,ready,production}.
> (d) Model-Keep-Alive „cancelled" = gewolltes Ketten-Muster. Die übrigen
> Punkte (Sicherheit, Guardian-Kanal, Chat-Degraded) waren echt und sind
> behoben (PRs #916/#917/#920/#921).

Geprüft: Website + API live, Chat-Smoke (Pflicht), Build-Gate, 3 Guards,
Abhängigkeiten, GitHub-Workflows/Issues, Profil-/SEO-Stand, Codequalität.

## Was funktioniert (Beweise)

- smyst.com: HTTP 200 in 0,22 s; robots.txt, llms.txt (200), sitemap.xml OK.
- TTS: /api/tts/voices 200, 19 Piper-Stimmen (de/en/tr) — Pflicht-Smoke grün.
- Profilseite /t/albert-einstein: lädt sauber, Layout ohne Fehler (Screenshot).
- Website-Chat-Flow (Pflicht-Smoke): türkische Frage → echte türkische
  smyst_llm-Antwort im Stream, KEINE Degraded-Meldung (Screenshot vorliegen).
- Build-Gate: grün (Retry, 1 m 27 s; erster Lauf scheiterte nur an
  Google-Drive-Sync ENOTEMPTY, kein Codefehler).
- Guards: profile-image-design, profile-memory-contract, validate-foundation —
  alle 3 grün.
- Profile: 93.654 live (Wachstum von 55.511 am 28.09.) — Autopilot arbeitet.
- Pipeline: Lane-B läuft; PR #903 (urllib3, 2× HIGH) bereits in main gemerged.

## Verbesserungsliste (Priorität wie in AGENTS.md: Sicherheit zuerst)

### P1 — Sicherheit

1. **10 Schwachstellen in Produktions-npm-Paketen** (Issue #913 offen):
   2× CRITICAL in @capacitor/android + @capacitor/ios 8.0.0–8.3.4
   (GHSA-rvm3-566m-v7fv: Remote-Content am App-Origin über internen Proxy),
   HIGH in braces + source-map-js (DoS), moderate in postcss-selector-parser.
   `npm audit fix` behebt capacitor + source-map-js ohne Breaking;
   braces/postcss bräuchten Major-Update. Native App-Builds betroffen.
2. **App-Guardian-Alarmierung TOT**: Issue #808 hat >2.500 Kommentare →
   GitHub verweigert addComment → Guardian-Workflow schlägt bei jedem Alarm
   fehl (heute 3× failure: 05:02/05:09/05:13 UTC). Alarm-Kanal auf
   Tages-Rotation (neues Issue pro Tag) umstellen. Warum der Guardian
   alamiert, ist danach aus dem Check-Log zu klären.
3. Offene Security-Ampeln abarbeiten: #895 (RED, 06.10.), #902 (ORANGE),
   #628 (möglicher Secret-Leak, seit 31.08. offen).
4. Disaster-Recovery-Test fehlgeschlagen (#819, seit 17.09. offen) —
   wiederholen und schließen.

### P2 — Zuverlässigkeit

5. **Non-Stream-Chat-API degraded**: /api/v1/chat/messages ohne
   Website-Session liefert nach ~31 s die Degraded-Meldung (2× kalt und warm
   reproduziert). smyst_llm reißt das 30-s-Complete-Deckel; nur der
   Website-Stream (90-s-Budget) kommt durch. Regression gegenüber 28.09.
   Fix-Richtung: Complete-Deckel anheben oder Non-Stream intern auf
   Stream umbauen.
6. **Antwortqualität Nicht-DE/EN schwach**: türkische Testantwort war
   grammatikalisch verstümmelt („Ben Albrecht Einsteinimizi düşünmek için
   bir yere gönderdi"). QA-Gate prüft primär deutsch — türkische
   Stichproben ins Monats-Review (model-sample-review) aufnehmen.
7. Backend-RAM: 8-GB-Box bei 93 %, Flapping (#886) — Entlastung nur per
   Server-Upgrade (Inhaber-Entscheidung, kein Code).
8. Model-Keep-Alive-Läufe fallen wiederholt auf „cancelled" nach ~3 m 24 s
   (Timeout-Muster wie Publish-Vorfall 02.10.) — Deckel prüfen.
9. Publish-Rückstand (02.10.): 45-Min-Nachlege-Automatik läuft —
   beobachten, ob „RÜCKSTAND LEER" gemeldet wird.

### P3 — SEO / Wachstum

10. **Sitemap deckt <2 % der Profile**: 1.517 URLs live, aber 93.654 Profile.
    Sitemap-Index (Segmente à 50.000) einführen, sonst findet Google die
    Profilseiten nicht.
11. Angezeigte Profilzahl inkonsistent: UI zeigt „Alle 31226 Profile
    ansehen" (pool.length), API hat 93.654 — Quelle/kGovernance klären.
12. 10 offene Dependabot-PRs (teils Major: tailwindcss 4, react-dom,
    checkout v7) — bewerten und mergen oder schließen.

### P4 — Codequalität / Betrieb

13. src/App.tsx hat 12.539 Zeilen (Monolith). Schrittweise aufteilen —
    nur ohne sichtbare Änderung (Design-/Funktions-Freeze beachten,
    geschützte Marker erhalten).
14. Lokale Build-Falle Google Drive: vite-emptyDir ENOTEMPTY, wenn Drive
    synchronisiert. Künftig dist vor Build löschen oder Repo-Ordner aus
    Drive-Sync nehmen; CI (GitHub) unbeeinflusst.
15. /health-Endpunkt fehlt (404) — health-Route ergänzen erleichtert
    externes Monitoring (Guardian prüft heute indirekt).
16. Fallback-Provider tot ohne Guthaben (OpenRouter :free antwortet nicht,
   GROQ_API_KEY fehlt) — Keys/Credits nur Inhaber (28.09.).
17. DPO wartet auf 30 echte Feedbackpaare (0 Daumen-Hoch/Runter bisher) —
    Feedback-Nutzung wäre förderbar; sichtbare UI-Änderungen brauchen
    Inhaber-Freigabe.

## Rollback/Einschätzung

Analyse ohne Änderungen am Code. Alle Punkte mit Issue-Nummern sind im
Repo referenziert; Fixes laufen über Feature-Branch + PR gemäß Branch-Regeln.
