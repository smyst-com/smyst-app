#!/usr/bin/env bash
# e2-Modell-Backup ueber GitHub Actions (Autopilot-Hook, 25.08.2026).
#
# Aufruf aus autopilot_retrain.sh nach einer Promotion, wenn lokal KEINE
# e2-Keys liegen: kopiert Adapter/Tokenizer/Configs auf einen Backup-Branch
# und stoesst model-backup-e2.yml an (nutzt die GitHub-Secrets IDRIVE_E2_*).
# Der 988-MB-Fused-Koerper bleibt weg — rekonstruierbar aus oeffentlicher
# Basis + Adapter (siehe training/README.md). Arbeitet in einem temporaeren
# git-worktree, damit das lokale Arbeitsverzeichnis unberuehrt bleibt.
#
# Exit 0 = Backup verifiziert hochgeladen, alles andere = Misserfolg (Log).

set -uo pipefail
VERSION="${1:?Nutzung: autopilot_backup_github.sh <version>}"
REPO_ROOT="/Users/alanbest/Library/CloudStorage/GoogleDrive-smyst247@gmail.com/.shortcut-targets-by-id/1GILNbp2CZmdjcolV9-kHi9Br4z8hwiub/smyst.com info/smyst.com app"
BRANCH="claude/model-backup-auto"
LOG="$HOME/Library/smyst-autopilots/logs/autopilot.log"

# gh im launchd-Kontext hat keinen Keychain-Zugriff -> Token-Datei (chmod 600)
TOKEN_FILE="$HOME/.smyst-secrets/gh_token"
if [ -f "$TOKEN_FILE" ] && ! gh auth status >/dev/null 2>&1; then
  export GH_TOKEN="$(cat "$TOKEN_FILE")"
fi

log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }

cd "$REPO_ROOT" || exit 1
WT="$(mktemp -d /tmp/smyst-backup.XXXXXX)"
trap 'git worktree remove --force "$WT" 2>/dev/null || rm -rf "$WT"' EXIT

git fetch origin --quiet
git worktree add -q "$WT" -B "$BRANCH" origin/main || { log "BACKUP-HOOK: Worktree fehlgeschlagen."; exit 1; }
ART_DIR="$WT/training/backup-artifacts/$VERSION"
mkdir -p "$ART_DIR"
cp training/fused/smyst-1.0-sft/config.json \
   training/fused/smyst-1.0-sft/generation_config.json \
   training/fused/smyst-1.0-sft/tokenizer_config.json \
   training/fused/smyst-1.0-sft/tokenizer.json \
   training/adapters/smyst-1.0-sft/adapters.safetensors \
   "$ART_DIR/" 2>/dev/null || { log "BACKUP-HOOK: Artefakte fehlen — Training vorher laufen lassen?"; exit 1; }

python3 - "$ART_DIR" "$VERSION" <<'PY'
import hashlib, json, pathlib, sys, datetime
d, version = pathlib.Path(sys.argv[1]), sys.argv[2]
def sha(p):
    h = hashlib.sha256()
    with p.open("rb") as f:
        for c in iter(lambda: f.read(1 << 20), b""):
            h.update(c)
    return h.hexdigest()
files = sorted(f for f in d.iterdir() if f.name != "MANIFEST.json")
(d / "MANIFEST.json").write_text(json.dumps({
    "model": "smyst-1.0-sft", "version": version,
    "basis": "Qwen/Qwen2.5-0.5B-Instruct",
    "erstellt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "hinweis": "fused/model.safetensors rekonstruierbar via mlx_lm.fuse (Basis + adapters).",
    "dateien": {f.name: {"bytes": f.stat().st_size, "sha256": sha(f)} for f in files},
}, indent=2, ensure_ascii=False))
PY

git -C "$WT" add "training/backup-artifacts/$VERSION"
git -C "$WT" commit -q -m "backup: smyst-1.0 Artefakte $VERSION (Autopilot)" || { log "BACKUP-HOOK: nichts zu committen."; exit 1; }
git -C "$WT" push -q -u origin "$BRANCH" --force-with-lease || { log "BACKUP-HOOK: Push fehlgeschlagen."; exit 1; }

gh workflow run model-backup-e2.yml --ref "$BRANCH" -f version="$VERSION" || { log "BACKUP-HOOK: Dispatch fehlgeschlagen."; exit 1; }
sleep 15
RUN_ID=""
for _ in $(seq 1 20); do
  RUN_ID=$(gh run list --workflow=model-backup-e2.yml --branch "$BRANCH" --limit 1 --json databaseId,status,conclusion -q '.[0] | select(.status=="completed") | .databaseId' 2>/dev/null)
  [ -n "$RUN_ID" ] && break
  sleep 15
done
if [ -z "$RUN_ID" ]; then log "BACKUP-HOOK: Run nicht rechtzeitig fertig."; exit 1; fi
CONCLUSION=$(gh run view "$RUN_ID" --json conclusion -q .conclusion)
if [ "$CONCLUSION" = "success" ]; then
  log "BACKUP-HOOK OK: s3://smyst-memories/models/smyst-1.0/$VERSION/ (Run $RUN_ID)."
  exit 0
fi
log "BACKUP-HOOK FEHLGESCHLAGEN: Run $RUN_ID = $CONCLUSION."
exit 1
