# Historical Demo Chat QC - 2026-06-12

## Scope

End-to-end follow-up for the low-risk historical profile launch on smyst.com.

## Fixed

- Public historical profile buttons now preserve the selected `twin` query when opening `/twin-chat`.
- The chat UI reads `?twin=...` and shows the selected public or private Twin instead of falling back to a generic "Dein Twin" state.
- Anonymous users keep the selected Twin in the GitHub sign-in return URL.
- Authenticated chats can start with historical demo profile ids such as `leonardo-da-vinci`.
- Chat messages for historical demo profiles now return a source-grounded, rule-based response with disclaimer, source basis and free-only mode.
- Optional local SQL demo seed data now mirrors the five historical starter profiles used by app and Workers.

## Free-Only Compliance

- No paid AI provider was added.
- No external translation, analytics, database or monitoring service was added.
- The implementation stays inside GitHub, Cloudflare Workers/KV and IDrive e2 boundaries.
- Historical demo chat remains rule-based and does not claim to be the real historical person.
- SQL seeds remain optional local/demo files and are not part of the production data path.

## Verification

- TypeScript: `tsc --noEmit` passed.
- Backend historical profile pipeline smoke check passed.
- Vite production build still hangs in this local environment after `vite v6.4.2 building for production...`; this is tracked as an environment/build blocker and was not bypassed by deploying partial Pages artifacts.
- Local Vite dev server started only with elevated local-network permission, but HTTP/browser navigation also hung in this environment.

## Live Checks Required After Deploy

- `/api/public/twins/leonardo-da-vinci` returns public profile metadata.
- `/t/leonardo-da-vinci` returns indexable profile HTML.
- Authenticated `/api/chat/start` with `twinId: "leonardo-da-vinci"` should create `Chat mit Leonardo da Vinci`.
- Authenticated `/api/chat/messages` should return mode `free-only-historical-demo`.

## Known Boundary

The free-only architecture is a Phase-1 MVP. It keeps module boundaries ready for future scale, but it must not promise real billion-user/day capacity on free GitHub and Cloudflare limits.
