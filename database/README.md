# Database

This folder is a legacy local-development reference.

Production rule:

- No separately hosted relational database is required or allowed in the current free-only architecture.
- Production metadata must be modeled through Legacy edge provider Workers/KV and IDrive e2 object metadata/status objects.
- SQL migrations remain useful as domain-model references, not as production deployment steps.

