# Twynt Architecture Plan

## Goal

Build twynt.com as a global AI identity, memory, persona and media platform.

Twynt is not only an AI chat app. It is a worldwide digital personality platform with memory, voice, media, access control, monetization and local/global discovery.

## Current Foundation

The current repository already contains:

- Vite + React web app
- Capacitor iOS/Android app shell
- Cloudflare Workers for translation, Google auth and IDrive E2 storage
- Cloudflare configuration through `wrangler.toml`
- Setup guide for Cloudflare, GitHub, Google OAuth, translation and storage

This means the project should evolve from the existing foundation instead of being restarted.

## Target Architecture

```text
Mobile App
React Native later / current Capacitor shell now
SQLite + MMKV local database/cache
        |
        | Auth, API, chat, uploads, signed URL requests
        v
Cloudflare Edge
WAF, CDN, rate limits, cache, DNS, geo-routing, signed URLs
        |
        +--> Public Web / SEO Layer
        |    Locations, countries, cities, languages, public twins
        |
        +--> Fastify Core API
        |    Users, twins, chat, access, payments, subscriptions
        |
        +--> Realtime Layer
        |    SSE / WebSockets for chat streaming, notifications and status
        |
        +--> Queue / Event System
        |    Upload events, AI jobs, transcription, embeddings, notifications
        |
        +--> AI Services
        |    Persona, memory, embeddings, retrieval, timeline, emotion analysis
        |
        +--> Object Storage
        |    IDrive E2 / Cloudflare R2
        |    Audio, video, images, PDFs, documents, profile assets
        |
        +--> PostgreSQL + pgvector
             Users, twins, memories, vectors, access rights, revenue, audit logs
```

## Platform Accounts

```text
GitHub Free
Code repository
Version control
Issues
Documentation
Later GitHub Actions for tests and deployment

Cloudflare Free
DNS
CDN
WAF
Rate limiting
Pages / Workers
Edge routing
Domain protection
Global performance layer

IDrive E2
S3-compatible object storage
Media files
Audio files
Video files
Documents
Images
Private and public twin assets
```

## Correct Upload Flow

The mobile app must never receive permanent storage keys.

```text
Mobile App
  -> asks Fastify API or Storage Worker for upload permission

API / Storage Worker
  -> checks user session and access rights
  -> creates signed upload URL

Mobile App
  -> uploads directly to IDrive E2 / Cloudflare R2

Storage
  -> stores file

API
  -> saves metadata in PostgreSQL

Queue
  -> starts background processing

AI Services
  -> transcription
  -> embeddings
  -> memory extraction
  -> emotional weighting
  -> persona update
  -> timeline update
  -> notification
```

## Event-Driven Processing

```text
Upload completed
        |
        v
Queue Event
        |
        +--> Transcribe audio/video
        +--> Extract text from documents
        +--> Generate embeddings
        +--> Detect people, places, topics
        +--> Calculate emotional weight
        +--> Update Memory Graph
        +--> Update Persona Engine
        +--> Update Timeline
        +--> Send notification
```

Start with Cloudflare Queues if the project stays mostly on Cloudflare. Use BullMQ + Redis if the backend later runs as a persistent Node service and needs more queue control.

## Mobile App Layer

The current app uses Capacitor. That is a practical MVP path. If the product later needs deeper native performance, React Native with native Swift/Kotlin modules can become the long-term app layer.

Native features needed over time:

- Camera
- Microphone
- Voice recording
- Push notifications
- Biometrics
- Video processing
- Local encryption
- Background upload
- Audio playback
- Future voice/video features

Local storage:

- SQLite for structured local data
- MMKV for fast key-value state

Local cache should store:

- Chat history
- Feed state
- Drafts
- Upload status
- Voice drafts
- Twin snippets
- Notifications
- Recently viewed memories

## Backend Layer

Fastify should own the main product logic.

Responsibilities:

- Authentication
- User accounts
- Twin creation
- Chat sessions
- Access control
- Payment status
- Subscription logic
- Signed upload URLs
- File metadata
- Public/private permissions
- Revenue tracking
- Admin tools
- Audit logs

Fastify should stay separate from heavy AI work. Heavy AI jobs go to queues and AI services.

## AI Services Layer

AI must be separated from the main API.

Core AI services:

- Persona Engine: values, humor, communication style, emotional patterns, moral boundaries, priorities and personality.
- Memory Engine: stores, ranks and connects memories.
- Retrieval Engine: finds the right memories for each answer.
- Embedding Engine: creates and updates vector embeddings.
- Timeline Engine: builds the life story and chronological context.
- Emotion Engine: weights memories by emotional importance.
- Transcription Engine: converts audio/video into text.
- Moderation / Safety Engine: protects private, sensitive and restricted content.

## Memory System

Do not build only a list of memories. Build structured memory.

Recommended PostgreSQL tables:

- `users`
- `twins`
- `memories`
- `memory_vectors`
- `memory_entities`
- `memory_relationships`
- `memory_events`
- `memory_emotional_weights`
- `memory_sources`
- `memory_permissions`

Memory types:

- Personal memory
- Family memory
- Career memory
- Relationship memory
- Trauma/sensitive memory
- Achievement
- Preference
- Belief
- Story
- Quote
- Voice note
- Document-derived memory

## Memory Graph

The Memory Graph connects life facts.

```text
Person -> Mother
Person -> Childhood
Childhood -> City
City -> School
School -> Friend
Friend -> Important Event
Important Event -> Emotional Weight
Emotional Weight -> Persona Influence
```

Start with PostgreSQL. Do not start with Neo4j unless the graph needs outgrow relational queries later.

## Emotional Weighting

Not every memory is equal.

Higher weight:

- Family
- Love
- Loss
- Death
- Trauma
- Major success
- Major failure
- Life-changing decisions
- Important relationships
- Repeated patterns

Lower weight:

- Random facts
- Small preferences
- Temporary interests
- Low-confidence extracted data

This makes the twin feel more real.

## Realtime Layer

Start simple.

Use SSE for:

- AI chat streaming
- Processing status
- Upload progress events
- Twin update events

Use WebSockets later for:

- Live conversations
- Multi-device sync
- Realtime creator dashboards
- Live revenue stats
- Voice/video interactions

## Global Location Layer

Twynt should become global like a location-based platform.

Public web structure:

```text
/locations
/locations/europe
/locations/germany
/locations/germany/berlin

/de/locations
/en/locations
/tr/locations
/fr/locations
/es/locations
/ar/locations
```

Global discovery supports:

- Countries
- Regions
- Cities
- Languages
- Local creators
- Public twins
- Cultural context
- Local SEO pages
- Regional rankings

This is the growth layer. It makes public twins discoverable worldwide.

## Security Layer

Twynt stores deeply sensitive data.

Required security:

- Device binding
- Biometric unlock
- Session fingerprinting
- Encryption at rest
- Encryption in transit
- Private signed URLs
- Access logs
- Consent logs
- Export system
- Delete system
- Role-based access
- Rate limiting
- Abuse detection
- Public/private twin permissions

Very important: the mobile app must never contain storage access keys. Only the backend creates signed URLs.

## Media Pipeline

MVP:

- Image upload
- Audio upload
- Document upload
- Basic video upload
- Signed URLs
- Metadata storage

Next:

- Audio transcription
- PDF/text extraction
- Image thumbnails
- Audio waveform previews
- Video thumbnails

Later:

- HLS video
- Adaptive bitrate
- FFmpeg pipeline
- Voice cloning checks
- AI audio replies
- Video twin replies

## AI Cost Layer

AI costs must be tracked from day one.

Track:

- Tokens per user
- Tokens per twin
- Embedding cost
- Transcription cost
- Chat cost
- Storage cost
- Video/audio processing cost
- Revenue per user
- Profit per user
- Fair usage limits

This prevents AI costs from exploding.

## Payment / Revenue Layer

Needed for later monetization:

- Subscriptions
- Creator revenue
- Paid public twins
- Private twin access
- Usage-based limits
- Revenue share
- Invoices
- Refund handling
- Payment status

Fastify API should own payment logic. PostgreSQL should store revenue truth.

## Expert Recommendation

Build twynt.com as:

- Identity Platform
- Memory Platform
- Persona Platform
- Media Platform
- Global Discovery Platform

Do not position it only as an AI chat app.

AI chat is only the visible interface. The real product is a structured digital personality with memory, emotion, voice, location, culture, consent and monetization.

