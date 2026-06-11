# Uploads

Uploads owns upload intents, file validation, quotas, status transitions, and processing triggers.

Rules:

- Uploads are private by default.
- Storage credentials never reach clients.
- Every uploaded file must get metadata, size/type validation, quota checks and processing status.
- Malware scanning is a long-term safety gate; in the Free-Only MVP risky file types stay blocked or tightly limited until a no-cost approved scan path exists.
