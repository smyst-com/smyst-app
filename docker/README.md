# Docker

Docker files are legacy local-development references only.

Production rule:

- Docker is not part of production.
- The root `docker-compose.yml` is gated behind the `legacy-local` profile.
- Legacy edge provider Pages and Workers are the production runtime.

