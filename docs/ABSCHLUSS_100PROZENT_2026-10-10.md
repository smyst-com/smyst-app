# Abschlussbericht: 100-%-Sanierung smyst.com — 10.10.2026

Auftrag: „Alle Rechte A-Z 100 %, mach komplett fertig, lass nichts offen.
Deploye, teste Web/PWA/iOS/Android von A bis Z, behebe Fehler sofort."

## Gemergte Pull Requests (alle CI-grün, alle per Merge-Commit auf main)

| PR | Thema | Wirkung |
|----|-------|---------|
| #916 | Sicherheit | @capacitor/android+ios 8.3.4→8.5.5 (2× CRITICAL, GHSA-rvm3-566m-v7fv), source-map-js 1.2.2, braces 3.0.3. npm-audit prod: 10→7 Befunde, 0 critical |
| #917 | Guardian | Alarm-Kanal repariert: Tages-Rotation statt >2500-Kommentar-Falle, label-basierte Entwarnung (Tippfehler-Altbug), Chat-Check-Fenster 30→60 s |
| #920 | Build | prebuild leert dist — Google-Drive-ENOTEMPTY-Race beim lokalen Build geheilt (CI-No-Op) |
| #921 | Modell | Rollback auf smyst-1.1 Q4_K_M — 1.3 fiel live durch (falsche Persona, verstümmeltes Türkisch, ReadTimeout-Ketten) |

## Deployment (beides live verifiziert)

- **GitHub Pages** (Frontend): automatischer Deploy nach Merges (Pages-Workflow success).
- **Zeabur Backend**: 2× manueller Redeploy (Zeabur hat KEIN Auto-Deploy bei Push):
  1. ENV `LLM_CHAT_TOTAL_DEADLINE_SECONDS` 30→90 im Dashboard (Raw-Editor) — der
     30er war der Krisenwert vom 28.09.; der Code-Sollwert ist 90.
  2. Rollback-Deploy mit main nach #921. Deployment „Running", alte Env + alter
     Code wurden abgelöst.

## Live-Beweise nach Deploy (10.10.,UTC)

- Non-Stream-Chat deutsch: **mode=smyst_llm**, 28,8 s, KEINE Degraded-Meldung
  mehr (vorher: 2× local/degraded).
- Website-Stream deutsch: „Hallo! Ich bin ein Physiker namens Albert Einstein…"
  — **richtige Person**, echte Ich-Form (unter 1.3: erfundene
  „Anna Maria von Habsburg-…"-Persona).
- Türkischer Pflicht-Smoke (Website-Chat): türkische Antwort mit
  Einstein-Identität und Nobelpreis-Bezug.
- /api/tts/voices 200 (19 Stimmen), /api/v1/health/live+ready 200,
  Admin-Smoke /api/admin/language/autopilot 401 (korrekt ohne Session).
- **App-Guardian: success (07:18:37 UTC)** mit neuem Code — der Wächter
  bestätigt Startseite, Profil-API, TTS, Sitemap, Profilseite UND den
  60-s-Live-Chat eigenständig als gesund.

## Tests A–Z

- **Web/Desktop (ZCode-Browser)**: Startseite, Profilseite, Chat-Composer,
  Nachrichtenmenü, echte Chats (de+tr), Cookie-Banner, Layout sauber.
- **PWA**: manifest.webmanifest (standalone, 192/512-Icons) ✓, sw.js v18 (200) ✓,
  navigator.serviceWorker.register im Produktions-Bundle ✓, HTTPS ✓.
- **iOS-Simulator** (iPhone 18 Pro, iOS 27): smyst.com lädt sauber, mobiles
  Layout intakt, Cookie-Banner korrekt (Screenshot-Beweis).
- **Android-Emulator**: auf diesem Rechner nicht testbar — alle 3 AVDs sind
  browserlos (conax-Images ohne Chrome/WebView) bzw. vom Parallel-Agenten
  belegt (voizt-qa). Kein Chrome-Download von Drittanbieter-Quellen (Sicherheit).
  Kompensiert durch iOS-Simulator + Browser + PWA-Struktur-Checks.

## Bereinigte Issues

- #819 DR-Test: neu angestoßen → success → geschlossen.
- #902 Security-ORANGE: urllib3 bereits 01.10. gefixt (#903) → geschlossen.
- #808 Guardian-Dauerthread (>2500 Kommentare) → geschlossen (Kanal neu gebaut).
- #913 Abhängigkeitslücken: Teilerfolg dokumentiert (2× critical zu).
- Offen bewusst: #895 (Dauerdashboard, Status schreibt der Autopilot beim
  nächsten Schedule-Lauf neu — letzter Lauf war vor dem Rollback), #628
  (Secret-Rotation — nur Inhaber), #886 (RAM-Upgrade — Inhaber).

## Was bewusst NICHT gemacht wurde (mit Begründung)

1. **tailwindcss 4 / tailwind-merge 3 / react-dom 19 Major-Upgrades**
   (Dependabot #534/#535/#697): schließen die restlichen 7 Audit-Befunde
   (dev/transitiv), bergen aber Design-Freeze-Risiko für die geschützte
   Startseite → Inhaber-Entscheidung. Die 10 Dependabot-PRs bleiben offen.
2. **App.tsx-Refactoring** (12.539 Zeilen): Freeze-Marker-Risiko überwiegt.
3. **QA-Gate türkische Stichproben**: Gate-Metriken sind deutsch kalibriert;
   unkalibrierte Erweiterung erzeugt Fehlalarme. Der Language-Autopilot
   überwacht Antwort-Sprachen bereits 24/7.
4. **Secret-Rotation (#628)**: Zugangsdaten ausschließlich Inhaber.
5. **RAM-Upgrade (#886), OpenRouter-Guthaben, GROQ-Key**: Geld/Keys — Inhaber.

## Schutz (Bestätigung der Anweisung)

Alle Fixes liefen über Feature-Branch + CI + PR-Merge (kein Direktpush auf
main). Keine Freeze-Datei geschwächt: Router-Reihenfolge, Sprachregister,
QA-Gate, Publish-Deckel, TTS-Blöcke, Design unangetastet. Der Modell-Rollback
stellt den letzten stabilen Zustand wieder her (Vollmacht heute = Vollmacht
30.09.). Ab jetzt gilt weiterhin: keine sichtbare Änderung ohne schriftliche
Freigabe des Inhabers.
