# Single donation production readiness (not deployed)

Single-payment routes use only ECPAY_SINGLE_ENV, ECPAY_SINGLE_MERCHANT_ID,
ECPAY_SINGLE_HASH_KEY and ECPAY_SINGLE_HASH_IV. Missing configuration fails closed;
there is no fallback to recurring credentials. Keep the existing ECPAY_ENV and
ECPAY_MERCHANT_ID/HASH_KEY/HASH_IV Stage bindings unchanged.

ECPAY_SINGLE_ENV=production blocks recurring routes, /api/me/subscription routes,
temporary provider/credential diagnostics and Stage cancellation fault injection.
Stage testing remains available on a Stage-configured deployment. A production
deployment cannot simultaneously expose Stage subscription testing routes.

Before a separately authorized switch, set these via interactive Wrangler only:

    npx wrangler secret put ECPAY_SINGLE_MERCHANT_ID
    npx wrangler secret put ECPAY_SINGLE_HASH_KEY
    npx wrangler secret put ECPAY_SINGLE_HASH_IV
    npx wrangler secret put ECPAY_SINGLE_ENV

Set ECPAY_SINGLE_ENV to production only at the authorized switch. Do not change
the original recurring Secrets. Deploy only after all configuration is ready.
Existing Stage single-payment callbacks will not validate against production
single credentials. Resolve any outstanding Stage checkout testing before switching;
never manually mark those orders paid. Existing recurring callbacks are intentionally
blocked on the production launch deployment, so keep Stage testing on a separate
Stage deployment if it must continue receiving callbacks.

Authenticated order status requires the verified owner; anonymous order status
remains minimal (status only) for the public result page. Result redirects never
update payment state. No database migration is required.

Website monthly buttons are disabled. App recurring purchase UI is disabled unless
the build explicitly defines YIFLY_STAGE_DIAGNOSTIC. Ensure production Release builds
do not define this flag. Existing TestFlight 131 is not changed by source edits;
a newly built App is required. Backend guards also reject old clients.

Local verification: node tests/single-production.test.mjs and existing test scripts.
No real payment/provider request is performed by these mocks.
