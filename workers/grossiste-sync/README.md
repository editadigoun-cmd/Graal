# Provisit Grossiste Sync Worker

Phase: **daily cumulative sales snapshots (UBIPHARM) with computed previous-day deltas; still read-only on supplier portal**.\n\nVerified on 2026-11-23: the portal landing page and the `StatsVentes` and `Achats` pages are reachable; `StatsVentes` exposes 26 product rows in the captured page. Authentication is not conclusively verified (the worker reports `not_confirmed`). The captured sales page is staged in Provisit under an Admin-only review run; the reference month for `Vente mois` is not confirmed, so no sales/stock/order data is written to the definitive tables.

The Worker is scheduled daily at 06:00 Benin time (05:00 UTC). It opens the UBIPHARM portal through Cloudflare Browser Rendering, authenticates, extracts the `Vente mois` cumulative column, and upserts a daily snapshot in Supabase. The view `grossiste_ventes_journalieres` calculates `today's cumulative - previous capture cumulative` and attributes the delta to the previous day (`date_capture - 1`). The first capture is a baseline with no calculated delta. A cumulative decrease is flagged instead of creating negative sales. It remains read-only on the supplier portal.

## Endpoints
- `GET /health` — health/mode.
- `POST /inspect/ubipharm` — inspect login/public page (token protected).
- `POST /inspect/ubipharm/authenticated` — authenticate then inspect the resulting page (token protected).
- `POST /extract/ubipharm` — authenticate and return a read-only extraction preview of the current authenticated page (token protected).\n- Scheduled event — daily 06:00 Benin time; snapshots cumulative `Vente mois` to Supabase.\n- Supabase view `grossiste_ventes_journalieres` — daily deltas attributed to the previous day, with baseline and decrease anomaly statuses.

## Secrets
Cloudflare Worker secrets:
- `SYNC_TOKEN`
- `UBIPHARM_USERNAME`
- `UBIPHARM_PASSWORD`\n- `SUPABASE_URL` (configured as a non-secret Cloudflare Worker variable)\n- `SUPABASE_SERVICE_ROLE_KEY` (configure once as a Cloudflare Worker secret; never store it in GitHub)

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
