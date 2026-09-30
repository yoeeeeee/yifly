import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {providerDiagnostic,safeProviderResult,safeNetworkError} from '../src/provider-diagnostic.js';
const env={ECPAY_ENV:'stage',ECPAY_STAGE_DIAGNOSTIC_SUBSCRIPTION_ID:'sub_fixture',ECPAY_MERCHANT_ID:'fixture',ECPAY_HASH_KEY:'fixture-key',ECPAY_HASH_IV:'fixture-iv'};
const url='https://worker.invalid/api/me/subscription/provider-diagnostic';
for(const authorization of [null,'Bearer forged.token.signature']) {
  const req=new Request(url,{headers:authorization?{authorization}:{}});
  assert.equal((await worker.fetch(req,env)).status,401);
}
let queries=0,calls=0;
const row={merchant_trade_no:'owned-trade',amount:190,status:'pending'};
const provider={MerchantID:'fixture',MerchantTradeNo:'owned-trade',PeriodAmount:190,PeriodType:'M',Frequency:1,ExecTimes:99,RtnCode:1,amount:190,process_date:'2026/09/30 13:33:05',TotalSuccessTimes:1,TotalSuccessAmount:190,ExecStatus:'1',Card6No:'secret-card',CheckMacValue:'secret-mac',ExecLog:[{RtnCode:1,amount:190,process_date:'2026/09/30 13:33:05',TradeNo:'ref',auth_code:'secret-auth'}]};
env.DB={prepare(sql){assert.match(sql,/^SELECT .* WHERE id=\? AND firebase_uid=\?$/);queries++;return {bind(id,uid){assert.equal(id,'sub_fixture');return {first:async()=>uid==='owner'?row:null}}}}};
const deps={verify:async()=>({uid:'owner'}),mac:async params=>{assert.equal(params.MerchantTradeNo,'owned-trade');return 'fixture-mac'},reply:(body,status)=>new Response(JSON.stringify(body),{status}),limiter:()=>null,providerFetch:async(target,options)=>{calls++;assert.equal(target,'https://payment-stage.ecpay.com.tw/Cashier/QueryCreditCardPeriodInfo');assert.equal(options.redirect,'error');assert.equal(new URLSearchParams(options.body).get('Action'),null);return Response.json(provider)}};
assert.equal((await providerDiagnostic(new Request(url),{...env,ECPAY_ENV:'production'},deps)).status,404);
assert.equal(queries,0);
assert.equal((await providerDiagnostic(new Request(url),{...env,ECPAY_STAGE_DIAGNOSTIC_SUBSCRIPTION_ID:undefined},deps)).status,503);
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
for(const [body,type,status,expected] of [
  [JSON.stringify(provider),'application/json',200,'PROVIDER_RESPONSE'],
  [JSON.stringify(provider),'text/html',200,'PROVIDER_RESPONSE'],
  ['0|訂單不存在','text/plain',200,'ORDER_NOT_FOUND'],
  ['RtnCode=0&RtnMsg=parameter+error','application/x-www-form-urlencoded',200,'PARAMETER_ERROR'],
  ['0|CheckMacValue error','text/plain',200,'MAC_ERROR'],
  ['bad gateway','text/plain',502,'HTTP_ERROR'],
  [JSON.stringify(provider),'application/octet-stream',200,'CONTENT_TYPE_ERROR'],
  ['<html>secret-card secret-mac</html>','text/html',200,'PARSE_ERROR']
]) {
  const res=await providerDiagnostic(new Request(url),env,{...deps,providerFetch:async()=>new Response(body,{status,headers:{'content-type':type}})});
  const data=await res.json();assert.equal(data.classification,expected);
  if(expected==='ORDER_NOT_FOUND')assert.equal(data.providerOrderFound,false);
  assert.ok(!JSON.stringify(data).includes('secret-'));
}
for(const [name,expected] of [['TimeoutError','TIMEOUT'],['TypeError','NETWORK_ERROR']]) {
  const res=await providerDiagnostic(new Request(url),env,{...deps,providerFetch:async()=>{const e=new Error('secret-error');e.name=name;throw e}});
  const data=await res.json();assert.equal(data.classification,expected);assert.ok(!JSON.stringify(data).includes('secret-error'));
}
console.log('diagnostic error classification tests passed');
for(const [message,category] of [['DNS lookup failed','DNS_FAILURE'],['TLS certificate failure','TLS_FAILURE'],['connection reset','CONNECTION_RESET'],['connection refused','CONNECTION_REFUSED'],['invalid URL','INVALID_URL'],['fetch failed','FETCH_FAILED'],['secret-body key iv token signature','OTHER_NETWORK_FAILURE']]) {
  const result=safeNetworkError(new TypeError(message));assert.equal(result.networkCategory,category);assert.ok(!JSON.stringify(result).includes(message));
}
assert.equal(safeNetworkError({name:'secret-token',message:'secret-token',stack:'secret-stack'}).exceptionName,'OtherError');
const hostile=await providerDiagnostic(new Request(url+'?subscription_id=other'),env,deps);assert.equal(hostile.status,400);
console.log('target ownership and sanitized network tests passed');
