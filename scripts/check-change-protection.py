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
    for key in [
        "productionDeployRequiresManualApproval",
        "productionDeployRequiresReleaseFreeze",
        "productionDeployRequiresRollbackPlan",
        "productionDeployRequiresBackupRestoreDryRun",
        "destructiveRequestsRequireCsrf",
        "destructiveRequestsRequireDeleteConfirmHeader",
    ]:
        require(policy.get(key) is True, f"policy must enable {key}")
    require(policy.get("paidServicesAllowed") is False, "paid services must remain disabled")

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
    ]:
        require(item in integrity, f"data integrity protection missing: {item}")

    print("change protection manifest validation passed")


if __name__ == "__main__":
    main()
