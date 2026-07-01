# Smyst Global Scale Production Plan

Status: execution runbook for the non-Cloudflare production path.

## Goal

Smyst must feel instant on web, PWA, iPhone, Android and future clients while
remaining secure, observable and resilient. The architecture target is:

- Spaceship for DNS only.
- GitHub Free for code, versioning, CI and release history only.
- IDrive e2 for the storage plane: media, uploads, exports, backups, archives,
  app artifacts, RAG documents, embeddings, prompt files, logs and private
  signed files.
- Salad for the compute plane: API, auth, AI inference, processing, indexing,
  search and cron jobs.
- Provider-router driven AI so Smyst can use Gemini, Claude, Grok, DeepSeek,
  Kimi, Manus, Mistral and other providers without coupling the product to one
  vendor.

## Hard Truth For Billion-User Scale

Free tiers are useful for bootstrapping and validation, not for billions of
daily users. The current stack can be made clean and professional now, but true
global scale requires paid capacity, quota contracts, provider redundancy,
monitoring and staged rollout controls.

The current blocking infrastructure fact is IDrive public access: the current
IDrive Free account can store and sync private objects, but public bucket/CDN
serving is blocked until IDrive enables public bucket access or the account is
upgraded.

## AI Provider Plane

Runtime secrets:

- `OPENROUTER_API_KEY`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`
- `XAI_API_KEY`
- `DEEPSEEK_API_KEY`
- `MOONSHOT_API_KEY`
- `MANUS_API_KEY`
- `MISTRAL_API_KEY`
- `GROQ_API_KEY`
- `TOGETHER_API_KEY`
- `COHERE_API_KEY`
- `PERPLEXITY_API_KEY`

Routing controls:

- `LLM_PROVIDER_ORDER`
- `LLM_DEFAULT_MODELS`

Recommended first production order:

```text
openrouter,openai,anthropic,gemini,xai,deepseek,moonshot,manus,mistral,groq,together,cohere,perplexity
```

Operational rule:

- Keep the router server-side only.
- Never put provider keys in the browser bundle.
- Use local deterministic fallback only as degraded service, not as the normal
  product answer path.
- Prefer fast providers for chat-start and first-token latency; route deeper
  reasoning, long context and agent tasks to slower premium providers.

## Storage Plane

IDrive e2 owns:

- User uploads and profile media.
- Images, video, audio, PDFs and documents.
- Static PWA/app files once public access is enabled.
- Build artifacts, APK/AAB/IPA files and rollback packages.
- Chat archives, prompt files, RAG source documents, embeddings and model files.
- Logs, audit logs, exports, backups, encrypted snapshots and QA artifacts.

Minimum bucket roles:

- `smyst-memories`: private user memory, uploads, profile media and RAG data.
- `backup.smyst.com`: encrypted backups and recovery material.
- `smyst.com`: public site/PWA files after public access is enabled.
- `app.smyst.com`: public app mirror after public access is enabled.
- `cdn.smyst.com`: public CDN files after public access is enabled.

Until IDrive public access is enabled:

- Keep `smyst.com` public delivery on GitHub Pages.
- Keep IDrive as private durable storage and backup plane.
- Do not claim IDrive CDN is live if public reads still return `403`.

## Compute Plane

Salad runs:

- FastAPI backend.
- Auth/session endpoints.
- AI inference gateway.
- Search/index workers.
- Embedding/RAG processing.
- Cron jobs, warmups and maintenance tasks.

Required scaling controls:

- Separate API replicas from background worker replicas.
- Use health checks and rolling deploys.
- Add queue-backed async jobs before large media processing.
- Add Redis or equivalent for rate limits, session coordination and hot cache.
- Add a production database before user scale; local files or in-memory state
  are not acceptable past early validation.

## DNS Plane

Spaceship owns:

- `smyst.com`
- `www.smyst.com`
- `app.smyst.com`
- `cdn.smyst.com`
- `api.smyst.com`

DNS targets:

- `api.smyst.com` -> Salad public endpoint.
- Static domains -> IDrive public/static targets only after IDrive public access
  is enabled and verified.
- Before that, `smyst.com` can remain on GitHub Pages while IDrive stores the
  private copy.

## Production Readiness Gates

Gate 1: Keys and secrets

- All provider keys present in GitHub Actions/Salad secret store.
- IDrive access keys present and rotated.
- No secret values committed to git.

Gate 2: Runtime health

- `https://smyst.com/` returns `200`.
- Salad live health returns `200`.
- Salad ready health returns `200` only when backing services are healthy.
- Provider status endpoint reports configured providers without exposing
  plaintext secrets.

Gate 3: Storage

- IDrive private upload/list/delete verified.
- IDrive public reads verified only after public access enablement.
- Backups and restore dry-run verified.

Gate 4: Scale controls

- Rate limits active.
- Request IDs/log correlation active.
- Provider fallback active.
- Queueing active for heavy jobs.
- Monitoring/alerting active.
- Cost budgets and provider quota alerts active.

## Immediate Next Actions

1. Enable IDrive public bucket access or upgrade the IDrive account.
2. Add the missing provider secrets to GitHub Actions and Salad.
3. Fix `api.smyst.com` DNS so it points to the Salad public endpoint.
4. Run the Salad backend deploy.
5. Run the IDrive static deploy after public access is enabled.
6. Verify live endpoints with curl and browser checks.
7. Add monitoring and alert thresholds before broader traffic.
