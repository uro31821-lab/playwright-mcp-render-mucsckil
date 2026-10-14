import {JHMultiStepCoordinator} from './multi-step.mjs';
import {createJH155Ports} from './jh155-ports.mjs';

/** Binds the existing coordinator to host-owned command/trust/process fences.
 * Scope arguments constrain this command; they cannot create a command, supply
 * a trust identity, grant a payment approval or resume another process's work.
 */
export function createBoundMultiStepRuntime({captureBinding,assertBinding,...ports}){
  if(typeof captureBinding!=='function'||typeof assertBinding!=='function')throw Error('JH_HOST_BINDING_REQUIRED');
  let held=null;
  function currentCommand(){
    if(!held)throw Error('MULTISTEP_CURRENT_SCOPE_REQUIRED');
    assertBinding(held.binding);
    const current=captureBinding();
    for(const key of ['device','command_id','server_instance','process_epoch','trust_id','device_digest'])
      if(current[key]!==held.binding[key])throw Error('MULTISTEP_COMMAND_CHANGED');
    return {deviceId:current.device,commandId:current.command_id,userInitiated:true,scope:structuredClone(held.scope)};
  }
  const coordinator=new JHMultiStepCoordinator(createJH155Ports({...ports,commandContext:currentCommand}));
  return Object.freeze({
    async start({scope,...request}){
      const binding=captureBinding();assertBinding(binding);
      if(held)throw Error('MULTISTEP_NEW_COMMAND_REQUIRED');
      if(!scope||!Array.isArray(scope.apps)||scope.apps.length<1||scope.apps.length>4||
        scope.apps.some(x=>typeof x!=='string'||!/^([a-zA-Z][A-Za-z0-9_]*\.)+[A-Za-z0-9_]+$/.test(x))||
        new Set(scope.apps).size!==scope.apps.length||!Array.isArray(scope.origins)||scope.origins.length<1||scope.origins.length>16||
        !Number.isSafeInteger(scope.maxPaymentKRW)||scope.maxPaymentKRW<0)throw Error('MULTISTEP_SCOPE_INVALID');
      for(const origin of scope.origins){let u;try{u=new URL(origin);}catch{throw Error('MULTISTEP_SCOPE_INVALID');}
        if(u.protocol!=='https:'||u.origin!==origin||u.username||u.password)throw Error('MULTISTEP_SCOPE_INVALID');}
      held={binding:structuredClone(binding),scope:structuredClone(scope)};
      const owned=held;
      try{return await coordinator.start(request);}
      catch(e){if(held===owned)coordinator.invalidate('START_REJECTED');throw e;}
    },
    advance:a=>coordinator.advance(a),
    checkedStatus:()=>coordinator.checkedStatus(),
    revise:a=>coordinator.revise(a),
    cancelWorkflow:id=>coordinator.cancelWorkflow(id),
    checkedPreviewReport:id=>coordinator.checkedPreviewReport(id),
    invalidateFor(device,commandId,reason){
      if(!held||held.binding.device!==device||(commandId!==undefined&&held.binding.command_id!==commandId))return false;
      coordinator.invalidate(reason);held=null;return true;
    }
  });
}
