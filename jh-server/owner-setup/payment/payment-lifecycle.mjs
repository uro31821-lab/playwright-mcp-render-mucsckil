import {fail} from './payment-core.mjs';

const CHARGED=new Set(['DISPATCHING','SUBMITTED','AUTHENTICATION_REQUIRED','UNKNOWN','SUCCESS_OBSERVED']);
const MESSAGE_EFFECT=new Set(['IN_FLIGHT','SENT','UNKNOWN']);

// A ledger cleanup hook for the EXISTING JH command fence. No task scheduler,
// recovery engine or automatic resume is introduced here.
export function discardPaymentWork(store,{device,commandId,ticketId,reason='COMMAND_DISCARDED'}={}){
  return store.transaction(()=>{
    let removed=0,preserved=0;
    for(const row of store.db.prepare('SELECT id,body FROM tickets').all()){
      if(ticketId&&row.id!==ticketId)continue;
      const t=store.decode('ticket|'+row.id,row.body),b=t.command_binding;
      if(device&&b?.device!==device)continue;
      if(commandId!==undefined&&b?.command_id!==commandId)continue;
      if(t.lifecycle_cancelled)continue;
      const external=CHARGED.has(t.final_flow?.state)||MESSAGE_EFFECT.has(t.message_status)||t.status==='USER_REPORTED_PAID';
      const oldLinks=store.db.prepare('SELECT hash FROM links WHERE ticket=?').all(t.id);
      for(const x of oldLinks)store.db.prepare("DELETE FROM records WHERE kind='final-link' AND id=?").run(x.hash);
      store.db.prepare('DELETE FROM links WHERE ticket=?').run(t.id);
      let next;
      if(external){
        // External effect evidence is the exception to transient-work deletion.
        // No approval can be reused; confirmation is read-only from this point.
        next={...t,lifecycle_cancelled:true,discard_reason:reason,discarded_at:store.now()};
        delete next.request_key;
        if(next.final_flow){delete next.final_flow.approval_id;delete next.final_flow.fingerprint;delete next.final_flow.boot;}
        if(!CHARGED.has(next.final_flow?.state))next.final_flow={state:'CANCELLED'};
        preserved++;
      }else{
        // Retain only opaque duplicate fences in tickets' indexed hash columns.
        // No order text, amount, account, URL, approval quote or command input.
        next={id:t.id,status:'DISCARDED',lifecycle_cancelled:true,payment_verified:false,final_flow:{state:'CANCELLED'},events:[],discard_reason:reason,discarded_at:store.now()};
        removed++;
      }
      store.db.prepare('UPDATE tickets SET body=? WHERE id=?').run(store.encode('ticket|'+t.id,next),t.id);
      const lock=store.getRecord('final','browser');
      if(lock?.ticket===t.id)store.setRecord('final','browser',{ticket:null});
    }
    return {removed,preserved,automatic_resume:false};
  });
}

export function installPaymentLifecycle(service,lifecycle){
  service.lifecycle=lifecycle;
  // Invoked at server start, before listening. Every unexecuted preparation is
  // discarded; effects and hash fences survive. No old task is restored.
  discardPaymentWork(service.store,{reason:'SERVER_PROCESS_RESTARTED'});
  service.discardWork=scope=>discardPaymentWork(service.store,scope);
}

export function requirePaymentActive(service,t){
  if(t.lifecycle_cancelled)fail('PAYMENT_PREPARATION_DISCARDED_NO_REPLAY');
  service.lifecycle?.assertActive(t);
}
