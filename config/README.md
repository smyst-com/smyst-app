# Config

Configuration files live here.

Rules:

- `env.example` is safe to commit.
- Real `.env` and `.env.production` files are not safe to commit.
- Production secrets belong in GitHub Secrets or Cloudflare Secrets.
- IDrive e2 keys are set only as Cloudflare Worker secrets.
- Local `.env` files are development-only and must not define a production server stack.
