# SEO, GEO, AEO, AIO And AI Visibility Architecture

> Status: Partially superseded. SEO/AEO/GEO remains active, but external services and server/database assumptions are not production requirements.

## Goal

smyst.com is designed to become a global, multilingual, machine-readable library of human knowledge, experience, opinion, memory, media, and digital AI twins.

The visibility system optimizes for:

- SEO: Search engine discovery and ranking.
- GEO: Generative engine discovery and citation.
- AEO: Answer engine extraction.
- AIO: AI-native readability and routing.
- LLM optimization.
- AI agent optimization.
- Knowledge graph optimization.
- Semantic search optimization.
- Voice search optimization.
- Multimodal search optimization.

Production visibility must never override privacy, consent, deletion, safety, or legal obligations.

## Primary Discovery Targets

Search and answer systems:

- Google.
- Bing.
- Baidu.
- Yandex.
- Naver.
- DuckDuckGo.
- ChatGPT.
- Claude.
- Gemini.
- DeepSeek.
- Kimi.
- Grok.
- Perplexity.
- Mistral.
- Qwen.
- Future global AI systems and agents.

## Primary Languages

Primary localized routes for Phase 1:

- `en`
- `de`
- `tr`
- `fr`
- `es`
- `pt`
- `ar`
- `zh`
- `ja`
- `ko`

Each language requires:

- Own URL.
- Own metadata.
- Own canonical URL.
- `hreflang` alternates.
- Sitemap entries.
- Structured data.
- Localized public summaries.
- Localized AI-readable summaries.

## Public Page Types

The long-term indexable surface consists of:

- Profile pages.
- AI twin pages.
- Knowledge pages.
- Question-and-answer pages.
- Document pages.
- Media pages.
- Topic pages.
- Entity pages.
- Collection pages.

Every public page must be:

- Indexable only after consent.
- Linkable.
- Shareable.
- Citable.
- Machine-readable.
- Accessible.
- Fast on mobile.
- Reversible through deletion and deindexing workflows.

## Technical Frontend Baseline

Implemented Free-Only baseline:

- 10 primary localized route roots.
- Static localized files in `public/locales`.
- `hreflang` alternates with `x-default`.
- Localized sitemap expansion.
- JSON-LD structured data baseline.
- Global `/llms.txt`.
- Static localized landing pages.

Required next frontend extensions:

- Real dynamic profile, twin, knowledge, document, media, and Q&A pages.
- Per-page JSON-LD by resource type.
- Per-resource Open Graph images.
- Per-resource canonical and translated alternates.
- Paginated sitemap indexes for billions of URLs.
- Image and video metadata pages.
- Web Vitals instrumentation.

## Structured Data Model

Baseline JSON-LD types:

- `WebSite`.
- `Organization`.
- `SoftwareApplication`.
- `FAQPage`.

Future resource JSON-LD types:

- `Person`.
- `ProfilePage`.
- `CreativeWork`.
- `Article`.
- `FAQPage`.
- `QAPage`.
- `MediaObject`.
- `ImageObject`.
- `VideoObject`.
- `AudioObject`.
- `Dataset`.
- `DefinedTerm`.
- `ItemList`.
- `BreadcrumbList`.
- `ClaimReview` where claims require verification.

Every structured object should expose:

- Canonical ID.
- Canonical URL.
- Locale.
- Public title.
- Public summary.
- Source citations.
- Trust signals.
- Consent status.
- Last verified timestamp.

## Knowledge Graph

The graph stores:

- Persons.
- Places.
- Companies.
- Products.
- Events.
- Documents.
- Videos.
- Images.
- Relationships.
- Interests.
- Skills.
- Opinions.
- Memories.
- Citations.

Implemented baseline schema:

- `public_pages`.
- `knowledge_entities`.
- `knowledge_relationships`.
- `public_citations`.
- `semantic_index_documents`.

Graph principles:

- Public graph edges require consent or public-domain basis.
- Private memory can inform private chat but must not leak into public graph pages.
- Every public relationship needs source provenance.
- Confidence scores must be visible to downstream systems.
- Deleted or revoked personal data must be removed from active graph indexes.

## AI-Readable Content Contract

Every public AI-visible resource should have:

- Human title.
- Machine title.
- Short answer summary.
- Long semantic summary.
- Key facts.
- Entity list.
- Relationship list.
- Citations.
- Source checksums when available.
- Content language.
- Translation state.
- Consent state.
- Index state.
- Last updated timestamp.

This allows:

- Search snippets.
- Answer engine extraction.
- LLM citation.
- Voice answer generation.
- AI agent traversal.
- Semantic reranking.

## Multimodal Search Contract

Documents:

- Extract text.
- Extract title, author, dates, language, and document structure.
- Generate citations by page, paragraph, or section.

Images:

- OCR text.
- Alt text.
- Caption.
- Detected entities.
- Safe-search state.
- Source reference.

Audio:

- Transcript.
- Speaker labels where legally allowed.
- Segment timestamps.
- Summary.
- Topic entities.

Video:

- Transcript.
- Scene summaries.
- Keyframes.
- Detected text.
- Detected entities.
- Chapter index.

## Performance Architecture

Targets:

- Mobile-first rendering.
- SSR for public discovery pages.
- Edge caching for anonymous public pages.
- CDN delivery for static assets and public media.
- Lazy loading for below-the-fold media.
- Optimized responsive images.
- Optimized video previews.
- Precomputed public metadata.
- Precomputed embeddings for semantic search.
- Incremental sitemap generation.

Core Web Vitals targets:

- LCP below 2.5 seconds on mobile.
- INP below 200 ms.
- CLS below 0.1.
- TTFB minimized through caching and pre-rendering.

## Privacy And DSGVO Constraints

Indexing is blocked unless:

- User has consented to public indexing.
- Content is not private or restricted.
- Moderation allows publication.
- Deletion request is not active.
- Legal basis is recorded.

Required DSGVO controls:

- Consent tracking.
- Consent revocation.
- Deletion pipeline.
- Deindexing pipeline.
- Data export.
- Audit logs.
- Public/private separation.
- Backup expiry handling.
- Minimal public data exposure.
- Purpose limitation.

## Sitemaps At Scale

The current baseline sitemap is small and static.

At scale, smyst.com needs:

- Sitemap index files.
- Per-locale sitemap files.
- Per-resource-type sitemap files.
- Incremental changed-page sitemap files.
- Last-modified timestamps from `public_pages.updated_at`.
- Strict exclusion for `noindex`, private, deleted, and revoked pages.

Example future structure:

- `/sitemap.xml`.
- `/sitemaps/en/profiles-0001.xml`.
- `/sitemaps/en/twins-0001.xml`.
- `/sitemaps/en/knowledge-0001.xml`.
- `/sitemaps/zh/media-0001.xml`.

## API Requirements

Future API modules:

- `GET /api/v1/public/pages/{id}`.
- `GET /api/v1/public/entities/{id}`.
- `GET /api/v1/public/graph/{entity_id}`.
- `GET /api/v1/public/search`.
- `GET /api/v1/public/sitemap-index`.
- `POST /api/v1/indexing/rebuild`.
- `POST /api/v1/indexing/deindex`.

All public APIs need:

- Rate limits.
- Cache headers.
- Abuse protection.
- Privacy filters.
- Audit logging for administrative changes.

## Prioritized Roadmap

1. Keep production release blocked until full foundation tests run.
2. Finish real dynamic public page routes for profiles, twins, knowledge, Q&A, documents, and media.
3. Store public-safe profile snapshots in Salad/IDrive metadata.
4. Build consent-aware indexing/export logic in Salad API.
5. Build deindexing service for deletion and consent revocation.
6. Generate per-page JSON-LD from resource data.
7. Generate dynamic sitemap indexes from `public_pages`.
8. Add semantic index jobs for public resources.
9. Add graph extraction and entity resolution from parsed content.
10. Add citation extraction and source provenance.
11. Add repository-managed static translations for public summaries.
12. Add multimodal metadata extraction for images, audio, and video.
13. Add public search API with hybrid full-text and vector search.
14. Add answer API for public, citation-backed summaries.
15. Add Web Vitals and crawl observability dashboards.
16. Add search engine and AI crawler monitoring.
17. Add international SEO QA automation.
18. Add production CDN and edge cache policies.
19. Add large-scale sitemap partitioning.
20. Add release-gated production rollout.

## Current Risks

- Full live IDrive e2 static hosting/Workers, PWA and IDrive-e2 tests have not run in this local environment.
- Dynamic public pages are not yet connected to real backend data.
- Some sitemap URLs currently resolve to baseline SSR pages, not final resource pages.
- Real AI integrations for OCR, transcription, video analysis, embeddings, and LLM routing are long-term placeholders and not Free-Only production requirements.
- Public indexing must remain blocked for private or unconsented data.
- Global scale requires a future distributed architecture beyond the Free-Only MVP.

## Decision

smyst.com will be built as an AI-first, privacy-first public knowledge platform:

- Public knowledge is optimized for humans, search engines, answer engines, and AI agents.
- Private memory remains private and non-indexable.
- Every public AI twin, profile, document, media file, and fact must be traceable, citable, and revocable.
- No production release may happen without the release-governance approval phrase.
