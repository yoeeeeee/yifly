import assert from 'node:assert/strict';
import { cancellationState, processCancellation, queryState } from '../src/cancellation.js';
import worker, { subscriptionEntitlement } from '../src/index.js';

const base={id:'test-sub',firebase_uid:'A',merchant_trade_no:'test-trade',amount:190,status:'active',current_period_end:'2030-01-01T00:00:00.000Z',cancel_state:'none',cancel_at_period_end:0};
const env={ECPAY_ENV:'stage',ECPAY_MERCHANT_ID:'dummy',ECPAY_HASH_KEY:'test-only',ECPAY_HASH_IV:'test-only',PUBLIC_SITE_ORIGIN:'https://yoeeeeee.github.io'};
const deps={reply:(x,status)=>new Response(JSON.stringify(x),{status}),mac:async()=> 'TEST-MAC',endpoint:()=> 'https://payment-stage.ecpay.com.tw/Cashier/CreditCardPeriodAction',entitlement:subscriptionEntitlement,limiter:()=>null};
const valid={MerchantID:'dummy',MerchantTradeNo:'test-trade',RtnCode:1,CheckMacValue:'TEST-MAC'};
const query={...valid,PeriodAmount:190,PeriodType:'M',Frequency:1,ExecTimes:99,ExecStatus:'0'};
const originalFetch=globalThis.fetch;
async function run({row={...base},result=valid,throws=false,updateFailure=false,uid='A',reconcile=false}={}) {
  let calls=0;const sqls=[];
  env.DB={prepare(sql){return {bind(...args){return {first:async()=>args[0]===row.firebase_uid?row:null,run:async()=>{
    sqls.push(sql);
    if(sql.includes("cancel_state='pending'")){row.cancel_state='pending';row.cancellation_request_id=args[0];row.cancellation_requested_at=args[1];}
    if(sql.includes('cancellation_checked_at=?')){row.cancellation_request_id=args[1];row.cancel_state='reconciliation_required';}
    if(sql.includes("cancel_state='confirmed'")){if(updateFailure)throw Error('database unavailable');row.cancel_state='confirmed';row.cancel_at_period_end=1;}
    if(sql.includes("cancel_state='reconciliation_required',updated_at"))row.cancel_state='reconciliation_required';
    if(sql.includes("cancel_state='none',cancellation_request_id=NULL")){row.cancel_state='none';row.cancellation_request_id=null;}
    return {meta:{changes:1}};
  }}}}}};
  globalThis.fetch=async(url,options)=>{calls++;assert.equal(options.redirect,'error');assert.ok(options.signal);if(throws)throw Error('response lost');return new Response(typeof result==='string'?result:JSON.stringify(result));};
  const response=await processCancellation(new Request('https://test/cancel'),env,{uid},deps,reconcile);
  assert.equal(row.current_period_end,base.current_period_end);
  assert.equal(subscriptionEntitlement(row),true);
  return {row,calls,response,sqls};
}
try {
  assert.equal((await run()).row.cancel_state,'confirmed');
  for(const result of [{...valid,RtnCode:0},'malformed',{...valid,CheckMacValue:'BAD'},{...valid,MerchantID:'other'},{...valid,MerchantTradeNo:'other'}]) {
    const outcome=await run({result});assert.equal(outcome.row.cancel_state,'reconciliation_required');assert.equal(outcome.row.cancel_at_period_end,0);
  }
  for(const scenario of [{throws:true},{throws:true},{updateFailure:true}])assert.equal((await run(scenario)).row.cancel_state,'reconciliation_required');
  for(const state of ['pending','confirmed','reconciliation_required']){
    const row={...base,cancel_state:state,cancellation_requested_at:new Date().toISOString()};
    const outcome=await run({row,result:query});
    assert.equal(outcome.calls,state==='reconciliation_required'?1:0);
  }
  assert.equal(cancellationState({...base,cancel_state:'pending',cancellation_requested_at:'2020-01-01T00:00:00Z'}),'reconciliation_required');
  assert.equal((await run({uid:'B',reconcile:true})).response.status,404);
  for(const [status,state] of [['0','confirmed'],['1','none'],['2','reconciliation_required'],['invalid','reconciliation_required']]){
    const outcome=await run({row:{...base,cancel_state:'reconciliation_required'},result:{...query,ExecStatus:status},reconcile:true});assert.equal(outcome.row.cancel_state,state);
  }
  assert.equal(queryState({...query,PeriodAmount:1},base,env),'unknown');
  const missing=await worker.fetch(new Request('https://test/api/me/subscription/reconcile',{method:'POST'}),env);assert.equal(missing.status,401);
  console.log('cancellation regression: all scenarios passed (mock provider and isolated in-memory D1 only)');
}finally{globalThis.fetch=originalFetch;}
