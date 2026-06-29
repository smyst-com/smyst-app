# Config

Configuration files live here.

Rules:

- `env.example` is safe to commit.
- Real `.env` and `.env.production` files are not safe to commit.
- Production secrets belong in GitHub Secrets or Salad runtime secrets.
- IDrive e2 keys are set only in GitHub Actions or Salad runtime secrets.
- Local `.env` files are development-only and must not define a production server stack.
