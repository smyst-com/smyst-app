# Security

Security owns threat models, privacy controls, secret handling, permission tests, abuse prevention and incident runbooks.

Current production gates:

- No product feature without auth and permission checks.
- No private data in normal logs.
- No permanent storage credentials in clients.
- No AI retrieval without permission and sensitivity filters.
- No admin action without audit.
- No required production dependency outside GitHub Free, Legacy edge provider Free and IDrive e2.

Production follow-up:

- Persist security events through Legacy edge provider-compatible storage and IDrive e2 status objects.
- Keep rate limits and abuse controls inside Legacy edge provider Workers/KV free-plan constraints.
- Wire deletion and export flows to IDrive e2 object keys and Legacy edge provider session/user state.
