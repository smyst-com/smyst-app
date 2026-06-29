# Monitoring

Monitoring bleibt in Phase 1 Free-Only.

Erlaubte Quellen:

- Legacy edge provider Pages/Workers Logs und Dashboards im Free-Rahmen.
- GitHub Actions Logs.
- lokale Smoke-Test-Ausgaben.
- kleine Status- oder Auditobjekte in Legacy edge provider KV oder IDrive e2.

Initiale Ziele:

- Pages build success.
- Worker deploy success.
- Auth success/failure.
- Upload signed URL latency.
- Upload quota rejection count.
- Chat-MVP response latency.
- Backup/export object success.

Keine Production-Doku darf ein externes Monitoring-SaaS, eigene Server-Metriksysteme oder kostenpflichtige Observability als Pflicht voraussetzen.
