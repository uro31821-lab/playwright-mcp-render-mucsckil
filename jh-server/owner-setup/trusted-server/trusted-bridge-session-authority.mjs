/** Opt-in session issuer attached to the real SecureBridge state maps.
 * Enrollment/account authentication remains a separate host path. No action grant.
 */
import {randomBytes,createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {PURPOSE,MAX_SESSION_MS,CHALLENGE_MS} from './trusted-device-registry.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const mac=(s,x)=>createHmac('sha256',s).update(x).digest('hex');
const token=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{24,128}$/.test(x);
const hex=x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x);
const eq=(a,b)=>hex(a)&&hex(b)&&timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
const fail=c=>{throw Object.assign(new Error(c),{code:c});};
function fields(x,names){if(!x||Array.isArray(x)||typeof x!=='object'||Object.keys(x).length!==names.length||names.some(k=>!Object.hasOwn(x,k)))fail('INVALID_FIELDS');}
export const activationMaterial=x=>['JH_TRUST_ACTIVATE_V1',PURPOSE,x.trustId,x.challengeId,x.redemptionId,x.sessionId,x.deviceDigest,x.sessionDigest,x.nonce,String(x.expiresAt)].join('\n');
export const receiptMaterial=x=>['JH_TRUST_ACTIVE_V1',PURPOSE,x.trustId,x.challengeId,x.redemptionId,x.sessionId,x.deviceDigest,x.sessionDigest,x.nonce,String(x.expiresAt)].join('\n');
export class TrustedBridgeSessionAuthority {
  #registry;#bridge;#now;#window=0;#requests=0;
  constructor({registry,bridge,now=Date.now}){
    if(!registry||typeof registry.trustForSessionIssuer!=='function'||typeof registry.claimForSessionIssuer!=='function')fail('TRUST_REGISTRY_REQUIRED');
    for(const k of ['devices','states','queues','jobs','recentJobs','frameWaiters'])if(!(bridge?.[k] instanceof Map))fail('BRIDGE_STATE_REQUIRED');
    if(!hex(bridge.serverDigest)||!hex(bridge.catalogDigest)||typeof bridge.sessionDigest!=='function'||typeof now!=='function')fail('BRIDGE_CONFIGURATION_REQUIRED');
    this.#registry=registry;this.#bridge=bridge;this.#now=now;
  }
  #time(){const n=this.#now();if(!Number.isSafeInteger(n)||n<0)fail('INVALID_CLOCK');return n;}
  #trust(id){return this.#registry.trustForSessionIssuer(id,this.#registry.issuerContext);}
  #scope(t,d){if(t.deviceDigest!==hash('jh56|'+d)||t.serverDigest!==this.#bridge.serverDigest||t.catalogDigest!==this.#bridge.catalogDigest)fail('TRUST_SCOPE_CHANGED');}
  #device(d){if(typeof d!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(d))fail('INVALID_DEVICE_ID');return d;}
  #purge(st){const n=this.#time();if(st.active&&st.active.expiresAt<=n){st.active.secret.fill(0);st.active=null;}for(const [id,p]of st.pending)if(p.expiresAt<=n||(p.trustId&&p.activationDeadline<=n)){p.secret.fill(0);st.pending.delete(id);}}
  #preflight(d,t){this.#scope(t,d);const st=this.#bridge.states.get(d);if(st){this.#purge(st);if(st.active)fail('BRIDGE_ALREADY_ACTIVE');if(st.pending.size)fail('PAIRING_IN_PROGRESS');}}
  challenge(input){
    fields(input,['trustId','clientNonce','deviceId']);const d=this.#device(input.deviceId),t=this.#trust(input.trustId);this.#preflight(d,t);
    return this.#registry.challenge(t.trustId,input.clientNonce);
  }
  recoveryChallenge(input){
    fields(input,['trustId','clientNonce','deviceId']);const d=this.#device(input.deviceId),t=this.#trust(input.trustId);
    this.#scope(t,d);return this.#registry.challenge(t.trustId,input.clientNonce);
  }
  recover(input){
    fields(input,['deviceId','proof']);const d=this.#device(input.deviceId),c=input.proof?.challenge;
    if(!c)fail('INVALID_PROOF');this.#scope(this.#trust(c.trustId),d);
    const r=this.#registry.inspectRecovery(input.proof),st=this.#bridge.states.get(d);
    if(st)this.#purge(st);
    // Report all current sessions/pairing on this device; never replace manual pairing.
    const activeSessions=st?.active?1:0,pendingSessions=st?.pending.size||0;
    let pendingJobs=0,uncertain=r.dispatchedJobsUncertain;
    for(const j of this.#bridge.jobs.values())if(j.trustBindingId===r.trustId){
      if(j.status==='queued'&&j.secureExpiresAt<=this.#time()){
        j.status='expired';j.error='TRUST_SESSION_EXPIRED_BEFORE_DISPATCH';j.completedAt=new Date(this.#time()).toISOString();
      }
      if(j.status==='queued')pendingJobs++;
      if(j.status==='in_progress'&&j.secureRequestedEffect!=='READ_ONLY')uncertain++;
    }
    const clear=activeSessions===0&&pendingSessions===0&&pendingJobs===0&&uncertain===0&&
      r.unusedChallenges===0&&r.redeemableProofs===0;
    return {version:1,code:clear?'RECOVERY_CLEAR':'RECOVERY_WAIT',purpose:'SESSION_STATE_RECONCILE_ONLY',...r,
      activeSessions,pendingSessions,pendingJobs,dispatchedJobsUncertain:uncertain,
      safeToStartNewAttempt:clear,sessionActive:false,actionApprovalGranted:false,screenConsentGranted:false};
  }
  begin(input){
    fields(input,['deviceId','proof']);const d=this.#device(input.deviceId),c=input.proof?.challenge;if(!c)fail('INVALID_PROOF');
    const t=this.#trust(c.trustId);this.#preflight(d,t);
    const verified=this.#registry.verifyReconnectProof(input.proof);
    const claim=this.#registry.claimForSessionIssuer(verified.redemptionId,this.#registry.issuerContext);
    // Durable one-shot claim before minting. A crash cannot authorize a replay.
    const current=this.#trust(claim.trustId);this.#preflight(d,current);
    const n=this.#time(),expiresAt=Math.min(n+MAX_SESSION_MS,claim.maxSessionExpiresAt,current.expiresAt);if(expiresAt<=n)fail('SESSION_EXPIRED');
    const p={sessionId:'s56_'+randomBytes(18).toString('base64url'),secret:randomBytes(32),expiresAt,
      deviceDigest:t.deviceDigest,trustId:t.trustId,ownerDigest:t.ownerDigest,redemptionId:claim.redemptionId,
      challengeId:c.challengeId,activationDeadline:Math.min(expiresAt,n+CHALLENGE_MS),seenActivate:new Set()};
    p.sessionDigest=this.#bridge.sessionDigest(p);
    const st=this.#bridge.states.get(d)||{active:null,pending:new Map()};st.pending.set(p.sessionId,p);this.#bridge.states.set(d,st);
    this.#bridge.devices.set(d,{...(this.#bridge.devices.get(d)||{}),secureBridgeVersion:56,deviceDigest:p.deviceDigest,secureActive:false,lastSeen:n});
    if(!this.#bridge.queues.has(d))this.#bridge.queues.set(d,[]);
    return {version:1,code:'TRUSTED_SESSION_PENDING',purpose:PURPOSE,trustId:t.trustId,
      challengeId:c.challengeId,clientNonce:c.clientNonce,redemptionId:claim.redemptionId,
      ownerDigest:t.ownerDigest,deviceDigest:t.deviceDigest,serverIdentityDigest:t.serverDigest,toolCatalogDigest:t.catalogDigest,
      secureSessionId:p.sessionId,secureSessionSecret:p.secret.toString('base64url'),sessionDigest:p.sessionDigest,
      secureExpiresAt:expiresAt,activationExpiresAt:p.activationDeadline,
      sessionActive:false,actionApprovalGranted:false,screenConsentGranted:false};
  }
  activate(input){
    fields(input,['deviceId','trustId','challengeId','redemptionId','sessionId','deviceDigest','sessionDigest','nonce','expiresAt','mac']);
    const d=this.#device(input.deviceId),st=this.#bridge.states.get(d),n=this.#time();if(!st)fail('TRUSTED_PENDING_MISSING');this.#purge(st);
    const p=st.pending.get(input.sessionId);if(!p?.trustId)fail('TRUSTED_PENDING_MISSING');const t=this.#trust(p.trustId);this.#scope(t,d);if(st.active)fail('BRIDGE_ALREADY_ACTIVE');
    if(p.trustId!==input.trustId||p.challengeId!==input.challengeId||p.redemptionId!==input.redemptionId||p.deviceDigest!==input.deviceDigest||p.sessionDigest!==input.sessionDigest)fail('ACTIVATION_SCOPE_MISMATCH');
    if(!token(input.nonce)||!Number.isSafeInteger(input.expiresAt)||input.expiresAt<=n||input.expiresAt>Math.min(n+CHALLENGE_MS,p.activationDeadline,p.expiresAt,t.expiresAt))fail('ACTIVATION_EXPIRED');
    if(!eq(input.mac,mac(p.secret,activationMaterial(input))))fail('ACTIVATION_MAC_INVALID');if(p.seenActivate.has(input.nonce))fail('ACTIVATION_REPLAY');p.seenActivate.add(input.nonce);
    this.#trust(p.trustId);
    for(const [id,other]of st.pending)if(id!==p.sessionId)other.secret.fill(0);
    st.active={...p,seenPoll:new Set(),seenComplete:new Set(),seenFrame:new Set()};st.pending.clear();
    const m=this.#bridge.devices.get(d);this.#bridge.devices.set(d,{...m,secureActive:true,lastSeen:n});
    const r={version:1,code:'TRUSTED_SESSION_ACTIVE',purpose:PURPOSE,trustId:p.trustId,challengeId:p.challengeId,
      redemptionId:p.redemptionId,sessionId:p.sessionId,deviceDigest:p.deviceDigest,sessionDigest:p.sessionDigest,
      nonce:input.nonce,expiresAt:p.expiresAt,actionApprovalGranted:false,screenConsentGranted:false};
    r.mac=mac(p.secret,receiptMaterial(r));return r;
  }
  /** Extends only an existing trusted session while its enrolled device is in use.
   * Requires BOTH a new durable one-shot device-key proof and the current session
   * MAC. A stolen session token alone is insufficient. Never renews the trust,
   * changes a job deadline, issues action consent, or drops nonce history. */
  renew(input){
    fields(input,['deviceId','sessionId','proof','mac']);
    const d=this.#device(input.deviceId),c=input.proof?.challenge;
    if(!c)fail('INVALID_PROOF');
    const t=this.#trust(c.trustId);this.#scope(t,d);
    const st=this.#bridge.states.get(d);if(st)this.#purge(st);
    const a=st?.active;
    if(!a||!a.trustId||a.trustId!==t.trustId||a.sessionId!==input.sessionId||!this.sessionAllowed(a))fail('RENEW_ACTIVE_TRUST_REQUIRED');
    const binding=['JH_TRUST_RENEW_V1',PURPOSE,t.trustId,c.challengeId,c.clientNonce,a.sessionId,a.deviceDigest].join('\n');
    if(!eq(input.mac,mac(a.secret,binding)))fail('RENEW_MAC_INVALID');
    const verified=this.#registry.verifyReconnectProof(input.proof);
    const claim=this.#registry.claimForSessionIssuer(verified.redemptionId,this.#registry.issuerContext);
    const current=this.#trust(t.trustId),n=this.#time();
    if(claim.trustId!==a.trustId||st.active!==a||!this.sessionAllowed(a))fail('RENEW_SCOPE_CHANGED');
    const expiresAt=Math.min(n+MAX_SESSION_MS,claim.maxSessionExpiresAt,current.expiresAt);
    if(expiresAt<=n||expiresAt<a.expiresAt)fail('RENEW_DEADLINE_INVALID');
    a.expiresAt=expiresAt;a.sessionDigest=this.#bridge.sessionDigest(a);
    const r={version:1,code:'TRUSTED_SESSION_RENEWED',purpose:PURPOSE,trustId:a.trustId,
      sessionId:a.sessionId,deviceDigest:a.deviceDigest,ownerDigest:a.ownerDigest,
      serverIdentityDigest:current.serverDigest,toolCatalogDigest:current.catalogDigest,
      challengeId:c.challengeId,clientNonce:c.clientNonce,secureExpiresAt:expiresAt,
      sessionDigest:a.sessionDigest,serverTime:n,actionApprovalGranted:false,screenConsentGranted:false};
    r.mac=mac(a.secret,['JH_TRUST_RENEWED_V1',PURPOSE,r.trustId,r.challengeId,r.clientNonce,
      r.sessionId,r.deviceDigest,r.ownerDigest,r.serverIdentityDigest,r.toolCatalogDigest,
      r.secureExpiresAt,r.sessionDigest,r.serverTime].join('\n'));
    return r;
  }
  beforeDispatch(j){
    const st=this.#bridge.states.get(j.targetDeviceId),a=st?.active;
    if(!a||a.sessionId!==j.secureSessionId||a.trustId!==j.trustBindingId||!this.sessionAllowed(a))fail('TRUST_DISPATCH_FENCED');
    // Read-only status/inspection has no external side effect to undo. Other work
    // stays unresolved durably until a separate result-verification flow resolves it.
    if(j.secureRequestedEffect!=='READ_ONLY')this.#registry.noteUncertainDispatch(a.trustId,hash(j.id+'|'+j.secureSessionId),this.#registry.issuerContext);
  }
  /** Mandatory fresh durable check by active56, before any existing Bridge work. */
  sessionAllowed(a){try{const t=this.#trust(a.trustId),n=this.#time();return a.ownerDigest===t.ownerDigest&&a.deviceDigest===t.deviceDigest&&t.serverDigest===this.#bridge.serverDigest&&t.catalogDigest===this.#bridge.catalogDigest&&a.expiresAt>n&&a.expiresAt<=t.expiresAt;}catch{return false;}}
  revokeForTrust(id){
    if(!token(id))fail('INVALID_TRUST_ID');
    try{this.#trust(id);fail('TRUST_STILL_VALID');}catch(e){if(!['TRUST_REVOKED','TRUST_EXPIRED','TRUST_NOT_FOUND','TRUST_SCOPE_CHANGED'].includes(e.code))throw e;}
    return this.fenceSessions(id);
  }
  /** Safety-only cleanup, called on revoked trust or unavailable registry. */
  fenceSessions(id){
    const revokedIds=new Set(),affectedDevices=new Set();
    for(const [d,st]of this.#bridge.states){
      if(st.active?.trustId===id){revokedIds.add(st.active.sessionId);st.active.secret.fill(0);st.active=null;affectedDevices.add(d);}
      for(const [sid,p]of st.pending)if(p.trustId===id){revokedIds.add(sid);p.secret.fill(0);st.pending.delete(sid);affectedDevices.add(d);}
    }
    for(const j of this.#bridge.jobs.values())if(revokedIds.has(j.secureSessionId)||j.trustBindingId===id){
      j.trustBindingId=id;
      if(j.status==='queued'||j.status==='in_progress'){
        const sent=j.status==='in_progress';j.status=sent?'error':'expired';j.error=sent?'TRUST_REVOKED_OUTCOME_UNKNOWN':'TRUST_REVOKED_BEFORE_DISPATCH';
        j.trustDispatchedOutcomeUncertain=sent;j.completedAt=new Date(this.#time()).toISOString();
        for(const k of ['textValue','actionApprovalGrantToken','screenGrantToken','secureMac','secureNonce','securePayloadDigest'])delete j[k];
      }
    }
    for(const [d,q]of this.#bridge.queues)this.#bridge.queues.set(d,q.filter(x=>this.#bridge.jobs.get(x)?.status==='queued'));
    for(const [k,v]of this.#bridge.recentJobs)if(revokedIds.has(v?.v?.secureSessionId)||v?.v?.trustBindingId===id)this.#bridge.recentJobs.delete(k);
    for(const [k,w]of this.#bridge.frameWaiters)if(affectedDevices.has(w.deviceId)&&!this.#bridge.states.get(w.deviceId)?.active){this.#bridge.frameWaiters.delete(k);try{w.resolve(null);}catch{}}
    for(const d of affectedDevices){const m=this.#bridge.devices.get(d);if(m)this.#bridge.devices.set(d,{...m,secureActive:!!this.#bridge.states.get(d)?.active});}
    return this.inspectTrust(id);
  }
  inspectTrust(id){
    let blocked=true;try{this.#trust(id);blocked=false;}catch{}
    let active=0,pending=0,uncertain=0;const sessions=new Set();
    for(const st of this.#bridge.states.values()){this.#purge(st);if(st.active?.trustId===id){active++;sessions.add(st.active.sessionId);}for(const p of st.pending.values())if(p.trustId===id){pending++;sessions.add(p.sessionId);}}
    for(const j of this.#bridge.jobs.values())if(j.trustBindingId===id||sessions.has(j.secureSessionId)){if(j.status==='queued')pending++;if(j.status==='in_progress'||j.trustDispatchedOutcomeUncertain===true)uncertain++;}
    const durable=this.#registry.uncertainDispatchCount(id,this.#registry.issuerContext);
    return {trustId:id,newSessionsBlocked:blocked,activeSessions:active,pendingJobs:pending,dispatchedJobsUncertain:Math.max(uncertain,durable),deviceSideCancellationVerified:false};
  }
  async handle(req,res,url){
    res.setHeader('cache-control','no-store');res.setHeader('content-type','application/json');
    if(req.method!=='POST'||url.search||!['/device/trusted/challenge','/device/trusted/reconnect','/device/trusted/activate','/device/trusted/recovery-challenge','/device/trusted/recover','/device/trusted/renew'].includes(url.pathname)){res.writeHead(404).end('{"ok":false,"code":"NOT_FOUND"}');return;}
    if(!/^application\/json(?:\s*;|$)/i.test(String(req.headers['content-type']||''))){res.writeHead(415).end('{"ok":false,"code":"JSON_REQUIRED"}');return;}
    const now=this.#time();if(now<this.#window||now-this.#window>=60_000){this.#window=now;this.#requests=0;}
    if(++this.#requests>60){res.writeHead(429).end('{"ok":false,"code":"RATE_LIMIT"}');return;}
    const chunks=[];let size=0;
    try{
      for await(const c of req){size+=c.length;if(size>8192){res.writeHead(413).end('{"ok":false,"code":"BODY_TOO_LARGE"}');return;}chunks.push(c);}
      let b;try{b=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('INVALID_JSON');}
      const r=url.pathname.endsWith('/renew')?this.renew(b):url.pathname.endsWith('/recovery-challenge')?this.recoveryChallenge(b):url.pathname.endsWith('/recover')?this.recover(b):url.pathname.endsWith('/challenge')?this.challenge(b):url.pathname.endsWith('/reconnect')?this.begin(b):this.activate(b);
      res.writeHead(200).end(JSON.stringify(r));
    }catch(e){const code=/^[A-Z0-9_]{1,70}$/.test(e.code||'')?e.code:'TRUST_REQUEST_REJECTED';if(!res.headersSent)res.writeHead(400).end(JSON.stringify({ok:false,code}));}
  }
}
