/** Integrates the verified owner enrollment gate with the EXISTING trust registry.
 * No call to begin()/finish() authorizes an Android action or screen capture.
 * This factory is a host-internal opt-in: real Google client/subject provisioning,
 * durable mount and Android sign-in UI must be supplied separately.
 */
import {createHash,createPublicKey,randomBytes,verify} from 'node:crypto';
import {lstatSync} from 'node:fs';
import {resolve} from 'node:path';
import {OwnerEnrollmentGate} from './owner-enrollment.mjs';
import {deny} from './enrollment-store.mjs';
import {TrustedDeviceRegistry,PURPOSE} from '../trusted-server/trusted-device-registry.mjs';
import {TrustedSettingsService} from '../trusted-server/trusted-settings-service.mjs';
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const token=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{32}$/.test(x);
const hash=x=>createHash('sha256').update(x).digest('hex');
const random=()=>randomBytes(24).toString('base64url');
const exact=(o,ks)=>{if(!o||Object.getPrototypeOf(o)!==Object.prototype||Object.keys(o).sort().join('|')!==[...ks].sort().join('|'))deny('unexpected_fields');};
const copy=x=>structuredClone(x);
const receipts=['trustId','ownerDigest','deviceDigest','serverDigest','catalogDigest','keyDigest','createdAt','expiresAt'];
export const STATUS_PURPOSE='OWNER_ENROLLMENT_STATUS_ONLY';
export const CANCEL_PURPOSE='OWNER_ENROLLMENT_CANCEL_ONLY';
const proofFields=['version','purpose','requestId','manifestDigest','keyDigest','challengeId','serverNonce','issuedAtMs','expiresAtMs'];
export function outcomeMaterial(c) {
  exact(c,proofFields);
  if(c.version!==1||![STATUS_PURPOSE,CANCEL_PURPOSE].includes(c.purpose)||!hex(c.manifestDigest)||!hex(c.keyDigest)||
      ![c.requestId,c.challengeId,c.serverNonce].every(token)||!Number.isSafeInteger(c.issuedAtMs)||!Number.isSafeInteger(c.expiresAtMs)||
      c.issuedAtMs<=0||c.expiresAtMs<=c.issuedAtMs||c.expiresAtMs-c.issuedAtMs>60000)deny('outcome_challenge_invalid');
  return Buffer.from(['JH_OWNER_OUTCOME_V1',...proofFields.map(k=>String(c[k]))].join('\n'));
}
export function createOwnerRegistryService({store,verifier,serverOrigin,catalogDigest,registryPath,initializeRegistry=false,clock=Date.now}) {
  if(typeof initializeRegistry!=='boolean'||!hex(verifier?.configurationDigest))deny('owner_configuration_required');
  let u;try{u=new URL(serverOrigin);}catch{deny('server_origin_invalid');}
  if(u.protocol!=='https:'||u.origin!==serverOrigin||u.username||u.password||u.search||u.hash||!hex(catalogDigest))deny('server_origin_invalid');
  if(resolve(registryPath)===store.storagePath)deny('storage_paths_must_differ');
  // Missing registry must never silently reset previously enrolled devices.
  let exists=true;try{const st=lstatSync(registryPath);if(!st.isFile()||st.isSymbolicLink()||st.size===0)deny('registry_file_invalid');}
  catch(e){if(e.code==='ENOENT')exists=false;else throw e;}
  if(exists===initializeRegistry)deny(exists?'registry_already_exists':'registry_missing_recovery_required');
  const serverDigest=hash(serverOrigin+'/mcp|jh-secure-bridge56');
  const admissions=new WeakMap(),removals=new WeakMap();
  const time=()=>{const n=clock();if(!Number.isSafeInteger(n)||n<=0)deny('clock_invalid');return n;};
  const expectedFor=r=>({deviceDigest:r.manifest.deviceDigest,serverDigest,catalogDigest,
    keyDigest:r.manifest.keyDigest,purpose:PURPOSE,requestedTrustMs:r.manifest.durationDays*86400000,consentRequestId:r.id});
  function validateRecord(r) {
    if(!r||!hex(r.accountDigest)||r.manifest.serverOrigin!==serverOrigin||r.manifest.catalogDigest!==catalogDigest||
        r.manifest.purpose!==PURPOSE||![1,7,30].includes(r.manifest.durationDays)||
        hash(JSON.stringify(r.manifest))!==r.manifestDigest||hash(Buffer.from(r.publicKeySpki,'base64url'))!==r.manifest.keyDigest)deny('enrollment_binding_changed');
  }
  const registry=new TrustedDeviceRegistry({databasePath:registryPath,serverDigest,catalogDigest,now:time,
    authorizeEnrollment:(ctx,e)=>{
      const saved=ctx&&admissions.get(ctx);if(!saved)return null;admissions.delete(ctx);
      const r=store.read(saved.requestId);validateRecord(r);
      if(r.state!=='APPLYING'||hash(JSON.stringify(e))!==hash(JSON.stringify(expectedFor(r)))||r.manifestDigest!==saved.manifestDigest)return null;
      const n=time(),expiresAt=Math.min(r.expires,r.authorizedAtMs+60000);
      if(n>=expiresAt||n<r.authorizedAtMs)return null;
      return {ownerDigest:r.accountDigest,enrollmentId:r.id,exactConsentDigest:hash(JSON.stringify(e)),expiresAt};
    },
    authorizeRevocation:(ctx,id)=>{
      const saved=ctx&&removals.get(ctx);if(!saved||saved.trustId!==id)return null;removals.delete(ctx);
      const r=store.read(saved.requestId);validateRecord(r);
      if(r.state!=='CANCEL_PENDING')return null;
      return {ownerDigest:r.accountDigest};
    }});
  try{registry.bindEnrollmentJournal(hash(store.registryBindingDigest()+'|'+verifier.configurationDigest),initializeRegistry);}catch(e){registry.close();throw e;}
  const gate=new OwnerEnrollmentGate({store,verifier,serverOrigin,catalogDigest,clock:time});
  let sessions=null,settings=new TrustedSettingsService({registry});
  const lookup=id=>registry.inspectEnrollment(id,registry.enrollmentInspectorContext);
  function verifyRow(r,t) {
    validateRecord(r);const e=expectedFor(r);
    if(!t||t.enrollmentId!==r.id||t.purpose!==PURPOSE||t.ownerDigest!==r.accountDigest||t.deviceDigest!==e.deviceDigest||
        t.serverDigest!==e.serverDigest||t.catalogDigest!==e.catalogDigest||t.keyDigest!==e.keyDigest||
        t.createdAt<r.authorizedAtMs||t.createdAt>=Math.min(r.expires,r.authorizedAtMs+60000)||
        t.expiresAt-t.createdAt!==e.requestedTrustMs)deny('registry_record_divergence');
    if(r.receipt&&receipts.some(k=>r.receipt[k]!==t[k]))deny('registry_receipt_divergence');
    return Object.freeze(Object.fromEntries(receipts.map(k=>[k,t[k]])));
  }
  const reply=(r,code,receipt=null,extra={})=>Object.freeze({version:1,code,requestId:r.id,manifestDigest:r.manifestDigest,
    purpose:PURPOSE,receipt,trustRegistered:code==='TRUST_REGISTERED',sessionActive:false,actionApprovalGranted:false,screenConsentGranted:false,...extra});
  function apply(id) {
    // Commit intent BEFORE registry I/O. A crash leaves APPLYING, never permission to replay.
    store.updateForApplication(id,r=>{validateRecord(r);const n=time();
      if(r.state!=='AUTHORIZED_NOT_APPLIED')deny('application_not_authorized');
      if(n<r.authorizedAtMs||n>=Math.min(r.expires,r.authorizedAtMs+60000))deny('application_authorization_expired');
      r.state='APPLYING';r.applyStartedAtMs=n;});
    return store.updateForApplication(id,r=>{
      validateRecord(r);if(r.state!=='APPLYING')deny('application_canceled');
      if(lookup(id))deny('application_existing_record_requires_reconcile');
      const ctx=Object.freeze({}),e=expectedFor(r);admissions.set(ctx,{requestId:id,manifestDigest:r.manifestDigest});
      try{registry.enroll({publicKeySpki:r.publicKeySpki,deviceDigest:e.deviceDigest,requestedTrustMs:e.requestedTrustMs,consentRequestId:id},ctx);}
      finally{admissions.delete(ctx);}
      const t=lookup(id),receipt=verifyRow(r,t);if(t.status!=='REGISTERED')deny('registration_not_current');
      r.state='APPLIED';r.receipt=receipt;r.appliedAtMs=time();return reply(r,'TRUST_REGISTERED',receipt);
    });
  }
  function reconcile(id) {
    return store.updateForApplication(id,r=>{
      const t=lookup(id);
      if(['APPLIED','APPLYING'].includes(r.state)) {
        if(!t){if(r.state==='APPLIED')deny('registry_record_missing');return reply(r,'RECONCILIATION_REQUIRED');}
        const receipt=verifyRow(r,t);r.state='APPLIED';r.receipt=receipt;
        if(t.status==='CLOCK_ROLLBACK')deny('clock_invalid');
        return reply(r,t.status==='REGISTERED'?'TRUST_REGISTERED':t.status==='REVOKED'?'TRUST_REVOKED':'TRUST_EXPIRED',receipt);
      }
      if(r.state==='CANCEL_PENDING')return reply(r,'CANCELLATION_PENDING',null,{complete:false});
      if(r.state==='CANCELED') {
        if(t){verifyRow(r,t);if(t.status!=='REVOKED')deny('canceled_registry_divergence');}
        return reply(r,'ENROLLMENT_CANCELED',null,{complete:true});
      }
      if(t)deny('unexpected_registry_record');
      return reply(r,time()>=r.expires?'ENROLLMENT_EXPIRED':r.state);
    });
  }
  function consumeProof(input,purpose,fn) {
    exact(input,['challenge','signature']);if(input.challenge?.purpose!==purpose)deny('outcome_purpose_mismatch');
    const bytes=outcomeMaterial(input.challenge);
    if(typeof input.signature!=='string'||!/^[-a-zA-Z0-9_]{8,110}$/.test(input.signature))deny('outcome_signature_invalid');
    return store.updateForApplication(input.challenge.requestId,r=>{
      const c=input.challenge,n=time(),saved=(r.outcomeChallenges||[]).find(x=>x.challenge.challengeId===c.challengeId);
      if(!saved||saved.used||!outcomeMaterial(saved.challenge).equals(bytes))deny('outcome_proof_unavailable');
      if(n<c.issuedAtMs||n>=c.expiresAtMs)deny('outcome_proof_expired');
      if(c.manifestDigest!==r.manifestDigest||c.keyDigest!==r.manifest.keyDigest)deny('outcome_binding_changed');
      const sig=Buffer.from(input.signature,'base64url');let valid=false;
      try{valid=sig.toString('base64url')===input.signature&&verify('sha256',bytes,createPublicKey({key:Buffer.from(r.publicKeySpki,'base64url'),format:'der',type:'spki'}),sig);}catch{}
      if(!valid)deny('outcome_signature_invalid');
      saved.used=true;return fn(r);
    });
  }
  async function finishCancellation(id) {
    let snapshot;
    store.updateForApplication(id,r=>{if(r.state!=='CANCEL_PENDING')deny('cancellation_not_pending');snapshot=copy(r);});
    const t=lookup(id);
    if(!t) {
      if(snapshot.receipt)deny('registry_record_missing');
      return store.updateForApplication(id,r=>{if(r.state!=='CANCEL_PENDING')deny('cancellation_changed');r.state='CANCELED';return reply(r,'ENROLLMENT_CANCELED',null,{complete:true});});
    }
    verifyRow(snapshot,t);
    const ctx=Object.freeze({});removals.set(ctx,{requestId:id,trustId:t.trustId});
    let result;try{result=await settings.remove(t.trustId,ctx);}finally{removals.delete(ctx);}
    const after=lookup(id);verifyRow(snapshot,after);
    if(after.status!=='REVOKED')deny('revocation_not_committed');
    return store.updateForApplication(id,r=>{
      if(r.state!=='CANCEL_PENDING')deny('cancellation_changed');
      const complete=result.complete===true;
      if(complete)r.state='CANCELED';
      r.cancellationSummary={serverRecordRevoked:true,activeSessionsRevoked:result.activeSessionsRevoked===true,
        pendingJobsRevoked:result.pendingJobsRevoked===true,dispatchedJobsUncertain:result.dispatchedJobsUncertain,complete};
      return reply(r,complete?'ENROLLMENT_CANCELED':'CANCELLATION_PENDING',null,{...r.cancellationSummary,deviceSideCancellationVerified:false});
    });
  }
  // The durable cancellation marker fences session issue/use before asynchronous
  // cleanup. Missing/unreadable journal or APPLYING is NOT a trusted registration.
  registry.installOwnerEnrollmentFence(t=>{
    const r=store.read(t.enrollment);validateRecord(r);
    return r.state==='APPLIED'&&r.receipt?.trustId===t.id&&r.accountDigest===t.owner&&
      r.manifest.deviceDigest===t.device&&r.manifest.keyDigest===t.key_digest&&
      r.receipt.serverDigest===t.server&&r.receipt.catalogDigest===t.catalog&&
      r.receipt.createdAt===t.created&&r.receipt.expiresAt===t.expires;
  });
  return Object.freeze({
    registry, // Host-internal installation into the existing Bridge. Never serialized.
    installSessionAuthority(authority){if(sessions)deny('session_authority_already_installed');settings=new TrustedSettingsService({registry,sessionAuthority:authority});sessions=authority;},
    begin(input){return gate.begin(input);},
    async finish(input){const authorized=await gate.authorize(input);return apply(authorized.requestId);},
    outcomeChallenge(input){
      exact(input,['requestId','purpose']);if(!token(input.requestId)||![STATUS_PURPOSE,CANCEL_PURPOSE].includes(input.purpose))deny('outcome_request_invalid');
      return store.updateForApplication(input.requestId,r=>{
        const n=time();if(n<r.manifest.issuedAtMs||n>r.manifest.issuedAtMs+31*86400000)deny('outcome_retention_expired');
        r.outcomeChallenges=(r.outcomeChallenges||[]).filter(x=>!x.used&&x.challenge.expiresAtMs>n);
        if(r.outcomeChallenges.length>=4)deny('outcome_challenge_limit');
        const c=Object.freeze({version:1,purpose:input.purpose,requestId:r.id,manifestDigest:r.manifestDigest,keyDigest:r.manifest.keyDigest,
          challengeId:random(),serverNonce:random(),issuedAtMs:n,expiresAtMs:n+60000});
        outcomeMaterial(c);r.outcomeChallenges.push({challenge:c,used:false});return c;
      });
    },
    status(input){const id=consumeProof(input,STATUS_PURPOSE,r=>r.id);return Object.freeze({...reconcile(id),outcomeChallengeId:input.challenge.challengeId,observedAtMs:time()});},
    async cancel(input){
      const id=consumeProof(input,CANCEL_PURPOSE,r=>{r.state='CANCEL_PENDING';r.cancellationRequestedAtMs=time();return r.id;});
      return Object.freeze({...await finishCancellation(id),outcomeChallengeId:input.challenge.challengeId,observedAtMs:time()});
    },
    close(){registry.close();}
  });
}
