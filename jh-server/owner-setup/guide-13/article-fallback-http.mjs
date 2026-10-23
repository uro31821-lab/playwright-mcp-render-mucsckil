/** Optional independent HTTPS article reader for known public publisher domains.
 * Not connected to JH in production. No cookies, no auth headers, no redirects, no local URLs.
 * Only exposes verified full article text when an actual articleBody/closed <article> is found.
 */
import {verifiedPublicArticleUrl,headlinesMatch} from './article-fulltext.mjs';
const clean=(v,max=300)=>typeof v==='string'?v.replace(/\s+/g,' ').trim().slice(0,max):'';
const decodeEntities=s=>String(s||'').replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|amp|lt|gt|quot|apos|nbsp|ldquo|rdquo|lsquo|rsquo|hellip);/gi,(all,v)=>{
 if(v[0]==='#'){const n=v[1]?.toLowerCase()==='x'?parseInt(v.slice(2),16):parseInt(v.slice(1),10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):' ';}
 return ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ldquo:'“',rdquo:'”',lsquo:'‘',rsquo:'’',hellip:'…'})[v.toLowerCase()]||all;
});
const plain=s=>decodeEntities(String(s||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/ig,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/ig,' ').replace(/<[^>]+>/g,' ')).replace(/[ \t]+/g,' ').replace(/\n\s*\n\s*\n/g,'\n\n').trim();
const jsonLd=(html)=>{
 const matches=[...html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/ig)];
 const found=[];
 const visit=x=>{
  if(Array.isArray(x)){x.forEach(visit);return;}
  if(!x||typeof x!=='object')return;
  if(Array.isArray(x['@graph']))visit(x['@graph']);
  const type=x['@type'];if((typeof type==='string'&&/Article|NewsArticle|ReportageNewsArticle/i.test(type))||
    Array.isArray(type)&&type.some(t=>/Article|NewsArticle/i.test(t)))found.push(x);
 };
 for(const m of matches){try{visit(JSON.parse(decodeEntities(m[1])))}catch{}}
 return found;
};
function canonicalUrl(html,url){
 const m=html.match(/<link\b(?=[^>]*\brel\s*=\s*["']?canonical["']?)(?=[^>]*\bhref\s*=\s*["']([^"']+)["'])[^>]*>/i);
 if(!m)return url;
 try{return new URL(decodeEntities(m[1]),url).href}catch{return null;}
}
/** Conservative: returning partial is safer than labelling a card or paywall full text. */
export function parsePublisherArticleHtml(html,{url,expectedTitle,allowedHosts=[]}={}){
 if(typeof html!=='string'||html.length<100)return {ok:false,code:'EMPTY_HTML'};
 const canonical=verifiedPublicArticleUrl(canonicalUrl(html,url),{allowedHosts});
 const source=verifiedPublicArticleUrl(url,{allowedHosts});
 if(!source||!canonical||canonical!==source)return {ok:false,code:'CANONICAL_URL_MISMATCH'};
 const ld=jsonLd(html).find(x=>typeof x.articleBody==='string'&&x.articleBody.length>=280&&headlinesMatch(expectedTitle,x.headline||''));
 if(ld){
  const body=plain(ld.articleBody).slice(0,80000);
  if(body.length>=280)return {ok:true,source:'INDEPENDENT_ORIGINAL_HTML',canonicalUrl:canonical,
   title:clean(ld.headline,300),body,fullBody:true,bodyBoundaryVerified:true,truncated:false,
   articleDate:typeof ld.datePublished==='string'?ld.datePublished.slice(0,32):null,observedAt:new Date().toISOString()};
 }
 // Only a complete HTML article element is accepted, not arbitrary scraped body text.
 const titleTag=/<meta\b(?=[^>]*\bproperty\s*=\s*["']og:title["'])(?=[^>]*\bcontent\s*=\s*["']([^"']+)["'])[^>]*>/i.exec(html);
 const title=clean(decodeEntities(titleTag?.[1]||(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1]||'')),300);
 if(!headlinesMatch(expectedTitle,plain(title)))return {ok:false,code:'TITLE_NOT_VERIFIED'};
 const begin=/<article\b[^>]*>/ig.exec(html);
 if(!begin)return {ok:false,code:'ARTICLE_BOUNDARY_NOT_FOUND'};
 const suffix=html.slice(begin.index+begin[0].length);
 const end=suffix.search(/<\/article\s*>/i);
 if(end<0)return {ok:false,code:'ARTICLE_END_NOT_VERIFIED'};
 const article=suffix.slice(0,end)
  .replace(/<(aside|nav|footer|form|button|figure)\b[^>]*>[\s\S]*?<\/\1>/gi,' ')
  .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,' ');
 const paras=[...article.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/ig)].map(m=>plain(m[1])).filter(x=>x.length>=25);
 const body=paras.join('\n\n').slice(0,80000);
 if(paras.length<3 || body.length<280)return {ok:false,code:'ARTICLE_BODY_SCOPE_PARTIAL'};
 return {ok:true,source:'INDEPENDENT_ORIGINAL_HTML',canonicalUrl:canonical,title:plain(title),body,
   fullBody:true,bodyBoundaryVerified:true,truncated:false,observedAt:new Date().toISOString()};
}
/** readHtml port enables deterministic tests. In production use only known trusted public publishers.
 * No automatic redirect and no cookies; limit size/time to keep one request bounded.
 */
export function makeIndependentPublicArticleReader({allowedHosts=[],readHtml=null,timeoutMs=8500,maxBytes=1500000}={}){
 if(!Array.isArray(allowedHosts)||allowedHosts.length===0)throw Error('PUBLISHER_ALLOWLIST_REQUIRED');
 return async function independentRead({url,expectedTitle,signal}={}){
  const safe=verifiedPublicArticleUrl(url,{allowedHosts});
  if(!safe)return {ok:false,code:'ORIGINAL_URL_NOT_ALLOWED'};
  try{
   let raw;
   if(readHtml){raw=await readHtml({url:safe,signal});}
   else {
    const inner=new AbortController();
    const abort=()=>inner.abort();signal?.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(abort,timeoutMs);
    try{
      const resp=await fetch(safe,{method:'GET',redirect:'manual',signal:inner.signal,credentials:'omit',
        headers:{Accept:'text/html,application/xhtml+xml', 'User-Agent':'JHArticleReadOnly/1.0'}});
      if(resp.status!==200)return {ok:false,code:`HTTP_${resp.status}`};
      if(!String(resp.headers.get('content-type')||'').toLowerCase().includes('text/html'))return {ok:false,code:'NOT_HTML'};
      const reader=resp.body?.getReader();if(!reader)return {ok:false,code:'EMPTY_RESPONSE'};
      const parts=[];let bytes=0;
      for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;
        if(bytes>maxBytes){await reader.cancel();return {ok:false,code:'HTML_SIZE_LIMIT'};}
        parts.push(value);
      }
      const joined=new Uint8Array(bytes);let offset=0;for(const b of parts){joined.set(b,offset);offset+=b.length;}
      raw=new TextDecoder('utf-8').decode(joined);
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort)}
   }
   if(typeof raw!=='string'||new TextEncoder().encode(raw).byteLength>maxBytes)return {ok:false,code:'HTML_INVALID_OR_TOO_LARGE'};
   return parsePublisherArticleHtml(raw,{url:safe,expectedTitle,allowedHosts});
  }catch(e){return {ok:false,code:e?.name==='AbortError'?'READ_TIMEOUT':'INDEPENDENT_HTTP_ERROR'};}
 };
}
