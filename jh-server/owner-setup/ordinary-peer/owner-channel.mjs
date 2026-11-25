import {createHash,randomBytes} from 'node:crypto';
import {GoogleOwnerVerifier} from '../owner-enrollment/owner-enrollment.mjs';
import {openPeerService} from './peer-service.mjs';

const cookieName='__Host-jh-peer';
const random=()=>randomBytes(32).toString('hex');
const fields=['response_type','client_id','redirect_uri','code_challenge','code_challenge_method','resource','scope','state'];
const digest=params=>createHash('sha256').update(JSON.stringify(fields.map(k=>params[k]??null))).digest('hex');
const esc=value=>String(value).replace(/[&"<>'`]/g,c=>({'&':'&amp;','"':'&quot;','<':'&lt;','>':'&gt;',"'":'&#39;','`':'&#96;'}[c]));
const claimsKey='peer59';
const reasons=new Map([
  ['PEER_ORIGIN_NULL','ORIGIN_NULL'],['PEER_ORIGIN_MISSING','ORIGIN_MISSING'],
  ['PEER_ORIGIN_MISMATCH','ORIGIN_MISMATCH'],['PEER_COOKIE','BROWSER_COOKIE'],
  ['PEER_CHALLENGE','CHALLENGE_MISSING'],['PEER_EXPIRED','CHALLENGE_EXPIRED'],
  ['PEER_BINDING','REQUEST_BINDING'],['PEER_OWNER','IDENTITY_POLICY'],
  ['owner_not_authorized','IDENTITY_POLICY'],['identity_token_invalid','IDENTITY_FORMAT'],
  ['identity_verification_failed','IDENTITY_VERIFICATION'],['identity_time_invalid','IDENTITY_TIME'],
  ['identity_nonce_mismatch','IDENTITY_NONCE']
]);
function reject(code){throw Object.assign(Error('Owner verification failed'),{code});}
export function rejectOwnerVerification(res,error){
  const reason=reasons.get(error?.code)??'VERIFICATION_FAILED';
  console.warn('JH_PEER_OWNER_VERIFY_REJECT '+reason);
  res.writeHead(403,{'cache-control':'no-store','content-type':'text/plain; charset=utf-8'})
    .end('소유자 확인을 완료하지 못했습니다. 앱을 다시 연결해 주세요. 확인 코드 '+reason);
}
export function createOwnerChannel(config,{verifier=new GoogleOwnerVerifier({clientId:config.googleWebClientId,allowedSubjects:[config.ownerSubject],allowedPresenters:config.allowedPresenterClientIds}),
  peer=openPeerService({config,noticeJson:process.env.JH_PEER_PREPARATION_NOTICE_JSON}),clock=Date.now}={}){
  const challenges=new Map();
  function page(res,params,isAllowedCallback){
    // The host supplies the same callback validator used during authorization.
    // Use the single canonical URL of this grant, without a host-wide wildcard.
    let formAction="'self'";
    const rawCallback=params.redirect_uri;
    if(typeof rawCallback==='string'&&isAllowedCallback?.(rawCallback)){
      const url=new URL(rawCallback);
      if(url.href===rawCallback&&!url.username&&!url.password&&!url.search&&!url.hash)
        formAction+=' '+url.href;
    }
    const now=clock();
    for(const [key,value] of challenges)if(value.expires<=now)challenges.delete(key);
    if(challenges.size>=1024){res.writeHead(429,{'cache-control':'no-store'}).end();return;}
    const cookie=random(),nonce=random(),script=random();
    challenges.set(cookie,{nonce,request:digest(params),expires:now+5*60*1000});
    const inputs=fields.filter(k=>params[k]!==undefined)
      .map(k=>'<input type="hidden" name="'+k+'" value="'+esc(params[k])+'">').join('');
    const html='<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'+
      '<title>개인 비서 연결</title><h1>개인 비서 연결</h1><p>준비비서의 비공개 안내를 확인하려면 등록된 Google 계정으로 연결하세요.</p>'+
      '<form id="owner" method="post" action="/oauth/authorize">'+inputs+'<input type="hidden" name="peer_proof"></form>'+
      '<div id="g_id_onload" data-client_id="'+esc(config.googleWebClientId)+'" data-nonce="'+nonce+'" data-callback="jhVerify" data-auto_prompt="false"></div>'+
      '<div class="g_id_signin" data-type="standard"></div><script nonce="'+script+'">window.jhVerify=function(r){const f=document.getElementById("owner");f.elements.peer_proof.value=r.credential;f.submit();};</script>'+
      '<script async src="https://accounts.google.com/gsi/client"></script>'+
      '<form method="post" action="/oauth/authorize">'+inputs+'<p><button>기존 기능만 연결</button></p></form></html>';
    res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'strict-origin',
      'x-frame-options':'DENY','x-content-type-options':'nosniff','cross-origin-opener-policy':'same-origin-allow-popups',
      'content-security-policy':"default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action "+formAction+"; script-src 'nonce-"+script+"' https://accounts.google.com/gsi/client; frame-src https://accounts.google.com; connect-src https://accounts.google.com/gsi/; style-src https://accounts.google.com/gsi/style 'unsafe-inline'; img-src data: https://accounts.google.com",
      'set-cookie':cookieName+'='+cookie+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=300'}).end(html);
  }
  async function verify(req,params){
    if(!Object.hasOwn(params,'peer_proof'))return null;
    const origin=req.headers.origin;
    if(!origin)reject('PEER_ORIGIN_MISSING');
    if(origin==='null')reject('PEER_ORIGIN_NULL');
    if(origin!==config.serverOrigin)reject('PEER_ORIGIN_MISMATCH');
    const cookies=String(req.headers.cookie??'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(cookieName+'='));
    if(cookies.length!==1)reject('PEER_COOKIE');
    const cookie=cookies[0].slice(cookieName.length+1);
    const c=challenges.get(cookie);
    challenges.delete(cookie);
    if(!c)reject('PEER_CHALLENGE');
    if(c.expires<=clock())reject('PEER_EXPIRED');
    if(c.request!==digest(params))reject('PEER_BINDING');
    const verified=await verifier.verify(params.peer_proof,c.nonce);
    if(verified.accountDigest!==config.accountDigest)reject('PEER_OWNER');
    return {owner:config.accountDigest,aud:config.serverOrigin,client:params.client_id,resource:params.resource};
  }
  function accepted(claims,params,refresh=false){
    if(!claims)return true;
    return claims.owner===config.accountDigest&&claims.aud===config.serverOrigin&&claims.client===params.client_id&&
      ((refresh&&!params.resource)||claims.resource===params.resource);
  }
  function current(req,records,hash,scope){
    const auth=req?.headers?.authorization;
    if(typeof auth!=='string'||!auth.startsWith('Bearer ')||auth.length>1024)return null;
    const row=records.get(hash('oauth-access|'+auth.slice(7)));
    if(!row||row.expiresAt<=clock()||row.scope!==scope)return null;
    const claims=row[claimsKey];
    return claims?.owner===config.accountDigest&&claims.aud===config.serverOrigin?claims:null;
  }
  function register(z,registerTool,session){
    registerTool('jh_ask_peer',{title:'행사 준비·통계 담당 동료에게 묻기',
      description:'준비비서는 행사 자료 수령처를, 통비서는 등록 집계의 확정 인원을 회신합니다. requester에 질문을 맡은 비서 역할을, actor에 질문을 받을 동료를 지정합니다.',
      inputSchema:{actor:z.enum(['preparation','statistics']),requester:z.enum(['preparation','statistics']).optional(),question:z.string().min(1).refine(s=>Array.from(s).length<=2200),purpose:z.string().min(1).refine(s=>Array.from(s).length<=240),
        retryKey:z.string().regex(/^[a-zA-Z0-9_-]{16,96}$/).optional()},
      annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}},
      args=>peer.ask(args,session));
  }
  return {page,verify,accepted,current,register};
}
