# Provisit Grossiste Sync Worker

Phase 1 scaffold is deliberately **read-only**. It exposes:
- `GET /health` (public status)
- `POST /test/{laborex|ubphar|ubipharm}` (protected by `SYNC_TOKEN`)

Provider credentials and Cloudflare API credentials must be Worker Secrets. No passwords are logged or returned. The current endpoint verifies configuration only; it does not yet submit credentials to portals. Provider scripts are blocked until selectors, post-login report navigation, and data fields are reviewed and validated.

## Secrets
- `SYNC_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN` (Browser Rendering/Browser Run permissions only, scoped to this account)
- `LABOREX_USERNAME`, `LABOREX_PASSWORD`
- `UBPHAR_USERNAME`, `UBPHAR_PASSWORD`
- `UBIPHARM_USERNAME`, `UBIPHARM_PASSWORD`

## Test
Run `node --test index.test.mjs`.

No sales rows are imported by this worker. Integration into Provisit sales remains a separate, reviewed step after validating each provider's extraction against a manually downloaded report.
