#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "config" / "backup-recovery-manifest.json"


def fail(message: str) -> None:
    raise SystemExit(f"FAILED backup recovery check: {message}")


def main() -> None:
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))

    policy = data.get("policy", {})
    if policy.get("paidServicesAllowed") is not False:
        fail("paid services must be disabled")
    if policy.get("productionDatabase") != "cloudflare-kv":
        fail("production database must be cloudflare-kv")
    if policy.get("productionObjectStore") != "idrive-e2":
        fail("production object store must be idrive-e2")
    if policy.get("legacySqlProduction") is not False:
        fail("legacy SQL must not be production")

    targets = {target.get("name"): target for target in data.get("targets", [])}
    required_targets = {
        "code-and-config",
        "cloudflare-pages-deployment",
        "cloudflare-workers",
        "cloudflare-kv-metadata",
        "idrive-e2-user-objects",
        "legacy-local-sql-reference",
    }
    missing = sorted(required_targets - set(targets))
    if missing:
        fail(f"missing targets: {', '.join(missing)}")

    kv = targets["cloudflare-kv-metadata"]
    for prefix in ["auth:user:", "meta:twin:", "meta:upload:", "public:twin:", "storage:user:"]:
        if prefix not in kv.get("includePrefixes", []):
            fail(f"KV include prefix missing: {prefix}")
    for forbidden in ["s:", "state:"]:
        if forbidden not in kv.get("excludePrefixes", []):
            fail(f"KV exclude prefix missing: {forbidden}")

    idrive = targets["idrive-e2-user-objects"]
    controls = set(idrive.get("requiredBucketControls", []))
    for control in ["cors-approved-origins-only", "server-side-encryption", "private-by-default"]:
        if control not in controls:
            fail(f"IDrive e2 control missing: {control}")

    legacy = targets["legacy-local-sql-reference"]
    if legacy.get("productionAllowed") is not False:
        fail("legacy SQL target must be blocked for production")

    evidence = set(data.get("releaseEvidence", []))
    for item in ["KV restore dry-run result", "IDrive e2 bucket CORS/encryption/lifecycle confirmation", "rollback target"]:
        if item not in evidence:
            fail(f"release evidence missing: {item}")

    risks = set(data.get("blockingRisks", []))
    for risk in ["no KV restore dry-run", "no IDrive e2 signed object restore test", "production data stored in legacy SQL or server filesystem"]:
        if risk not in risks:
            fail(f"blocking risk missing: {risk}")

    print("backup recovery manifest validation passed")


if __name__ == "__main__":
    main()
