# Smyst Roadmap

## Current Free-Only Constraint

Phase 1 and the current MVP must use only GitHub Free, Cloudflare Free and
IDrive e2 with hard quotas. VPS/RackNerd, Docker-Production, FastAPI as a
production backend, PostgreSQL, Redis, pgvector, Caddy, DeepL, Google
Translate, Google OAuth, GA4 and Google Search Console are not production
dependencies.

GitHub and Cloudflare must remain permanently free. Do not plan GitHub Pro,
Team, Enterprise, paid Actions minutes, paid storage, Codespaces, Cloudflare
Pro, Business, Enterprise, Workers Paid, R2 Paid, Images, Stream, Queues,
D1 Paid, KV Paid, Vectorize, Cloudflare AI or any service that can silently
turn into paid usage after a limit. IDrive e2 is the central S3-compatible
storage for files, media, models, backups, chat archives, profile objects and
twin data, with hard quotas and stop-before-cost behavior.

All phases after Phase 2 are product vision. They are not approved production
architecture until a new written Free-Only review confirms that they still work
without paid services.

## Phase 1: Foundation

Goal: Make the existing app deployable, protected and connected.

- Create GitHub repository `smyst-app`
- Initialize Git in this project folder
- Push existing code to GitHub
- Connect GitHub to Cloudflare Pages
- Configure `smyst.com` on Cloudflare
- Create Cloudflare KV namespaces
- Create IDrive E2 bucket `smyst-memories`
- Set Cloudflare secrets for auth, translation and storage
- Deploy Workers for translation, auth and storage
- Verify production URL and custom domain

Success criteria:

- `https://smyst.com` loads from Cloudflare
- GitHub is the source of truth for code
- Cloudflare Pages deploys from `main`
- Workers are deployed
- IDrive E2 upload signing is ready

## Phase 2: Product MVP

Goal: Make smyst usable as an early product.

- User login
- Twin profile
- Memory upload
- Basic chat
- Signed upload URLs
- File metadata
- Basic privacy states
- Basic multilingual pages
- App install shell through Capacitor

Success criteria:

- User can sign in
- User can create a twin
- User can upload a memory file
- Uploaded files are private by default
- App can run as web, iOS shell and Android shell

## Phase 3: Free-Only Background Status And Memory Preparation

Goal: Move slow work out of the request path without adding a paid queue,
database, vector service or AI provider.

- Add lightweight status objects in KV and IDrive e2
- Process small user-triggered rebuild steps inside Worker limits
- Use manual or rule-based extraction for MVP memory candidates
- Store chat archives and chat summaries in IDrive e2
- Save memory source links
- Show processing status to user
- Degrade safely when quotas or free limits are reached

Success criteria:

- Upload does not block on parsing or memory preparation
- User sees pending/processing/ready states
- Confirmed memories become searchable through metadata and summaries
- No paid queue, embedding, model, database or monitoring dependency is added

Free-only gate:

- No paid AI, queue, database, vector, translation or monitoring service may be
  introduced by this phase without a new approval.
- If a feature cannot be implemented safely on GitHub Free, Cloudflare Free and
  IDrive e2 with hard quotas, reduce it to manual, local, static or deferred
  behavior.

## Phase 4: Persona And Memory Engine

Goal: Make the twin feel meaningfully personal.

- Persona Engine v1
- Confirmed Memory Layer v1
- Memory source links and confidence
- Timeline v1
- Metadata/summary retrieval v1
- Memory confidence scoring
- Sensitive-memory permissions
- Per-twin memory access rules

Success criteria:

- Twin answers with personal context
- Important memories influence answers more than weak facts
- Sensitive memories respect access rules
- Chat history remains available in the profile without becoming raw model
  training data

## Phase 5: Global Discovery

Goal: Make smyst discoverable worldwide.

- `/locations`
- Country pages
- City pages
- Language-specific pages
- Public twin profiles
- Creator profiles
- Local SEO metadata
- Sitemap and hreflang

Success criteria:

- Search engines can discover public twin pages
- Location pages exist for major countries/cities
- Public/private boundaries are respected

## Phase 6: Monetization And Scale

Goal: Turn smyst into a global platform.

Status: Long-term business vision only, not part of the current Free-Only-MVP.
Any paid product, paid access, payment provider or paid infrastructure path
requires a separate written approval and must not be a production dependency for
Phase 1.

- Subscriptions
- Creator monetization
- Access purchases
- Revenue dashboard
- Token and AI cost tracking
- Storage cost tracking
- Usage limits
- Audit logs

Success criteria:

- Revenue and AI cost can be calculated per user/twin
- Paid access can be enforced
- Abuse and excessive AI usage can be limited

## Phase 7: Voice And Video

Goal: Add deep media experiences.

- Voice notes
- AI voice replies
- Video memories
- Video thumbnails
- Waveform previews
- HLS video
- Adaptive bitrate
- Voice consent checks

Success criteria:

- Voice/video works without slowing the core API
- Consent and privacy are explicit
- Media cost remains measurable
