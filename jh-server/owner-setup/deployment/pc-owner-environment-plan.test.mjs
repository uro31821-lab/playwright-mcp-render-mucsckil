import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {persistPcOwnerPlan,preparePcOwnerPlanFromEnvironment,restrictOwnedDirectoryWrite} from './pc-owner-environment-plan.mjs';
function fixture(){const mount=fs.mkdtempSync(path.join(os.tmpdir(),'jh-plan-'));fs.chmodSync(mount,0o700);return {p:{version:1,serverOrigin:'https://jh-secure-bridge-fix4.onrender.com',googleWebClientId:'test-web.apps.googleusercontent.com',androidClientId:'test-android.apps.googleusercontent.com',expectedGmail:'synthetic@gmail.com',ownerLabel:'Synthetic',storageMount:mount,storageEpoch:'synthetic-epoch-001'},cleanup:()=>fs.rmSync(mount,{recursive:true,force:true})};}
test('explicit plan is private, read back, and repeated publication does not rewrite',()=>{const f=fixture();try{const r=persistPcOwnerPlan(f.p);assert.equal(r.created,true);assert.equal(r.authorityGranted,false);const file=path.join(f.p.storageMount,'jh-pc-bootstrap/plan.json'),first=fs.readFileSync(file),before=fs.statSync(file);assert.equal(before.mode&0o777,0o600);assert.equal(fs.statSync(path.dirname(file)).mode&0o777,0o700);assert.equal(persistPcOwnerPlan(f.p).created,false);assert.deepEqual(fs.readFileSync(file),first);assert.equal(fs.statSync(file).mtimeMs,before.mtimeMs);}finally{f.cleanup();}});
test('different operator plan cannot replace existing settings',()=>{const f=fixture();try{persistPcOwnerPlan(f.p);assert.throws(()=>persistPcOwnerPlan({...f.p,expectedGmail:'other@gmail.com'}),/PC_PLAN_EXISTING_CONFIG_CONFLICT/);}finally{f.cleanup();}});
for(const item of ['.plan-writing','.plan-stage'])test('interrupted '+item+' is preserved for review',()=>{const f=fixture();try{const d=path.join(f.p.storageMount,'jh-pc-bootstrap');fs.mkdirSync(d,{mode:0o700});fs.writeFileSync(path.join(d,item),'interrupted',{mode:0o600});assert.throws(()=>persistPcOwnerPlan(f.p),/PC_PLAN_INTERRUPTED_REVIEW_REQUIRED/);assert.equal(fs.readFileSync(path.join(d,item),'utf8'),'interrupted');}finally{f.cleanup();}});
test('linked private directory is rejected',()=>{const f=fixture();try{fs.mkdirSync(path.join(f.p.storageMount,'other'),{mode:0o700});fs.symlinkSync('other',path.join(f.p.storageMount,'jh-pc-bootstrap'));assert.throws(()=>persistPcOwnerPlan(f.p),/PC_PLAN_PRIVATE_DIRECTORY_REQUIRED/);}finally{f.cleanup();}});
test('linked plan file is rejected',()=>{const f=fixture();try{persistPcOwnerPlan(f.p);const d=path.join(f.p.storageMount,'jh-pc-bootstrap');fs.renameSync(path.join(d,'plan.json'),path.join(d,'other'));fs.symlinkSync('other',path.join(d,'plan.json'));assert.throws(()=>persistPcOwnerPlan(f.p));}finally{f.cleanup();}});
test('nonprivate plan file is rejected',()=>{const f=fixture();try{persistPcOwnerPlan(f.p);fs.chmodSync(path.join(f.p.storageMount,'jh-pc-bootstrap/plan.json'),0o644);assert.throws(()=>persistPcOwnerPlan(f.p));}finally{f.cleanup();}});
test('no environmental plan has no write effect',()=>assert.deepEqual(preparePcOwnerPlanFromEnvironment({}),{materialized:false}));
test('environment provision is explicit and never accepts a temporary production mount',()=>{const f=fixture();try{const json=JSON.stringify(f.p);assert.throws(()=>preparePcOwnerPlanFromEnvironment({JH_PC_OWNER_SETUP_PLAN_JSON:json}),/PC_SETUP_EXPLICIT_ENABLE_REQUIRED/);assert.throws(()=>preparePcOwnerPlanFromEnvironment({JH_PC_OWNER_SETUP_ENABLED:'1',JH_PC_OWNER_SETUP_PLAN_FILE:'/var/data/jh-pc-bootstrap/plan.json',JH_PC_OWNER_SETUP_PLAN_JSON:json}),/PC_SETUP_PRODUCTION_MOUNT_REQUIRED/);assert.equal(fs.readdirSync(f.p.storageMount).length,0);}finally{f.cleanup();}});
test('malformed, duplicate and extra fields cannot become a private plan',()=>{const env={JH_PC_OWNER_SETUP_ENABLED:'1',JH_PC_OWNER_SETUP_PLAN_FILE:'/var/data/jh-pc-bootstrap/plan.json'};for(const value of ['{}','{"version":1,"version":1}','x'.repeat(8193)])assert.throws(()=>preparePcOwnerPlanFromEnvironment({...env,JH_PC_OWNER_SETUP_PLAN_JSON:value}),/PC_PLAN_ENVIRONMENT_INVALID/);});

test('owned directory permission preparation only removes other-user write bits',()=>{const f=fixture();try{const child=path.join(f.p.storageMount,'existing-user-data');fs.writeFileSync(child,'unchanged');fs.chmodSync(child,0o644);const before=fs.statSync(child);fs.chmodSync(f.p.storageMount,0o777);const r=restrictOwnedDirectoryWrite(f.p.storageMount);assert.deepEqual(r,{permissionsTightened:true,beforeMode:'777',afterMode:'755',childrenChanged:false});assert.equal(fs.readFileSync(child,'utf8'),'unchanged');assert.equal(fs.statSync(child).mode,before.mode);assert.equal(fs.statSync(child).mtimeMs,before.mtimeMs);assert.equal(restrictOwnedDirectoryWrite(f.p.storageMount).permissionsTightened,false);}finally{f.cleanup();}});
test('mount preparation rejects symlinks and leaves target untouched',()=>{const f=fixture();try{const dir=path.join(f.p.storageMount,'dir');fs.mkdirSync(dir,{mode:0o777});fs.chmodSync(dir,0o777);fs.symlinkSync('dir',path.join(f.p.storageMount,'link'));assert.throws(()=>restrictOwnedDirectoryWrite(path.join(f.p.storageMount,'link')),/PC_MOUNT_OWNER_REVIEW_REQUIRED/);assert.equal(fs.statSync(dir).mode&0o777,0o777);}finally{f.cleanup();}});
test('already private directory remains private',()=>{const f=fixture();try{assert.deepEqual(restrictOwnedDirectoryWrite(f.p.storageMount),{permissionsTightened:false,beforeMode:'700',afterMode:'700',childrenChanged:false});}finally{f.cleanup();}});

// Mount-root metadata and private application state are different boundaries.
import {isRenderManagedRoot,assertStorageRootAccess,inspectOwnerMount} from './owner-storage.mjs';
import {validateOwnerConfiguration,EXPECTED_CATALOG} from './owner-config.mjs';
import {validatePcOwnerSetupPlan,inspectPcOwnerSetupTarget} from './pc-owner-handoff.mjs';
const renderContext={serviceId:'srv-db0fjl2d0e5s73be114g',uid:1000,gid:1000};
const renderStat={uid:0,gid:1000,mode:0o42775,isDirectory:()=>true,isSymbolicLink:()=>false};
test('observed service-owned group mount is distinct from a private directory',()=>{
 assert.equal(isRenderManagedRoot('/var/data',renderStat,renderContext),true);
 for(const mode of [0o777,0o2777,0o1775,0o775,0o2707,0o6775])assert.equal(isRenderManagedRoot('/var/data',{...renderStat,mode},renderContext),false);
 for(const mount of ['/tmp/data','/var/data/child','/var/data/','/var/data/../data'])assert.equal(isRenderManagedRoot(mount,renderStat,renderContext),false);
 for(const context of [{...renderContext,serviceId:'another-service'},{...renderContext,serviceId:undefined},{...renderContext,uid:0},{...renderContext,gid:0}])assert.equal(isRenderManagedRoot('/var/data',renderStat,context),false);
 for(const st of [{...renderStat,uid:1000},{...renderStat,gid:1001},{...renderStat,isSymbolicLink:()=>true},{...renderStat,isDirectory:()=>false}])assert.equal(isRenderManagedRoot('/var/data',st,renderContext),false);
});
test('read-only mount policy leaves the directory and unrelated file unchanged',()=>{
 const f=fixture();try{
  const child=path.join(f.p.storageMount,'untouched');fs.writeFileSync(child,'original',{mode:0o600});
  const before=fs.statSync(f.p.storageMount),file=fs.statSync(child);
  assertStorageRootAccess(f.p.storageMount);
  assert.equal(fs.statSync(f.p.storageMount).mode,before.mode);assert.equal(fs.statSync(f.p.storageMount).uid,before.uid);
  assert.equal(fs.statSync(child).mtimeMs,file.mtimeMs);assert.equal(fs.readFileSync(child,'utf8'),'original');
 }finally{f.cleanup();}
});
test('group-writable temporary roots are NOT mistaken for Render mounts',()=>{
 const f=fixture();try{
  fs.chmodSync(f.p.storageMount,0o2775);
  assert.throws(()=>assertStorageRootAccess(f.p.storageMount),/MOUNT_WRITABLE_BY_OTHER_USERS/);
  assert.throws(()=>persistPcOwnerPlan(f.p),/PC_PLAN_MOUNT_PATH_INVALID/);
  assert.throws(()=>inspectPcOwnerSetupTarget(validatePcOwnerSetupPlan(f.p)),/PC_SETUP_MOUNT_INVALID/);
  assert.equal(fs.statSync(f.p.storageMount).mode&0o7777,0o2775);assert.equal(fs.readdirSync(f.p.storageMount).length,0);
 }finally{f.cleanup();}
});
test('a link to a restricted root is still rejected',()=>{
 const f=fixture();try{
  const real=path.join(f.p.storageMount,'real'),link=path.join(f.p.storageMount,'link');fs.mkdirSync(real,{mode:0o700});fs.symlinkSync(real,link);
  assert.throws(()=>assertStorageRootAccess(link),/MOUNT_WRITABLE_BY_OTHER_USERS/);
 }finally{f.cleanup();}
});
test('permission approval alone cannot turn an ephemeral directory into a persistent mount',()=>{
 const f=fixture();try{
  assertStorageRootAccess(f.p.storageMount);
  const p=validatePcOwnerSetupPlan(f.p);
  assert.throws(()=>inspectPcOwnerSetupTarget(p),/PC_SETUP_PERSISTENT_MOUNT_REQUIRED/);
  const c=validateOwnerConfiguration({version:1,serverOrigin:p.serverOrigin,catalogDigest:EXPECTED_CATALOG,googleWebClientId:p.googleWebClientId,allowedPresenterClientIds:[p.googleWebClientId,p.androidClientId],ownerSubject:'synthetic-subject',ownerLabel:p.ownerLabel,storageMount:p.storageMount,storageEpoch:p.storageEpoch});
  assert.throws(()=>inspectOwnerMount(c),/DISTINCT_PERSISTENT_MOUNT_REQUIRED/);
  assert.equal(fs.readdirSync(f.p.storageMount).length,0);
 }finally{f.cleanup();}
});
test('platform root policy never authorizes a group-readable private bootstrap directory',()=>{
 const f=fixture();try{
  const dir=path.join(f.p.storageMount,'jh-pc-bootstrap');fs.mkdirSync(dir,{mode:0o750});
  assert.throws(()=>persistPcOwnerPlan(f.p),/PC_PLAN_PRIVATE_DIRECTORY_REQUIRED/);
  assert.equal(fs.statSync(dir).mode&0o777,0o750);assert.equal(fs.readdirSync(dir).length,0);
 }finally{f.cleanup();}
});
test('strict filesystem and nested mount checks remain active after root approval',()=>{
 const f=fixture();try{
  const p=validatePcOwnerSetupPlan(f.p);
  const row=`41 20 8:1 / ${p.storageMount} rw,relatime - ext4 fixture rw\n`;
  assert.throws(()=>inspectPcOwnerSetupTarget(p,{mountInfo:row,filesystemType:0x794c7630}),/PC_SETUP_FILESYSTEM_MISMATCH/);
  assert.throws(()=>inspectPcOwnerSetupTarget(p,{mountInfo:row.replace('rw,relatime','ro,relatime'),filesystemType:0xef53}),/PC_SETUP_PERSISTENT_MOUNT_REQUIRED/);
  assert.throws(()=>inspectPcOwnerSetupTarget(p,{mountInfo:row+`42 41 8:2 / ${p.storageMount}/jh-owner-setup rw - ext4 fixture rw\n`,filesystemType:0xef53}),/PC_SETUP_NESTED_MOUNT_FORBIDDEN/);
 }finally{f.cleanup();}
});
