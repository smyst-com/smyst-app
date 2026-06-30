# smyst.com Production Change Control

Status: active

## Hard rule

No production change may be made without written approval from the owner.

This includes:

- DNS changes at Spaceship.
- IDrive e2 bucket, policy, object, website-hosting or backup changes.
- Salad compute, API, cron, indexer or backend deployment changes.
- GitHub `main` merges, production workflow runs and release tags.
- Database schema, migration, seed, backup or restore changes.
- API key, OAuth, secret, token or provider configuration changes.
- Cloudflare changes. Cloudflare is not part of the smyst.com production target.

## Required approval text

Production release approval must be explicit and written in the current working context.

Recommended approval text:

```text
Ja OK: deploy smyst.com Produktion jetzt.
```

## Pre-release checks

Before any production release:

- `git status` reviewed; unrelated user changes are not included.
- TypeScript build passes.
- Backend syntax/tests relevant to the changed code pass.
- `https://cherry-asparagus-a32jleuk8dgn22zu.salad.cloud/api/v1/health/live` returns HTTP 200.
- `https://cherry-asparagus-a32jleuk8dgn22zu.salad.cloud/api/v1/health/ready` returns HTTP 200.
- `https://api.smyst.com/api/v1/health/live` returns HTTP 200 after DNS cutover.
- `https://smyst.com/` loads the current production build.

## Post-release checks

After release:

- Test `smyst.com` desktop and mobile viewport.
- Check console warnings/errors.
- Check auth session probe.
- Check core navigation.
- Check public profile discovery.
- Check static assets, manifest and service worker.
- Record exact deployment time, commit SHA and smoke-test result.
