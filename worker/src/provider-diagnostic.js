// TEMPORARY STAGE DIAGNOSTIC. Remove after investigation. No database writes.
const target = 'https://payment-stage.ecpay.com.tw/Cashier/QueryCreditCardPeriodInfo';
const integer = value => value !== undefined && value !== null && value !== '' && Number.isSafeInteger(Number(value)) ? Number(value) : null;
const emptyResult=()=>({providerOrderFound:'unknown',recurringContract:'UNKNOWN',initialAuthorization:'UNKNOWN',totalSuccessTimes:null,totalSuccessAmount:null,execStatus:null,execLog:[]});
export function diagnosticMessage(value) {
  const msg=typeof value==='string'?value.trim().toLowerCase():'';
  if(['查無訂單','查無此訂單','查無交易','查無此交易','訂單不存在','order not found','trade not found'].includes(msg))return 'ORDER_NOT_FOUND';
  if(['checkmacvalue error','checkmacvalue錯誤','檢查碼錯誤','mac error'].includes(msg))return 'MAC_ERROR';
  if(['parameter error','參數錯誤','參數檢查失敗'].includes(msg))return 'PARAMETER_ERROR';
  if(['success','ok','成功','查詢成功'].includes(msg))return 'SUCCESS';
  return 'UNRECOGNIZED_PROVIDER_MESSAGE'; // Never echo arbitrary provider text.
}
export function parseDiagnostic(text) {
  try {const result=JSON.parse(text);if(result&&typeof result==='object'&&!Array.isArray(result))return result;}catch{}
  if(/^\s*-?\d+\|[^\r\n]*\s*$/.test(text)){const at=text.indexOf('|');return {RtnCode:text.slice(0,at).trim(),RtnMsg:text.slice(at+1).trim()};}
  const fields=new URLSearchParams(text);
  if(fields.has('RtnCode')&&!/[<>]/.test(text))return Object.fromEntries(fields);
  return null;
}
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
    const contentType=response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()||'';
    const safeType=['application/json','text/html','text/plain','application/x-www-form-urlencoded'].includes(contentType)?contentType:'unexpected';
    const result=parseDiagnostic((await response.text()).slice(0,65536));
    const message=diagnosticMessage(result?.RtnMsg);
    const info={providerHttpStatus:response.status,providerContentType:safeType,rtnCode:integer(result?.RtnCode),rtnMsg:message,parseFailure:!result,networkFailure:false,timeout:false,orderNotFound:response.ok&&message==='ORDER_NOT_FOUND'};
    const classification=!response.ok?'HTTP_ERROR':!result?'PARSE_ERROR':safeType==='unexpected'?'CONTENT_TYPE_ERROR':message==='ORDER_NOT_FOUND'?'ORDER_NOT_FOUND':message==='MAC_ERROR'?'MAC_ERROR':message==='PARAMETER_ERROR'?'PARAMETER_ERROR':'PROVIDER_RESPONSE';
    console.log('stage provider diagnostic',{merchantTradeNo:row.merchant_trade_no,classification,...info});
    const safe=response.ok&&safeType!=='unexpected'&&result?safeProviderResult(result,row,env):emptyResult();
    if(info.orderNotFound){safe.providerOrderFound=false;safe.recurringContract='NOT FOUND';}
    // Official query response is unsigned: only fixed HTTPS, no redirects,
    // strict contract correlation, and an explicit response allowlist.
    return reply({...safe,...info,classification},200,env);
  }catch(error){
    const timeout=error?.name==='TimeoutError'||error?.name==='AbortError';
    const info={providerHttpStatus:null,providerContentType:null,rtnCode:null,rtnMsg:null,parseFailure:false,networkFailure:!timeout,timeout,orderNotFound:false,classification:timeout?'TIMEOUT':'NETWORK_ERROR'};
    console.log('stage provider diagnostic',{merchantTradeNo:row.merchant_trade_no,...info});
    return reply({...emptyResult(),...info},200,env);
  }
}
