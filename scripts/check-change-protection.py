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
    require(data.get("version") >= "2026-06-24", "manifest version must include the 2026-06-24 profile image/design guard update")
    require(data.get("lastVerifiedDate") >= "2026-06-24", "manifest must store lastVerifiedDate for the profile image/design guard")
    require(
        "profile image" in data.get("lastVerifiedScope", "").lower()
        and "light theme" in data.get("lastVerifiedScope", "").lower(),
        "manifest lastVerifiedScope must mention profile images and light theme protection",
    )

    policy = data.get("policy", {})
    for key in [
        "protectedProductionMode",
        "productionDeployRequiresManualApproval",
        "productionDeployRequiresReleaseFreeze",
        "productionDeployRequiresRollbackPlan",
        "productionDeployRequiresBackupRestoreDryRun",
        "productionDeployRequiresGreenBuild",
        "productionDeployRequiresGreenAudit",
        "productionDeployRequiresGreenPreflight",
        "productionDeployRequiresGreenLiveSmoke",
        "destructiveRequestsRequireCsrf",
        "destructiveRequestsRequireDeleteConfirmHeader",
        "criticalFileChangesRequireWrittenApproval",
        "dataShapeChangesRequireBackupAndRollbackPlan",
        "workingFeatureChangesRequireExplicitTask",
    ]:
        require(policy.get(key) is True, f"policy must enable {key}")
    require(policy.get("paidServicesAllowed") is False, "paid services must remain disabled")
    require(policy.get("allowedProductionServiceTiers") == ["GitHub.com Free", "Cloudflare.com Free"], "allowed production service tiers must stay GitHub.com Free and Cloudflare.com Free")
    require(policy.get("centralStorage") == "IDrive e2", "central storage must remain IDrive e2")
    require(policy.get("autoBillingServicesAllowed") is False, "auto-billing services must remain disabled")
    require(policy.get("futureScaleRequiresExplicitArchitectureDecision") is True, "future scale must require an explicit architecture decision")

    protected_mode = data.get("protectedProductionMode", {})
    require(protected_mode.get("status") == "enabled", "protected production mode must stay enabled")
    for key in [
        "releaseDecision",
        "criticalFileChangeRule",
        "dataChangeRule",
        "featureChangeRule",
        "costRule",
        "fallbackRule",
    ]:
        require(bool(protected_mode.get(key)), f"protected production mode missing {key}")
    require("NO-GO" in protected_mode.get("fallbackRule", ""), "fallback rule must block unsafe releases with NO-GO")

    hard_rules = set(data.get("hardArchitectureRules", []))
    for item in [
        "GitHub.com may be used only on the Free tier",
        "Cloudflare.com may be used only on the Free tier",
        "No paid add-on service may be introduced",
        "No service may be introduced if it can automatically create cost",
        "IDrive e2 remains central storage for files, media, models, backups and data",
        "Do not remove curated profile image files, imageFile metadata or public profile visibility without written approval",
        "Do not weaken light theme profile text contrast without written approval and visual verification",
        "If billion-user/day scale is unrealistic on free-only limits, optimize and measure free-only instead of adding paid infrastructure",
    ]:
        require(item in hard_rules, f"hard architecture rule missing: {item}")

    critical_files = data.get("criticalProductionFiles", [])
    require(len(critical_files) >= 30, "critical production file list is too small")
    for rel_path in critical_files:
        require((ROOT / rel_path).exists(), f"critical production file missing: {rel_path}")
    for rel_path in [
        ".github/workflows/deploy.yml",
        "config/change-protection-manifest.json",
        "docs/runbooks/release-governance.md",
        "scripts/preflight-release.sh",
        "scripts/test-all.sh",
        "scripts/check-bottom-icon-regression.mjs",
        "scripts/check-profile-image-design-guard.py",
        "workers/storage-idrive.ts",
        "workers/api.ts",
        "workers/curated-public-twin-data.ts",
        "src/App.tsx",
        "src/index.css",
    ]:
        require(rel_path in critical_files, f"critical production file not protected: {rel_path}")

    routes = {item.get("route"): item for item in data.get("destructiveRoutes", [])}
    for route, expected_header in {
        "DELETE /api/account": "X-Smyst-Delete-Confirm: delete-account",
        "DELETE /storage/account": "X-Smyst-Delete-Confirm: delete-account-storage",
        "DELETE /storage/file/{key}": "X-Smyst-Delete-Confirm: delete-file",
    }.items():
        require(route in routes, f"missing destructive route {route}")
        protections = routes[route].get("protections", [])
        require("X-Smyst-CSRF: 1" in protections, f"{route} missing CSRF protection")
        require(expected_header in protections, f"{route} missing delete confirm header")
        require("rate limit" in protections, f"{route} missing rate limit")

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
        "Cloudflare Pages deployment rollback path",
        "Cloudflare Worker version rollback path",
        "Cloudflare KV preview restore dry-run required before release",
    ]:
        require(item in rollback, f"rollback protection missing: {item}")

    integrity = set(data.get("dataIntegrityProtections", []))
    for item in [
        "IDrive e2 object keys are user-scoped",
        "storage downloads require KV metadata status uploaded",
        "upload-complete verifies IDrive object via signed HEAD",
        "curated public profiles require local raster profile images with matching size metadata",
        "light theme profile names and subtitles require protected contrast overrides",
    ]:
        require(item in integrity, f"data integrity protection missing: {item}")

    configuration = set(data.get("configurationProtections", []))
    require(
        "check-profile-image-design-guard.py blocks missing curated profile images and light theme contrast regressions" in configuration,
        "configuration protection missing profile image/design guard",
    )

    guard = data.get("profileImageDesignGuard", {})
    require(guard.get("status") == "enabled", "profileImageDesignGuard must stay enabled")
    require(guard.get("lastVerifiedDate") >= "2026-06-24", "profileImageDesignGuard must store verification date")
    require(guard.get("requiredLocalCheck") == "python3 scripts/check-profile-image-design-guard.py", "profileImageDesignGuard must point to local check")
    require(guard.get("requiredCiWorkflow") == ".github/workflows/deploy.yml", "profileImageDesignGuard must point to CI workflow")
    require(guard.get("requiredCiStep") == "Validate curated profile images and light theme contrast", "profileImageDesignGuard must point to CI step")
    require(guard.get("protectedProfileCount") == 100, "profileImageDesignGuard must protect exactly 100 curated public profiles")
    guard_rules = set(guard.get("rules", []))
    for item in [
        "Every curated public profile must have imageFile metadata.",
        "Every curated public profile image must be a local raster image.",
        "No curated public profile may use /api/public/twin-images SVG fallback.",
        "Image size metadata must match the committed local file.",
        "Light theme profile names and subtitles must keep readable contrast overrides.",
    ]:
        require(item in guard_rules, f"profileImageDesignGuard missing rule: {item}")
    live_validation = set(guard.get("liveValidation", []))
    for item in [
        "https://smyst.com/api/public/twins must return 100 profiles.",
        "Every live public twin must include an imageUrl.",
        "No live imageUrl may contain /api/public/twin-images/.",
    ]:
        require(item in live_validation, f"profileImageDesignGuard missing live validation: {item}")

    print("change protection manifest validation passed")


if __name__ == "__main__":
    main()
