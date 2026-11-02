#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execute} from './store.mjs';
import {MAX_BYTES,check} from './engine.mjs';
export async function main(args){
 if(args.includes('--help')||args.length===0){console.log('JH Pattern Guidance: init|validate|mutate|patterns|evaluate|challenge|context --store ABSOLUTE_PRIVATE_FILE --owner OWNER [--input JSON_FILE]');return;}
 const [command,...rest]=args,opts={};for(let i=0;i<rest.length;i+=2){const flag=rest[i];check(['--store','--owner','--input'].includes(flag)&&rest[i+1]&&!Object.hasOwn(opts,flag),'PATTERN_CLI_ARGUMENT');opts[flag]=rest[i+1];}
 let raw='';if(opts['--input'])raw=await readFile(opts['--input'],'utf8');else if(!process.stdin.isTTY){for await(const b of process.stdin){raw+=b;check(Buffer.byteLength(raw)<=MAX_BYTES,'PATTERN_CAPACITY');}}
 check(Buffer.byteLength(raw)<=MAX_BYTES,'PATTERN_CAPACITY');const input=raw.trim()?JSON.parse(raw):{};
 console.log(JSON.stringify(await execute(command,{store:opts['--store'],owner:opts['--owner'],input}),null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main(process.argv.slice(2)).catch(e=>{console.error(JSON.stringify({ok:false,code:/^PATTERN_[A-Z_]+$/.test(e.code)?e.code:'PATTERN_IO_OR_INPUT_REJECTED'}));process.exitCode=1;});
