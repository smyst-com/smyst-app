# Twynt Roadmap

## Phase 1: Foundation

Goal: Make the existing app deployable, protected and connected.

- Create GitHub repository `twynt-app`
- Initialize Git in this project folder
- Push existing code to GitHub
- Connect GitHub to Cloudflare Pages
- Configure `twynt.com` on Cloudflare
- Create Cloudflare KV namespaces
- Create IDrive E2 bucket `twynt-memories`
- Set Cloudflare secrets for auth, translation and storage
- Deploy Workers for translation, auth and storage
- Verify production URL and custom domain

Success criteria:

- `https://twynt.com` loads from Cloudflare
- GitHub is the source of truth for code
- Cloudflare Pages deploys from `main`
- Workers are deployed
- IDrive E2 upload signing is ready

## Phase 2: Product MVP

Goal: Make twynt usable as an early product.

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

## Phase 3: Queue And AI Processing

Goal: Move slow work out of the request path.

- Add queue/event system
- Process upload events asynchronously
- Transcribe audio/video
- Extract text from documents
- Create embeddings
- Extract memory candidates
- Save memory source links
- Show processing status to user

Success criteria:

- Upload does not block on AI processing
- User sees pending/processing/ready states
- Memories become searchable after processing

## Phase 4: Persona And Memory Engine

Goal: Make the twin feel meaningfully personal.

- Persona Engine v1
- Memory Graph v1
- Emotional Weighting v1
- Timeline v1
- Retrieval Engine v1
- Memory confidence scoring
- Sensitive-memory permissions

Success criteria:

- Twin answers with personal context
- Important memories influence answers more than weak facts
- Sensitive memories respect access rules

## Phase 5: Global Discovery

Goal: Make twynt discoverable worldwide.

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

Goal: Turn twynt into a global platform.

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

