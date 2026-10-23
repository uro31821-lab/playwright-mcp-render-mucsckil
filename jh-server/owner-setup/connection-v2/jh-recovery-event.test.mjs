import test from 'node:test';
import assert from 'node:assert/strict';
import {redactedRecoveryEvent,recoveryEventKey} from './jh-recovery-event.mjs';
test('real V2 recovery records verified outcome with no private payload',()=>{
 const raw={status:'RECOVERED',failure:{id:'browser',code:'BROWSER_UNAVAILABLE',url:'https://secret'},
  recoveryActions:[{action:'BROWSER_TRANSPORT_SOFT_RECONNECT',outcome:'VERIFIED',token:'secret'}],
  notificationDelivery:'NOT_NEEDED',deviceId:'private-id',session:'private-session'};
 const e=redactedRecoveryEvent(raw,1000);
 assert.equal(e.status,'RECOVERED');assert.equal(e.outcome,'VERIFIED');
 assert.equal(e.stage,'browser');assert.equal(e.replayPreviousCommand,false);
 for(const v of ['secret','private-id','private-session'])assert.ok(!JSON.stringify(e).includes(v));
});
test('manual-required transitions record lack of delivery without claiming push',()=>{
 const e=redactedRecoveryEvent({status:'MANUAL_REQUIRED',
 failure:{id:'security',code:'SECURE_SESSION_INACTIVE'},notificationDelivery:'NOT_CONFIGURED'},1000);
 assert.equal(e.notificationDelivery,'NOT_CONFIGURED');
 assert.equal(e.stage,'security');assert.equal(e.action,null);
});
test('no event from healthy check, status drift and arbitrary strings are rejected',()=>{
 assert.equal(redactedRecoveryEvent({status:'HEALTHY'}),null);
 assert.equal(redactedRecoveryEvent({status:'custom',recoveryActions:[]}),null);
 const e=redactedRecoveryEvent({status:'OBSERVING',failure:{id:'hack',code:'token="secret"'}},1000);
 assert.equal(e.stage,'unknown');assert.equal(e.code,'UNKNOWN');
});
test('duplicate event keys are stable across times for log deduplication',()=>{
 const x={status:'RETRY_SCHEDULED',failure:{id:'browser',code:'BROWSER_UNAVAILABLE'},
  recoveryActions:[{action:'BROWSER_TRANSPORT_SOFT_RECONNECT',outcome:'NOT_CONFIRMED'}]};
 assert.equal(recoveryEventKey(redactedRecoveryEvent(x,1000)),recoveryEventKey(redactedRecoveryEvent(x,2000)));
});
