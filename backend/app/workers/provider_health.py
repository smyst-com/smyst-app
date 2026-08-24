"""smyst.com Provider-Health-Watchdog: Fruehwarnung vor Provider-Ausfaellen.

Vorfall 24.08.2026: DeepSeek (402, Credits), OpenRouter-Repo-Key (403,
Limit), Anthropic/Gemini/xAI (400, ungueltig) fielen UBER TAGE still aus —
erst der Zusammenbruch der Pipeline (0 veroeffentlicht, 744 Gateway-503)
machte es sichtbar. Dieser Worker pingt stuendlich alle konfigurierten
Provider (Credential-Check ohne Generierungskosten) und

1. schreibt den Statusbericht in den Object Brain
   (pipeline/health/providers-YYYY-MM-DD.json, ein Lauf pro Stunde bleibt
   erhalten — Trend erkennbar). Ping-Art: ECHTE Mini-Generierung (8 Tokens)
   je Provider — der Credential-Check verschwieg am 24.08. Credits-Ausfaelle
   (models-Endpoint antwortete trotzdem),
2. druckt eine Zusammenfassung ins Workflow-Log,
3. beendet mit Exit-Code 2, wenn weniger als MIN_HEALTHY_PROVIDER Provider
   erreichbar sind — das GitHub-Workflow alarmiert dann (Issue-Label
   provider-outage) und der Admin sieht die Ampel im Autopilot-Cockpit.

Nur Lesezugriffe: kein Statuswechsel, kein Loeschen, keine Capsule-Berührung.

Start:
    python -m app.workers.provider_health
    python -m app.workers.provider_health --min-healthy 2
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import date, datetime, timezone

from app.ai.llm_router import provider_statuses
from app.integrations.candidate_store import CandidateStore, build_s3_client

HEALTH_PREFIX = "pipeline/health/"

#: Rot fuer die Pipeline bedeutet: weniger als zwei nutzbare Provider —
#: der smyst_gateway allein traegt Last nur bis zum naechsten Rate-Limit.
MIN_HEALTHY_PROVIDERS = 2


async def _generation_pings() -> dict[str, dict]:
    # Mini-Generierung je Provider: faengt 402 (Credits) und generations-
    # seitige 403/429 ein, die der models-Endpoint verschweigt (Erstlauf
    # 24.08.: 5/7 Credential-ok trotz unbrauchbarer Keys).
    from time import perf_counter

    from app.ai.llm_router import LocalDeterministicProvider, build_default_router
    from app.ai.models import LLMRequest

    router = build_default_router()
    request = LLMRequest(
        prompt="Antworte mit einem Wort: ja", system_prompt="", max_tokens=8, temperature=0.0
    )

    async def _ping(provider):
        started = perf_counter()
        try:
            response = await provider.complete(request)
            ok = not getattr(response, "degraded", False)
            return provider.name, {
                "ok": ok,
                "latency_ms": int((perf_counter() - started) * 1000),
                "error": None if ok else "degraded",
            }
        except Exception as exc:
            return provider.name, {
                "ok": False,
                "latency_ms": int((perf_counter() - started) * 1000),
                "error": f"{type(exc).__name__}: {exc}"[:160],
            }

    remote = [p for p in router.providers if not isinstance(p, LocalDeterministicProvider)]
    return dict(await asyncio.gather(*(_ping(p) for p in remote)))


def run_health_check(*, min_healthy: int, with_storage: bool) -> tuple[dict, int]:
    now = datetime.now(timezone.utc)
    pings = asyncio.run(_generation_pings())
    configured = {s["provider"]: s for s in provider_statuses() if s.get("configured")}

    providers: list[dict] = []
    healthy = 0
    for name, result in sorted(pings.items()):
        if name not in configured:
            continue  # ohne Key ist ein Fehlschlag nur Rauschen
        entry = {
            "provider": name,
            "ok": bool(result.get("ok")),
            "latency_ms": result.get("latency_ms"),
            "error": result.get("error"),
        }
        providers.append(entry)
        healthy += 1 if entry["ok"] else 0

    report = {
        "worker": "provider_health",
        "checked_at": now.isoformat(),
        "healthy": healthy,
        "min_healthy": min_healthy,
        "providers": providers,
    }
    exit_code = 0 if healthy >= min_healthy else 2

    if with_storage:
        from app.workers.ingest_candidates import _pipeline_bucket

        store = CandidateStore(build_s3_client(), _pipeline_bucket())
        hour = now.strftime("%Y-%m-%d")
        store._client.put_object(  # noqa: SLF001
            Bucket=store._bucket,
            Key=f"{HEALTH_PREFIX}providers-{hour}.json",
            Body=json.dumps(report, ensure_ascii=False, indent=2).encode("utf-8"),
            ContentType="application/json",
        )
    return report, exit_code


def main(argv: list[str] | None = None) -> int:  # pragma: no cover - CLI-Verdrahtung
    parser = argparse.ArgumentParser(description="smyst.com Provider-Health-Watchdog")
    parser.add_argument("--min-healthy", type=int, default=MIN_HEALTHY_PROVIDERS)
    parser.add_argument(
        "--no-storage", action="store_true", help="Bericht nicht nach e2 schreiben (Test)"
    )
    args = parser.parse_args(argv)

    report, exit_code = run_health_check(
        min_healthy=args.min_healthy, with_storage=not args.no_storage
    )
    print(
        json.dumps(
            {
                "healthy": report["healthy"],
                "min_healthy": report["min_healthy"],
                "providers": {
                    p["provider"]: ("ok" if p["ok"] else f"DOWN ({p['error']})")
                    for p in report["providers"]
                },
            },
            ensure_ascii=False,
        )
    )
    if exit_code != 0:
        print(
            f"ALARM: nur {report['healthy']} Provider erreichbar "
            f"(Minimum {report['min_healthy']}) — Pipeline in Gefahr.",
            file=sys.stderr,
        )
    return exit_code


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
