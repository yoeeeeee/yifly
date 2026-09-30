# TEMPORARY STAGE DIAGNOSTIC

Remove `GET /api/me/subscription/provider-diagnostic` after investigation.
Requires a verified Firebase bearer token; Stage only. No client parameters.
Selects only the pending subscription specified by the Stage Secret
`ECPAY_STAGE_DIAGNOSTIC_SUBSCRIPTION_ID`, using a SELECT by `id=?`, then separate
existence, verified UID ownership, and pending checks. No provider call before all pass.
Missing target fails closed; another UID or non-pending state cannot query it.
No D1 writes, profile upsert,
cancel, retry, charge, or fault injection. Three queries per minute per UID/IP.
Uses the existing MAC implementation and fixed Stage QueryCreditCardPeriodInfo HTTPS
endpoint, rejects redirects and correlates merchant/trade/amount/period fields.
Response contains only allowlisted fields. Uncorrelated/error responses are UNKNOWN,
not proof of order absence or authorization failure.

Official specification: https://developers.ecpay.com.tw/2892/
ExecStatus: 0 terminated, 1 executing, 2 completed.

Do not paste Firebase tokens into chat. Use an existing authenticated client only.
TestFlight 130 has no diagnostic action; returning from checkout does not invoke this API.

Diagnostic transport failures return HTTP 200 with the existing UNKNOWN result
shape plus safe classification fields, compatible with TestFlight 131. The app
ignores extra fields; detailed classifications are visible in `wrangler tail`.
Only allowlisted provider messages are returned/logged; arbitrary text is never echoed.
Recognized order-not-found messages return `providerOrderFound: false`.
JSON bodies (including official text/html media type), form encoded errors and
single-line code|message errors are parsed; malformed HTML is not treated as success.
Unrecognized failures remain UNKNOWN rather than being guessed as order absence.
Network logs contain only allowlisted exception names and categorical DNS/TLS/reset/
refused/invalid-URL/fetch-failed/other classifications, never exception message or stack.
Stage requests have an ephemeral request ID on every checkpoint and rejection log.
No UID, subscription ID, MerchantTradeNo, TradeNo, request payload or credentials
are logged. Non-Stage is rejected as NOT_STAGE (HTTP 404) silently, because logging
is strictly Stage-only. Stage early returns include exact safe rejection reason.
