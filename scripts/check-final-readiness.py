#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCORECARD = ROOT / "config" / "final-readiness-scorecard.json"

required_areas = {
    "security",
    "speed",
    "stability",
    "scale",
    "seo",
    "ai",
    "infrastructure",
    "usability",
    "maintainability",
    "future-readiness",
}


def fail(message: str) -> None:
    print(f"final readiness check failed: {message}", file=sys.stderr)
    raise SystemExit(1)


def require_non_empty_list(value: object, label: str) -> None:
    if not isinstance(value, list) or not value:
        fail(f"{label} must be a non-empty list")
    if any(not isinstance(item, str) or not item.strip() for item in value):
        fail(f"{label} must contain only non-empty strings")


def main() -> None:
    if not SCORECARD.is_file():
        fail("missing config/final-readiness-scorecard.json")

    data = json.loads(SCORECARD.read_text(encoding="utf-8"))
    if data.get("productionStatus") != "NO-GO":
        fail("productionStatus must stay NO-GO until final written production approval")

    policy = data.get("freeOnlyPolicy")
    if not isinstance(policy, dict):
        fail("missing freeOnlyPolicy")
    if policy.get("paidServicesAllowed") is not False:
        fail("paid services must be disabled")
    if policy.get("productionDeployRequiresFinalWrittenApproval") is not True:
        fail("production deploy must require final written approval")

    require_non_empty_list(data.get("globalBlockers"), "globalBlockers")

    areas = data.get("areas")
    if not isinstance(areas, list) or not areas:
        fail("areas must be a non-empty list")

    seen: set[str] = set()
    total = 0.0
    for area in areas:
        if not isinstance(area, dict):
            fail("each area must be an object")

        area_id = area.get("id")
        if area_id not in required_areas:
            fail(f"unexpected or missing required area id: {area_id!r}")
        if area_id in seen:
            fail(f"duplicate area id: {area_id}")
        seen.add(area_id)

        score = area.get("score")
        if not isinstance(score, (int, float)) or score < 0 or score > 10:
            fail(f"{area_id} score must be a number from 0 to 10")
        total += float(score)

        if area.get("targetScore") != 10:
            fail(f"{area_id} targetScore must be 10")
        if not isinstance(area.get("why"), str) or not area["why"].strip():
            fail(f"{area_id} must include a why explanation")
        require_non_empty_list(area.get("automaticImprovements"), f"{area_id}.automaticImprovements")

        if score < 10:
            if area.get("status") != "blocked-below-10":
                fail(f"{area_id} score below 10 must include blockers status")
            require_non_empty_list(area.get("blockers"), f"{area_id}.blockers")
            require_non_empty_list(area.get("nextActions"), f"{area_id}.nextActions")
        else:
            if area.get("status") != "verified-10":
                fail(f"{area_id} score 10 must be marked verified-10")
            require_non_empty_list(area.get("evidence"), f"{area_id}.evidence")

    missing = required_areas - seen
    if missing:
        fail("missing required areas: " + ", ".join(sorted(missing)))

    repeat = data.get("repeatCheck")
    if not isinstance(repeat, dict) or repeat.get("required") is not True:
        fail("repeatCheck.required must be true")
    if repeat.get("localValidationScript") != "scripts/check-final-readiness.py":
        fail("repeatCheck.localValidationScript must point to this script")

    average = total / len(areas)
    print(f"final readiness scorecard validation passed (average {average:.1f}/10)")


if __name__ == "__main__":
    main()
