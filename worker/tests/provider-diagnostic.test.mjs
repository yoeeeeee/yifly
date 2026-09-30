import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {providerDiagnostic,safeProviderResult} from '../src/provider-diagnostic.js';
const env={ECPAY_ENV:'stage',ECPAY_MERCHANT_ID:'fixture',ECPAY_HASH_KEY:'fixture-key',ECPAY_HASH_IV:'fixture-iv'};
const url='https://worker.invalid/api/me/subscription/provider-diagnostic';
for(const authorization of [null,'Bearer forged.token.signature']) {
  const req=new Request(url,{headers:authorization?{authorization}:{}});
  assert.equal((await worker.fetch(req,env)).status,401);
}
let queries=0,calls=0;
const row={merchant_trade_no:'owned-trade',amount:190};
const provider={MerchantID:'fixture',MerchantTradeNo:'owned-trade',PeriodAmount:190,PeriodType:'M',Frequency:1,ExecTimes:99,RtnCode:1,amount:190,process_date:'2026/09/30 13:33:05',TotalSuccessTimes:1,TotalSuccessAmount:190,ExecStatus:'1',Card6No:'secret-card',CheckMacValue:'secret-mac',ExecLog:[{RtnCode:1,amount:190,process_date:'2026/09/30 13:33:05',TradeNo:'ref',auth_code:'secret-auth'}]};
env.DB={prepare(sql){assert.match(sql,/^SELECT .* WHERE firebase_uid=\?/);queries++;return {bind(uid){return {first:async()=>uid==='owner'?row:null}}}}};
const deps={verify:async()=>({uid:'owner'}),mac:async params=>{assert.equal(params.MerchantTradeNo,'owned-trade');return 'fixture-mac'},reply:(body,status)=>new Response(JSON.stringify(body),{status}),limiter:()=>null,providerFetch:async(target,options)=>{calls++;assert.equal(target,'https://payment-stage.ecpay.com.tw/Cashier/QueryCreditCardPeriodInfo');assert.equal(options.redirect,'error');assert.equal(new URLSearchParams(options.body).get('Action'),null);return Response.json(provider)}};
assert.equal((await providerDiagnostic(new Request(url),{...env,ECPAY_ENV:'production'},deps)).status,404);
assert.equal(queries,0);
assert.equal((await providerDiagnostic(new Request(url+'?MerchantTradeNo=other'),env,deps)).status,400);
assert.equal((await providerDiagnostic(new Request(url),env,{...deps,verify:async()=>({uid:'other'})})).status,404);
assert.equal(calls,0);
const response=await providerDiagnostic(new Request(url),env,deps),result=await response.json();
assert.equal(response.status,200);assert.equal(result.initialAuthorization,'SUCCESS');assert.equal(result.execStatusMeaning,'EXECUTING');
assert.equal(calls,1);
for(const sensitive of ['secret-card','secret-mac','secret-auth','Card6No','CheckMacValue','auth_code'])assert.ok(!JSON.stringify(result).includes(sensitive));
assert.equal(safeProviderResult({...provider,MerchantTradeNo:'other'},row,env).providerOrderFound,'unknown');
assert.equal(safeProviderResult({RtnCode:999},row,env).initialAuthorization,'UNKNOWN');
console.log('provider diagnostic tests passed (SELECT-only mock rejects writes)');
