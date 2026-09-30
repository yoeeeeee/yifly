// TEMPORARY STAGE DIAGNOSTIC. Remove after investigation. No database writes.
const target = 'https://payment-stage.ecpay.com.tw/Cashier/QueryCreditCardPeriodInfo';
const integer = value => value !== undefined && value !== null && value !== '' && Number.isSafeInteger(Number(value)) ? Number(value) : null;
export function safeProviderResult(result, row, env) {
  const unknown = {providerOrderFound:'unknown',recurringContract:'UNKNOWN',initialAuthorization:'UNKNOWN',totalSuccessTimes:null,totalSuccessAmount:null,execStatus:null,execLog:[]};
  if (!result || typeof result !== 'object' || Array.isArray(result)) return unknown;
  // A failure code alone does not prove "order not found" or payment failure.
  if (result.MerchantID !== env.ECPAY_MERCHANT_ID || result.MerchantTradeNo !== row.merchant_trade_no ||
      Number(result.PeriodAmount) !== row.amount || result.PeriodType !== 'M' || Number(result.Frequency) !== 1 || Number(result.ExecTimes) !== 99) return unknown;
  const times=integer(result.TotalSuccessTimes),amount=integer(result.TotalSuccessAmount);
  const status=['0','1','2'].includes(String(result.ExecStatus))?String(result.ExecStatus):null;
  const success=times>0 && amount>=row.amount && Number(result.amount)===row.amount && Boolean(result.process_date);
  return {providerOrderFound:true,recurringContract:'EXISTS',initialAuthorization:success?'SUCCESS':'UNKNOWN',
    rtnCode:integer(result.RtnCode),merchantIdMatches:true,totalSuccessTimes:times,totalSuccessAmount:amount,execStatus:status,
    execStatusMeaning:({'0':'TERMINATED','1':'EXECUTING','2':'COMPLETED'})[status]||'UNKNOWN',
    execLog:Array.isArray(result.ExecLog)?result.ExecLog.slice(0,100).map((item,index)=>({index:index+1,RtnCode:integer(item?.RtnCode),Amount:integer(item?.amount),ProcessDate:typeof item?.process_date==='string'?item.process_date.slice(0,30):null,hasTradeNo:typeof item?.TradeNo==='string'&&item.TradeNo.length>0})):[]};
}
export async function providerDiagnostic(req,env,{verify,mac,reply,limiter,providerFetch=fetch}) {
  if(env.ECPAY_ENV!=='stage')return reply({error:'not found'},404,env);
  let profile;try{profile=await verify(req,env)}catch{return reply({error:'unauthorized'},401,env)}
  const url=new URL(req.url);
  if(url.search || req.headers.get('content-length') && req.headers.get('content-length')!=='0')return reply({error:'parameters not allowed'},400,env);
  const limited=limiter(req,env,`provider-diagnostic:${profile.uid}`,3,60000);if(limited)return limited;
  const row=await env.DB.prepare('SELECT merchant_trade_no,amount FROM subscriptions WHERE firebase_uid=? ORDER BY created_at DESC LIMIT 1').bind(profile.uid).first();
  if(!row)return reply({error:'no subscription'},404,env);
  const params={MerchantID:env.ECPAY_MERCHANT_ID,MerchantTradeNo:row.merchant_trade_no,TimeStamp:Math.floor(Date.now()/1000)};
  params.CheckMacValue=await mac(params,env);
  try {
    const response=await providerFetch(target,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params)});
    if(!response.ok)return reply({error:'provider unavailable'},502,env);
    // Official query response is unsigned: only fixed HTTPS, no redirects,
    // strict contract correlation, and an explicit response allowlist.
    return reply(safeProviderResult(await response.json(),row,env),200,env);
  }catch{return reply({error:'provider query unavailable'},502,env)}
}
