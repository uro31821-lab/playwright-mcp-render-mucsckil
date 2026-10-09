/** Synthetic test child only. Receives ephemeral fixture data on stdin, never argv. */
import {validateOwnerConfiguration,sha} from '../deployment/owner-config.mjs';
import {inspectProvisionedLifeStorage} from '../deployment/life-storage-provision.mjs';
import {LifeCheckpointStore} from '../server-continuation/life-checkpoint-store.mjs';
import {readFileSync} from 'node:fs';
let raw='';for await(const b of process.stdin)raw+=b;
const x=JSON.parse(raw),config=validateOwnerConfiguration(x.config);
inspectProvisionedLifeStorage(config,x.options,x.observations);
const key=readFileSync(x.options.keyFile),s=new LifeCheckpointStore({databasePath:x.options.databasePath,key,serverDigest:sha(config.serverOrigin)});
key.fill(0);
if(x.operation==='write-and-hold'){
 const cp={workflowId:'fixture_durable_workflow',planDigest:'d'.repeat(64),revision:0,paused:false,cancelled:false,
  entries:[{taskId:'fixture_task',status:'PENDING',providerId:null,code:'pending',evidenceDigest:null,receiptRef:null,verifiedAt:0,invocations:0}]};
 const saved=s.compareAndSet(config.accountDigest,cp,0);s.control(config.accountDigest,cp.workflowId,saved.revision,'cancel');
 console.log('COMMITTED');setInterval(()=>{},1000);
}else if(x.operation==='read'){
 const cp=s.load(config.accountDigest,'fixture_durable_workflow');
 console.log(JSON.stringify({found:!!cp,cancelled:cp?.cancelled,revision:cp?.revision,invocations:cp?.entries?.[0]?.invocations}));s.close();
}else{throw Error('TEST_OPERATION_INVALID');}
