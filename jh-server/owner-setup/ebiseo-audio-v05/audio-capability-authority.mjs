/* Copyright 2026 JH Equalizer contributors. SPDX-License-Identifier: Apache-2.0 */
import {randomBytes} from 'node:crypto';
import {AUDIO_ROUTES,plainRecord,only,fail,makeReleaseGuard} from './audio-contract.mjs';
import {exactAudioExtension,exactAudioCapability} from './audio-release-authority.mjs';

export const AUDIO_PROBE_TTL_MS=30000;
export const AUDIO_CAPABILITY_TTL_MS=30000;
const hex64=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const command=x=>typeof x==='string'&&/^[a-f0-9]{32}$/.test(x);
const token=x=>typeof x==='string'&&/^[a-f0-9]{48}$/.test(x);
const audioSignal=(type,p)=>AUDIO_ROUTES.some(x=>x.jobType===type||x.tool===p?.mcpToolName)||
  (p!==null&&typeof p==='object'&&Object.hasOwn(p,'audioExtension'));
const deny=code=>Object.freeze({allowed:false,code,httpStatus:409});
const allow=()=>Object.freeze({allowed:true});
const key=b=>JSON.stringify([b.deviceId,b.sessionId,b.commandId,b.taskDigest]);
const same=(a,b)=>a&&b&&['deviceId','deviceDigest','sessionId','commandId','processEpoch'].every(k=>a[k]===b[k]);

/** Internal, in-memory capability evidence. currentBinding must consult active56
 * (including existing trust validity) and the current command fence. It returns
 * no secret. Only the generated host's authenticated completion hook may call
 * acceptedAuthenticatedCompletion; JSON returned to an MCP caller is never evidence. */
export function createAudioCapabilityAuthority({releaseAuthority,getCatalogDigest,
  captureAdmission,currentBinding,now=Date.now}={}) {
  const assertRelease=makeReleaseGuard({releaseAuthority,getCatalogDigest});assertRelease();
  if(typeof captureAdmission!=='function'||typeof currentBinding!=='function'||typeof now!=='function')
    fail('AUDIO_CAPABILITY_HOST_REQUIRED');
  const pending=new Map(),leases=new Map(),latest=new Map();let jobs=new WeakMap(),closed=false,lastNow=-1;
  function time() {
    const n=now();if(closed||!Number.isSafeInteger(n)||n<0)fail('AUDIO_CAPABILITY_UNAVAILABLE');
    if(n<lastNow){pending.clear();leases.clear();latest.clear();jobs=new WeakMap();fail('AUDIO_CAPABILITY_CLOCK_CHANGED');}
    lastNow=n;
    for(const [id,p] of pending)if(p.expiresAt<=n)pending.delete(id);
    for(const [id,p] of leases)if(p.expiresAt<=n)leases.delete(id);
    for(const [id,p] of latest)if(p.expiresAt<=n&&!leases.has(id))latest.delete(id);
    return n;
  }
  function binding(value,taskDigest,n) {
    if(!plainRecord(value)||typeof value.deviceId!=='string'||!value.deviceId||
       !hex64(value.deviceDigest)||typeof value.sessionId!=='string'||!value.sessionId||
       !command(value.commandId)||!Number.isSafeInteger(value.sessionExpiresAt)||value.sessionExpiresAt<=n||
       !hex64(taskDigest))fail('AUDIO_ACTIVE_COMMAND_SESSION_REQUIRED');
    return Object.freeze({deviceId:value.deviceId,deviceDigest:value.deviceDigest,sessionId:value.sessionId,
      commandId:value.commandId,processEpoch:value.processEpoch??null,taskDigest,
      sessionExpiresAt:value.sessionExpiresAt});
  }
  function current(expected,n) {
    let actual;try{actual=binding(currentBinding(expected.deviceId),expected.taskDigest,n);}catch{return false;}
    return same(expected,actual);
  }
  function requireLease(expected,n) {
    assertRelease();
    const lease=leases.get(key(expected));
    if(!lease||!same(expected,lease)||lease.expiresAt<=n||!current(expected,n))
      fail('AUDIO_PHONE_CAPABILITY_REQUIRED');
    return lease;
  }
  function probeMatches(p,b) {
    return plainRecord(p)&&Object.keys(p).sort().join('|')==='commandId|nonce|taskDigest'&&
      token(p.nonce)&&p.commandId===b.commandId&&p.taskDigest===b.taskDigest;
  }
  function signedJobMatches(job,b) {
    return job?.targetDeviceId===b.deviceId&&job.targetDeviceDigest===b.deviceDigest&&
      job.secureSessionId===b.sessionId&&job.commandId===b.commandId&&job.taskDigest===b.taskDigest;
  }
  return Object.freeze({
    prepareProbe(args) {
      const n=time();assertRelease();
      const b=binding(captureAdmission(args.device_id),args.task_digest,n);
      if(args.device_id!==undefined&&args.device_id!==b.deviceId)fail('AUDIO_DEVICE_BINDING_MISMATCH');
      if(pending.size>=32||(!latest.has(key(b))&&latest.size>=32))fail('AUDIO_CAPABILITY_CAPACITY');
      const nonce=randomBytes(24).toString('hex');
      const p=Object.freeze({...b,nonce,expiresAt:Math.min(n+AUDIO_PROBE_TTL_MS,b.sessionExpiresAt)});
      pending.set(nonce,p);
      // A newer authenticated capability check must supersede older evidence,
      // including earlier queued work and an older outstanding probe result.
      latest.set(key(b),p);leases.delete(key(b));
      return Object.freeze({binding:p,hostArgs:{device_id:b.deviceId,task_digest:b.taskDigest},
        extra:{commandId:b.commandId,audioCapabilityProbe:{nonce,commandId:b.commandId,taskDigest:b.taskDigest}}});
    },
    finishProbe(probe) {
      const n=time();const p=probe?.binding;
      if(!p||!token(p.nonce))fail('AUDIO_PHONE_CAPABILITY_REQUIRED');
      const lease=requireLease(p,n);
      if(lease.nonce!==p.nonce)fail('AUDIO_PHONE_CAPABILITY_REQUIRED');
      return Object.freeze({deviceId:p.deviceId,sessionId:p.sessionId,commandId:p.commandId,taskDigest:p.taskDigest});
    },
    abandonProbe(probe) { if(probe?.binding?.nonce)pending.delete(probe.binding.nonce); },
    beforeMk(type,payload,deviceId) {
      const isAudio=audioSignal(type,payload),hasProbe=Object.hasOwn(payload||{},'audioCapabilityProbe');
      if(!isAudio&&!hasProbe)return;
      const n=time();assertRelease();
      if(hasProbe) {
        const p=payload.audioCapabilityProbe,expected=pending.get(p?.nonce);
        if(isAudio||type!=='secure_device_status'||payload.mcpToolName!=='life_android_secure_status'||
           payload.secureRequestedEffect!=='READ_ONLY'||!expected||!probeMatches(p,expected)||
           payload.commandId!==expected.commandId||payload.taskDigest!==expected.taskDigest||
           payload.targetDeviceDigest!==expected.deviceDigest||deviceId!==expected.deviceId||
           latest.get(key(expected))?.nonce!==expected.nonce||
           !current(expected,n))fail('AUDIO_CAPABILITY_PROBE_BINDING');
        return;
      }
      const route=AUDIO_ROUTES.find(x=>x.jobType===type);
      if(!route||payload.mcpToolName!==route.tool||payload.secureRequestedEffect!==route.effect||
         !exactAudioExtension(payload.audioExtension))fail('AUDIO_EXTENSION_ROUTE_MISMATCH');
      const b=binding(currentBinding(deviceId),payload.taskDigest,n);
      if(b.commandId!==payload.commandId||b.deviceDigest!==payload.targetDeviceDigest)
        fail('AUDIO_CAPABILITY_SCOPE_MISMATCH');
      requireLease(b,n);
    },
    capture(job,payload) {
      if(!Object.hasOwn(payload||{},'audioCapabilityProbe'))return;
      const n=time(),p=payload.audioCapabilityProbe,expected=pending.get(p?.nonce);
      if(!expected||!probeMatches(p,expected)||!signedJobMatches(job,expected)||!current(expected,n)||
         job.type!=='secure_device_status'||job.mcpToolName!=='life_android_secure_status'||
         job.secureRequestedEffect!=='READ_ONLY'||!Number.isSafeInteger(job.secureExpiresAt)||job.secureExpiresAt<=n)
        fail('AUDIO_CAPABILITY_PROBE_BINDING');
      jobs.set(job,{expected,dispatched:false,consumed:false});
    },
    beforeDispatch(job) {
      if(!audioSignal(job?.type,job)&&!Object.hasOwn(job||{},'audioCapabilityProbe'))return allow();
      try {
        const n=time();
        this.beforeMk(job.type,job,job.targetDeviceId);
        if(!job.secureSessionId||job.status!=='queued'||job.secureExpiresAt<=n)
          fail('AUDIO_CAPABILITY_DISPATCH_BINDING');
        if(Object.hasOwn(job,'audioCapabilityProbe')) {
          const entry=jobs.get(job);
          if(!entry||entry.consumed||entry.dispatched||!signedJobMatches(job,entry.expected))
            fail('AUDIO_CAPABILITY_PROBE_REPLAY');
          // This is only eligibility. Dispatch evidence is recorded after both
          // unchanged trust and durable beforeDispatch gates have succeeded.
        } else {
          const b=binding(currentBinding(job.targetDeviceId),job.taskDigest,n);
          if(!signedJobMatches(job,b))fail('AUDIO_CAPABILITY_DISPATCH_BINDING');
          requireLease(b,n);
        }
        return allow();
      } catch(e) { return deny(/^AUDIO_[A-Z_]+$/.test(e?.code||'')?e.code:'AUDIO_CAPABILITY_REJECTED'); }
    },
    didDispatch(job) {
      const entry=jobs.get(job);if(!entry)return;
      const n=time();
      if(entry.consumed||entry.dispatched||job.status!=='queued'||
         !signedJobMatches(job,entry.expected)||!current(entry.expected,n)||entry.expected.expiresAt<=n)
        fail('AUDIO_CAPABILITY_PROBE_REPLAY');
      entry.dispatched=true;
    },
    acceptedAuthenticatedCompletion(job,result) {
      const entry=jobs.get(job);
      if(!entry)return false;
      if(entry.consumed)return false;
      const reservationLive=pending.get(entry.expected.nonce)===entry.expected;
      entry.consumed=true;pending.delete(entry.expected.nonce);
      const n=time(),expected=entry.expected;
      if(!reservationLive)return false;
      if(latest.get(key(expected))?.nonce!==expected.nonce)return false;
      leases.delete(key(expected));
      if(!entry.dispatched||job.status!=='in_progress'||!signedJobMatches(job,expected)||
         !probeMatches(job.audioCapabilityProbe,expected)||
         !job.secureSessionId||job.type!=='secure_device_status'||
         job.mcpToolName!=='life_android_secure_status'||job.secureRequestedEffect!=='READ_ONLY'||
         expected.expiresAt<=n||!current(expected,n)||result?.ok!==true||
         result?.secureActive!==true||result?.deviceResponded!==true||
         !exactAudioCapability(result?.phoneCapabilities?.EBISEO_AUDIO_EXTENSION))return false;
      leases.set(key(expected),Object.freeze({...expected,
        expiresAt:Math.min(expected.sessionExpiresAt,n+AUDIO_CAPABILITY_TTL_MS)}));
      return true;
    },
    discard(job) {const e=jobs.get(job);if(e)pending.delete(e.expected.nonce);jobs.delete(job);},
    close() {closed=true;pending.clear();leases.clear();latest.clear();jobs=new WeakMap();}
  });
}
