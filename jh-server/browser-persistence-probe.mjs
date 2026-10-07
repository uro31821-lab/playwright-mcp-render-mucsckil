// CI only: real pinned Chromium, synthetic page and token, no operating services.
import assert from 'node:assert/strict';
import http from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createBrowserTransport} from './browser-transport.mjs';
import {createBrowserSession} from './browser-session.mjs';
const endpoint = 'http://127.0.0.1:18931/mcp';
const page = http.createServer((req,res) => {
  res.writeHead(200, {'content-type':'text/html'});
  res.end('<html><head><title>JH Retained Page</title></head><body><h1>JH Retained Page</h1><button onclick="this.textContent=\'ONE CLICK\'">Probe button</button></body></html>');
});
await new Promise(r=>page.listen(18932,'127.0.0.1',r));
const results = {};
const text = r => (r.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');
try {
  let initCount=0;
  const current = createBrowserSession({transport:createBrowserTransport({
    endpoint:'https://playwright-mcp-yzcy.onrender.com/mcp', token:'synthetic-test-token-not-a-production-key', timeoutMs:30000,
    fetchImpl:async (_url,options)=> { if(JSON.parse(options.body).method==='initialize') initCount++; return fetch(endpoint,options); }
  })});
  const nav = text(await current.tool('browser_navigate',{url:'http://127.0.0.1:18932/'}));
  assert(nav.includes('JH Retained Page'));
  await delay(12000);
  let after;
  try { after=text(await current.tool('browser_snapshot',{})); }
  catch(e) {after=e.message;}
  results.current={retained:after.includes('JH Retained Page'),blank:after.includes('about:blank'),initializations:initCount,error:after.startsWith('browser_')?after:null};
  const client=new Client({name:'jh-persistence-control',version:'1.0'},{capabilities:{}});
  const t=new StreamableHTTPClientTransport(new URL(endpoint));
  try {
    await client.connect(t);
    assert(text(await client.callTool({name:'browser_navigate',arguments:{url:'http://127.0.0.1:18932/'}})).includes('JH Retained Page'));
    await delay(12000);
    const one=text(await client.callTool({name:'browser_snapshot',arguments:{}}));
    await delay(6000);
    const two=text(await client.callTool({name:'browser_snapshot',arguments:{}}));
    results.sdk={retained:one.includes('JH Retained Page')&&two.includes('JH Retained Page')};
    assert(results.sdk.retained,'SDK control must retain actual page');
  } finally {await client.close();}
  console.log('PERSISTENCE_DIAGNOSIS',JSON.stringify(results));
} finally {page.closeAllConnections();await new Promise(r=>page.close(r));}
