import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildDurableRoutedRuntime} from '../owner-setup/deployment/durable-live-release.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../owner-setup');

test('explicit website opens target the existing Android RIGHT Chrome pane, not cloud Playwright',()=>{
  const result=buildDurableRoutedRuntime(root);
  const generated=fs.readFileSync(result.file,'utf8');
  const start=generated.indexOf('  registerOAuthTool("life_open_service",{');
  const end=generated.indexOf('  registerOAuthTool("life_naver_mail",{',start);
  assert.ok(start>=0&&end>start,'service registration not present');
  const open=generated.slice(start,end);
  assert.ok(open.includes('mk("open_url",{target:"chrome",url})'));
  assert.ok(open.includes('mk("open_url",{target:"chrome",url:raw})'));
  assert.ok(open.includes('["인스타그램","인스타","instagram"]'));
  assert.ok(open.includes('rightAddressConfirmed:finished?.status==="complete"'));
  assert.ok(!open.includes('route:"playwright"'));
  assert.ok(!open.includes('browserTool("browser_navigate",{url})'));
  assert.ok(open.includes('const returnTarget=jhNativeReturnTarget56(s)'));
  assert.ok(open.includes('target:"카카오T"'));
  const cloud=generated.slice(generated.indexOf('  registerOAuthTool("life_web_navigate",{'));
  assert.ok(cloud.includes('browserTool("browser_navigate"'),'server-side Playwright research must remain available');
});

test('production release file continues to preserve Secure56 identity and single-command fences',()=>{
  const release=fs.readFileSync(path.join(root,'deployment/durable-live-release.mjs'),'utf8');
  assert.ok(release.includes('patchDurableMcpWorkflow56(patchExistingDurableReturnRoute56(input))'));
  assert.ok(release.includes('JH_ROUTE_PATCH_SCOPE_CHANGED'));
  assert.ok(release.includes('JH_RIGHT_OPEN_ROUTE_ANCHOR'));
});
