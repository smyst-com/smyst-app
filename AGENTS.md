# AGENTS.md – Arbeitsregeln für KI-Agenten in smyst-app

Diese Regeln gelten für alle KI-Agenten (Codex, Claude, andere) und menschliche Beiträge.
Produktions-Branch ist `main`. Jeder Push auf `main` deployt automatisch auf https://smyst.com.

## Schreibweise (Pflicht)

Die Plattform heißt immer und ausschließlich **smyst.com** – niemals SMYST, SMYST.COM oder Smyst.
Das gilt für Code, UI, Doku, APIs, Metadaten, SEO und Marketingtexte.

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
- Keine Paid-Services einführen (GitHub Free, Spaceship DNS, IDrive e2, Salad only)
- Private Inhalte niemals öffentlich machen; `/private/` bleibt noindex
- Keine Secrets in Code, Logs oder Doku

## Architektur-Leitplanken

- GitHub Pages liefert alles Statische (App, Profilseiten, sitemap, robots, llms.txt,
  statisches JSON-API `/api/public/twins/`)
- IDrive e2 ist privater Objektspeicher (Object Brain), Salad nur echte Rechenarbeit
- Kuratierte Profildaten haben genau eine Quelle: `src/data/curated-public-twin-data.ts`
