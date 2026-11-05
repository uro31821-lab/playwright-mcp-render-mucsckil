import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'../..');
const executableExt=new Set(['.mjs','.js','.cjs','.ts','.yml','.yaml']);
const retiredDir=['playwright','mobile'].join('-');
const banned=[
  ['PLAYWRIGHT','MOBILE'].join('_'),
  ['Playwright','Mobile','Provider'].join(''),
  ['JH','PLAYWRIGHT','ADB'].join('_'),
  retiredDir+'/',
  'stage67/'+retiredDir
];

function walk(dir,out=[]){
  for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
    if(ent.name==='.git'||ent.name==='node_modules')continue;
    const full=path.join(dir,ent.name);
    if(ent.isDirectory())walk(full,out);
    else out.push(full);
  }
  return out;
}

test('retired mobile engine directory and provider runtime are absent',()=>{
  assert.equal(fs.existsSync(path.join(root,'jh-mobile-dual-engine/stage67',retiredDir)),false);
  assert.equal(fs.existsSync(path.join(root,'jh-mobile-dual-engine/stage67/router.mjs')),false);
  assert.equal(fs.existsSync(path.join(root,'.github/workflows/jh-stage67-dual-engine.yml')),false);
  assert.equal(fs.existsSync(path.join(root,'.github/workflows/jh-stage68-three-round.yml')),false);
});

test('no executable source or workflow contains retired mobile-engine identifiers',()=>{
  const violations=[];
  for(const file of walk(root)){
    if(!executableExt.has(path.extname(file)))continue;
    const rel=path.relative(root,file).replaceAll('\\','/');
    const text=fs.readFileSync(file,'utf8');
    for(const token of banned){
      if(rel.includes(token)||text.includes(token))violations.push({rel,token});
    }
  }
  assert.deepEqual(violations,[]);
});

test('general web Playwright dependencies remain intact',()=>{
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  assert.ok(pkg.dependencies?.playwright);
  assert.ok(pkg.dependencies?.['playwright-core']);
  assert.ok(pkg.devDependencies?.['@playwright/test']);
});

test('final mobile routing is Android then manual only',()=>{
  const matrix=JSON.parse(fs.readFileSync(path.join(root,'jh-mobile-dual-engine/stage67/matrix.json'),'utf8'));
  const s69=JSON.parse(fs.readFileSync(path.join(root,'jh-mobile-dual-engine/stage69/current.json'),'utf8'));
  const s70=JSON.parse(fs.readFileSync(path.join(root,'jh-mobile-dual-engine/stage70/current.json'),'utf8'));
  assert.deepEqual(matrix.order,['ANDROID','MANUAL']);
  assert.equal(s69.routingModel,'ANDROID_THEN_MANUAL');
  assert.equal(s70.routingModel,'ANDROID_THEN_MANUAL');
  assert.deepEqual(matrix.activeAutomaticRoutes.slice().sort(),['BACK','SCREENSHOT','WAIT_CONDITION'].sort());
});
