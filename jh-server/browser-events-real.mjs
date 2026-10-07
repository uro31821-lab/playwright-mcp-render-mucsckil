// Real Chromium regression. Only loopback fixture data; no production credentials.
import assert from 'node:assert/strict';
import http from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createBrowserTransport} from './browser-transport.mjs';
import {createBrowserSession} from './browser-session.mjs';
import {withBrowserEvents} from './browser-events.mjs';
const endpoint='https://playwright-mcp-yzcy.onrender.com/mcp',token='synthetic-test-browser-events-token';
let requests=0,inits=0,gets=0,pings=0,navigations=0;
const wire=async(_u,o)=>{
 if(o.method==='GET')gets++;else{const m=JSON.parse(o.body);if(m.method==='initialize')inits++;if(Object.hasOwn(m,'result'))pings++;if(m.params?.name==='browser_navigate')navigations++;}
 return fetch('http://127.0.0.1:18935/mcp',o);
};
const transport=withBrowserEvents(createBrowserTransport({endpoint,token,fetchImpl:wire,timeoutMs:30000}),{endpoint,token,fetchImpl:wire});
const session=createBrowserSession({transport});
const text=r=>(r.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');
const page=http.createServer((q,r)=>{requests++;r.writeHead(200,{'content-type':'text/html'});r.end('<title>JH Event Persistence</title><h1>JH Event Persistence</h1><button onclick="this.textContent=\'clicked once\'">Click probe</button>');});
await new Promise(r=>page.listen(18934,'127.0.0.1',r));
try{
 assert(text(await session.tool('browser_navigate',{url:'http://127.0.0.1:18934/'})).includes('JH Event Persistence'));
 for(const wait of[6000,6000,6000]){await delay(wait);assert(text(await session.tool('browser_snapshot',{})).includes('JH Event Persistence'));}
 assert.equal(inits,1);assert.equal(gets,1);assert.equal(navigations,1);assert(pings>=3);
 console.log('REAL_BROWSER_FIXED',JSON.stringify({retained:true,initializations:inits,eventStreams:gets,heartbeatReplies:pings,navigationCalls:navigations,delayedSnapshots:3}));
 const sha=s=>createHash('sha256').update(s).digest('hex');
 console.log('EVENT_MODULE_SHA',sha(readFileSync(new URL('./browser-events.mjs',import.meta.url))));
}finally{transport.close();page.closeAllConnections();await new Promise(r=>page.close(r));}
