# RUNBOOK: smyst 1.1 v4 GGUF → Object Brain → Live

Stand: 2026-09-05 · Vorbereitet von ZCode · Ausführung sobald Mac-Uplink stabil
(kürzester Check: `curl -o /dev/null -w "%{speed_upload}" --upload-file /tmp/v4parts/v4p00` > 2 MB/s)

## Zustand
- **v4-Modell:** fertig (Gate bestanden), 2× lokal gesichert
  - MLX fused: `~/smyst-train/fused/smyst-1.1-v4/`
  - GGUF Q8_0 (1,5 GB): `~/smyst-train/smyst-1.1-v4-Q8_0.gguf`
- **54 Teile à 30 MB + SHA256SUMS:** `/tmp/v4parts/` (Tmp-Verzeichnis — ggf. neu splitten, Befehl unten)
- **Live-System NICHT abhängig davon:** smyst-1.1-Q4 (24.08.) antwortet, Provider-Kette dahinter

## Schritte (Reihenfolge einhalten)

### 1. Teile-Release füllen (Mac, ~30 Min bei gutem Uplink)
```bash
cd "/Users/alanbest/Library/CloudStorage/GoogleDrive-smyst247@gmail.com/.shortcut-targets-by-id/1GILNbp2CZmdjcolV9-kHi9Br4z8hwiub/smyst.com info/smyst.com app"
gh release create v4-parts --title "v4 parts" --notes "temp"
gh release upload v4-parts /tmp/v4parts/v4p* /tmp/v4parts/SHA256SUMS --clobber
# Prüfung: 55 Assets (54 Teile + SHA256SUMS)
gh release view v4-parts --json assets -q '[.assets | length]'
# Bei Abbruch: einfach `gh release upload v4-parts ... --clobber` wiederholen — Teile bleiben
```
Falls /tmp/v4parts weg (Neustart): neu splitten
```bash
mkdir -p /tmp/v4parts && cd /tmp/v4parts
split -b 30m -d ~/smyst-train/smyst-1.1-v4-Q8_0.gguf v4p
cd ~/smyst-train && shasum -a 256 smyst-1.1-v4-Q8_0.gguf | awk '{print $1"  smyst-1.1-v4-Q8_0.gguf"}' > /tmp/v4parts/SHA256SUMS
```

### 2. Transfer-Workflow triggern (1 Befehl)
```bash
gh workflow run "smyst 1.1 GGUF -> Object Brain (Split-Parts)"
```
Der Runner: lädt Teile → setzt zusammen → SHA256-Prüfung → Upload nach
`models/smyst-1.1/2026-08-23/smyst-1.1-v4-Q8_0.gguf` → löscht Teile-Release.
Dauer: ~5 Min (Runner-Glasfaser).

### 3. Router aktualisieren (Promotion)
Neuen Workflow „Promotion-Pilot (Alias/Router)" laufen lassen — er findet den
neuen GGUF und öffnet den Promotion-PR (start-llm.sh Position 1, Alias bleibt).
```bash
gh workflow run "Promotion-Pilot (Alias/Router)"
# PR prüfen und mergen (= schriftliche Freigabe, AGENTS.md-Freeze)
```

### 4. Redeploy-Zyklus (Memory_Bank.md 04.09)
PR mergen → Worktree pullen → base64 backend/Dockerfile → Zeabur-Tab:
updateDockerfile(atob) + redeployService → ~10-15 Min Build.

### 5. Live-Verifikation (ZCode sagt „fertig" erst danach)
```bash
# Health-Ping muss smyst_llm ok:true zeigen, Chat in der Rolle antworten,
# KI-Outing bei "Wer bist du?" DARF NICHT mehr kommen (v4-Kur)
```

## Warum dieser Umweg?
Mac-Uplink aktuell < 100 KB/s (Google-Drive-Sync/ISP-Drossel) — 1,5 GB einzeln
scheiterte 3×. Split-Parts (54×30 MB, Muster der Parallel-Session s11p*) sind
abbruchsicher: Teile bleiben liegen, Resume = erneuter `gh release upload`.
