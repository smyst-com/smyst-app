#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "config" / "surface-protection-manifest.json"

NEGATIVE_CONTEXT = (
    "not allowed",
    "not part of production",
    "not production",
    "nicht erlaubt",
    "blocked",
    "forbidden",
    "legacy",
    "non-production",
    "free-only rule",
)


def fail(message: str) -> None:
    raise SystemExit(f"FAILED surface protection check: {message}")


def require(value: bool, message: str) -> None:
    if not value:
        fail(message)


def text(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def has_negative_context(line: str) -> bool:
    lower = line.lower()
    return any(marker in lower for marker in NEGATIVE_CONTEXT)


def scan_file_forbidden(path: Path, patterns: list[str]) -> list[str]:
    issues: list[str] = []
    if not path.is_file():
        return issues
    try:
        content = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return issues
    rel = path.relative_to(ROOT)
    for line_no, line in enumerate(content.splitlines(), start=1):
        lower = line.lower()
        if has_negative_context(line):
            continue
        for pattern in patterns:
            if pattern.lower() in lower:
                issues.append(f"{rel}:{line_no} contains forbidden production pattern: {pattern}")
    return issues


def iter_policy_files() -> list[Path]:
    roots = [
        ".github/workflows",
        "config",
        "scripts",
        "src",
        "backend",
        "public",
        "frontend",
    ]
    files: list[Path] = []
    for root in roots:
        base = ROOT / root
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if not path.is_file():
                continue
            if any(part in {"node_modules", "dist", ".next", "test-results"} for part in path.parts):
                continue
            files.append(path)
    return files


def main() -> None:
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    policy = data.get("policy", {})
    require(policy.get("paidServicesAllowed") is False, "paid services must remain disabled")
    require(policy.get("autoBillingServicesAllowed") is False, "auto-billing services must remain disabled")
    require(policy.get("productionDatabase") == "salad-api-idrive-metadata", "production database must remain Salad/IDrive metadata")
    require(policy.get("centralObjectStorage") == "idrive-e2", "central object storage must remain idrive-e2")
    require(policy.get("designChangesRequireExplicitTask") is True, "design changes must require explicit task")
    require(policy.get("cssChangesRequireExplicitTask") is True, "CSS changes must require explicit task")
    require(policy.get("apiDeleteRoutesRequireConfirmation") is True, "API DELETE routes must require confirmation")
    require(policy.get("githubActionsNode20WarningsAllowed") is False, "GitHub Actions Node 20 warnings must remain blocked")

    protected = data.get("protectedSurfaces", {})
    for group in ["designAndCss", "productionData", "api", "githubActions"]:
        for rel_path in protected.get(group, []):
            require((ROOT / rel_path).exists(), f"protected surface missing: {rel_path}")

    forbidden_services = data.get("forbiddenProductionServices", [])
    forbidden_legacy_edge = data.get("forbiddenLegacyEdgePaidOrAutoBillingProducts", [])
    issues: list[str] = []
    for path in iter_policy_files():
        if path.relative_to(ROOT).as_posix() in {
            "config/surface-protection-manifest.json",
            "scripts/check-surface-protection.py",
        }:
            continue
        issues.extend(scan_file_forbidden(path, forbidden_services))
        issues.extend(scan_file_forbidden(path, forbidden_legacy_edge))
    if issues:
        fail("\n" + "\n".join(issues))

    workflow_text = "\n".join(text(path) for path in protected.get("githubActions", []))
    for required in data.get("requiredGithubActionsProtections", []):
        require(required in workflow_text, f"GitHub Actions protection missing: {required}")
    for forbidden in data.get("forbiddenGithubActionsPatterns", []):
        require(forbidden not in workflow_text, f"GitHub Actions forbidden pattern present: {forbidden}")

    api_text = "\n".join(text(path) for path in protected.get("api", []))
    for required in data.get("requiredApiProtectionTerms", []):
        require(required in api_text, f"API protection term missing: {required}")

    print("surface protection validation passed")


if __name__ == "__main__":
    main()
