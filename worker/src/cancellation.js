import { consumeCancelResponseLoss } from './stage-fault.js';
const PENDING_MS = 120000;
export function cancellationState(row, now = Date.now()) {
  if (row.cancel_at_period_end) return 'confirmed';
  const state = row.cancel_state || 'none';
  if (state === 'pending' || (state === 'none' && row.cancellation_request_id)) {
    const requested = Date.parse(row.cancellation_requested_at);
    return Number.isFinite(requested) && now - requested < PENDING_MS ? 'pending' : 'reconciliation_required';
  }
  return state;
}
export function queryState(result, row, env) {
  if (!result || String(result.RtnCode) !== '1' || result.MerchantID !== env.ECPAY_MERCHANT_ID ||
      result.MerchantTradeNo !== row.merchant_trade_no || Number(result.PeriodAmount) !== row.amount ||
      result.PeriodType !== 'M' || Number(result.Frequency) !== 1 || Number(result.ExecTimes) !== 99) return 'unknown';
  if (String(result.ExecStatus) === '0') return 'cancelled';
  if (String(result.ExecStatus) === '1') return 'active';
  return 'unknown'; // Completed is not proof of a cancellation.
}
const own = (env, uid) => env.DB.prepare("SELECT * FROM subscriptions WHERE firebase_uid=? AND status='active' ORDER BY created_at DESC LIMIT 1").bind(uid).first();
export async function processCancellation(req, env, profile, deps, reconcile = false) {
  const { reply, mac, endpoint, entitlement, limiter } = deps;
  const limited = limiter(req, env, `subscription-${reconcile ? 'reconcile' : 'cancel'}:${profile.uid}`, 6, 600000);
  if (limited) return limited;
  const row = await own(env, profile.uid);
  if (!row) return reply({error:'no active subscription'},404,env);
  let state = cancellationState(row);
  const response = (status = 200) => reply({active:entitlement(row),cancelState:state,cancelAtPeriodEnd:state==='confirmed',currentPeriodEnd:row.current_period_end},status,env);
  if (state === 'confirmed') return response();
  if (state === 'pending') return response(202);
  if (!reconcile && !entitlement(row)) return reply({error:'subscription expired'},409,env);
  const requestId = `cancel_${crypto.randomUUID()}`, now = new Date().toISOString();
  const markUnknown = async () => {
    state = 'reconciliation_required';
    try { await env.DB.prepare("UPDATE subscriptions SET cancel_state='reconciliation_required',updated_at=? WHERE id=? AND cancellation_request_id=? AND cancel_at_period_end=0").bind(new Date().toISOString(),row.id,requestId).run(); }
    catch { console.error('cancellation persistence unavailable',{subscriptionId:row.id}); }
    return response(202);
  };
  if (state === 'reconciliation_required' || reconcile) {
    if (state === 'none') return response();
    const cutoff = new Date(Date.now()-30000).toISOString();
    const lock = await env.DB.prepare("UPDATE subscriptions SET cancellation_checked_at=?,cancellation_request_id=?,cancel_state='reconciliation_required' WHERE id=? AND firebase_uid=? AND cancel_at_period_end=0 AND (cancellation_checked_at IS NULL OR cancellation_checked_at<=?)").bind(now,requestId,row.id,profile.uid,cutoff).run();
    if (!lock.meta.changes) return response(202);
    const params={MerchantID:env.ECPAY_MERCHANT_ID,MerchantTradeNo:row.merchant_trade_no,TimeStamp:Math.floor(Date.now()/1000)};
    params.CheckMacValue=await mac(params,env);
    try {
      const target=endpoint(env).replace('CreditCardPeriodAction','QueryCreditCardPeriodInfo');
      const res=await fetch(target,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params)});
      if(!res.ok) return markUnknown();
      const result=await res.json();
      // Official query response has no CheckMacValue; trust only the fixed HTTPS endpoint,
      // reject redirects and correlate every contract field before using ExecStatus.
      const provider=queryState(result,row,env);
      console.log('cancellation provider queried',{subscriptionId:row.id,providerStatus:provider});
      if(provider==='unknown')return markUnknown();
      state=provider==='cancelled'?'confirmed':'none';
      const sql=provider==='cancelled'
        ? "UPDATE subscriptions SET cancel_state='confirmed',cancel_at_period_end=1,cancelled_at=COALESCE(cancelled_at,?),updated_at=? WHERE id=? AND cancellation_request_id=?"
        : "UPDATE subscriptions SET cancel_state='none',cancellation_request_id=NULL,cancellation_requested_at=NULL,updated_at=? WHERE id=? AND cancellation_request_id=?";
      const statement=env.DB.prepare(sql);
      const saved=await (provider==='cancelled'?statement.bind(now,now,row.id,requestId):statement.bind(now,row.id,requestId)).run();
      if(!saved.meta.changes)return markUnknown();
      console.log('cancellation reconciled',{subscriptionId:row.id,state});
      return response();
    } catch { return markUnknown(); }
  }
  const reserved=await env.DB.prepare("UPDATE subscriptions SET cancel_state='pending',cancellation_request_id=?,cancellation_requested_at=?,updated_at=? WHERE id=? AND firebase_uid=? AND cancel_at_period_end=0 AND cancel_state='none' AND cancellation_request_id IS NULL").bind(requestId,now,now,row.id,profile.uid).run();
  if(!reserved.meta.changes){state='pending';return response(202);}
  const params={MerchantID:env.ECPAY_MERCHANT_ID,MerchantTradeNo:row.merchant_trade_no,Action:'Cancel',TimeStamp:Math.floor(Date.now()/1000)};
  params.CheckMacValue=await mac(params,env);
  try {
    const res=await fetch(endpoint(env),{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params)});
    const text=await res.text();
    // Exact fault boundary: real provider response bytes received, before parsing,
    // authenticity/result decisions or any confirmed subscription write.
    if(await consumeCancelResponseLoss(env,row.id,requestId))return markUnknown();
    if(!res.ok)return markUnknown();
    let result;
    try{result=JSON.parse(text);}catch{result=Object.fromEntries(new URLSearchParams(text));}
    if(!result || result.MerchantID!==env.ECPAY_MERCHANT_ID || result.MerchantTradeNo!==row.merchant_trade_no ||
       !result.CheckMacValue || result.CheckMacValue!==await mac(result,env))return markUnknown();
    // A signed failure (including already disabled) is reconciled rather than retried blindly.
    if(String(result.RtnCode)!=='1')return markUnknown();
    const saved=await env.DB.prepare("UPDATE subscriptions SET cancel_state='confirmed',cancel_at_period_end=1,cancelled_at=?,updated_at=? WHERE id=? AND cancellation_request_id=?").bind(now,now,row.id,requestId).run();
    if(!saved.meta.changes)return markUnknown();
    state='confirmed';console.log('subscription cancellation confirmed',{subscriptionId:row.id});return response();
  }catch{return markUnknown();}
}
