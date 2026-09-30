import assert from "node:assert/strict";
import { ecpayMode, resolvePublicPaymentAmount, resolveSubscriptionPlan, subscriptionEntitlement } from "../src/index.js";

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
console.log("security tests passed");
