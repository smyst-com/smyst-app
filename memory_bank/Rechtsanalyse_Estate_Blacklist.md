# smyst.com — Rechtliche Risiko-Analyse: Historische KI-Profile & Estate-Blacklist

Stand: 2026-07-04 · Erstellt vom Betreuungs-Agenten auf Anweisung von Adam King.

**WICHTIGER HINWEIS:** Dieses Dokument ist eine strukturierte Risiko-Analyse zur Entscheidungsunterstützung, KEINE Rechtsberatung. Vor Skalierung über das Tageslimit (5/Tag) hinaus und vor Monetarisierung der Profile wird eine einmalige Prüfung durch eine Kanzlei (Medien-/IP-Recht) empfohlen.

## 1. Was smyst.com heute macht (Ist-Zustand, risikominimierend)

- Nur VERSTORBENE historische Personen (Sterbejahr-Cutoff im Ingest; Sterbejahr > 1955 nur mit works=restricted).
- Klare KI-Kennzeichnung auf jeder Profilseite und in jeder Chat-Antwort ("KI-Rekonstruktion auf Basis öffentlicher Quellen; nicht die echte Person") — QA erzwingt sie (Chat-Smoke-Test: Täuschungsformeln verboten, Fangfrage muss zurückgewiesen werden).
- Nur öffentlich dokumentiertes Wissen (Wikidata/Wikipedia, Quellen mit Snapshots archiviert); keine erfundenen biografischen Fakten (QA-Konsistenz-Checks).
- Bilder nur mit von der Commons-API bestätigter freier Lizenz (PD/CC0/CC-BY*); unfreie Bilder werden verworfen, Profil bekommt kein Bild statt riskantes Bild; imageCredit-Feld vorhanden.
- Vier-Stufen-Risiko-Check: Werke (Urheberrecht), Bild (Lizenz), Publicity (estate_blacklist), Ethik (Watchlist). Nur publicity/ethics können ablehnen.
- Audit-Trail: jede Veröffentlichung mit approved_by, Versionen, Unpublish-Rollback ohne Datenlöschung.

Diese Architektur ist bereits deutlich vorsichtiger als die meisten vergleichbaren Angebote (Character.ai u.a.).

## 2. Rechtsgebiete und Risikobewertung

### 2.1 Postmortales Persönlichkeitsrecht (Deutschland — Hauptrisiko-Jurisdiktion, da smyst.com deutschsprachig)

- Ideeller Schutz (Menschenwürde, BVerfG "Mephisto"): zeitlich unbegrenzt, aber nur gegen grobe Entstellung/Herabwürdigung. Risiko für smyst.com: NIEDRIG, solange Profile respektvoll, quellenbasiert und gekennzeichnet sind. Genau das erzwingt die QA. Restrisiko: Chat-Antworten, die dem Verstorbenen Aussagen "in den Mund legen", die als entstellend empfunden werden könnten → mitigiert durch Profilregel "keine Sätze wie 'X würde sagen'", Nach-Tod-Einordnung Pflicht.
- Vermögenswerter Schutz (BGH "Marlene Dietrich"): 10 Jahre nach Tod, danach erloschen. Alle Pipeline-Kandidaten sind länger tot (Cutoff). Risiko: SEHR NIEDRIG für Personen †vor 2016.
- Empfehlung: Cutoff nie unter "Tod + 10 Jahre" senken (aktuell weit darüber); für Personen †nach ~1990 zusätzlich manuelle Sichtung.

### 2.2 US Right of Publicity (relevant, weil smyst.com global erreichbar ist)

- Bundesstaatlich, sehr uneinheitlich: Indiana/Oklahoma 100 Jahre postmortal, Kalifornien 70 Jahre (nur mit Registrierung), Tennessee (Elvis Act 2024: ausdrücklich auch Stimme/KI), New York 40 Jahre (erst seit 2021, nicht rückwirkend), UK: kein postmortales Publicity Right.
- Durchsetzer sind fast ausschließlich kommerzielle Nachlassverwerter: CMG Worldwide, Authentic Brands Group (ABG), Greenlight (Einstein/HUJ). GENAU DAS deckt die estate_blacklist (51 Einträge, Quelle: CMG-Client-List 2025 + ABG-Recherche) ab — das ist der richtige Ansatz.
- Präzedenz zugunsten smyst.com: HUJ v. GM (C.D. Cal. 2012, Einstein: max. 50 Jahre nach NJ-Recht, abgelaufen); Comedy III v. Saderup (transformative use); informative/edukative Nutzung mit Quellen ist kein "Merchandising".
- Risiko: NIEDRIG-MITTEL. Hauptrisiko ist nicht Verlieren vor Gericht, sondern Abmahn-/Belästigungskosten durch aggressive Verwerter. Blacklist-block für CMG/ABG-Klienten beibehalten; James Dean (Indiana, 100 J.) bleibt korrekt geblockt.
- Empfehlung: Bei manual_review-Fällen (z.B. Gandhi: CMG listet ihn; Matisse: Succession Matisse aktiv bei BILDRECHTEN) dokumentierten Kurzcheck im Risk-Report ablegen: Wer verwertet? Bis wann läuft Schutz? Nur informativ-edukative Darstellung?

### 2.3 Urheberrecht an Werken (Zitate, Texte, Bilder der Werke)

- Regel works=restricted (Sterbejahr > Cutoff → nur Paraphrase, Zitatverbot in der Capsule) entspricht §51 UrhG-Vorsicht und 70-Jahre-p.m.a.-Frist (DE/EU) bzw. US 95-Jahre-Regeln. Risiko: NIEDRIG.
- ACHTUNG Matisse (†1954): Werke sind in Frankreich/EU noch bis Ende 2024+Kriegsverlängerungen bzw. je nach Land geschützt gewesen; einzelne Werke können in einigen Jurisdiktionen noch geschützt sein. Das PROFILBILD (Foto von 1933, PD-geprüft) ist ok; im Chat KEINE Bildreproduktionen seiner Werke anbieten — Capsule-Regel prüfen (works=pass wurde gesetzt, weil †1954 > Cutoff-Grenze knapp; Empfehlung: für Künstler †nach 1950 works=restricted erzwingen).
- Empfehlung (konkret umsetzbar): Risk-Check-Regel ergänzen: Kategorie Kunst + Sterbejahr > 1950 → works=restricted.

### 2.4 Bildrechte (Fotos)

- Commons Special:FilePath + LicenseShortName-Prüfung (PD/CC0/CC-BY*) ist solide. Restrisiko: falsch getaggte Commons-Dateien (kommt vor). Mitigation vorhanden: imageCredit + Quelle; bei Beschwerde sofortiges Unpublish möglich.
- CC-BY verlangt Namensnennung: imageCredit nennt aktuell "Wikimedia Commons (lizenzgeprüft, PD/CC)" pauschal. Empfehlung: bei CC-BY-Dateien Urheber + Lizenz konkret ins imageCredit-Feld übernehmen (Feld existiert, nur Befüllung erweitern). Prioritär vor Skalierung.

### 2.5 DSGVO / Datenschutz

- DSGVO gilt NICHT für Verstorbene (ErwG 27). Risiko: SEHR NIEDRIG. Ausnahme: Erwähnung lebender Angehöriger in Profiltexten vermeiden — Quellen sind Wikipedia-Summaries, Risiko gering; QA könnte optional auf Namen Lebender im Profiltext prüfen.

### 2.6 KI-Kennzeichnung / EU AI Act

- Art. 50 AI Act (Transparenz bei KI-Systemen, die mit Menschen interagieren, und bei Deepfakes): smyst.com kennzeichnet jede Seite und jede Antwort als KI — Pflicht ist erfüllt und im QA-Gate verankert. Risiko: NIEDRIG. Empfehlung: Kennzeichnung nie abschwächen; sie ist gleichzeitig die stärkste Verteidigung gegen Publicity-/Täuschungsvorwürfe.
- Stimmen: Aktuell keine Voice-Klone realer Personen (nur synthetische Piper-Stimmen) — beibehalten. Tennessee ELVIS Act u.ä. machen Stimm-Imitationen zum höchsten Risikofeld. NIEMALS "historische Stimme nachbilden" ohne Einzelfreigabe + Rechtsprüfung.

### 2.7 Ethik-Watchlist

- block für NS-/Massenverbrecher + religiös hochsensible Figuren (Mohammed), manual_review für Jesus/Moses/Buddha: angemessen, deckt § 130 StGB-Risiken (Volksverhetzung) und Plattform-Reputationsrisiken ab. Beibehalten.

## 3. Gesamtbewertung

| Bereich | Risiko | Trend bei Skalierung |
|---|---|---|
| Ideelles Persönlichkeitsrecht DE | niedrig | stabil (QA-Gate) |
| US Publicity (Blacklist-Fälle) | mittel → durch Blacklist niedrig | steigt mit Bekanntheit |
| Urheberrecht Werke | niedrig | steigt bei Künstlern †nach 1950 |
| Bildlizenzen (CC-BY-Attribution) | niedrig-mittel | steigt linear mit Profilzahl |
| DSGVO | sehr niedrig | stabil |
| AI-Act-Transparenz | niedrig (erfüllt) | stabil |
| Stimm-Imitation | n/a (nicht gemacht) | HOCH, falls je eingeführt |

**Fazit:** Der aktuelle Autopilot (5/Tag, Blacklist, QA-Kennzeichnung, nur Verstorbene, freie Bilder) ist gut vertretbar. Vor Erhöhung des Tageslimits: Punkte 2.3 (works=restricted für Künstler †>1950) und 2.4 (CC-BY-Attribution konkretisieren) umsetzen — beides kleine Pipeline-PRs, die der Agent selbst erledigen kann. Einmalige anwaltliche Bestätigung dieser Analyse empfohlen, danach Limit-Erhöhung unbedenklich planbar.

## 4. Nächste konkrete Schritte (für den Agenten)

1. Risk-Check-PR: Kunst + Sterbejahr > 1950 → works=restricted (kleiner Patch + Tests).
2. Merge-Script-PR: CC-BY-Attribution (Urheber+Lizenz) in imageCredit übernehmen.
3. Danach: Vorschlag an Adam für neues Tageslimit (z.B. 10) MIT Verweis auf diese Analyse.
4. Optional: Standard-Prozess für Takedown-Anfragen dokumentieren (unpublish-Mode existiert bereits — Reaktionszeit < 24 h möglich).
