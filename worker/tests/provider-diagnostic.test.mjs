import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {providerDiagnostic,safeProviderResult,safeNetworkError} from '../src/provider-diagnostic.js';
const env={ECPAY_ENV:'stage',ECPAY_STAGE_DIAGNOSTIC_SUBSCRIPTION_ID:'sub_fixture',ECPAY_MERCHANT_ID:'fixture',ECPAY_HASH_KEY:'fixture-key',ECPAY_HASH_IV:'fixture-iv'};
const url='https://worker.invalid/api/me/subscription/provider-diagnostic';
for(const authorization of [null,'Bearer forged.token.signature']) {
  const req=new Request(url,{headers:authorization?{authorization}:{}});
  assert.equal((await worker.fetch(req,env)).status,401);
}
let queries=0,calls=0,signingInput;
const row={firebase_uid:'owner',merchant_trade_no:'owned-trade',amount:190,status:'pending'};
const provider={MerchantID:'fixture',MerchantTradeNo:'owned-trade',PeriodAmount:190,PeriodType:'M',Frequency:1,ExecTimes:99,RtnCode:1,amount:190,process_date:'2026/09/30 13:33:05',TotalSuccessTimes:1,TotalSuccessAmount:190,ExecStatus:'1',Card6No:'secret-card',CheckMacValue:'secret-mac',ExecLog:[{RtnCode:1,amount:190,process_date:'2026/09/30 13:33:05',TradeNo:'ref',auth_code:'secret-auth'}]};
env.DB={prepare(sql){assert.match(sql,/^SELECT .* WHERE id=\?$/);queries++;return {bind(id){assert.equal(id,'sub_fixture');return {first:async()=>row}}}}};
const deps={verify:async()=>({uid:'owner'}),mac:async params=>{assert.equal(params.MerchantTradeNo,'owned-trade');assert.ok(Object.hasOwn(params,'PlatformID'));assert.equal(params.PlatformID,'');assert.deepEqual(Object.keys(params).sort(),['MerchantID','MerchantTradeNo','PlatformID','TimeStamp']);signingInput={...params};return 'fixture-mac'},reply:(body,status)=>new Response(JSON.stringify(body),{status}),limiter:()=>null,providerFetch:async(target,options)=>{calls++;assert.equal(target,'https://payment-stage.ecpay.com.tw/Cashier/QueryCreditCardPeriodInfo');assert.equal(options.redirect,'manual');assert.equal(typeof options.body,'string');assert.equal(options.headers['content-type'],'application/x-www-form-urlencoded');const form=new URLSearchParams(options.body);assert.deepEqual([...form.keys()],['MerchantID','MerchantTradeNo','PlatformID','TimeStamp','CheckMacValue']);assert.ok(form.has('PlatformID'));assert.equal(form.get('PlatformID'),'');assert.deepEqual([...form.keys()].filter(key=>key!=='CheckMacValue').sort(),Object.keys(signingInput).sort());for(const key of Object.keys(signingInput))assert.equal(form.get(key),String(signingInput[key]));assert.doesNotThrow(()=>new Request(target,options));assert.ok(!options.body.includes('undefined'));assert.ok(!options.body.includes('null'));assert.equal(form.get('Action'),null);return Response.json(provider)}};
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
  ['', 'text/html',302,'HTTP_ERROR'],
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
const captured=[];const originalLog=console.log;
console.log=(...args)=>captured.push(args);
try {
  const run=async(e=env,d=deps)=>{captured.length=0;const response=await providerDiagnostic(new Request(url),e,d);return {status:response.status,logs:captured.map(x=>x[1])}};
  for(const [e,d,reason] of [
    [{...env,ECPAY_STAGE_DIAGNOSTIC_SUBSCRIPTION_ID:undefined},deps,'TARGET_SECRET_MISSING'],
    [env,{...deps,verify:async()=>{throw Error('secret-token')}},'FIREBASE_AUTH_FAILED'],
    [{...env,DB:{prepare:()=>({bind:()=>({first:async()=>null})})}},deps,'TARGET_NOT_FOUND'],
    [env,{...deps,verify:async()=>({uid:'different-secret-uid'})},'UID_MISMATCH'],
    [{...env,DB:{prepare:()=>({bind:()=>({first:async()=>({...row,status:'active'})})})}},deps,'STATUS_NOT_PENDING'],
    [{...env,DB:{prepare:()=>{throw Error('secret-db-message')}}},deps,'OTHER'],
    [env,{...deps,mac:async()=>{throw Error('secret-key')}},'OTHER'],
    [env,{...deps,limiter:()=>new Response('{}',{status:429})},'OTHER']
  ]) {
    const {logs}=await run(e,d);assert.ok(logs.some(x=>x.checkpoint==='DIAG_REJECT'&&x.state===reason));
    assert.ok(logs.some(x=>x.checkpoint==='DIAG_PROVIDER_QUERY'&&x.state==='NOT_STARTED'));
    assert.equal(new Set(logs.map(x=>x.requestId)).size,1);
    for(const secret of ['secret-token','secret-key','secret-db-message','different-secret-uid','owned-trade','sub_fixture','fixture-key','fixture-iv'])assert.ok(!JSON.stringify(logs).includes(secret));
  }
  const valid=await run();assert.ok(valid.logs.some(x=>x.checkpoint==='DIAG_PROVIDER_QUERY'&&x.state==='STARTED'));
  for(const checkpoint of ['QUERY_BUILD_START','QUERY_BUILD_OK','QUERY_SIGN_START','QUERY_SIGN_OK','QUERY_BODY_BUILD_START','QUERY_BODY_BUILD_OK','FETCH_START','FETCH_RESPONSE_RECEIVED'])assert.ok(valid.logs.some(x=>x.checkpoint===checkpoint));
  const fetchThrow=await run(env,{...deps,providerFetch:async()=>{throw new TypeError('secret-token redirect failed')}});
  assert.ok(fetchThrow.logs.some(x=>x.checkpoint==='FETCH_THROW'&&x.networkCategory==='REDIRECT_FAILURE'));
  assert.ok(!JSON.stringify(fetchThrow.logs).includes('secret-token'));
  const timed=await run(env,{...deps,providerFetch:async()=>{throw new DOMException('secret-timeout','TimeoutError')}});
  assert.ok(timed.logs.some(x=>x.checkpoint==='FETCH_THROW'&&x.networkCategory==='TIMEOUT'));
  assert.ok(valid.logs.some(x=>x.checkpoint==='DIAG_REQUEST_RECEIVED'));
  assert.ok(valid.logs.some(x=>x.checkpoint==='DIAG_UID_OWNERSHIP'&&x.state==='MATCH'));
  const production=await run({...env,ECPAY_ENV:'production'});assert.equal(production.status,404);assert.equal(production.logs.length,0);
} finally {console.log=originalLog}
console.log('checkpoint rejection coverage and sensitive-log tests passed');
for(const [message,category] of [['Failed to parse URL','INVALID_URL'],['Invalid header value token=secret','INVALID_HEADER'],['Invalid request body secret-card','INVALID_REQUEST_BODY'],['Redirect failure Bearer secret','REDIRECT_FAILURE'],['Unsupported operation HashKey=secret','UNSUPPORTED_OPERATION']]) {
  assert.equal(safeNetworkError(new TypeError(message)).networkCategory,category);
  assert.ok(!JSON.stringify(safeNetworkError(new TypeError(message))).includes('secret'));
}
console.log('fetch construction phases and safe TypeError tests passed');
