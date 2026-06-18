# Auth

Production identity runs through the Cloudflare Worker auth layer.

Current production direction:

- GitHub OAuth is the allowed external OAuth provider.
- Sessions are stored in Cloudflare KV.
- Cookies are HttpOnly, Secure and SameSite=Strict.
- Google OAuth is disabled for production.

Legacy backend/database auth notes may remain as local development references only. They are not production requirements.
