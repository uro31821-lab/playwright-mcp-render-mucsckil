/** Explicit in-process composition for the existing PC proof HTTP handler.
 * Not attached to the operating server and does not start any listener. */
import {PcOwnerIdentityProof} from '../owner-enrollment/pc-owner-proof.mjs';
import {createPcOwnerProofHttpHandler} from '../owner-enrollment/pc-owner-proof-http.mjs';
import {validatePcOwnerSetupPlan,inspectPcOwnerSetupTarget,readPcOwnerConfiguration,persistPcOwnerConfiguration} from './pc-owner-handoff.mjs';
export function createPcOwnerSetupService({plan:input,oauthClient,clock=Date.now,storageObservations}={}){
 const plan=validatePcOwnerSetupPlan(input);
 inspectPcOwnerSetupTarget(plan,storageObservations); // fail before offering login
 const existing=readPcOwnerConfiguration(plan,{storageObservations});
 const proof=new PcOwnerIdentityProof({serverOrigin:plan.serverOrigin,googleWebClientId:plan.googleWebClientId,expectedGmail:plan.expectedGmail,expectedSubject:existing?.ownerSubject??null,oauthClient,clock});
 let closed=false,attempted=false;
 const facade={serverOrigin:proof.serverOrigin,
  begin(){if(closed||attempted)throw Object.assign(Error('PC_PROOF_UNAVAILABLE'),{code:'PC_PROOF_UNAVAILABLE',status:503});return proof.begin();},
  cancel:(session,input)=>proof.cancel(session,input),
  async finish(session,input,options={}){
   if(closed||attempted)throw Object.assign(Error('PC_PROOF_UNAVAILABLE'),{code:'PC_PROOF_UNAVAILABLE',status:503});
   const verified=await proof.finish(session,input,options);
   if(closed||attempted||options.signal?.aborted)throw Object.assign(Error('PC_PROOF_CANCELED'),{code:'PC_PROOF_CANCELED',status:409});
   attempted=true;
   try{
    const saved=persistPcOwnerConfiguration(proof.takeEvidence(verified.receiptId),plan,{clock,signal:options.signal,storageObservations});
    return {ok:true,code:'IDENTITY_SAVED_CONFIGURATION_PENDING',identityVerified:true,configurationCandidateSaved:saved.configurationCandidateSaved,readbackVerified:saved.readbackVerified,ownerConfigured:false,trustCreated:false,actionApproved:false};
   }catch{throw Object.assign(Error('PC_PROOF_UNAVAILABLE'),{code:'PC_PROOF_UNAVAILABLE',status:503});}
  }};
 return Object.freeze({handler:createPcOwnerProofHttpHandler({proof:facade}),close(){if(closed)return;closed=true;proof.close();},
  // Internal access for an explicitly composed host; never exported via HTTP.
  configuration(){return readPcOwnerConfiguration(plan,{storageObservations});}});
}
