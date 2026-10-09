/** Internal host adapter, not an HTTP/MCP route. Existing authenticated enrollment
 * and removal callbacks remain mandatory in TrustedDeviceRegistry. Nothing here
 * grants an Android action, stores session secrets, or starts a background worker.
 */
import {PURPOSE} from './trusted-device-registry.mjs';
const token=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{24,128}$/.test(x);
const count=x=>Number.isSafeInteger(x)&&x>=0&&x<=1_000_000;
export class TrustedSettingsService {
  #registry; #sessions;
  constructor({registry,sessionAuthority=null}){
    if(!registry||typeof registry.enroll!=='function'||typeof registry.revoke!=='function')throw Error('TRUST_REGISTRY_REQUIRED');
    if(sessionAuthority!==null&&(typeof sessionAuthority.revokeForTrust!=='function'||typeof sessionAuthority.inspectTrust!=='function'))throw Error('SESSION_AUTHORITY_INVALID');
    this.#registry=registry;this.#sessions=sessionAuthority;
  }
  enroll(input,authenticatedContext){
    const registered=this.#registry.enroll(input,authenticatedContext);
    // Whitelist response fields. The original short session is not issued here.
    const receipt=Object.freeze(Object.fromEntries(['trustId','ownerDigest','deviceDigest','serverDigest',
      'catalogDigest','keyDigest','createdAt','expiresAt'].map(k=>[k,registered[k]])));
    return Object.freeze({receipt,consentRequestId:input.consentRequestId,purpose:PURPOSE,
      actionApprovalGranted:false,screenConsentGranted:false,sessionActive:false});
  }
  async remove(trustId,authenticatedContext){
    if(!token(trustId))throw Error('INVALID_TRUST_ID');
    const r=this.#registry.revoke(trustId,authenticatedContext);
    if(r?.status!=='TRUST_REVOKED')throw Error('TRUST_REMOVAL_NOT_COMMITTED');
    const reply={trustId,purpose:PURPOSE,serverRecordRevoked:true,
      activeSessionsRevoked:false,pendingJobsRevoked:false,dispatchedJobsUncertain:null,deviceSideCancellationVerified:false,complete:false};
    if(!this.#sessions)return Object.freeze(reply);
    try {
      await this.#sessions.revokeForTrust(trustId);
      // A success from the cleanup operation is not sufficient. Read back the same
      // scope and verify the issuer fence, active sessions and queued work separately.
      const after=await this.#sessions.inspectTrust(trustId);
      if(after?.trustId!==trustId||after?.newSessionsBlocked!==true||!count(after?.activeSessions)||!count(after?.pendingJobs))return Object.freeze(reply);
      reply.activeSessionsRevoked=after.activeSessions===0;
      reply.pendingJobsRevoked=after.pendingJobs===0;
      reply.dispatchedJobsUncertain=count(after.dispatchedJobsUncertain)?after.dispatchedJobsUncertain:null;
      // Server-side fencing cannot undo a command already delivered to a phone.
      reply.complete=reply.activeSessionsRevoked&&reply.pendingJobsRevoked&&reply.dispatchedJobsUncertain===0;
    }catch {/* Persisted trust removal stands even when active session cleanup is uncertain. */}
    return Object.freeze(reply);
  }
}
