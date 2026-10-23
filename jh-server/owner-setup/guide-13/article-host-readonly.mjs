/** DRAFT ONLY. Does NOT register in production without an explicit, reviewed tool catalog release.
 * The current operational guide-13 planner remains unchanged. This is a read-only tool
 * candidate for the separately approved JH Secure56 server catalog.
 */
import {identifyCurrentArticleFromSignedReadback} from './current-article.mjs';
import {readCurrentNewsArticle,verifiedPublicArticleUrl} from './article-fulltext.mjs';
import {makeIndependentPublicArticleReader} from './article-fallback-http.mjs';

export const ARTICLE_CANDIDATE_TOOL='life_article_fulltext_read';
const DEFAULT_NEWS_HOSTS=Object.freeze([
  'www.hani.co.kr','hani.co.kr','www.yna.co.kr','yna.co.kr','www.reuters.com','reuters.com',
  'apnews.com','www.apnews.com'
]);

/** The existing Playwright snapshot doesn't prove the entire article (including its end).
 * Return partial instead of guessing completeness. A future verified DOM extraction port
 * may replace this conservative primary adapter.
 */
export function createJHPlaywrightArticleReader(browserTool){
 if(typeof browserTool!=='function')throw Error('BROWSER_PORT_REQUIRED');
 return async({url})=>{
  try{
   const nav=await browserTool('browser_navigate',{url});
   const str=typeof nav==='string'?nav:JSON.stringify(nav);
   if(/browser_request_timeout|TIMEOUT|navigation failed/i.test(str))return {ok:false,code:'PLAYWRIGHT_TIMEOUT'};
   if(/403|captcha|access denied/i.test(str))return {ok:false,code:'PLAYWRIGHT_BLOCKED'};
   const snap=await browserTool('browser_snapshot',{});
   const s=typeof snap==='string'?snap:JSON.stringify(snap);
   if(/about:blank|captcha|access denied/i.test(s))return {ok:false,code:'PLAYWRIGHT_EMPTY_OR_BLOCKED'};
   return {ok:false,code:'PLAYWRIGHT_SNAPSHOT_PARTIAL_FULL_BODY_NOT_ATTESTED'};
  }catch(e){return {ok:false,code:e?.name==='AbortError'?'PLAYWRIGHT_TIMEOUT':'PLAYWRIGHT_READ_FAILED'};}
 };
}

export function registerJHArticleReadCandidate({enabled=false,registerOAuthTool,z,textResult,getHostContext,
  readVerifiedRight,browserTool,readFallback,allowedHosts=DEFAULT_NEWS_HOSTS}={}){
 if(enabled!==true)return {registered:false,code:'DRAFT_DISABLED',toolNames:[]};
 if(typeof registerOAuthTool!=='function'||!z||typeof textResult!=='function'||
    typeof getHostContext!=='function'||typeof readVerifiedRight!=='function'||
    typeof browserTool!=='function')throw Error('ARTICLE_HOST_PORT_MISSING');
 if(!Array.isArray(allowedHosts)||!allowedHosts.length)throw Error('PUBLISHER_ALLOWLIST_REQUIRED');
 const primaryRead=createJHPlaywrightArticleReader(browserTool);
 const fallbackRead=readFallback||makeIndependentPublicArticleReader({allowedHosts});
 registerOAuthTool(ARTICLE_CANDIDATE_TOOL,{
  title:'JH 기사 원문 전체 읽기 — 검증된 출처 전용',
  description:'현재 서명된 오른쪽 기사 제목과 지정한 언론사 HTTPS 원문을 대조합니다. Playwright 읽기가 실패하면 독립 HTTPS 원문을 한 번 조회합니다. 전체 본문 입증 시에만 요약용 원문을 돌려주며, 기사 내용 요약은 GPT가 수행합니다. Android 조작·촬영·결제·전송 없음.',
  inputSchema:{article_url:z.string().min(12).max(2048)},
  annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:true}
 },async({article_url})=>{
  try{
   const ctx=getHostContext();
   if(!/^[a-f0-9]{32}$/.test(ctx?.command_id||''))return textResult({ok:false,code:'HOST_COMMAND_REQUIRED'});
   const reject=code=>textResult({ok:false,code,summary_scope:'NOT_VERIFIED',
     read_only:true,external_effect_status:'NOT_EXECUTED'});
   // Recheck the authoritative Secure56 command from the host after every await.
   // Do not trust a caller-supplied old command or a reused right-pane receipt.
   const current=()=>{
     try{return getHostContext()?.command_id===ctx.command_id;}catch{return false;}
   };
   // This is the SAME signed-readback callback used by the existing JH guide13 planner.
   const proof=await readVerifiedRight('현재 열린 기사',ctx.command_id);
   if(!current())return reject('HOST_COMMAND_CHANGED_DURING_READ');
   const article=identifyCurrentArticleFromSignedReadback({readback:proof,commandId:ctx.command_id});
   if(article.status!=='ARTICLE_TITLE_IDENTIFIED')return reject('CURRENT_ARTICLE_UNVERIFIED');
   const requested=verifiedPublicArticleUrl(article_url,{allowedHosts});
   if(!requested)return reject('ORIGINAL_URL_NOT_ALLOWED');
   const nativeAddress=verifiedPublicArticleUrl(article.observed_chrome_url,{allowedHosts});
   if(!nativeAddress)return reject('RIGHT_CHROME_URL_UNVERIFIED');
   if(requested!==nativeAddress)return reject('RIGHT_CHROME_URL_MISMATCH');
   const result=await readCurrentNewsArticle({commandId:ctx.command_id,currentArticle:article,
     candidateUrl:article_url,primaryRead,fallbackRead,allowedHosts,timeoutMs:8000,
     isCommandActive:current});
   if(!current())return reject('HOST_COMMAND_CHANGED_DURING_READ');
   if(result.ok!==true)return textResult(result);
   // An old article must not be delivered after the user changed Chrome tabs.
   // Read ONE fresh signed right-pane snapshot, with no click, scroll or OCR.
   const finalProof=await readVerifiedRight('현재 열린 기사 최종 확인',ctx.command_id);
   if(!current())return reject('HOST_COMMAND_CHANGED_DURING_READ');
   const latest=identifyCurrentArticleFromSignedReadback({readback:finalProof,commandId:ctx.command_id});
   const firstWindow=String(proof?.observation?.window_id??'');
   const lastWindow=String(finalProof?.observation?.window_id??'');
   const firstAt=Date.parse(proof?.observation?.observed_at||'');
   const lastAt=Date.parse(finalProof?.observation?.observed_at||'');
   if(latest.status!=='ARTICLE_TITLE_IDENTIFIED' || latest.title!==article.title ||
      verifiedPublicArticleUrl(latest.observed_chrome_url,{allowedHosts})!==nativeAddress ||
      !firstWindow || lastWindow!==firstWindow ||
      !Number.isFinite(firstAt) || !Number.isFinite(lastAt) || lastAt<firstAt)
     return reject('RIGHT_ARTICLE_CHANGED_DURING_READ');
   return textResult(result);
  }catch(e){return textResult({ok:false,code:'ARTICLE_READ_UNAVAILABLE',summary_scope:'NOT_VERIFIED',
    detail:'Do not retry an uncertain browser read. No private data or credentials were logged.'});}
 });
 return {registered:true,toolNames:[ARTICLE_CANDIDATE_TOOL],effects:'READ_ONLY',catalogApprovalRequired:true,
  activation:'EXPLICIT_REVIEW_ONLY'};
}
