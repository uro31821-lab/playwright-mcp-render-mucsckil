/** Compose all opt-in continuation routes using ONE existing store and reviewed host
 * authenticator. Does not initialize DBs, mint tokens, grant scopes, open a port or start workers.
 * Legacy application startup remains unchanged until an operator explicitly installs this handler. */
import {createLifeDirectoryHandler} from './life-directory-http.mjs';
import {createLifeRemoteTaskHandler} from './life-remote-task-http.mjs';
import {createLifeCheckpointHandler} from './life-checkpoint-http.mjs';
import {createLifeContentHandler} from './life-content-http.mjs';
import {createLifeWorkerHandler} from './life-worker-http.mjs';
import {createLifeReconciliationHandler} from './life-reconciliation-http.mjs';
import {createLifeQueueHandler} from './life-queue-http.mjs';
export function createLifeContinuationHost(options){
 if(!options||options.enableQueue!==true)throw new Error('continuation_queue_explicit_enable_required');
 const handlers=[...(typeof options.directory==='function'?[createLifeDirectoryHandler(options)]:[]),...(options.enableRemoteTasks===true?[createLifeRemoteTaskHandler(options)]:[]),createLifeQueueHandler(options),createLifeReconciliationHandler(options),createLifeWorkerHandler(options),createLifeContentHandler(options),createLifeCheckpointHandler(options)];
 return async(req,res)=>{for(const h of handlers)if(await h(req,res))return true;return false;};
}
