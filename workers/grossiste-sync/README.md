# Provisit Grossiste Sync Worker

Phase: **read-only UBIPHARM portal navigation, extraction preview, and admin staging**.\n\nVerified on 2026-11-23: the portal landing page and the `StatsVentes` and `Achats` pages are reachable; `StatsVentes` exposes 26 product rows in the captured page. Authentication is not conclusively verified (the worker reports `not_confirmed`). The captured sales page is staged in Provisit under an Admin-only review run; the reference month for `Vente mois` is not confirmed, so no sales/stock/order data is written to the definitive tables.

The worker opens the UBIPHARM supplier portal through Cloudflare Browser Rendering, authenticates using configured Cloudflare secrets, and returns a limited preview of visible page text, tables, links and download candidates. It does **not** click export/download controls, modify portal data, or write any data to Provisit yet. Every result is marked as requiring review and not imported.

## Endpoints
- `GET /health` — health/mode.
- `POST /inspect/ubipharm` — inspect login/public page (token protected).
- `POST /inspect/ubipharm/authenticated` — authenticate then inspect the resulting page (token protected).
- `POST /extract/ubipharm` — authenticate and return a read-only extraction preview of the current authenticated page (token protected).

## Secrets
Cloudflare Worker secrets:
- `SYNC_TOKEN`
- `UBIPHARM_USERNAME`
- `UBIPHARM_PASSWORD`

Do not send credentials in chat or commit them. The worker never returns or logs credential values.

## Browser
Cloudflare Browser Run binding: `BROWSER`.

## Next implementation phases
1. Verify the login flow and extraction preview against the live portal.
2. Map portal navigation and safely read permitted pages/reports, including downloadable reports when available.
3. Add a Provisit staging API/table with run metadata, raw preview, normalized records and validation flags.
4. Build Admin review UI; only Admin approval applies changes to definitive sales/stock data.

Unknown/ambiguous product matches must remain flagged for review. No final import before explicit Admin approval.

## Deployment
GitHub Actions workflow `.github/workflows/grossiste-sync.yml` deploys on main changes and manual dispatch. Required repository secrets: `CF_API_TOKEN`, `CF_ACCOUNT_ID`, `PROVISIT_SYNC_TOKEN`, `UBIPHARM_USERNAME`, `UBIPHARM_PASSWORD`.
