# Threat Model

Initial threats:

- Account takeover.
- Unauthorized twin creation.
- Impersonation.
- Deepfake and voice misuse.
- Prompt injection through uploaded files.
- Data exfiltration through chat.
- Public bucket misconfiguration.
- AI cost abuse.
- Scraping public twins.
- Admin privilege misuse.
- GDPR deletion failures.

Initial mitigations:

- RBAC and ABAC.
- Private-by-default uploads.
- Signed URLs.
- Malware scanning before parsing.
- Prompt-injection scanning before retrieval.
- Moderation before and after model calls.
- Audit logs.
- Rate limits.
- Provider circuit breakers.

