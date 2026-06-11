from __future__ import annotations

from dataclasses import dataclass
from time import time


@dataclass(frozen=True)
class RateLimitDecision:
    allowed: bool
    remaining: int
    reset_seconds: int


class InMemoryRateLimiter:
    def __init__(self) -> None:
        self._buckets: dict[str, list[float]] = {}

    def check(self, *, key: str, limit: int, window_seconds: int) -> RateLimitDecision:
        now = time()
        window_start = now - window_seconds
        timestamps = [ts for ts in self._buckets.get(key, []) if ts > window_start]
        allowed = len(timestamps) < limit
        if allowed:
            timestamps.append(now)
        self._buckets[key] = timestamps
        remaining = max(0, limit - len(timestamps))
        reset_seconds = int(max(1, window_seconds - (now - timestamps[0]))) if timestamps else window_seconds
        return RateLimitDecision(allowed=allowed, remaining=remaining, reset_seconds=reset_seconds)


rate_limiter = InMemoryRateLimiter()

