# Cancellation reconciliation

Provider documentation: https://developers.ecpay.com.tw/2892/ and https://developers.ecpay.com.tw/2900/.

Current flow: verified Firebase UID → own subscription → atomic pending reservation → signed Cancel → authenticate response → atomic confirmation. Before sending, reservation failures prevent the provider call. After sending, transport, parsing, MAC, identity or persistence failure leaves uncertainty. A crash leaves pending; after 2 minutes its effective state becomes reconciliation_required. Legacy request IDs are interpreted the same way without migrating existing row contents. Existing cancel_at_period_end=1 is interpreted as confirmed.

QueryCreditCardPeriodInfo is a documented POST endpoint. ExecStatus 0=terminated, 1=executing, 2=completed. Its documented JSON response has no CheckMacValue. The server sends a signed request to a fixed HTTPS endpoint, disallows redirects, requires successful HTTP/JSON and exact MerchantID, MerchantTradeNo, PeriodAmount, PeriodType, Frequency and ExecTimes correlation. Only 0 confirms termination; 1 allows a new cancellation attempt. All other states stay unknown. Card fragments and authorization details returned by ECPay are never logged or returned.

POST /api/me/subscription/reconcile is Firebase authenticated and chooses the subscription using verified UID, never client IDs. It does not submit Cancel. Each subscription has a 30-second reconciliation claim and requests time out after 15 seconds. Conditional request IDs prevent stale results from overwriting newer state. A signed Cancel failure is reconciled, including already-disabled errors, rather than treated as successful cancellation or retried blindly.

States: none → pending → confirmed or reconciliation_required. pending suppresses duplicate provider calls. confirmed retries return immediately. reconciliation_required only queries the provider. current_period_end is never modified by cancellation or reconciliation.

## Manual recovery if provider query remains unknown

1. Keep reconciliation_required; do not display cancellation success or resend Cancel.
2. Operator verifies the correct Stage/Production merchant account and exact MerchantTradeNo in ECPay's recurring order details. Capture timestamp and provider evidence in a restricted operational ticket, excluding card data and secrets.
3. If provider confirms terminated, verify the same subscription ID, merchant trade number and current cancellation request ID in a read-only D1 query. Only then perform a prepared conditional update setting cancel_state=confirmed, cancel_at_period_end=1 and cancelled_at, guarded by subscription ID and that request ID. Do not change current_period_end. Record affected row count; require exactly one.
4. If provider confirms executing, conditional update cancel_state=none and clear cancellation_request_id/cancellation_requested_at using the same guards. User can submit a fresh cancellation afterward.
5. Unknown or conflicting evidence: leave reconciliation_required and contact ECPay support. Never infer cancellation from first-payment status or an authorization refund.

No manual recovery was performed on existing subscriptions in this implementation.

## Verification limits

Local cancellation.test.mjs uses isolated simulated provider responses and an in-memory database double; it covers success, signed failure, network/response loss, malformed/MAC/identity mismatch, persistence failure, retries, expiry, UID isolation and query outcomes. It does not claim a live ECPay transaction was tested.

Blocking manual Stage acceptance: with a NEW disposable Stage subscription authorized by the owner, confirm query ExecStatus for active and cancelled states; exercise App reconciliation after a deliberately interrupted cancellation response; verify no additional Cancel request is sent, current period stays unchanged and UI refreshes to confirmed. Do not cancel the two protected existing Stage subscriptions. Production switch remains gated on this acceptance. No credentials or environment were changed.
