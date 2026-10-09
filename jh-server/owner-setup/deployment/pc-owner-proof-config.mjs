/** Converts an in-process verified identity to an operator REVIEW candidate.
 * No file writes, environment updates, grants, keys, DB opening, or deployment. */
import {assertPcIdentityEvidence} from '../owner-enrollment/pc-owner-proof.mjs';
import {validateOwnerConfiguration,EXPECTED_ORIGIN,EXPECTED_CATALOG} from './owner-config.mjs';
export function ownerConfigurationProposal(evidence,{ownerLabel,storageEpoch,androidClientId,storageMount='/var/data'},now=Date.now()){
 assertPcIdentityEvidence(evidence);
 if(!Number.isSafeInteger(now)||now<evidence.verifiedAt||now>=evidence.expiresAt)throw Error('PC_EVIDENCE_EXPIRED');
 const config=validateOwnerConfiguration({version:1,serverOrigin:EXPECTED_ORIGIN,catalogDigest:EXPECTED_CATALOG,googleWebClientId:evidence.googleWebClientId,allowedPresenterClientIds:[evidence.googleWebClientId,androidClientId],ownerSubject:evidence.subject,ownerLabel,storageMount,storageEpoch});
 if(config.accountDigest!==evidence.accountDigest)throw Error('PC_EVIDENCE_BINDING_MISMATCH');
 return Object.freeze({reviewRequired:true,operationallyApplied:false,config});
}
