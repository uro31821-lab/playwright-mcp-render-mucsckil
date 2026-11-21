import {randomBytes, createHash, createHmac, timingSafeEqual} from 'node:crypto';

// JH228 server-side image stage. Never mount a public upload endpoint.
export const IMAGE_STAGE_PATH='/device/camera-v2-example';
const SHA=/^[a-f0-9]{64}$/, CMD=/^[a-f0-9]{32}$/, SID=/^[A-Za-z0-9_-]{16,160}$/;
const REF=/^[A-Za-z0-9_-]{16,64}$/, LEASE=/^[A-Za-z0-9_-]{43}$/;
const NONCE=/^[A-Za-z0-9_-]{24}$/;
const hash=b=>createHash('sha256').update(b).digest('hex');
function same(a,b) {
  return typeof a==='string'&&typeof b==='string'&&a.length===b.length &&
    timingSafeEqual(Buffer.from(a),Buffer.from(b));
}
function validScope(v) {
  return v?.verifiedBySecure56===true && SID.test(v.secureSessionId) &&
    SHA.test(v.deviceDigest)&&SHA.test(v.taskDigest)&&CMD.test(v.commandId);
}
const validDims=d=>Number.isSafeInteger(d?.width)&&d.width>=32&&d.width<=8000&&
  Number.isSafeInteger(d?.height)&&d.height>=32&&d.height<=8000;
function reject(res,status,code){
  res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(code);return true;
}
export class AiCameraV2StageStore {
  #items=new Map(); #now;
  constructor({now=()=>Date.now()}={}){this.#now=now;}
  sweep(){
    const t=this.#now();
    for(const [k,e] of this.#items)if(t>=e.expiresAtMs){e.bytes.fill(0);this.#items.delete(k);}
  }
  pendingCount(){this.sweep();return this.#items.size;}
  close(){for(const e of this.#items.values())e.bytes.fill(0);this.#items.clear();}
  stageVerifiedJpeg(x){
    this.sweep();
    if(!validScope(x)||!REF.test(x.referenceId)||!SHA.test(x.sha256)||
       !Buffer.isBuffer(x.bytes)||x.size!==x.bytes.length||x.size<64||x.size>8*1024*1024||
       !validDims(x.dimensions)||!same(hash(x.bytes),x.sha256)||
       x.bytes[0]!==255||x.bytes[1]!==216||
       x.bytes[x.size-2]!==255||x.bytes[x.size-1]!==217)
      return {acknowledged:false,code:'STAGE_INVALID_OR_UNVERIFIED'};
    if(this.#items.size>=8)return {acknowledged:false,code:'STAGING_CAPACITY_REACHED'};
    const stageLease=randomBytes(32).toString('base64url'),expiresAtMs=this.#now()+30000;
    this.#items.set(stageLease,{bytes:Buffer.from(x.bytes),referenceId:x.referenceId,
      sha256:x.sha256,size:x.size,secureSessionId:x.secureSessionId,
      deviceDigest:x.deviceDigest,taskDigest:x.taskDigest,commandId:x.commandId,expiresAtMs});
    return {acknowledged:true,stageLease,referenceId:x.referenceId,sha256:x.sha256,
      size:x.size,expiresAtMs,secureSessionId:x.secureSessionId,
      deviceDigest:x.deviceDigest,taskDigest:x.taskDigest,commandId:x.commandId};
  }
  describe(lease){
    this.sweep();
    if(!LEASE.test(lease))return null;
    const e=this.#items.get(lease);
    return e?{referenceId:e.referenceId,sha256:e.sha256,size:e.size,
      secureSessionId:e.secureSessionId,deviceDigest:e.deviceDigest,taskDigest:e.taskDigest,
      commandId:e.commandId,expiresAtMs:e.expiresAtMs}:null;
  }
  consume(lease,proof){
    this.sweep();
    if(!LEASE.test(lease)||!validScope(proof)||proof.stageProofVerified!==true)
      return {ok:false,code:'STAGE_SCOPE_INVALID'};
    const e=this.#items.get(lease);
    if(!e)return {ok:false,code:'STAGE_MISSING_OR_CONSUMED'};
    if(!same(e.secureSessionId,proof.secureSessionId)||!same(e.deviceDigest,proof.deviceDigest)||
       !same(e.taskDigest,proof.taskDigest)||!same(e.commandId,proof.commandId))
      return {ok:false,code:'STAGE_SCOPE_MISMATCH'};
    this.#items.delete(lease);
    return {ok:true,bytes:e.bytes,size:e.size,sha256:e.sha256,
      release(){e.bytes.fill(0);}};
  }
}
export function createSecure56StageVerifier({store,lookupActiveSession,claimNonce,now=()=>Date.now()}={}){
  if(!(store instanceof AiCameraV2StageStore)||typeof lookupActiveSession!=='function'||
     typeof claimNonce!=='function')throw Error('SECURE56_STAGE_BACKEND_REQUIRED');
  return async req=>{
    const h=req.headers??{},lease=h['x-jh-stage-lease'],e=store.describe(lease);
    const expString=h['x-jh-expires'],nonce=h['x-jh-nonce'],mac=h['x-jh-mac'];
    if(!e||h['x-jh-session']!==e.secureSessionId||h['x-jh-device']!==e.deviceDigest||
       h['x-jh-task-digest']!==e.taskDigest||h['x-jh-command-id']!==e.commandId||
       h['x-jh-image-sha256']!==e.sha256||h['x-jh-byte-count']!==String(e.size)||
       !NONCE.test(nonce??'')||!/^[0-9]{13}$/.test(expString??'')||!SHA.test(mac??''))
      return null;
    const nowMs=now(),exp=Number(expString);
    if(!Number.isSafeInteger(exp)||exp<=nowMs||exp>nowMs+30000||
       nowMs>=e.expiresAtMs)return null;
    const s=await lookupActiveSession(e.secureSessionId);
    if(!s||s.verifiedBySecure56!==true||s.sessionId!==e.secureSessionId||
       s.deviceDigest!==e.deviceDigest||!Buffer.isBuffer(s.secret)||
       s.secret.length<16||!Number.isSafeInteger(s.expiresAtMs)||exp>s.expiresAtMs)
      return null;
    // The native app signs the existing Secure56 'frame' domain.
    const msg=['frame',s.sessionId,lease,s.deviceDigest,nonce,exp,e.taskDigest,e.sha256,e.size].join('|');
    const expected=createHmac('sha256',s.secret).update(msg).digest('hex');
    if(!same(mac,expected))return null;
    if(await claimNonce({sessionId:s.sessionId,nonce,lease,commandId:e.commandId,expiresAtMs:exp})!==true)
      return null;
    return {...e,verifiedBySecure56:true,stageProofVerified:true};
  };
}
export async function serveStagedJpeg(req,res,{store,verifyActiveDeviceSession}={}){
  if(!req.url?.startsWith(IMAGE_STAGE_PATH))return false;
  if(req.method!=='GET')return reject(res,405,'METHOD_NOT_ALLOWED');
  if(req.url!==IMAGE_STAGE_PATH)return reject(res,400,'STAGE_QUERY_FORBIDDEN');
  if(!(store instanceof AiCameraV2StageStore)||typeof verifyActiveDeviceSession!=='function')
    return reject(res,503,'STAGE_NOT_CONNECTED');
  if(!LEASE.test(req.headers?.['x-jh-stage-lease']??''))
    return reject(res,400,'INVALID_STAGE_LEASE');
  let proof;
  try{proof=await verifyActiveDeviceSession(req);}catch{return reject(res,403,'STAGE_AUTH_INVALID');}
  if(!validScope(proof)||proof.stageProofVerified!==true)
    return reject(res,403,'STAGE_AUTH_INVALID');
  const result=store.consume(req.headers['x-jh-stage-lease'],proof);
  if(!result.ok)return reject(res,404,'STAGE_NOT_FOUND');
  const cleanup=()=>result.release();
  res.once('close',cleanup);
  try{
    res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'no-store, private',
      'Content-Length':result.size,'X-JH-Image-Sha256':result.sha256,
      'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
    res.end(result.bytes,cleanup);
  }catch{cleanup();res.destroy();}
  return true;
}
