# Chat

Chat owns sessions, messages, simulated/stream-ready responses, feedback, and latency metrics.

Rules:

- Chat must not wait for upload parsing or twin rebuild jobs.
- Time-to-first-response is a core MVP metric.
- Degraded modes must never bypass security or privacy.
- External AI inference is not a Free-Only production requirement.
