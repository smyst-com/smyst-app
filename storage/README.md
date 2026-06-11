# Storage

Storage owns IDrive e2 integration, signed URLs, object key rules, lifecycle, deletion, and backups.

Rules:

- Never expose permanent credentials to clients.
- Signed URLs must be short-lived.
- Object keys must not contain emails, names, or original filenames.
- Deleted users/twins/uploads require deletion or retention-marking of IDrive-e2 objects and related KV status.
- Derived chunks/vectors are long-term architecture concepts, not Free-Only MVP production dependencies.
