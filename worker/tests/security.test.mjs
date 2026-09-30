import assert from "node:assert/strict";
import { ecpayMode, nextMonth, resolvePublicPaymentAmount, resolveSubscriptionPlan, subscriptionEntitlement } from "../src/index.js";

assert.equal(resolveSubscriptionPlan({ planId: "monthly_190", amount: 1 }), null);
assert.equal(resolveSubscriptionPlan({ planId: "monthly_190" }).amount, 190);
assert.equal(resolveSubscriptionPlan({ planId: "monthly_390" }).amount, 390);
assert.equal(resolvePublicPaymentAmount({ planId: "support_50", amount: 1 }), null);
assert.equal(resolvePublicPaymentAmount({ planId: "support_500", amount: 500 }), 500);
assert.equal(resolvePublicPaymentAmount({ amount: 49 }), null);
assert.equal(resolvePublicPaymentAmount({ amount: 50.5 }), null);
assert.equal(resolvePublicPaymentAmount({ amount: 10001 }), null);
assert.equal(resolvePublicPaymentAmount({ amount: Number.POSITIVE_INFINITY }), null);
assert.equal(ecpayMode({ ECPAY_ENV: "stage" }), "stage");
assert.equal(ecpayMode({ ECPAY_ENV: "production" }), "production");
assert.equal(ecpayMode({ ECPAY_ENV: "unexpected" }), null);
assert.equal(subscriptionEntitlement({ status: "active", current_period_end: "2030-01-01T00:00:00.000Z" }, Date.parse("2029-01-01T00:00:00.000Z")), true);
assert.equal(subscriptionEntitlement({ status: "active", current_period_end: "2029-01-01T00:00:00.000Z" }, Date.parse("2029-01-01T00:00:00.000Z")), false);
assert.equal(subscriptionEntitlement({ status: "cancelled", current_period_end: "2030-01-01T00:00:00.000Z" }, 0), false);
for (const [start, expected] of [
  ["2025-01-31T12:34:56.000Z", "2025-02-28T12:34:56.000Z"],
  ["2025-01-30T12:34:56.000Z", "2025-02-28T12:34:56.000Z"],
  ["2024-01-31T12:34:56.000Z", "2024-02-29T12:34:56.000Z"],
  ["2024-02-29T12:34:56.000Z", "2024-03-29T12:34:56.000Z"],
  ["2025-02-28T12:34:56.000Z", "2025-03-28T12:34:56.000Z"],
  ["2025-03-31T12:34:56.000Z", "2025-04-30T12:34:56.000Z"],
  ["2025-08-31T12:34:56.000Z", "2025-09-30T12:34:56.000Z"],
  ["2025-12-31T12:34:56.000Z", "2026-01-31T12:34:56.000Z"]
]) assert.equal(nextMonth(start), expected);
assert.throws(() => nextMonth("not-a-date"), TypeError);
console.log("security tests passed");
