#!/usr/bin/env bash
# v4-GGUF Teile-Uploader (ueber Nacht, resumable):
# - laedt alle fehlenden Teile parallel (6 gleichzeitig) hoch
# - Schleife bis alle 55 Assets da sind (Teile + SHA256SUMS)
# - danach: Transfer-Workflow triggern (Object Brain) + Meldung im Log
set -uo pipefail
APP="/Users/alanbest/Library/CloudStorage/GoogleDrive-smyst247@gmail.com/.shortcut-targets-by-id/1GILNbp2CZmdjcolV9-kHi9Br4z8hwiub/smyst.com info/smyst.com app"
LOG="$HOME/Library/smyst-autopilots/logs/gguf-upload.log"
cd /tmp/v4parts || exit 1
log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

TOTAL=55
for ROUND in $(seq 1 30); do
  HAVE=$(gh api repos/smyst-com/smyst-app/releases/tags/v4-parts --jq '.assets | length' 2>/dev/null || echo 0)
  log "Runde $ROUND: $HAVE/$TOTAL Assets vorhanden."
  [ "$HAVE" -ge "$TOTAL" ] && break
  # Fehlende Teile berechnen
  gh api repos/smyst-com/smyst-app/releases/tags/v4-parts --jq '.assets[].name' 2>/dev/null > /tmp/have_assets.txt || true
  ls v4p* SHA256SUMS 2>/dev/null | while read -r f; do
    grep -qx "$f" /tmp/have_assets.txt || echo "$f"
  done > /tmp/missing.txt
  MISS=$(wc -l < /tmp/missing.txt)
  [ "$MISS" -eq 0 ] && break
  log "Lade $MISS fehlende Teile mit 6 Parallel-Uploads hoch..."
  xargs -0 -P 6 -I{} gh release upload v4-parts /tmp/v4parts/{} --clobber >> "$LOG" 2>&1 < <(tr '\n' '\0' < /tmp/missing.txt) || true
  sleep 60
done

HAVE=$(gh api repos/smyst-com/smyst-app/releases/tags/v4-parts --jq '.assets | length' 2>/dev/null || echo 0)
if [ "$HAVE" -ge "$TOTAL" ]; then
  log "ALLE $TOTAL Teile oben – triggere Object-Brain-Transfer."
  gh workflow run "smyst 1.1 GGUF -> Object Brain (Split-Parts)" -R smyst-com/smyst-app 2>/dev/null \
    || gh workflow run gguf-to-e2.yml -R smyst-com/smyst-app 2>/dev/null \
    || log "WARNUNG: Workflow-Trigger fehlgeschlagen – manuell starten."
else
  log "Nicht vollstaendig ($HAVE/$TOTAL) nach $ROUND Runden – naechster Lauf setzt fort."
fi
