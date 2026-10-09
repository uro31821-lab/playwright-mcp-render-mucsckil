import {EventEmitter} from 'node:events';
import test from 'node:test';import assert from 'node:assert/strict';
import {context,origin,catalog,clientId,subject,hash} from './integration-fixture.mjs';
import {installConfiguredOwnerHost} from './owner-host-bootstrap.mjs';
import {TrustedBridgeSessionAuthority} from '../trusted-server/trusted-bridge-session-authority.mjs';
test('startup composition uses configured owner and the existing registry without enrolling a caller',t=>{
 const c=context(t);c.close();let handler,authority;
 const runtime={httpServer:new EventEmitter(),installTrustedSessionRegistry56(registry){authority=new TrustedBridgeSessionAuthority({registry,bridge:{devices:new Map(),states:new Map(),queues:new Map(),jobs:new Map(),recentJobs:new Map(),frameWaiters:new Map(),serverDigest:hash(origin+'/mcp|jh-secure-bridge56'),catalogDigest:catalog,sessionDigest:()=>hash('fixture-only')}});return authority;},installOwnerEnrollmentHandler56(fn){handler=fn;}};
 const host=installConfiguredOwnerHost(runtime,{googleClientId:clientId,allowedOwnerSubjects:[subject],ownerJournalPath:c.config.filename,registryPath:c.serviceConfig.registryPath,encryptionKey:c.config.key,storageEpoch:c.config.epoch,serverOrigin:origin,catalogDigest:catalog});
 try{assert.equal(host.enrollmentHostInstalled,true);assert.equal(host.trustCreated,false);assert.equal(host.sessionCreated,false);assert.equal(typeof handler,'function');assert.ok(authority);assert.equal(runtime.httpServer.listenerCount('request'),1);}finally{host.close();}
});
test('startup rejects missing owner settings before installing any host',t=>{const c=context(t);let installed=0;const runtime={installTrustedSessionRegistry56(){installed++},installOwnerEnrollmentHandler56(){installed++}};assert.throws(()=>installConfiguredOwnerHost(runtime,{ownerJournalPath:c.config.filename,registryPath:c.serviceConfig.registryPath}),/owner_configuration_required/);assert.equal(installed,0);});
