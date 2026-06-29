#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "config" / "change-protection-manifest.json"


def fail(message: str) -> None:
    raise SystemExit(f"FAILED change protection check: {message}")


def require(value: bool, message: str) -> None:
    if not value:
        fail(message)


def main() -> None:
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    policy = data.get("policy", {})

    require(policy.get("protectedProductionMode") is True, "protected production mode must stay enabled")
    require(policy.get("paidServicesAllowed") is False, "paid services must remain disabled")
    require(policy.get("autoBillingServicesAllowed") is False, "auto-billing services must remain disabled")
    require(
        policy.get("allowedProductionServiceTiers") == ["GitHub.com Free", "IDrive e2", "Salad.com", "Spaceship DNS"],
        "allowed production service tiers must stay GitHub, IDrive e2, Salad and Spaceship",
    )
    require(policy.get("centralStorage") == "IDrive e2", "central storage must remain IDrive e2")
    require(policy.get("futureScaleRequiresExplicitArchitectureDecision") is True, "future scale must require an explicit architecture decision")

    protected_mode = data.get("protectedProductionMode", {})
    require(protected_mode.get("status") == "enabled", "protected production mode must stay enabled")
    require("NO-GO" in protected_mode.get("fallbackRule", ""), "fallback rule must block unsafe releases with NO-GO")

    hard_rules = set(data.get("hardArchitectureRules", []))
    for item in [
        "GitHub.com may be used only on the Free tier",
        "Legacy edge/CDN providers must not be used for new production work",
        "No paid add-on service may be introduced",
        "No service may be introduced if it can automatically create cost",
        "Spaceship remains the DNS and domain authority",
        "Salad.com remains the compute/API target",
        "IDrive e2 remains central storage for files, media, models, backups and data",
    ]:
        require(item in hard_rules, f"hard architecture rule missing: {item}")

    critical_files = data.get("criticalProductionFiles", [])
    require(len(critical_files) >= 25, "critical production file list is too small")
    for rel_path in critical_files:
        require((ROOT / rel_path).exists(), f"critical production file missing: {rel_path}")
    for rel_path in [
        ".github/workflows/deploy.yml",
        "config/change-protection-manifest.json",
        "docs/runbooks/release-governance.md",
        "scripts/preflight-release.sh",
        "scripts/test-all.sh",
        "scripts/check-profile-image-design-guard.py",
        "scripts/check-provider-exit.py",
        "src/App.tsx",
        "src/data/curated-public-twin-data.ts",
        "backend/app/main.py",
    ]:
        require(rel_path in critical_files, f"critical production file not protected: {rel_path}")

    deployment = set(data.get("deploymentProtections", []))
    for item in [
        "workflow_dispatch only for production deploy",
        "release_approval must equal Ja OK",
        "rollback_plan_confirmed required",
        "backup_restore_confirmed required",
        "live smoke test after deploy",
    ]:
        require(item in deployment, f"deployment protection missing: {item}")

    rollback = set(data.get("rollbackProtections", []))
    for item in [
        "Git revert or cherry-pick rollback path",
        "IDrive e2 static artifact rollback path",
        "Salad backend rollback path",
        "Salad metadata restore dry-run required before release",
    ]:
        require(item in rollback, f"rollback protection missing: {item}")

    print("change protection manifest validation passed")


if __name__ == "__main__":
    main()
