import assert from 'node:assert/strict';
import { processCancellation } from '../src/cancellation.js';
import { consumeCancelResponseLoss, stageFaultEligible } from '../src/stage-fault.js';

const defaultRow={id:'disposable',firebase_uid:'owner',merchant_trade_no:'trade',amount:190,status:'active',current_period_end:'2030-01-01T00:00:00Z',cancel_state:'none',cancel_at_period_end:0,cancelled_at:null};
const enabled={ECPAY_ENV:'stage',ECPAY_MERCHANT_ID:'test-merchant',ECPAY_STAGE_SIMULATE_CANCEL_RESPONSE_LOSS:'true',ECPAY_STAGE_FAULT_SUBSCRIPTION_ID:'disposable'};
const deps={reply:(body,status)=>new Response(JSON.stringify(body),{status}),mac:async()=> 'test-mac',endpoint:env=>`https://payment${env.ECPAY_ENV==='stage'?'-stage':''}.ecpay.com.tw/Cashier/CreditCardPeriodAction`,entitlement:()=>true,limiter:()=>null};
const originalFetch=globalThis.fetch;
async function fixture(config, req=new Request('https://worker/cancel',{method:'POST'}), failure=false) {
  const row={...defaultRow},events=[],fault={consumed_at:null,armed_at:'2026-09-30T00:00:00Z'};
  const env={...config,DB:{prepare(sql){return {bind(...args){return {
    first:async()=>args[0]===row.firebase_uid?row:null,
    run:async()=>{
      if(sql.includes('UPDATE stage_fault_injections')){
        events.push('consume');assert.ok(events.includes('response-bytes'));
        if(fault.consumed_at)return {meta:{changes:0}};
        fault.consumed_at=args[0];return {meta:{changes:1}};
      }
      if(sql.includes("cancel_state='pending'")){row.cancel_state='pending';row.cancellation_request_id=args[0];row.cancellation_requested_at=args[1];}
      if(sql.includes('cancellation_checked_at=?')){row.cancellation_request_id=args[1];row.cancel_state='reconciliation_required';}
      if(sql.includes("cancel_state='reconciliation_required',updated_at"))row.cancel_state='reconciliation_required';
      if(sql.includes("cancel_state='confirmed'")){events.push('confirmed');row.cancel_state='confirmed';row.cancel_at_period_end=1;row.cancelled_at=args[0];}
      return {meta:{changes:1}};
    }
  }}}}}};
  globalThis.fetch=async(url)=>{
    const query=url.includes('QueryCreditCardPeriodInfo');events.push(query?'query':'cancel');
    return {ok:true,text:async()=>{events.push('response-bytes');return JSON.stringify({MerchantID:'test-merchant',MerchantTradeNo:'trade',RtnCode:failure?0:1,CheckMacValue:'test-mac'});},json:async()=>({MerchantID:'test-merchant',MerchantTradeNo:'trade',RtnCode:1,PeriodAmount:190,PeriodType:'M',Frequency:1,ExecTimes:99,ExecStatus:'0'})};
  };
  const invoke=(reconcile=false)=>processCancellation(req,env,{uid:'owner'},deps,reconcile);
  await invoke();return {row,fault,events,env,invoke};
}
try {
  for(const config of [{...enabled,ECPAY_STAGE_SIMULATE_CANCEL_RESPONSE_LOSS:'false'},{...enabled,ECPAY_STAGE_FAULT_SUBSCRIPTION_ID:'other'},{...enabled,ECPAY_ENV:'production'}]){
    const f=await fixture(config);assert.equal(f.row.cancel_state,'confirmed');assert.equal(f.fault.consumed_at,null);assert.ok(!f.events.includes('consume'));
  }
  assert.equal(stageFaultEligible({...enabled,ECPAY_ENV:'production'},'disposable'),false);
  for(const failure of [false,true]){
    const f=await fixture(enabled,undefined,failure);
    assert.deepEqual(f.events,['cancel','response-bytes','consume']);
    assert.equal(f.row.cancel_state,'reconciliation_required');assert.equal(f.row.cancel_at_period_end,0);assert.equal(f.row.cancelled_at,null);assert.equal(f.row.current_period_end,defaultRow.current_period_end);assert.ok(f.fault.consumed_at);
    assert.equal(await consumeCancelResponseLoss(f.env,'disposable','retry'),false);
    await f.invoke(true);assert.ok(f.events.includes('query'));assert.equal(f.row.cancel_state,'confirmed');assert.equal(f.row.current_period_end,defaultRow.current_period_end);
    await f.invoke();assert.equal(f.events.filter(x=>x==='cancel').length,1);
  }
  const attacks=[new Request('https://worker/cancel?simulate=true',{method:'POST'}),new Request('https://worker/cancel',{method:'POST',headers:{'X-Simulate':'true','X-Debug':'true'}}),new Request('https://worker/cancel',{method:'POST',body:JSON.stringify({simulate:true,ECPAY_STAGE_SIMULATE_CANCEL_RESPONSE_LOSS:'true',subscriptionId:'disposable'})})];
  for(const req of attacks){const f=await fixture({ECPAY_ENV:'stage',ECPAY_MERCHANT_ID:'test-merchant'},req);assert.equal(f.row.cancel_state,'confirmed');assert.equal(f.fault.consumed_at,null);}
  // Concurrent consumes share one atomic persisted guard, not isolate memory.
  let consumed=false;const env={...enabled,DB:{prepare(){return {bind(){return {run:async()=>{if(consumed)return {meta:{changes:0}};consumed=true;return {meta:{changes:1}};}}}}}}};
  assert.equal((await Promise.all([consumeCancelResponseLoss(env,'disposable','a'),consumeCancelResponseLoss(env,'disposable','b')])).filter(Boolean).length,1);
  console.log('stage fault regression passed: disabled/target/production/client controls, response boundary, one-shot, retry, real query code path');
}finally{globalThis.fetch=originalFetch;}
