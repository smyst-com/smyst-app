# Backend

This folder is a legacy local-development reference.

Production rule:

- The backend is not a production dependency.
- Production API/auth/storage entry points must run through Cloudflare Workers on the free plan.
- Production state must use Cloudflare storage primitives and IDrive e2, not a self-hosted server stack.

Keep this folder only for experiments, modeling and historical implementation reference.

