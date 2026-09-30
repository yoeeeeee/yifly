// TEMPORARY STAGE DIAGNOSTIC. Remove after investigation. No database writes.
const target = 'https://payment-stage.ecpay.com.tw/Cashier/QueryCreditCardPeriodInfo';
export function safeNetworkError(error) {
  const name=['TypeError','Error','TimeoutError','AbortError','NetworkError','SyntaxError'].includes(error?.name)?error.name:'OtherError';
  const message=typeof error?.message==='string'?error.message.toLowerCase():'';
  const code=typeof error?.cause?.code==='string'?error.cause.code:'';
  // Inspect internally; never echo message/cause/stack or arbitrary exception names.
  const category=['TimeoutError','AbortError'].includes(name)?'TIMEOUT':
    /dns|name resolution|enotfound|eai_again/.test(message)||['ENOTFOUND','EAI_AGAIN'].includes(code)?'DNS_FAILURE':
    /tls|ssl|certificate/.test(message)||code.startsWith('ERR_TLS_')?'TLS_FAILURE':
    /connection reset|econnreset/.test(message)||code==='ECONNRESET'?'CONNECTION_RESET':
    /connection refused|econnrefused/.test(message)||code==='ECONNREFUSED'?'CONNECTION_REFUSED':
    /invalid url|url is invalid|parse url/.test(message)?'INVALID_URL':
    /invalid header|header name|header value/.test(message)?'INVALID_HEADER':
    /request body|body type|body.*used|body.*locked/.test(message)?'INVALID_REQUEST_BODY':
    /redirect/.test(message)?'REDIRECT_FAILURE':
    /unsupported|not supported|not implemented/.test(message)?'UNSUPPORTED_OPERATION':
    /illegal invocation|incompatible receiver/.test(message)?'INVALID_INVOCATION':
    /network connection lost|connection closed/.test(message)?'CONNECTION_LOST':
    /fetch failed|failed to fetch/.test(message)?'FETCH_FAILED':'OTHER_NETWORK_FAILURE';
  return {exceptionName:name,networkCategory:category};
}
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
  const requestId=crypto.randomUUID().slice(0,8);
  const log=(checkpoint,state,details={})=>{if(env.ECPAY_ENV==='stage')console.log('stage diagnostic',{requestId,checkpoint,state,...details})};
  const reject=(reason,body,status)=>{log('DIAG_PROVIDER_QUERY','NOT_STARTED');log('DIAG_REJECT',reason);return reply(body,status,env)};
  if(env.ECPAY_ENV!=='stage')return reply({error:'not found'},404,env);
  log('DIAG_REQUEST_RECEIVED','RECEIVED');log('DIAG_STAGE_CHECK','PASS');
  let profile;try{profile=await verify(req,env);log('DIAG_FIREBASE_AUTH','SUCCESS')}catch{log('DIAG_FIREBASE_AUTH','FAILED');return reject('FIREBASE_AUTH_FAILED',{error:'unauthorized'},401)}
  const url=new URL(req.url);
  if(url.search || req.headers.get('content-length') && req.headers.get('content-length')!=='0')return reject('OTHER',{error:'parameters not allowed'},400);
  const limited=limiter(req,env,`provider-diagnostic:${profile.uid}`,3,60000);if(limited){log('DIAG_PROVIDER_QUERY','NOT_STARTED');log('DIAG_REJECT','OTHER',{category:'RATE_LIMITED'});return limited;}
  const subscriptionId=env.ECPAY_STAGE_DIAGNOSTIC_SUBSCRIPTION_ID;
  const targetPresent=typeof subscriptionId==='string'&&/^sub_[A-Za-z0-9]+$/.test(subscriptionId);
  log('DIAG_TARGET_SECRET',targetPresent?'PRESENT':'MISSING');
  if(!targetPresent)return reject('TARGET_SECRET_MISSING',{error:'diagnostic target not configured'},503);
  let row;
  try{row=await env.DB.prepare('SELECT firebase_uid,merchant_trade_no,amount,status FROM subscriptions WHERE id=?').bind(subscriptionId).first()}
  catch{ return reject('OTHER',{error:'diagnostic unavailable'},503) }
  log('DIAG_TARGET_LOOKUP',row?'FOUND':'NOT_FOUND');
  if(!row)return reject('TARGET_NOT_FOUND',{error:'diagnostic target unavailable'},404);
  log('DIAG_UID_OWNERSHIP',row.firebase_uid===profile.uid?'MATCH':'MISMATCH');
  if(row.firebase_uid!==profile.uid)return reject('UID_MISMATCH',{error:'diagnostic target unavailable'},404);
  log('DIAG_SUBSCRIPTION_STATUS',row.status==='pending'?'PENDING':'OTHER');
  if(row.status!=='pending')return reject('STATUS_NOT_PENDING',{error:'diagnostic target is not pending'},409);
  if(!env.ECPAY_MERCHANT_ID||!env.ECPAY_HASH_KEY||!env.ECPAY_HASH_IV)return reject('OTHER',{error:'diagnostic unavailable'},503);
  let params,options;
  const preparationFailure=(error,stage)=>{log('QUERY_PREPARATION_THROW',stage,safeNetworkError(error));return reject('OTHER',{error:'diagnostic unavailable'},503)};
  log('QUERY_BUILD_START','STARTED');
  try {
    const parsed=new URL(target);
    if(parsed.protocol!=='https:'||parsed.hostname!=='payment-stage.ecpay.com.tw'||parsed.pathname!=='/Cashier/QueryCreditCardPeriodInfo'||parsed.search||parsed.hash||target.trim()!==target)throw new TypeError('Invalid URL');
    // TEMPORARY Stage compatibility test: sign and send the same empty PlatformID.
    params={MerchantID:env.ECPAY_MERCHANT_ID,MerchantTradeNo:row.merchant_trade_no,PlatformID:'',TimeStamp:Math.floor(Date.now()/1000)};
    log('QUERY_BUILD_OK','OK');
  }catch(error){return preparationFailure(error,'QUERY_BUILD')}
  log('QUERY_SIGN_START','STARTED');
  try{params.CheckMacValue=await mac(params,env);log('QUERY_SIGN_OK','OK')}catch(error){return preparationFailure(error,'QUERY_SIGN')}
  log('QUERY_BODY_BUILD_START','STARTED');
  let constructionStage='BODY_PARAMS_CREATE';
  try {
    log('BODY_PARAMS_CREATE_START','STARTED');
    const form=new URLSearchParams();log('BODY_PARAMS_CREATE_OK','OK');
    constructionStage='BODY_PARAMS_APPEND';log('BODY_PARAMS_APPEND_START','STARTED');
    for(const key of ['MerchantID','MerchantTradeNo','PlatformID','TimeStamp','CheckMacValue']) {
      if(params[key]===undefined||params[key]===null)throw new TypeError('Invalid request body');
      form.set(key,String(params[key]));
    }
    log('BODY_PARAMS_APPEND_OK','OK');
    constructionStage='BODY_SERIALIZE';log('BODY_SERIALIZE_START','STARTED');
    const body=form.toString();log('BODY_SERIALIZE_OK','OK');log('QUERY_BODY_BUILD_OK','OK');
    constructionStage='FETCH_OPTIONS_BUILD';log('FETCH_OPTIONS_BUILD_START','STARTED');
    // workerd rejects redirect:error at Request construction; manual never follows.
    options={method:'POST',redirect:'manual',signal:AbortSignal.timeout(15000),headers:{'content-type':'application/x-www-form-urlencoded'},body};
    log('FETCH_OPTIONS_BUILD_OK','OK');
    constructionStage='REQUEST_CONSTRUCTION';log('REQUEST_CONSTRUCTION_START','STARTED');
    // Validate Fetch inputs locally before the outbound call. Fresh body every time.
    new Request(target,options);
    log('REQUEST_CONSTRUCTION_OK','OK');
  }catch(error){return preparationFailure(error,constructionStage)}
  let fetchStage='FETCH';
  try {
    log('DIAG_PROVIDER_QUERY','STARTED');
    log('FETCH_START','STARTED');
    const response=await providerFetch(target,options);
    log('FETCH_RESPONSE_RECEIVED','RECEIVED',{providerHttpStatus:response.status});
    fetchStage='RESPONSE_READ';
    const contentType=response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()||'';
    const safeType=['application/json','text/html','text/plain','application/x-www-form-urlencoded'].includes(contentType)?contentType:'unexpected';
    const result=parseDiagnostic((await response.text()).slice(0,65536));
    const message=diagnosticMessage(result?.RtnMsg);
    const info={providerHttpStatus:response.status,providerContentType:safeType,rtnCode:integer(result?.RtnCode),rtnMsg:message,parseFailure:!result,networkFailure:false,timeout:false,orderNotFound:response.ok&&message==='ORDER_NOT_FOUND'};
    const classification=!response.ok?'HTTP_ERROR':!result?'PARSE_ERROR':safeType==='unexpected'?'CONTENT_TYPE_ERROR':message==='ORDER_NOT_FOUND'?'ORDER_NOT_FOUND':message==='MAC_ERROR'?'MAC_ERROR':message==='PARAMETER_ERROR'?'PARAMETER_ERROR':'PROVIDER_RESPONSE';
    const safe=response.ok&&safeType!=='unexpected'&&result?safeProviderResult(result,row,env):emptyResult();
    if(info.orderNotFound){safe.providerOrderFound=false;safe.recurringContract='NOT FOUND';}
    log('DIAG_PROVIDER_RESULT',safe.providerOrderFound===true?'SUCCESS':classification==='PROVIDER_RESPONSE'?'UNKNOWN':classification,{...info,providerOrderFound:safe.providerOrderFound});
    // Official query response is unsigned: only fixed HTTPS, no redirects,
    // strict contract correlation, and an explicit response allowlist.
    return reply({...safe,...info,classification},200,env);
  }catch(error){
    log(fetchStage==='FETCH'?'FETCH_THROW':'RESPONSE_READ_THROW','FAILED',safeNetworkError(error));
    const timeout=error?.name==='TimeoutError'||error?.name==='AbortError';
    const info={providerHttpStatus:null,providerContentType:null,rtnCode:null,rtnMsg:null,parseFailure:false,networkFailure:!timeout,timeout,orderNotFound:false,classification:timeout?'TIMEOUT':'NETWORK_ERROR',...safeNetworkError(error)};
    log('DIAG_PROVIDER_RESULT',info.classification,info);
    return reply({...emptyResult(),...info},200,env);
  }
}
