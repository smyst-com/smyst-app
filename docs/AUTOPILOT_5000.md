# smyst.com Autopilot — 5.000 Profile/Tag (Reparatur + Absicherung, 14.09.2026)

Auftrag des Inhabers (14.09.2026, wörtlich): „Unser eigenes Modell und unser
eigener Autopilot veröffentlichen dauerhaft jeden Tag automatisch 5.000 neue
gültige Profile, vollständig ohne manuelle Bedienung."

Diese Datei dokumentiert Ursachenanalyse, Änderungen, Scheduler-Design,
Runbook (inkl. Nachhol-Verfahren für verpasste Tage) und die Schutzregeln.

---

## 1. Diagnose (14.09.2026, alle Zahlen aus Live-Logs/Store belegt)

### Ist-Zustand vor der Reparatur

Tatsächlich veröffentlichte Profile je Tag (UTC, aus dem Live-Katalog
`/api/public/twins/`, 25.971 Einträge am 14.09.):

| Tag | publiziert | | Tag | publiziert |
|---|---|---|---|---|
| 30.08. | 1.027 | | 06.09. | 1.799 |
| 31.08. | 976 | | 07.09. | 1 |
| 01.09. | 1.134 | | 08.09. | 0 |
| 02.09. | 211 | | 09.09. | 1 |
| 03.09. | 31 | | 10.09. | 0 |
| 04.09. | 41 | | 11.09. | 0 |
| 05.09. | 32 | | 12.09. | 316 |
| | | | 13.09. | 567 |

Das Ziel 5.000/Tag wurde **nie** erreicht (Bestwert 1.799). 07.–11.09.
stand die Kette fast vollständig still (Hauptursache: QA-Marker-Fehlablehnung,
bereits 12.09. per PR #760 behoben).

### Ursachenkette des Durchsatz-Einbruchs (alle live bewiesen)

1. **Store-Scan-Overhead fraßte die Shard-Läufe.** Jeder Scale-2k-Shard-Job
   lud den Publish-Duplikat-Check per Voll-Scan (26.000+ Einzel-GETs ≈
   25–40 min) und dann je Stufe bis 1.000 Dokumente über ALLE Shards, bevor
   auf den eigenen Shard gefiltert wurde. Lauf 34764593243 (13.09.,
   Log ausgewertet): 70–190 min je Shard, **davon 60–185 min reine Scans
   und nur ~15 min QA-Arbeit**. Die Selbst-Takt-Kette kam dadurch nur auf
   ~6–8 Läufe/Tag statt 20+.
2. **QA-Auswahl ohne Fairness und ohne Ende.** Dauerhaft durchfallende
   Kandidaten blieben ewig Status `generated` und belegten in jedem Lauf
   QA-Slots (Befund bereits Runde 38; der Sharded-Runner hatte die
   Fairness-Sortierung aus `run_qa_batch` nie übernommen).
3. **Ingest-Versorgung zu dünn.** Lauf 34770171289: Ingest akzeptierte
   **143 neue Kandidaten bei 10.022 Dubletten** und SPARQL-ReadTimeout
   (Kategorie Kunst fiel komplett aus). 8 Läufe × ~143 ≈ 1.100 Kandidaten/Tag
   — daraus konnte rein rechnerisch nie mehr als ~700 live gehen. Die
   18 Berufskategorien waren bei ≥5 Sitelinks weitgehend abgegrast (die
   Bekanntheits-Bremse setzte den Cursor ständig auf Seite 0 zurück).
4. **Publish-Deckel inkonsistent.** Der Watchdog-Dispatch von
   `pipeline-publish.yml` lief mit Default **2500**/Tag, während der
   Cron-Pfad bereits mit 5.000 lief — bei Erreichen des Ziels hätte der
   halbe Tagesdurchsatz am falschen Deckel hängen können.
5. **Fehldiagnose-Gefahr der alten Trichter-Zahlen:** Die Status-Marker im
   Store sind teilweise veraltet (candidate 41.771 / generated 34.357 /
   reviewed 16.454 laut Marker-LIST), dokumentenbasierte Gegenprüfung
   zeigte die Scans mussten Zehntausende Dokumente laden, um die wenigen
   echten Treffer zu finden. Marker sind und bleiben Hinweise, nicht
   Wahrheit (Design im Store-Docstring).

---

## 2. Änderungen (PR: Autopilot-5000-Reparatur)

### Backend

| Datei | Änderung |
|---|---|
| `app/integrations/candidate_store.py` | NEU `status_entries()` (QID + LastModified via LIST), `count_by_status_since()` (Tageszahlen ohne Voll-Scan), `load/save_published_summary()` (kompakter Duplikat-Check-Index). |
| `app/workers/sharded_runner.py` | NEU `select_shard_documents()`: Marker-LIST → sofort Shard-Filter → nur eigene Dokumente laden (statt 1.000 über alle Shards). QA-Fairness: ungetestete zuerst, dann nach `qa_attempts` aufsteigend. Published-Summary (1 GET) statt Voll-Scan, Fallback auf den alten Weg. |
| `app/workers/qa_candidates.py` | NEU Retry-Obergrenze `qa_attempts` (Env `QA_MAX_ATTEMPTS`, Default 5): echte QA-Fehler zählen Versuche; bei Überschreitung terminal `rejected` mit Pflichtgrund (erlaubter Übergang generated→rejected; NICHTS wird gelöscht). Provider-Ausfälle (`skipped`) zählen NICHT. |
| `app/workers/publish_profiles.py` | NEU `refresh_published_summary()`: nach JEDEM Publish-Lauf wird die kompakte `{wikidata_qid, name}`-Liste der Live-Profile erneuert (1 GET + 1 PUT je Lauf). |
| `app/workers/ingest_candidates.py` | `CATEGORIES_PER_RUN` 4→6, WDQS-Timeout 60→90 s, 3. Retry (10/30/60 s). |
| `app/ai/wikidata_candidates.py` | 17 NEUE Berufskategorien (Militaer, Hochschullehre, Recht, Fotografie, Diplomatie, Wirtschaft, Religion, Dirigieren, Operngesang, Luftfahrt, Geologie, Botanik, Psychologie, Drehbuch, Buehne, Archaeologie, Uebersetzen) — **jede QID einzeln gegen wbgetentities verifiziert** (2 Suchtreffer waren Insekt/Schiff und wurden verworfen). |
| `app/workers/pipeline_stats.py` (NEU) | Tagesstatistik: Bestand je Status + HEUTE-Zahlen (Marker-LastModified, LIST-Aggregation) + Tagesziel/Rest + Ingest-Cursor; `--save` schreibt `pipeline/stats/daily-<tag>.json`, `--watchdog` Exit 1 bei Trockenheit. |
| `scripts/pipeline_quota_check.py` (NEU) | Leichter Quoten-Check (nur boto3) für den 15-min-Watchdog — keine Backend-Installation nötig. |

### Workflows

| Workflow | Änderung |
|---|---|
| `pipeline-run.yml` | Cron 8→12 Läufe/Tag (alle 2 h), Stufen-Limits 250→**800** (Research/Risiko/Build, gemessen ~2,5 h je Kette). |
| `pipeline-scale-2k.yml` + `-lane-b.yml` | Batch je Shard 30→**50** (möglich, weil der Scan-Overhead weg ist; QA ~30 s/Kandidat). |
| `pipeline-publish.yml` | Tagesdeckel-Default 2500→**5000** (konsistent zum Cron-Pfad); NEU Tages-Statistik in jeder Run-Summary. |
| `pipeline-watchdog.yml` | NEU Quota-Eskalation (alle 15 min): liest Tagesquoten direkt aus den Status-Markern; solange < 5.000 veröffentlicht wurde und eine Lane/der Ingest >45 bzw. >90 min still ist, werden Scale-2k-A, -B und run-small nachgeschoben. Ziel erreicht → keine Eskalation. |
| `pipeline-health.yml` (NEU) | Halbstündiger read-only Health-Check: Tagesquote + Trichter + letzte Läufe in der Run-Summary; bei echtem Stillstand (Ziel offen UND alle Ketten ≥1,5–3 h still) Alarm-Issue `autopilot-stalled`, Entwarnung schließt automatisch. |

### Kapazitätsrechnung nach dem Fix (ehrlich)

- **QA:** Shard-Laufzeit jetzt ~25–35 min (50 × ~30 s QA + wenige Minuten
  Scans) → Selbst-Takt/Wachdog-Eskalation erlauben ~20–40 Läufe/Tag ×
  24 Shards × 50 Kandidaten ≈ **24.000–48.000 QA-Versuche/Tag** theoretisch;
  real durch `generated`-Nachschub begrenzt.
- **Versorgung:** Ingest-Deckel 12 × 1.000 = 12.000/Tag; 6 von 35 Kategorien
  je Lauf, frische Pools (Militär, Recht, Theologie …) haben zehntausende
  unverbrauchte Personen ≥5 Sitelinks. run-small-Kette verarbeitet
  12 × 800 = 9.600/Tag je Stufe; die Scale-2k-Lannen arbeiten dieselben
  Stufen zusätzlich mit 24 × 50 je Lauf.
- **Erwartung:** ~65–70 % QA-Pass → für 5.000 veröffentlichte Profile braucht
  es ~7.500 QA-Durchläufe und ~7.500 neue Kandidaten — beide Größen liegen
  jetzt über der Zielmarke. Erste kontrollierte Messung: siehe Abschnitt 6.

---

## 3. Scheduler-Übersicht (nach dem Fix)

| Takt | Werkzeug | Aufgabe |
|---|---|---|
| alle 2 h (12×/Tag) | `pipeline-run.yml` Cron | Ingest (1.000) → Research/Risiko/Build (je 800) → Auto-Publish (Deckel 5.000) → Pages-Deploy |
| Selbst-Takt | `pipeline-scale-2k.yml` + Lane B | QA-Kette chain't sich selbst; Crons `0 */2` und `30 1,7,13,19` redundant |
| alle 15 min | `pipeline-watchdog.yml` | Heilt fehlende Slots,Publish ≤2h-Takt, Quota-Eskalation (Lannen + Ingest) solange < 5.000/Tag |
| alle 30 min | `pipeline-health.yml` | read-only Health + Alarm-Issue bei Stillstand |
| nach jedem Publish | `pipeline-publish.yml` Steps | Pages-Deploy (nur wenn keiner aktiv) + Tages-Statistik |

Idempotenz/Robustheit (bestand + neu):

- QID-UPsert-Index + Slug-Disambiguierung + Live-Slug-Gegenprüfung →
  keine doppelten Profile, auch nicht nach Neustarts (bestand).
- Statuswechsel nur über die State Machine mit Audit-Trail; S3-PUT je
  Dokument ist atomar (bestand).
- Publish zählt sein Tageslimit aus dem eigenen Index → erneutes Anstoßen
  desselben Jobs publish't nichts doppelt (bestand, per Test gesichert).
- NEU: fehlgeschlagene QA-Versuche werden begrenzt; Concurrency-Gruppen
  serialisieren; Circuit-Breaker bricht bei Provider-Ausfall ab (bestand);
  Selbst-Takt + Watchdog + Quota-Eskalation starten jederzeit nach.

---

## 4. Verpasste Tage (Befund 14.09.2026)

Gegen das Ziel 5.000/Tag fehlen seit 02.09. kumuliert **≈ 57.000 Profile**
(Tageslücken siehe Tabelle in Abschnitt 1; 30.08.–01.09. lief das System auf
der alten 2.000/Tag-Auslegung). Kein Datenverlust: alle Kandidaten liegen im
Store, die Kette arbeitet sie mit erhöhter Kapazität kontrolliert ab.

### Nachhol-Verfahren (sicher, ohne den Tagesbetrieb zu gefährden)

Der Nachhol-Lauf nutzt GENAU dieselbe Kette mit denselben Gates (QA,
Duplikat-Schutz, Tageslimit) — nur mit größerenLimits:

```bash
# 1) Mehr Nachschub + Verarbeitung (zb +2.000 je Stufe):
gh workflow run pipeline-run.yml -f mode=run-batch -f batch_limit=2000 \
  -f ingest_limit=3000 -f approved_by=smyst247@gmail.com

# 2) QA-Takt an (Selbst-Kette + Watchdog eskalieren automatisch);
#    optional zusaetzlich explizit:
gh workflow run pipeline-scale-2k.yml     -f batch_size_per_shard=60
gh workflow run pipeline-scale-2k-lane-b.yml -f batch_size_per_shard=60

# 3) Veröffentlichung mit erhöhtem Tagesdeckel (z. B. 10.000 an einem Tag):
gh workflow run pipeline-publish.yml -f publish_limit=10000
```

Eigenschaften: idempotent (keine Dubletten, QID-Gate), keine Löschung,
Concurrency-Gruppen verhindern Kollisionen, der normale Tagesrhythmus läuft
unberührt weiter (Queue statt Cancel).

---

## 5. Schutz (Funktions-Freeze)

Der produktionskritische Autopilot ist in `AGENTS.md` (Abschnitt
„Funktions-Freeze Autopilot 5.000/Tag") geschützt. Ohne schriftliche
Freigabe des Inhabers (Adam King) dürfen insbesondere nicht gelöscht,
deaktiviert, umgebaut oder aus dem Scheduler entfernt werden:

- `pipeline-scale-2k.yml`, `pipeline-scale-2k-lane-b.yml` (Selbst-Takt-Kette),
  `pipeline-run.yml` (Cron-Takt), `pipeline-publish.yml` (Auto-Publish inkl.
  Deckel 5.000), `pipeline-watchdog.yml` (Quota-Eskalation),
  `pipeline-health.yml` (Health/Alarm),
- `app/workers/sharded_runner.py`, `qa_candidates.py` (QA-Gate + Retry-Cap),
  `publish_profiles.py`, `ingest_candidates.py`, `pipeline_stats.py`,
  `candidate_store.py` (Marker-Auswahl + Summary),
- `scripts/pipeline_quota_check.py`.

Vor jeder Änderung an diesen Dateien: Backup-Branch bzw. der PR-Vergleich
gegen `main` ist Pflicht (Rollback = `git revert` des Merge-Commits).
Die QA-Kriterien (KI-Kennzeichnung, Zeitreisenden-Rahmen) werden durch
diesen Auftrag NICHT verändert — der Retry-Cap lehnt nur wiederholt
echt gescheiterte Kandidaten terminal ab (dokumentiert, umkehrbar).

---

## 6. Live-Nachweis nach Deploy

(Ergebnisse werden nach dem Merge hier und in Memory_Bank.md nachgetragen:
erste Läufe mit neuer Auswahl, Shard-Laufzeiten, Publish-Zahlen, Tagesquote.)
