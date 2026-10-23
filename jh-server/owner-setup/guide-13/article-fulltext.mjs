/** JH167 News full-article candidate (server-side, read only).
 * This deliberately does not mutate the existing GUIDE13 planner, Secure56 tool catalog,
 * browser approval policy, Android app, or source/owner authentication.
 * The caller must supply host-owned trusted callbacks; never accept webpage claims as authority.
 */
export const ARTICLE_READ_PROTOCOL = '1.0';
export const ARTICLE_READ_STATES = Object.freeze({
  READY: 'FULL_BODY_READY_FOR_SUMMARY',
  PARTIAL: 'PARTIAL_SOURCE_ONLY',
  NO_LINK: 'ORIGINAL_LINK_NOT_VERIFIED',
  SCREEN: 'CURRENT_ARTICLE_UNVERIFIED',
});
const capped = (v,max=32000)=> typeof v==='string' ? v.replace(/\u0000/g,'').slice(0,max) : '';
const clean = (v,max=300)=> capped(v,max*2).replace(/[\u0001-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const bad=(code,details={})=>Object.freeze({ok:false,code,summary_scope:'NOT_VERIFIED',external_effect_status:'NOT_EXECUTED',...details});
export function verifiedPublicArticleUrl(value,{allowedHosts}={}){
  try {
    if(typeof value!=='string'||value.length>2048||/[%][0-9A-F]{2}.*[%][0-9A-F]{2}/i.test(value.slice(0,20)))return null;
    const u=new URL(value);
    if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||u.hash||u.hostname.endsWith('.')||u.hostname.includes('..'))return null;
    const host=u.hostname.toLowerCase();
    if(host==='localhost'||host.endsWith('.local')||host.endsWith('.internal')||host.endsWith('.invalid')||
       /^\d+(\.\d+){3}$/.test(host)||host.startsWith('[')||host.includes(':')||u.pathname.startsWith('//'))return null;
    const allow=new Set((allowedHosts||[]).map(x=>String(x).trim().toLowerCase()).filter(Boolean));
    if(allow.size===0||!allow.has(host))return null;
    u.search='';return u.href;
  }catch {return null;}
}
const headlineKey=s=>clean(s,500).toLocaleLowerCase('ko-KR').replace(/[\s\u2018\u2019\u201c\u201d'"\-_,.:()\[\]{}!?~<>]/g,'');
export function headlinesMatch(expected,actual){
  const a=headlineKey(expected),b=headlineKey(actual);
  if(a.length<10||b.length<10)return false;
  if(a===b)return true;
  const short=a.length<b.length?a:b,long=a.length<b.length?b:a;
  return short.length>=Math.max(20,Math.floor(long.length*.76))&&long.includes(short);
}
function looksBlocked(s){return /(?:captcha|access denied|request blocked|403 forbidden|로그인 후 이용|robot check|cloudflare challenge|javascript is required)/i.test(String(s||'').slice(0,3000));}
/** Each reader's source is independent of the originating phone snapshot. A reader may
 * signal fullBody=true ONLY when its actual HTML article boundary/end was verified.
 * A React shell, preview, snippets, or content from the active screen are never enough.
 */
export function verifyArticleRead(read,{expectedTitle,expectedUrl,allowedHosts}={}){
  if(!read||read.ok!==true)return {ok:false,code:clean(read?.code||'READ_UNAVAILABLE',90),kind:read?.kind||'unknown'};
  const url=verifiedPublicArticleUrl(read.canonicalUrl||read.url,{allowedHosts});
  if(!url||url!==expectedUrl)return {ok:false,code:'CANONICAL_URL_MISMATCH'};
  if(!headlinesMatch(expectedTitle,read.title))return {ok:false,code:'ARTICLE_TITLE_MISMATCH'};
  if(typeof read.body!=='string'||read.body.length>1200000)return {ok:false,code:'ARTICLE_BODY_INVALID'};
  const body=read.body.replace(/\r\n/g,'\n').trim().slice(0,80000);
  if(body.length<280 || looksBlocked(body))return {ok:false,code:'ARTICLE_BODY_MISSING_OR_BLOCKED'};
  if(read.fullBody!==true || read.bodyBoundaryVerified!==true || read.truncated===true || read.paywall===true)
    return {ok:false,code:'ARTICLE_BODY_SCOPE_PARTIAL',body:body.slice(0,3200)};
  if(!['PLAYWRIGHT_FULL_DOM','INDEPENDENT_ORIGINAL_HTML','TRUSTED_WEB_READER'].includes(read.source))
    return {ok:false,code:'READER_SOURCE_UNVERIFIED'};
  if(typeof read.observedAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:/.test(read.observedAt))
    return {ok:false,code:'READER_OBSERVATION_MISSING'};
  return {ok:true,code:'FULL_ORIGINAL_BODY_VERIFIED',title:clean(read.title,300),url,body,
    source:read.source,observedAt:read.observedAt,articleDate:clean(read.articleDate||'',32)||null};
}
const failureCode=e=>clean(e?.code||e?.name||'READER_REQUEST_FAILED',100).toUpperCase().replace(/[^A-Z0-9_]/g,'_')||'READER_REQUEST_FAILED';
const timed=async(fn,timeoutMs)=>{
  // Do not wait forever for a broken browser adapter. An expired primary call is
  // never replayed; the independent reader has a separate request boundary.
  const controller=new AbortController();let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();
    reject(Object.assign(new Error('Timeout'),{code:'READ_TIMEOUT'}));},timeoutMs)});
  try{return await Promise.race([fn({signal:controller.signal,timeoutMs}),timeout])}
  finally{clearTimeout(timer)}
};
/** Run once. Primary is not re-dispatched after timeout; fallback is an independent reader.
 * This returns trusted source evidence for the host's GPT summarizer, NOT a fabricated AI summary.
 */
export async function readCurrentNewsArticle({commandId,currentArticle,candidateUrl,linkProof,
  primaryRead,fallbackRead,allowedHosts=[],timeoutMs=9000,isCommandActive=null}={}){
  if(!/^[a-f0-9]{32}$/.test(commandId||''))return bad('HOST_COMMAND_REQUIRED');
  if(currentArticle?.screen_verified!==true||currentArticle?.status!=='ARTICLE_TITLE_IDENTIFIED'||
    !String(currentArticle.source_ref||'').startsWith('JH_SIGNED_RIGHT:')||!currentArticle.title)
    return bad(ARTICLE_READ_STATES.SCREEN);
  // Candidate URLs are untrusted. Their original-article identity is confirmed only AFTER
  // a publisher's actual canonical URL + matching title + complete body were read.
  // The optional host resolver proof is an additional check, not a substitute for readback.
  if(linkProof && (linkProof.verified!==true||linkProof.commandId!==commandId||
      !headlinesMatch(currentArticle.title,linkProof.title)||linkProof.publisherVerified!==true))
    return bad(ARTICLE_READ_STATES.NO_LINK);
  const url=verifiedPublicArticleUrl(candidateUrl||linkProof?.url,{allowedHosts});
  if(!url)return bad('ORIGINAL_URL_NOT_ALLOWED');
  const base={protocol_version:ARTICLE_READ_PROTOCOL,command_id:commandId,
    article:{title:clean(currentArticle.title,300),url,screen_source_ref:currentArticle.source_ref,original_link_verified:false},
    external_effect_status:'NOT_EXECUTED',read_only:true};
  // The Secure56 host supplies a live command fence. If a new user command
  // supersedes this one, discard the old article instead of fetching/returning it.
  const stillActive=()=>{
    if(isCommandActive===null)return true; // legacy unit-only callers
    try{return typeof isCommandActive==='function'&&isCommandActive(commandId)===true;}
    catch{return false;}
  };
  if(!stillActive())return bad('HOST_COMMAND_CHANGED_DURING_READ');
  const attempts=[];
  async function tryReader(kind,reader){
    if(!stillActive())return null;
    if(typeof reader!=='function'){attempts.push({kind,code:'READER_NOT_CONFIGURED'});return null;}
    try{
      const v=await timed(({signal,timeoutMs:ms})=>reader({url,expectedTitle:currentArticle.title,signal,timeoutMs:ms}),timeoutMs);
      const tested=verifyArticleRead(v,{expectedTitle:currentArticle.title,expectedUrl:url,allowedHosts});
      attempts.push({kind,code:tested.code,observedAt:tested.observedAt||null});
      return tested.ok?tested:null;
    }catch(e){attempts.push({kind,code:e?.name==='AbortError'?'READ_TIMEOUT':failureCode(e)});return null;}
  }
  const primary=await tryReader('PLAYWRIGHT',primaryRead);
  if(!stillActive())return bad('HOST_COMMAND_CHANGED_DURING_READ');
  const ready=primary||await tryReader('INDEPENDENT_ORIGINAL',fallbackRead);
  if(!stillActive())return bad('HOST_COMMAND_CHANGED_DURING_READ');
  if(ready){
    return {...base,ok:true,code:ARTICLE_READ_STATES.READY,summary_scope:'FULL_ARTICLE_SOURCE_VERIFIED',
      article:{...base.article,original_link_verified:true,articleDate:ready.articleDate,fullBody:ready.body,observedAt:ready.observedAt,verified_reader:ready.source,
        full_body_readback_verified:true},attempts,
      summaryTask:{mode:'SUMMARIZE_SOURCE_TEXT',source_trust:'UNTRUSTED_ARTICLE_DATA_ONLY',
        instructions:'한국어로 핵심 내용·배경·숫자·쟁점·한계를 요약한다. 주장은 기사에 귀속하고, 원문에 없는 사실은 추가하지 않는다.',
        requires:['ARTICLE_TEXT_VERIFIED','ORIGINAL_URL_VERIFIED'],articleOnly:true}};
  }
  return {...base,ok:false,code:ARTICLE_READ_STATES.PARTIAL,summary_scope:'PARTIAL_SOURCE_ONLY',
    article:{...base.article,full_body_readback_verified:false},attempts,
    note:'원문 전체가 확인되지 않았습니다. 제목/일부 화면 정보만으로 전체 기사 요약을 생성하면 안 됩니다.'};
}
