/**
 * JH autonomous *safe* recovery controller v2.
 * No import-time effects. No generic command executor. No Android foreground,
 * OAuth login/approval, task recreation, network write, process restart, or replay.
 *
 * Each caller-supplied adapter MUST come from the trusted existing JH host.
 */
import { diagnoseJH } from './jh-self-diagnostic.mjs';

const KNOWN_CHECKS = Object.freeze(['server', 'mcp', 'browser', 'bridge', 'security']);
const ACTION = 'BROWSER_TRANSPORT_SOFT_RECONNECT';
const BROWSER_ELIGIBLE = new Set([
  'BROWSER_UNAVAILABLE', 'BROWSER_SESSION_EXPIRED', 'BROWSER_EVENT_CHANNEL_CLOSED',
]);
const ADVICE = Object.freeze({
  server: { code: 'CHECK_JH_SERVER', text: 'JH 서버 상태를 확인하세요. 앱을 재설치하거나 결제·전송 작업을 재시작하지 마세요.' },
  mcp: { code: 'CHECK_CHATGPT_PLUGIN', text: 'ChatGPT 설정에서 JH Secure Live 연결 상태를 확인하세요. 서버만으로 ChatGPT 도구 선택 오류를 복구할 수 없습니다.' },
  browser: { code: 'CHECK_BROWSER_SESSION', text: 'JH 브라우저 연결을 확인하세요. 열려 있는 입력·결제 화면은 유지하고 새 작업으로 다시 시작하지 마세요.' },
  bridge: { code: 'OPEN_JH_SECURE', text: '휴대폰에서 JH Secure를 열어 연결 상태를 확인하세요. 화면 공유나 접근성 승인은 휴대폰에서 직접 해주세요.' },
  security: { code: 'REAUTHORIZE_ON_DEVICE', text: '휴대폰에서 보안 인증 또는 필요한 권한을 직접 승인하세요. 인증 정보는 AI에 보내지 마세요.' },
});

function positiveInt(value, fallback, min, max) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}
function cleanCheck(x) {
  if (!x || !KNOWN_CHECKS.includes(x.id)) return null;
  return {
    id: x.id,
    state: ['PASS', 'FAIL', 'UNKNOWN'].includes(x.state) ? x.state : 'UNKNOWN',
    code: typeof x.code === 'string' && /^[A-Z0-9_]{1,72}$/.test(x.code) ? x.code : 'INVALID_CODE',
  };
}
function normalizeReport(report) {
  const checks = Array.isArray(report?.checks) ? report.checks.map(cleanCheck).filter(Boolean) : [];
  const seen = new Set();
  const validChecks = checks.filter(x => !seen.has(x.id) && seen.add(x.id));
  for (const id of KNOWN_CHECKS) if (!seen.has(id)) validChecks.push({id, state:'UNKNOWN', code:'MISSING_CHECK'});
  return {checks:validChecks, overall:validChecks.some(x=>x.state==='FAIL')?'FAIL':validChecks.some(x=>x.state==='UNKNOWN')?'PARTIAL':'PASS'};
}
function firstFailure(report) {
  // If the server or ChatGPT MCP itself is down, dependent sub-checks are less useful.
  // A security failure always prevents trying a browser reconnect.
  const order = ['security', 'server', 'mcp', 'bridge', 'browser'];
  for (const id of order) {
    const c = report.checks.find(x => x.id===id && x.state==='FAIL');
    if (c) return c;
  }
  return null;
}
function canRecoverBrowser(report, failure) {
  if (failure.id!=='browser' || !BROWSER_ELIGIBLE.has(failure.code)) return false;
  // Prove the host is reachable. Do not change a browser session if the trust chain is broken.
  if (report.checks.find(x=>x.id==='server')?.state!=='PASS') return false;
  if (report.checks.find(x=>x.id==='security')?.state==='FAIL') return false;
  if (report.checks.find(x=>x.id==='bridge')?.state==='FAIL') return false;
  return true;
}
function statusObject(status, diagnostic, extra={}) {
  return Object.freeze({schemaVersion:2,status,overall:diagnostic.overall,checks:diagnostic.checks,
    ...extra, noTaskReplay:true, noSecurityBypass:true});
}

/**
 * @param {object} config
 * @param {()=>Promise<object>} [config.diagnose] Read-only diagnostic (must not call BEGIN_COMMAND).
 * @param {()=>Promise<{verified:boolean,idle:boolean}>} [config.isIdle] Trusted, read-only JH workflow idle check.
 * @param {()=>Promise<{verified:true,idle:true,exclusive:true,release:Function}>} [config.acquireMaintenanceLease]
 *    Atomic exclusive lease from JH workflow authority: prevents new jobs during reconnect.
 * @param {()=>Promise<{ok:boolean,mode:string}>} [config.reconnectBrowserTransport]
 *    ONLY an in-memory session/transport refresh; never reset browser profile/pages or perform browser actions.
 * @param {(event: object)=>Promise<any>} [config.notifyUser]
 *    Existing approved notification channel; no default outgoing transport.
 */
export function createJHAutoRecovery({
  diagnose, adapters, isIdle, acquireMaintenanceLease, reconnectBrowserTransport, notifyUser,
  now=Date.now, failureThreshold=2, maxAttempts=2, initialBackoffMs=15000, maxBackoffMs=120000,
  maxAttemptsPerWindow=3, attemptWindowMs=30*60*1000, notificationBackoffMs=5*60*1000,
}={}) {
  const inspect = typeof diagnose==='function' ? diagnose : () => diagnoseJH(adapters ?? {});
  const threshold=positiveInt(failureThreshold,2,1,10);
  const max=positiveInt(maxAttempts,2,1,3);
  const backoff=positiveInt(initialBackoffMs,15000,1,3600000);
  const backoffMax=positiveInt(maxBackoffMs,120000,1,3600000);
  const windowLimit=positiveInt(maxAttemptsPerWindow,3,1,10);
  const windowMs=positiveInt(attemptWindowMs,30*60*1000,1000,86400000);
  const alertGap=positiveInt(notificationBackoffMs,5*60*1000,1000,3600000);
  const repairHistory=[];
  let episode=null, busy=false, timer=null;
  let lastReport=normalizeReport();
  async function sendAlert(problem, reason) {
    if (episode?.notified) return {notificationDelivery:'ALREADY_SENT'};
    if (episode?.lastNotifyAt !== null && episode?.lastNotifyAt !== undefined && now()-episode.lastNotifyAt < alertGap)
      return {notificationDelivery:'RETRY_DEFERRED'};
    const info=ADVICE[problem.id] ?? ADVICE.browser;
    const event=Object.freeze({schemaVersion:2,type:'MANUAL_REQUIRED',
      cause:info.code, recoveryCode:reason, nextStep:info.text,
      attemptedRecovery:episode?.attempts ?? 0,
      automaticExternalActions:false, noTaskReplay:true});
    if (typeof notifyUser!=='function') return {notificationDelivery:'NOT_CONFIGURED',manualAction:event};
    if (episode) episode.lastNotifyAt=now();
    try {
      const result=await notifyUser(event);
      if (result?.delivered===true && episode) episode.notified=true;
      return {notificationDelivery:result?.delivered===true?'DELIVERED':'NOT_CONFIRMED',manualAction:event};
    } catch { return {notificationDelivery:'DELIVERY_FAILED',manualAction:event}; }
  }
  async function runOnce() {
    let report;
    try { report=normalizeReport(await inspect()); }
    catch {
      // Repeated failure of the diagnostic itself is an incident, not a quiet unknown.
      // It is never eligible for automatic repair and contains no exception text.
      report=normalizeReport({checks:[{id:'server',state:'FAIL',code:'DIAGNOSTIC_CHECK_FAILED'}]});
    }
    lastReport=report;
    const failure=firstFailure(report);
    if (!failure) {
      episode=null;
      return statusObject(report.overall==='PASS'?'HEALTHY':'UNVERIFIED',report,{recoveryActions:[],notificationDelivery:'NOT_NEEDED'});
    }
    const key=`${failure.id}:${failure.code}`;
    if (!episode || episode.key!==key) episode={key, consecutive:0, attempts:0, lastAttemptAt:-Infinity, lastNotifyAt:null, notified:false};
    episode.consecutive++;
    if (episode.consecutive<threshold) return statusObject('OBSERVING',report,{failure:{id:failure.id,code:failure.code},confirmation:episode.consecutive,recoveryActions:[]});
    if (!canRecoverBrowser(report,failure) || typeof reconnectBrowserTransport!=='function' ||
        typeof isIdle!=='function' || typeof acquireMaintenanceLease!=='function') {
      const reason=canRecoverBrowser(report,failure)?'SAFE_RECOVERY_ADAPTER_NOT_CONFIGURED':'USER_INTERVENTION_REQUIRED';
      const notification=await sendAlert(failure,reason);
      return statusObject('MANUAL_REQUIRED',report,{failure:{id:failure.id,code:failure.code},recoveryActions:[],...notification});
    }
    let idle;
    try { idle=await isIdle?.(); }catch { idle=null; }
    if (idle?.verified!==true || idle?.idle!==true) {
      return statusObject('WAITING_FOR_IDLE',report,{failure:{id:failure.id,code:failure.code},recoveryActions:[],notificationDelivery:'NOT_NEEDED'});
    }
    if (episode.attempts>=max) {
      const notification=await sendAlert(failure,'AUTO_RECOVERY_EXHAUSTED');
      return statusObject('MANUAL_REQUIRED',report,{failure:{id:failure.id,code:failure.code},recoveryActions:[],...notification});
    }
    for (let i=repairHistory.length-1;i>=0;i--) if (now()-repairHistory[i] >= windowMs) repairHistory.splice(i,1);
    if (repairHistory.length >= windowLimit) {
      const notification=await sendAlert(failure,'GLOBAL_RECOVERY_BUDGET_EXHAUSTED');
      return statusObject('MANUAL_REQUIRED',report,{failure:{id:failure.id,code:failure.code},recoveryActions:[],...notification});
    }
    const ms = Math.min(backoffMax,backoff*2**Math.max(0,episode.attempts-1));
    if (episode.attempts>0 && now()-episode.lastAttemptAt<ms) return statusObject('RETRY_SCHEDULED',report,
      {failure:{id:failure.id,code:failure.code},recoveryActions:[],retryAfterMs:Math.max(0,ms-(now()-episode.lastAttemptAt))});
    // An observed idle flag alone races with new commands. Require an atomic
    // exclusive lease granted by the existing JH workflow owner, or fail closed.
    let lease;
    try { lease=await acquireMaintenanceLease?.({purpose:ACTION,readOnlyPreflight:true}); }
    catch { lease=null; }
    if (lease?.verified!==true || lease?.idle!==true || lease?.exclusive!==true || typeof lease.release!=='function') {
      return statusObject('WAITING_FOR_SAFE_WINDOW',report,{failure:{id:failure.id,code:failure.code},recoveryActions:[],notificationDelivery:'NOT_NEEDED'});
    }
    try {
    episode.attempts++; episode.lastAttemptAt=now(); repairHistory.push(now());
    let result;
    try { result=await reconnectBrowserTransport({action:ACTION,scope:'TRANSPORT_ONLY', noNewCommand:true, noNavigation:true}); }
    catch { result=null; }
    const actionReport={action:ACTION,outcome:'UNVERIFIED',attempt:episode.attempts};
    if (result?.ok!==true || result?.mode!=='TRANSPORT_ONLY') {
      actionReport.outcome='NOT_CONFIRMED';
      if (episode.attempts>=max) {
        const notification=await sendAlert(failure,'AUTO_RECOVERY_EXHAUSTED');
        return statusObject('MANUAL_REQUIRED',report,{failure:{id:failure.id,code:failure.code},recoveryActions:[actionReport],...notification});
      }
      return statusObject('RETRY_SCHEDULED',report,{failure:{id:failure.id,code:failure.code},recoveryActions:[actionReport]});
    }
    let after;
    try { after=normalizeReport(await inspect()); } catch { after=null; }
    if (after) lastReport=after;
    if (after?.checks.find(x=>x.id==='browser')?.state==='PASS' && !firstFailure(after)) {
      actionReport.outcome='VERIFIED'; episode=null;
      return statusObject('RECOVERED',after,{recoveryActions:[actionReport],notificationDelivery:'NOT_NEEDED'});
    }
    actionReport.outcome='VERIFICATION_FAILED';
    if (episode.attempts>=max) {
      const notification=await sendAlert(failure,'AUTO_RECOVERY_EXHAUSTED');
      return statusObject('MANUAL_REQUIRED',after??report,{failure:{id:failure.id,code:failure.code},recoveryActions:[actionReport],...notification});
    }
    return statusObject('RETRY_SCHEDULED',after??report,{failure:{id:failure.id,code:failure.code},recoveryActions:[actionReport]});
    } finally { try { await lease.release(); } catch { /* Never expose the lease error. */ } }
  }
  async function tick() {
    if (busy) return statusObject('SKIPPED_CONCURRENT',lastReport,{recoveryActions:[]});
    busy=true;
    try { return await runOnce(); }
    finally { busy=false; }
  }
  function start({intervalMs=60000}={}) {
    if (timer) return false;
    const safeInterval=positiveInt(intervalMs,60000,10000,3600000);
    timer=setInterval(()=>{void tick().catch(()=>{});},safeInterval);
    timer.unref?.();
    return true;
  }
  function stop() { if (timer) clearInterval(timer);timer=null; }
  return Object.freeze({tick,start,stop,get isRunning(){return timer!==null;}});
}
