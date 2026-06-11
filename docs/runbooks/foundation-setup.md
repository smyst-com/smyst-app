# Foundation Setup Runbook

Production setup uses only GitHub Free, Cloudflare Free and IDrive e2.

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
2. Connect Cloudflare Pages to GitHub.
3. Create Cloudflare KV namespaces.
4. Configure `wrangler.toml`.
5. Set Cloudflare secrets for GitHub OAuth and IDrive e2.
6. Run GitHub Actions checks.
7. Deploy Pages and Workers through the `Deploy` workflow.

