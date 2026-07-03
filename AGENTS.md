# AGENTS.md – Arbeitsregeln für KI-Agenten in smyst-app

Diese Regeln gelten für alle KI-Agenten (Codex, Claude, andere) und menschliche Beiträge.
Produktions-Branch ist `main`. Jeder Push auf `main` deployt automatisch auf https://smyst.com.

## Schreibweise (Pflicht)

Die Plattform heißt immer und ausschließlich **smyst.com** – niemals SMYST, SMYST.COM oder Smyst.
Das gilt für Code, UI, Doku, APIs, Metadaten, SEO und Marketingtexte.

## Design-Freeze Startseite (Pflicht, 100 % geschützt)

Das Design der Startseite (Start-Shell: Header, Logo, Suchfeld, Kategorie-Chips,
Profil-Grid, Chat-Composer/Footer und Seitenmenü) ist eingefroren.

1. KEINE sichtbare Design-Änderung an der Startseite ohne ausdrückliche
   schriftliche Bestätigung des Inhabers (Adam King) im konkreten Auftrag. Keine Ausnahme.
2. Ohne Freigabe verboten: Elemente hinzufügen oder entfernen (z. B. Icon-Legenden,
   Erklärtexte, Banner), Layout, Farben, Abstände oder Typografie ändern.
3. Gilt auch für Restores und Reverts: Vor jedem Restore prüfen, dass keine
   eingefrorenen Design-Elemente zurückkommen. Vorfall: Die Icon-Legende im Footer
   wurde am 30.06.2026 (82b12da) auf Anweisung entfernt, kam durch Restore 187c6d8
   zurück und wurde am 03.07.2026 (PR #25) erneut entfernt.
   Die Icon-Legende darf NIE wieder eingebaut werden.
4. Ohne Freigabe erlaubt: reine Bug- und Sicherheits-Fixes ohne sichtbare
   Design-Auswirkung auf die Startseite.

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

## Rote Linien

- Keine Nutzerdaten, Medien, Chats oder Profile löschen
- Bestehende Funktionen nicht beschädigen; die 100 kuratierten Profile sind geschützt
- Startseiten-Design nicht ohne schriftliche Freigabe ändern (siehe Design-Freeze)
- Keine Paid-Services einführen (GitHub Free, Spaceship DNS, IDrive e2, Salad only)
- Private Inhalte niemals öffentlich machen; `/private/` bleibt noindex
- Keine Secrets in Code, Logs oder Doku

## Architektur-Leitplanken

- GitHub Pages liefert alles Statische (App, Profilseiten, sitemap, robots, llms.txt,
  statisches JSON-API `/api/public/twins/`)
- IDrive e2 ist privater Objektspeicher (Object Brain), Salad nur echte Rechenarbeit
- Kuratierte Profildaten haben genau eine Quelle: `src/data/curated-public-twin-data.ts`
