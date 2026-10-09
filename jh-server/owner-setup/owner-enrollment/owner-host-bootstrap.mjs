/** Host-startup composition only. Calling this requires real owner configuration
 * and previously provisioned persistent storage. Does not create cloud resources,
 * read ChatGPT/Drive credentials, enroll anyone, or activate a device by default.
 * Call before accepting requests; on any installation failure terminate startup.
 */
import path from 'node:path';
import {EnrollmentStore} from './enrollment-store.mjs';
import {GoogleOwnerVerifier} from './owner-enrollment.mjs';
import {createOwnerRegistryService} from './owner-registry-service.mjs';
import {createOwnerEnrollmentHttpHandler} from './owner-enrollment-http.mjs';
export function installConfiguredOwnerHost(runtime,config) {
  for(const k of ['installTrustedSessionRegistry56','installOwnerEnrollmentHandler56'])if(typeof runtime?.[k]!=='function')throw Error('BRIDGE_RUNTIME_REQUIRED');
  if(!config||!path.isAbsolute(config.ownerJournalPath||'')||!path.isAbsolute(config.registryPath||'')||path.resolve(config.ownerJournalPath)===path.resolve(config.registryPath))throw Error('DISTINCT_PRIVATE_STORAGE_REQUIRED');
  // No first-caller ownership; the verifier refuses a missing allowlist/client.
  const verifier=new GoogleOwnerVerifier({clientId:config.googleClientId,allowedSubjects:config.allowedOwnerSubjects,allowedPresenters:config.allowedPresenters});
  const store=new EnrollmentStore({filename:config.ownerJournalPath,key:config.encryptionKey,epoch:config.storageEpoch,initialize:config.initialize===true});
  let service;
  try {
    service=createOwnerRegistryService({store,verifier,serverOrigin:config.serverOrigin,catalogDigest:config.catalogDigest,registryPath:config.registryPath,initializeRegistry:config.initialize===true});
    const authority=runtime.installTrustedSessionRegistry56(service.registry);
    service.installSessionAuthority(authority);
    runtime.installOwnerEnrollmentHandler56(createOwnerEnrollmentHttpHandler({service,serverOrigin:config.serverOrigin}));
    return Object.freeze({enrollmentHostInstalled:true,trustCreated:false,sessionCreated:false,actionApprovalGranted:false,
      close(){service.close();store.close();}});
  } catch(e) {try{service?.close();}catch{}store.close();throw e;}
}
