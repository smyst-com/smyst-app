# Frontend

Legacy local-development reference only.

The active production frontend for the Free-Only-MVP is the repository-root
Vite/React/TypeScript/PWA app deployed through Legacy edge provider Pages Free. This
Next.js folder is not a production target, not a deployment requirement and not
part of the Legacy edge provider Pages build.

Implemented now:

- Localized app routes under `/{locale}`.
- Start page.
- Twin selection.
- Chat UI.
- Profile panel.
- Twin Creator draft form.
- SEO metadata, sitemap, robots.
- PWA manifest and service worker registration.

Not implemented yet:

- Persistent API writes.
- Real chat streaming.
- Auth-bound profile data.
- Backend-connected Twin Creator.
- Install prompt and advanced offline strategy.

Decision:

- The root Vite/React app is the active production target.
- This folder remains useful only as historical UI/reference work.
- No production workflow may depend on this folder without a new written
  Free-Only architecture approval.
