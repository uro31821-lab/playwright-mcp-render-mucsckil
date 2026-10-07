import test from 'node:test';
import assert from 'node:assert/strict';
import {installCatalogFraming} from './browser-transport.mjs';
function target(){const events=[];return {events,removeHeader(n){events.push(['remove',n]);},writeHead(...args){events.push(['write',...args]);return this;}};}
test('object headers preserve auth metadata headers but remove obsolete length first',()=>{
 const r=target(); installCatalogFraming(r);const original={'Content-Length':4,'Content-Type':'application/json','WWW-Authenticate':'synthetic-challenge'};assert.equal(r.writeHead(200,original),r);assert.deepEqual(r.events,[['remove','content-length'],['write',200,{'Content-Type':'application/json','WWW-Authenticate':'synthetic-challenge'}]]);assert.equal(original['Content-Length'],4);
});
test('status message and raw header pairs remain supported',()=>{
 const r=target();installCatalogFraming(r);r.writeHead(200,'OK',['Content-Length','2','content-length','3','Content-Type','application/json']);assert.deepEqual(r.events[1],['write',200,'OK',['Content-Type','application/json']]);
});
test('implicit headers retain status and return identity',()=>{
 const r=target();installCatalogFraming(r);assert.equal(r.writeHead(200),r);assert.deepEqual(r.events,[['remove','content-length'],['write',200]]);
});
test('header state errors are not swallowed',()=>{
 const r=target();r.removeHeader=()=>{throw Error('headers already sent');};installCatalogFraming(r);assert.throws(()=>r.writeHead(200),/headers already sent/);assert.deepEqual(r.events,[]);
});
