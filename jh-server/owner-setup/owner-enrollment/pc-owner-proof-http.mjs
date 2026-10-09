/** Explicit route factory only; it is not installed in the operating server.
 * Only the supplied identity-proof service is used. No owner/phone/Life grants. */
import {readFileSync} from 'node:fs';
import {parseOwnerJson} from './owner-enrollment-http.mjs';
const BASE='/jh/setup/google';
const COOKIE='__Host-jh-pc-proof';
const assets=new Map([['', ['text/html; charset=utf-8','index.html']],['/app.js',['application/javascript; charset=utf-8','app.js']],['/style.css',['text/css; charset=utf-8','style.css']]].map(([route,[type,file]])=>[BASE+route,{type,bytes:readFileSync(new URL('./pc-owner-web/'+file,import.meta.url))}]));
const csp="default-src 'none'; script-src 'self' https://accounts.google.com/gsi/client; style-src 'self' https://accounts.google.com/gsi/style; frame-src https://accounts.google.com/gsi/; connect-src 'self' https://accounts.google.com/gsi/; img-src 'self' data:; base-uri 'none'; object-src 'none'; form-action 'self'; frame-ancestors 'none'";
function cookie(req){const values=String(req.headers.cookie||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(COOKIE+'='));return values.length===1?values[0].slice(COOKIE.length+1):null;}
export function createPcOwnerProofHttpHandler({proof}){
 if(!proof||proof.serverOrigin!=='https://jh-secure-bridge-fix4.onrender.com')throw Error('PC_PROOF_SERVICE_REQUIRED');
 let active=0;
 return async(req,res,url)=>{
  if(url.pathname!==BASE&&!url.pathname.startsWith(BASE+'/'))return false;
  const headers={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin','content-security-policy':csp,'cross-origin-opener-policy':'same-origin-allow-popups','x-frame-options':'DENY'};
  const send=(s,v,extra={})=>{if(!res.destroyed&&!res.headersSent){res.writeHead(s,{...headers,'content-type':'application/json; charset=utf-8',...extra});res.end(JSON.stringify(v));}};
  if(url.search||req.headers.host!==new URL(proof.serverOrigin).host){send(400,{ok:false,code:'PC_PROOF_REQUEST_REJECTED'});return true;}
  if(req.method==='GET'&&assets.has(url.pathname)){const a=assets.get(url.pathname);res.writeHead(200,{...headers,'content-type':a.type});res.end(a.bytes);return true;}
  if(req.method!=='POST'||!['/challenge','/verify','/cancel'].some(p=>url.pathname===BASE+p)){send(404,{ok:false,code:'NOT_FOUND'});return true;}
  if(req.headers.origin!==proof.serverOrigin||req.headers['x-jh-proof-request']!=='1'||(req.headers['sec-fetch-site']!==undefined&&req.headers['sec-fetch-site']!=='same-origin')){send(403,{ok:false,code:'PC_PROOF_ORIGIN_REJECTED'});return true;}
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']||'')||req.headers['content-encoding']){send(415,{ok:false,code:'JSON_REQUIRED'});return true;}
  const length=req.headers['content-length'];if(length!==undefined&&(!/^\d+$/.test(length)||Number(length)>12288)){send(413,{ok:false,code:'BODY_TOO_LARGE'});return true;}
  if(active>=4){send(429,{ok:false,code:'PC_PROOF_RATE_LIMIT'});return true;}active++;
  const controller=new AbortController();const disconnected=()=>{if(!res.writableEnded)controller.abort();};res.once('close',disconnected);let timer;
  try{
   timer=setTimeout(()=>req.destroy(),8000);timer.unref?.();const chunks=[];let total=0;
   for await(const b of req){total+=b.length;if(total>12288)throw Object.assign(Error('BODY_TOO_LARGE'),{code:'BODY_TOO_LARGE',status:413});chunks.push(b);}
   clearTimeout(timer);if(!req.complete||(length!==undefined&&Number(length)!==total))throw Error('INCOMPLETE_BODY');
   const raw=Buffer.concat(chunks);let input;try{input=parseOwnerJson(raw);}finally{raw.fill(0);for(const b of chunks)b.fill(0);}
   if(url.pathname===BASE+'/challenge'){
    if(Object.keys(input).length)throw Error('UNEXPECTED_INPUT');
    const {session,...publicChallenge}=proof.begin();send(200,publicChallenge,{'set-cookie':COOKIE+'='+session+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=120'});
   }else if(url.pathname===BASE+'/cancel')send(200,proof.cancel(cookie(req),input));
   else send(200,await proof.finish(cookie(req),input,{signal:controller.signal}));
  }catch(e){const permitted=new Set(['PC_PROOF_CSRF_REJECTED','PC_PROOF_ALREADY_USED','PC_PROOF_RATE_LIMIT','PC_PROOF_UNAVAILABLE','PC_PROOF_VERIFY_TIMEOUT','PC_PROOF_CANCELED','PC_PROOF_CANCELED_OR_EXPIRED','IDENTITY_TOKEN_INVALID','GOOGLE_IDENTITY_VERIFICATION_FAILED','IDENTITY_CLAIMS_REJECTED','IDENTITY_ACCOUNT_REJECTED','IDENTITY_TIME_REJECTED','IDENTITY_NONCE_REJECTED','PROOF_FIELDS_INVALID','BODY_TOO_LARGE']);const code=permitted.has(e.code)?e.code:'PC_PROOF_REQUEST_REJECTED';send(permitted.has(e.code)?(e.status||400):400,{ok:false,code});}
  finally{clearTimeout(timer);res.removeListener('close',disconnected);active--;}
  return true;
 };
}
