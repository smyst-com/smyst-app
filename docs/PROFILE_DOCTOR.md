# Profil-Doktor — Bestands-Qualität 24/7 (Profil-Autopilot, 15.09.2026)

Auftrag des Inhabers (15.09.2026): Der Autopilot soll mit dem eigenen
KI-Modell dauerhaft 24/7 im Hintergrund arbeiten und **jedes Profil
regelmäßig einzeln prüfen** — Geburts-/Sterbeorte ergänzen, Geburts-/
Sterbedaten, Biografie, Beruf und Lebensereignisse auf Vollständigkeit und
Qualität kontrollieren, Fehler, Widersprüche und Dubletten erkennen,
Änderungen protokollieren und nichts Beschädigen.

Der Autopilot (pipeline-*) veröffentlicht täglich NEUE Profile; der
Profil-Doktor ist sein Gegenstück für den BESTAND.

---

## 1. Ist-Befund (15.09.2026, Live-Katalog, 27.218 Profile)

| Bestand | Zahl | Ursache |
|---|---|---|
| Pipeline-Profile ohne Geburtsort | 405 | Wikidata hat kein P19 — der 12×/täglich laufende Orts-Backfill kann nichts setzen (Beispiel: john-george-taylor, Q15130138) |
| Pipeline-Profile ohne Sterbeort | 950 | wie oben (P20 fehlt) |
| Fake-„01.01."-Lebensdaten | 3.593 Geburts-/1.995 Sterbedaten | Wikidata kennt nur das Jahr; die Anzeige behauptet Tag-Präzision |
| Kuratierte 100 Profile | vollständig | 4-Zeilen-Format über `LIFE_PLACES` (src/data/life-places.ts) abgedeckt |

## 2. Was der Doktor je Profil tut

Reihenfolge der Quellen — strikt gesichert, nie erfunden:

1. **Vollständigkeits-Audit** (Publish-Index + Wikidata-Snapshot): fehlende
   Orte, Daten, Labels, Kategorie, zu kurze Beschreibung.
2. **Fills aus Wikidata-Snapshots** (gleiche Regeln wie `backfill_places`):
   P19/P20 → „Stadt, Land", P569/P570 → ISO-Daten. NUR leere Felder.
3. **Ehrliche Labels:** Jahres-/Dekaden-/Monats-Präzision wird als
   „1859" / „ca. 1859" / „03.1859" angezeigt statt „01.01.1859". Nur das
   Anzeige-Label, `birth_date`/`death_date` (ISO) bleiben unverändert.
4. **Eigenes Modell (smyst-1.1):** Hat Wikidata keinen Ort, extrahiert das
   Modell Geburts-/Sterbeort aus den gespeicherten Wikipedia-Texten.
   Anti-Halluzinations-Gate: Der Ortsname muss wortgrenzgenau im Quelltext
   stehen; ein Land, das nicht im Text steht, wird abgeschnitten. Max.
   2 Versuche je Profil (Kostenbremse).
5. **Widersprüche** (Tod vor Geburt, Alter > 122 Jahre) und **Dubletten**
   (gleicher Name + Geburtsjahr, verschiedene QIDs): NUR Bericht — nie
   Statusänderung, nie Löschen, nie Unpublish.
6. **Anreicherungs-Flag:** zu kurze Beschreibung → `needs_rebuild`-Liste im
   Bericht (Futter für den QA-gegateen `rebuild-one`, keine Automatik).
7. **Selbsttest nach jedem Schreiben:** profile.json neu lesen, slug/name/
   Felder gegenprüfen; bei Abweichung Fehler + Überspringen des Index-Write.
8. **Chat-Rauchprobe** je Lauf gegen den eigenen llama-server.

## 3. Rotation und 24/7-Betrieb

- Ledger: `pipeline/stats/doctor-rotation.json` (qid → checked_at/attempts).
  Nie geprüfte Profile zuerst, dann älteste Prüfung. Fehlgeschlagene Profile
  werden nicht markiert und beim nächsten Lauf erneut versucht.
- Workflow `.github/workflows/profile-doctor.yml`: **stündlich** (37 * * * *),
  je Lauf 250 Profile → voller Umlauf über den Bestand (~27.000) in ~4,5
  Tagen. Extraktions-Budget 40/Lauf: der sichtbare Fehlbestand (950) schrumpft
  in ~1 Tag, danach bleibt nur die normale Rotation.
- `keep-takt` verkettet Läufe, falls GitHub-Crons ausfallen (bewährtes
  Muster aus pipeline-scale-2k, mit 30-min-Fehler-Cooldown).
- Nach Änderungen: Pages-Deploy (Ping-Pong-Guard), dann Nachprüfung —
  `gh run watch` des Pages-Laufs, geänderte `/t/<slug>/`-Seiten und
  `/api/public/twins/<slug>/` live abrufen, `providers?ping=true` muss
  smyst_llm ok:true liefern (Pflicht-Smoke).

## 4. Protokollierung

- Changelog je Lauf in IDrive e2: `pipeline/changelogs/<tag>-profile-doctor.json`
- Letzter Bericht: `pipeline/stats/profile-doctor-latest.json`
- Run-Summary in GitHub Actions (Geprüft/Korrigiert/Extraktionen/Widersprüche/
  Dubletten/Fehler/Chat-Smoke)

## 5. Manueller Betrieb

```bash
gh workflow run profile-doctor.yml                        # Normalrotation
gh workflow run profile-doctor.yml -f dry_run=true        # Vorschau (schreibt nichts)
gh workflow run profile-doctor.yml -f only_incomplete=true -f limit=400  # Nachhol-Modus
gh workflow run profile-doctor.yml -f extraction_budget=80               # mehr Extraktion
```

Lokal (mit e2-Zugang, Python 3.12):
```bash
cd backend
python -m app.workers.profile_doctor --enabled --dry-run
python -m app.workers.profile_doctor --enabled --limit 250
```

## 6. Schutzregeln

- Der Doktor schreibt ausschließlich diese Felder: `birth_place`,
  `death_place`, `birth_date`, `death_date`, `birth_label`, `death_label`.
  Fills nur auf LEERE Felder; Label-Ersetzungen nur gegen denselben
  Altwert (feldweiser Konflikt-Schutz gegen den parallel laufenden
  Publish-/Backfill-Betrieb auf demselben Index).
- Nie löschen, nie unpublishen, nie Status ändern, nie QA-Kriterien
  anfassen (Qualitätsschleife-Schutz gilt unverändert).
- Eigenmodell-Extraktion ohne Beleg im Quelltext wird verworfen — das
  Modell kann hier nichts Falsches veröffentlichen.
- Die eingefrorenen Autopilot-Dateien (AGENTS.md „Funktions-Freeze
  Autopilot 5.000/Tag") werden NICHT berührt — der Doktor ist rein additiv.
- Rollback: `git revert` des Merge-Commits; der Scheduler kennt den
  Doktor danach nicht mehr (keine Daten-Reste im Store außer den
  ergänzten Feldern und Berichten).
