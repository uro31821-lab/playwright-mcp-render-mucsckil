/** Read-only HTTP metadata observer. Never changes authentication or consumes request bodies. */
import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';

const ROUTES = new Map([
  ['POST /device/register', 'register'], ['POST /device/activate', 'activate'],
  ['GET /device/poll', 'poll'],
]);

export function classifyRoute(method, url) {
  if (typeof url !== 'string' || url.length > 8192) return null;
  const pathname = url.split('?', 1)[0];
  const exact = ROUTES.get(`${method} ${pathname}`);
  if (exact) return exact;
  if (method === 'POST' && /^\/job\/[^/]{1,160}\/complete$/.test(pathname)) return 'complete';
  if (method === 'POST' && /^\/device\/frame\/[^/]{1,160}$/.test(pathname)) return 'frame';
  return null;
}

export function expiryDelta(header, now) {
  if (typeof header !== 'string' || !/^\d{1,16}$/.test(header)) return null;
  const value = Number(header);
  if (!Number.isSafeInteger(value)) return null;
  return Math.max(-3600000, Math.min(3600000, value - now));
}

export function makeObserver({ sink = record => console.log('JH_CONNECTION_DIAG', JSON.stringify(record)),
  now = Date.now, monotonic = () => performance.now(), intervalMs = 60000, eventBudget = 60 } = {}) {
  let bucketAt = now(), emitted = 0, suppressed = 0, lastPollAt = null, lastActivationAt = null;
  let observed = 0, errors = 0;
  const counts = new Map();
  const safeEmit = record => { try { sink(record); } catch { /* Logging cannot change request handling. */ } };
  function flush() {
    const at = now();
    if (observed || suppressed) {
      safeEmit({ schema: 1, event: 'summary', atUtc: new Date(at).toISOString(),
        counts: Object.fromEntries(counts), responsesObserved: observed, errorsObserved: errors,
        suppressedEvents: suppressed, lastSuccessfulPollAgeMs: lastPollAt === null ? null : Math.max(0, at-lastPollAt),
        lastSuccessfulActivationAgeMs: lastActivationAt === null ? null : Math.max(0, at-lastActivationAt) });
    }
    bucketAt=at; emitted=0; suppressed=0; observed=0; errors=0; counts.clear();
  }
  function emitLimited(record) {
    if (now()-bucketAt >= intervalMs) flush();
    if (emitted >= eventBudget) { suppressed++; return; }
    emitted++; safeEmit(record);
  }
  function observe(req,res) {
    try {
      const route=classifyRoute(req.method,req.url);
      if (!route) return;
      const receivedAt=now(), start=monotonic();
      const sessionHeaderPresent=typeof req.headers['x-jh-session']==='string';
      const expiryMinusServerNowMs=expiryDelta(req.headers['x-jh-expires'],receivedAt);
      let done=false;
      function complete(finished) {
        try {
          if(done)return; done=true;
          const at=now(), status=finished ? Number(res.statusCode) : 0;
          if(at-bucketAt >= intervalMs)flush();
          observed++; if(!finished || status>=400)errors++;
          const statusGroup=!finished?'transport_closed':`${Math.floor(status/100)}xx`;
          const key=`${route}:${statusGroup}`; counts.set(key,(counts.get(key)||0)+1);
          const firstSuccessfulPoll=route==='poll' && (status===200 || status===204) && lastPollAt===null;
          const pollGapBeforeMs=lastPollAt===null?null:Math.max(0,at-lastPollAt);
          if(route==='poll' && (status===200 || status===204))lastPollAt=at;
          if(route==='activate' && status>=200 && status<300)lastActivationAt=at;
          if(route==='register'||route==='activate'||status>=400||!finished||firstSuccessfulPoll){
            emitLimited({schema:1,event:'response',atUtc:new Date(at).toISOString(),route,status,
              sessionHeaderPresent,expiryMinusServerNowMs,
              durationMs:Math.round(Math.max(0,monotonic()-start)),pollGapBeforeMs});
          }
        } catch { /* No effect on response or server error semantics. */ }
      }
      res.once('finish',()=>complete(true));
      res.once('close',()=>complete(false));
    } catch { /* No effect on handler execution. */ }
  }
  const timer=setInterval(()=>{try{flush();}catch{}},intervalMs); timer.unref();
  return {observe,flush,close(){clearInterval(timer);flush();}};
}

/** Preserve createServer overloads and the original request listener. */
export function installDiagnostics(options={}) {
  const original=http.createServer;
  const observer=makeObserver(options);
  const servers=new Set();
  function createServer(...args){
    const server=Reflect.apply(original,this,args);
    server.prependListener('request',observer.observe);
    servers.add(server); server.once('close',()=>servers.delete(server));
    return server;
  }
  http.createServer=createServer; syncBuiltinESMExports();
  return {close(){
    if(http.createServer===createServer){http.createServer=original;syncBuiltinESMExports();}
    for(const server of servers)server.removeListener('request',observer.observe);
    servers.clear(); observer.close();
  }};
}
