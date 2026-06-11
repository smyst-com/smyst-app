# Vector

This folder is a legacy local-development reference for retrieval and embedding experiments.

Production rule:

- No separately hosted vector database is required in the current free-only architecture.
- Any production retrieval prototype must stay within Cloudflare Workers/KV and IDrive e2 constraints.
- Permission and sensitivity filters remain mandatory before any retrieval path is exposed.

