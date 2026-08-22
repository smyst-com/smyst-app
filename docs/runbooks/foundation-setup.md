# Foundation Setup Runbook

> **Status: ueberholtes Zielbild.** Dieses Dokument beschreibt eine geplante
> Architektur aus der Free-only-Phase (Cloudflare Pages/Workers/KV, Salad), die
> so nie gebaut wurde. Es ist KEINE Beschreibung des Live-Systems.
> Verbindlich sind `docs/ARCHITECTURE.md`, `docs/INFRA_SETUP.md`,
> `docs/07-deployment-architecture.md` und `docs/FREE_ONLY_DATA_MAP.md`.
> Eingeordnet am 2026-08-20.

Production setup uses only GitHub Free, Cloudflare and IDrive e2.

## Required Resources

- GitHub repository.
- Cloudflare domain, Pages project, Workers and KV namespaces.
- IDrive e2 bucket and access keys.
- GitHub OAuth app for login.

## Forbidden As Production Requirements

- VPS or hosted server.
- Docker production runtime.
- Self-hosted database, cache, queue or reverse proxy.
- Google OAuth, external translation APIs, external analytics.

## Setup Order

1. Push code to GitHub.
2. Connect IDrive e2 static hosting to GitHub.
3. Create IDrive e2 namespaces.
4. Configure `legacy-edge-cli.toml`.
5. Set Cloudflare secrets for GitHub OAuth and IDrive e2.
6. Run GitHub Actions checks.
7. Deploy Pages and Workers through the `Deploy` workflow.

