import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalog, planRoute } from './router.mjs';
import { createTaskStore, validateTaskStore, applyTaskEvent, listTasks, getTask, resolveMenuSelection } from './tasks.mjs';
import { createRoutineStore, validateRoutineStore, applyRoutineEvent, listRoutines, getRoutine, instantiateRoutine } from './routines.mjs';

const catalogIds = catalog.entries.map(entry => entry.id);
const fail = code => { const error = new Error(code); error.code = code; throw error; };
const operations = {
  'route': ['input'],
  'tasks.init': ['ownerScope', 'at'],
  'tasks.validate': ['state', 'ownerScope'],
  'tasks.apply': ['state', 'event'],
  'tasks.list': ['state', 'query'],
  'tasks.get': ['state', 'taskId'],
  'tasks.select': ['state', 'input'],
  'routines.init': ['ownerScope', 'at'],
  'routines.validate': ['state', 'ownerScope'],
  'routines.apply': ['state', 'event', 'sourceTask'],
  'routines.list': ['state', 'query'],
  'routines.get': ['state', 'routineId'],
  'routines.plan': ['state', 'input']
};

/** Pure dispatcher: neither saves the returned state nor runs a planned operation. */
export function dispatch(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) fail('INVALID_REQUEST');
  if (!Object.hasOwn(operations, request.op)) fail('UNKNOWN_OPERATION');
  if (Object.keys(request).some(key => key !== 'op' && !operations[request.op].includes(key))) fail('UNKNOWN_REQUEST_FIELD');
  switch (request.op) {
    case 'route': return planRoute(request.input);
    case 'tasks.init': return createTaskStore(request);
    case 'tasks.validate': return validateTaskStore(request.state, { ownerScope: request.ownerScope });
    case 'tasks.apply': {
      if (request.event?.type === 'START') {
        const ids = [request.event.payload?.lead, ...(request.event.payload?.helpers ?? [])];
        if (ids.some(id => !catalogIds.includes(id))) fail('UNKNOWN_CAPABILITY');
      }
      return applyTaskEvent(request.state, request.event);
    }
    case 'tasks.list': return listTasks(request.state, request.query);
    case 'tasks.get': return getTask(request.state, request.taskId);
    case 'tasks.select': return resolveMenuSelection(request.state, request.input);
    case 'routines.init': return createRoutineStore(request);
    case 'routines.validate': return validateRoutineStore(request.state, { ownerScope: request.ownerScope });
    case 'routines.apply': return applyRoutineEvent(request.state, request.event, { catalogIds, sourceTask: request.sourceTask });
    case 'routines.list': return listRoutines(request.state, request.query);
    case 'routines.get': return getRoutine(request.state, request.routineId);
    case 'routines.plan': return instantiateRoutine(request.state, { ...request.input, catalogIds });
  }
}

async function main() {
  const chunks = []; let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 16 * 1024 * 1024) fail('INPUT_TOO_LARGE');
    chunks.push(chunk);
  }
  let request;
  try { request = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { fail('INVALID_JSON'); }
  process.stdout.write(`${JSON.stringify({ ok:true, result:dispatch(request) })}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(`${JSON.stringify({ok:false,error:{code:error.code ?? error.message ?? 'INVALID_INPUT'}})}\n`);
    process.exitCode = 1;
  });
}
