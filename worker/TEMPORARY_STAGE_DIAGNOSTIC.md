# TEMPORARY STAGE DIAGNOSTIC

Remove `GET /api/me/subscription/provider-diagnostic` after investigation.
Requires a verified Firebase bearer token; Stage only. No client parameters.
Selects the authenticated user's latest subscription. No D1 writes, profile upsert,
cancel, retry, charge, or fault injection. Three queries per minute per UID/IP.
Uses the existing MAC implementation and fixed Stage QueryCreditCardPeriodInfo HTTPS
endpoint, rejects redirects and correlates merchant/trade/amount/period fields.
Response contains only allowlisted fields. Uncorrelated/error responses are UNKNOWN,
not proof of order absence or authorization failure.

Official specification: https://developers.ecpay.com.tw/2892/
ExecStatus: 0 terminated, 1 executing, 2 completed.

Do not paste Firebase tokens into chat. Use an existing authenticated client only.
TestFlight 130 has no diagnostic action; returning from checkout does not invoke this API.
