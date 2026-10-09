/** Repository-layout entry: installed as jh-server/owner-setup/deployment/...
 * In normal mode load the ORIGINAL host entry from jh-server, preserving its
 * original module resolution. Never replace it with the inner reference copy.
 */
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {PUBLISHED_FILES} from './published-lineage.mjs';
import {selectPublishedStartup} from './published-service-entry.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
function fail(code){throw Object.assign(Error(code),{code});}
export function composePublishedHostPackage(original){
 if(!Buffer.isBuffer(original)||sha(original)!==PUBLISHED_FILES['package.json'])fail('PUBLISHED_HOST_PACKAGE_MISMATCH');
 const p=JSON.parse(original.toString('utf8'));
 p.scripts.start='node owner-setup/deployment/published-host-router.mjs';
 p.scripts.postinstall+=' && npm ci --prefix owner-setup --ignore-scripts --no-audit --no-fund && npm ci --prefix owner-setup/owner-enrollment --ignore-scripts --no-audit --no-fund';
 // Existing dependencies, engines, prestart, and old postinstall prefix unchanged.
 return Buffer.from(JSON.stringify(p,null,2)+'\n');
}
export function assertPublishedHost(hostRoot,sourceRoot){
 for(const [file,hash] of Object.entries(PUBLISHED_FILES)){
  const p=path.join(hostRoot,file),s=lstatSync(p);
  if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||realpathSync(p)!==p)fail('PUBLISHED_HOST_SOURCE_MISMATCH');
  const b=readFileSync(p);
  if(file==='package.json'){
   const expected=composePublishedHostPackage(readFileSync(path.join(sourceRoot,'published-baseline/package.json')));
   if(!b.equals(expected))fail('PUBLISHED_HOST_PACKAGE_MISMATCH');
  }else if(sha(b)!==hash)fail('PUBLISHED_HOST_SOURCE_MISMATCH');
 }
 return true;
}
export function requirePcNodeVersion(version){
 if(typeof version!=='string'||!/^\d+\.\d+\.\d+$/.test(version))fail('PC_SETUP_NODE_RUNTIME_REQUIRED');
 const [major,minor]=version.split('.').map(Number);
 if(major<22||(major===22&&minor<16))fail('PC_SETUP_NODE_RUNTIME_REQUIRED');
}
export async function main(){
 const sourceRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),hostRoot=path.dirname(sourceRoot);
 if(path.basename(sourceRoot)!=='owner-setup')fail('PUBLISHED_HOST_LAYOUT_REQUIRED');
 if(process.env.JH_OPERATIONAL_START!==undefined||process.env.JH_OPERATIONAL_ACCOUNT_DIGEST!==undefined){
  assertPublishedHost(hostRoot,sourceRoot);requirePcNodeVersion(process.versions.node);
  const {main:operationalMain}=await import('./operational-service-entry.mjs');
  return operationalMain();
 }
 if(process.env.JH_PC_OWNER_SETUP_PLAN_JSON!==undefined&&process.env.JH_PC_OWNER_SETUP_ENABLED!=='1')fail('PC_SETUP_EXPLICIT_CONFIGURATION_REQUIRED');
 const mode=selectPublishedStartup(process.env);
 assertPublishedHost(hostRoot,sourceRoot);
 if(mode==='published')return import(pathToFileURL(path.join(hostRoot,'auth-diagnostics-entry.mjs')).href);
 requirePcNodeVersion(process.versions.node);
 const {preparePcOwnerPlanFromEnvironment}=await import('./pc-owner-environment-plan.mjs');
 preparePcOwnerPlanFromEnvironment();
 const {main:start}=await import('./published-service-entry.mjs');return start();
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 main().catch(e=>{console.error(typeof e?.code==='string'&&/^[A-Z_]{3,80}$/.test(e.code)?e.code:'PUBLISHED_HOST_START_FAILED');process.exitCode=1;});
}
