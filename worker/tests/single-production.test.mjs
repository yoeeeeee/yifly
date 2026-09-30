import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker, {singlePaymentMode,singlePaymentBindings,recurringAvailable} from '../src/index.js';
import {stageFaultEligible} from '../src/stage-fault.js';
import {stageCredentialCheck} from '../src/provider-diagnostic.js';

// Local mocks only. No provider requests, remote D1 or deployment credentials.
const source=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
const functions=source.split('\n').filter(line=>/^(function ecpayEncode|function ecpaySort|async function mac)\(/.test(line));
const {mac}=new Function(functions.join('\n')+';return {mac}')();
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);jwk.kid='local-test';
const originalFetch=globalThis.fetch;
globalThis.fetch=async url=>{assert.equal(url,'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');return Response.json({keys:[jwk]},{headers:{'cache-control':'max-age=3600'}})};
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
async function token(uid){const now=Math.floor(Date.now()/1000);const head=encode({alg:'RS256',kid:jwk.kid}),claims=encode({aud:'fixture-project',iss:'https://securetoken.google.com/fixture-project',sub:uid,iat:now,auth_time:now,exp:now+3600});const body=`${head}.${claims}`;return `${body}.${Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(body))).toString('base64url')}`}
const tokens={A:await token('user-A'),B:await token('user-B')};
const orders=[];let paidWrites=0;
const env={ECPAY_ENV:'stage',ECPAY_MERCHANT_ID:'recurring-fixture',ECPAY_HASH_KEY:'recurring-key',ECPAY_HASH_IV:'recurring-iv',ECPAY_SINGLE_ENV:'production',ECPAY_SINGLE_MERCHANT_ID:'single-fixture',ECPAY_SINGLE_HASH_KEY:'single-key',ECPAY_SINGLE_HASH_IV:'single-iv',FIREBASE_PROJECT_ID:'fixture-project',PUBLIC_SITE_ORIGIN:'https://yoeeeeee.github.io',DB:{prepare(sql){return {bind(...args){return {
  run:async()=>{if(sql.startsWith('INSERT INTO users'))return {meta:{changes:1}};if(sql.startsWith('INSERT INTO orders')){orders.push({order_id:args[0],merchant_trade_no:args[1],amount:args[2],firebase_uid:args[3],status:'pending'});return {meta:{changes:1}}}if(sql.startsWith('UPDATE orders')){const order=orders.find(row=>row.merchant_trade_no===args.at(-1));assert.ok(order);if(sql.includes("status='paid'")){order.status='paid';paidWrites++}else order.status='failed';return {meta:{changes:1}}}throw Error('Unexpected write')},
  first:async()=>orders.find(row=>row.order_id===args[0]||row.merchant_trade_no===args[0])||null,
  all:async()=>{assert.match(sql,/WHERE firebase_uid=\?/);return {results:orders.filter(row=>row.firebase_uid===args[0]).map(row=>({orderId:row.order_id,amount:row.amount,status:row.status}))}}
}}}}}};
let sequence=0;
const request=(path,{method='GET',body,uid,form,origin}={})=>new Request('https://worker.invalid'+path,{method,headers:{'cf-connecting-ip':`fixture-${sequence++}`,...(uid?{authorization:`Bearer ${tokens[uid]}`} : {}),...(origin?{origin}:{}),...(body?{'content-type':'application/json'}:{})},body:form?new URLSearchParams(form):body?JSON.stringify(body):undefined});
async function create(body,uid){const res=await worker.fetch(request(uid?'/api/payment/create':'/api/payment/create-public',{method:'POST',body,uid,origin:env.PUBLIC_SITE_ORIGIN}),env);assert.equal(res.status,200);const result=await res.json();assert.equal(result.action,'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5');assert.equal(result.params.MerchantID,env.ECPAY_SINGLE_MERCHANT_ID);assert.equal(result.params.CheckMacValue,await mac(result.params,singlePaymentBindings(env)));assert.match(result.params.OrderResultURL,/\/api\/payment\/result$/);return result}
try {
  assert.equal(singlePaymentMode(env),'production');assert.equal(recurringAvailable(env),false);
  assert.equal(singlePaymentMode({...env,ECPAY_SINGLE_ENV:'invalid'}),null);
  assert.equal(recurringAvailable({...env,ECPAY_SINGLE_ENV:'stage'}),true);
  assert.equal(singlePaymentBindings(env).ECPAY_HASH_KEY,'single-key');
  assert.equal(singlePaymentBindings({...env,ECPAY_SINGLE_HASH_KEY:undefined}).ECPAY_HASH_KEY,undefined);
  const anonymous=await create({planId:'support_50'}),owned=await create({planId:'support_100'},'A');
  assert.equal(orders[0].firebase_uid,null);assert.equal(orders[1].firebase_uid,'user-A');
  await create({amount:10000},'B');
  const stageResult=await worker.fetch(request('/api/payment/create-public',{method:'POST',body:{planId:'support_300'},origin:env.PUBLIC_SITE_ORIGIN}),{...env,ECPAY_SINGLE_ENV:'stage'});
  assert.equal((await stageResult.json()).action,'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5');
  for(const amount of [49,10001,0,-1,50.5])assert.equal((await worker.fetch(request('/api/payment/create-public',{method:'POST',body:{amount},origin:env.PUBLIC_SITE_ORIGIN}),env)).status,400);
  assert.equal((await worker.fetch(request('/api/payment/create-public',{method:'POST',body:{planId:'support_50',amount:1},origin:env.PUBLIC_SITE_ORIGIN}),env)).status,400);
  assert.equal((await worker.fetch(request('/api/payment/create',{method:'POST',body:{planId:'support_50'}}),env)).status,401);
  const forged=request('/api/payment/create',{method:'POST',body:{planId:'support_50'}});forged.headers.set('authorization','Bearer forged.token.signature');assert.equal((await worker.fetch(forged,env)).status,401);
  const base={MerchantID:env.ECPAY_SINGLE_MERCHANT_ID,MerchantTradeNo:anonymous.params.MerchantTradeNo,TradeAmt:'50',RtnCode:'1',TradeNo:'fixture-reference',PaymentType:'Credit_CreditCard',SimulatePaid:'0'};
  async function callback(overrides={},invalid=false){const form={...base,...overrides};form.CheckMacValue=invalid?'invalid':await mac(form,singlePaymentBindings(env));return worker.fetch(request('/api/payment/callback',{method:'POST',form}),env)}
  assert.equal((await callback({},true)).status,400);
  assert.equal((await callback({MerchantID:'wrong'})).status,400);
  assert.equal((await callback({TradeAmt:'51'})).status,400);
  assert.equal((await callback({MerchantTradeNo:'UnknownTrade'})).status,404);
  assert.equal((await callback({SimulatePaid:'1'})).status,400);
  const redirect=await worker.fetch(request('/api/payment/result',{method:'POST',form:base}),env);assert.equal(redirect.status,303);assert.equal(orders[0].status,'pending');assert.match(redirect.headers.get('location'),/^https:\/\/yoeeeeee.github.io\/yifly\/support-success.html\?orderId=/);
  assert.equal(await (await callback()).text(),'1|OK');assert.equal(await (await callback()).text(),'1|OK');assert.equal(paidWrites,1);
  const failed=await callback({MerchantTradeNo:owned.params.MerchantTradeNo,TradeAmt:'100',RtnCode:'0'});assert.equal(await failed.text(),'1|OK');assert.equal(orders[1].status,'failed');
  assert.equal((await worker.fetch(request('/api/payment/status/'+owned.orderId),env)).status,401);
  assert.equal((await worker.fetch(request('/api/payment/status/'+owned.orderId,{uid:'B'}),env)).status,404);
  const status=await worker.fetch(request('/api/payment/status/'+owned.orderId,{uid:'A'}),env);assert.deepEqual(await status.json(),{status:'failed'});
  assert.deepEqual(await (await worker.fetch(request('/api/payment/status/'+anonymous.orderId),env)).json(),{status:'paid'});
  const history=await (await worker.fetch(request('/api/me/payments',{uid:'A'}),env)).json();assert.equal(history.payments.length,1);assert.equal(history.payments[0].orderId,owned.orderId);
  for(const path of ['/api/subscriptions/create','/api/subscription/callback','/api/subscription/period-callback','/api/subscription/result','/api/me/subscription/provider-diagnostic','/api/me/subscription/cancel','/api/me/subscription/reconcile'])assert.equal((await worker.fetch(request(path,{method:path.includes('diagnostic')?'GET':'POST'}),env)).status,404);
  assert.equal(stageCredentialCheck(env),null);
  assert.equal(stageFaultEligible({...env,ECPAY_STAGE_SIMULATE_CANCEL_RESPONSE_LOSS:'true',ECPAY_STAGE_FAULT_SUBSCRIPTION_ID:'fixture'},'fixture'),false);
  console.log('single production readiness: isolated credentials/endpoints, auth, amounts, callback verification, idempotency, result, ownership, recurring/diagnostic/fault guards PASS');
}finally{globalThis.fetch=originalFetch}
