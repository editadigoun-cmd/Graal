# Provisit Grossiste Sync Worker

Current phase: **UBIPHARM browser diagnostics only**. The worker uses Cloudflare Browser Run through the `BROWSER` binding to inspect the portal's public/login page and identify its visible form controls. It does not submit credentials, change portal data, or import sales.

## Endpoints
- `GET /health` — public health status.
- `POST /inspect/ubipharm` — protected by `SYNC_TOKEN`; opens the UBIPHARM Benin portal and returns page diagnostics (title, URL, visible form/input metadata, links and limited body text). Only UBIPHARM is enabled in this phase.

## Secrets
Configure in Cloudflare Worker Secrets / environment:
- `SYNC_TOKEN`
- `UBIPHARM_USERNAME` and `UBIPHARM_PASSWORD` (reserved for the next verified login step; not used by diagnostics)
- Future providers: `LABOREX_USERNAME`, `LABOREX_PASSWORD`, `UBPHAR_USERNAME`, `UBPHAR_PASSWORD`

No credentials should be sent in chat, committed to Git, or logged.

## Browser
Wrangler configuration declares the Cloudflare Browser Run binding as `BROWSER`. Browser automation requires Browser Run enabled for the Cloudflare account.

## Next
After inspecting the actual login page and confirming its selectors and authorized flow, implement login using secrets, then inspect the authenticated supplier portal. Capture product rows and section/group boundaries; resolve each product to its laboratory using the Provisit product catalog. Unknown/ambiguous products go to review. Compare extracted totals against a manually downloaded report before any sales import.

Run tests with `node --test index.test.mjs`.


## Automated deployment (GitHub Actions)
Workflow: `.github/workflows/grossiste-sync.yml` (main only). On changes to this worker, it installs dependencies, runs tests, deploys to Cloudflare, and sets Worker secrets.

Required GitHub repository Actions secrets:
- `CF_API_TOKEN`: Cloudflare token with Workers Scripts Edit and Browser Rendering Edit on the target account.
- `CF_ACCOUNT_ID`: Cloudflare account ID.
- `PROVISIT_SYNC_TOKEN`: long random bearer token.
- `UBIPHARM_USERNAME`
- `UBIPHARM_PASSWORD`

The actual supplier portal is `https://fournisseur-benin.ubipharm.com`, discovered from the public UBIPHARM Benin site. No credential has been entered or submitted yet.

After secrets are set, use Actions > Deploy Provisit UBIPHARM Sync Worker > Run workflow. Once deployed, the diagnostics endpoint is `POST https://provisit-grossiste-sync.<your-workers-subdomain>.workers.dev/inspect/ubipharm` with header `Authorization: Bearer <PROVISIT_SYNC_TOKEN>`.

This first deployment only inspects the portal page and form metadata. The login automation and authenticated data extraction are the next phase, after the actual supplier login flow has been verified.
