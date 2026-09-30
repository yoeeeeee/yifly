export function stageFaultEligible(env, subscriptionId) {
  return env.ECPAY_ENV === 'stage'
    && env.ECPAY_SINGLE_ENV !== 'production'
    && env.ECPAY_STAGE_SIMULATE_CANCEL_RESPONSE_LOSS === 'true'
    && typeof env.ECPAY_STAGE_FAULT_SUBSCRIPTION_ID === 'string'
    && env.ECPAY_STAGE_FAULT_SUBSCRIPTION_ID === subscriptionId;
}

// Call ONLY after the real Cancel HTTP response body has been read.
// The atomic conditional update is shared across all isolates; nothing auto-arms.
export async function consumeCancelResponseLoss(env, subscriptionId, requestId) {
  if (!stageFaultEligible(env, subscriptionId)) return false;
  const result = await env.DB.prepare(
    "UPDATE stage_fault_injections SET consumed_at=?,consumed_request_id=? WHERE fault_type='cancel_response_loss' AND subscription_id=? AND consumed_at IS NULL"
  ).bind(new Date().toISOString(), requestId, subscriptionId).run();
  if (result.meta.changes !== 1) return false;
  console.log('STAGE TEST: cancel response-loss fault injected', {subscriptionId});
  return true;
}
