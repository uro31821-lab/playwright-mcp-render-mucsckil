import { pathToFileURL } from 'node:url';
import { access } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { types } from 'node:util';
import { FileLearningStore } from './store.mjs';
import { ingest, recall, recallContext, recallContexts, propose, addLesson, setProposalStatus } from './engine.mjs';
import { bindRegression, checkLesson } from './regression.mjs';
import { evaluateConstraints } from './constraints.mjs';
import { prepareReview, createReviewedCandidate } from './curation.mjs';
import { evaluateTrajectory } from './trajectory.mjs';
import { decideProposal, proposalDecisionView } from './decisions.mjs';
import { registerReviewedCandidate, proposalProgressView } from './progress.mjs';
import { taskView, observeTask } from './host-observations.mjs';
import { proposalContext } from './proposal-context.mjs';
import { createHostInstructionCandidate } from './instructions.mjs';
import { lessonView } from './lesson-view.mjs';
import { prepareRuleUse } from './rule-usage.mjs';
import { usageReview } from './rule-use-review.mjs';
import { prepareReviewContext } from './review-context.mjs';
import { prepareCandidateEvidence } from './candidate-evidence.mjs';

function evaluatorFor(suite) {
  if (suite?.evaluator === undefined || suite.evaluator === 'jh.constraints.v1') return evaluateConstraints;
  if (suite.evaluator === 'jh.trajectory.v1') return evaluateTrajectory;
  throw new TypeError('Unknown trusted evaluator');
}

function contextRequest(input) {
  const fail = () => { throw new TypeError('context requires exactly one of query or queries, and optional options, proposals and usageReview'); };
  if (!input || typeof input !== 'object' || types.isProxy(input) || Array.isArray(input) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(input))) fail();
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(input).some(key => typeof key !== 'string' || !['query', 'queries', 'options', 'proposals', 'usageReview'].includes(key)) ||
      Object.values(descriptors).some(item => !Object.hasOwn(item, 'value') || !item.enumerable) ||
      Object.hasOwn(input, 'query') === Object.hasOwn(input, 'queries')) fail();
  if (Object.hasOwn(input, 'proposals') && input.proposals === undefined) fail();
  if (Object.hasOwn(input, 'usageReview') && input.usageReview === undefined) fail();
}

function usageReviewRequest(input) {
  const fail = () => { throw new TypeError('usage-review requires exactly one of query or queries, and optional options'); };
  if (!input || typeof input !== 'object' || types.isProxy(input) || Array.isArray(input) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(input))) fail();
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(input).some(key => typeof key !== 'string' || !['query', 'queries', 'options'].includes(key)) ||
      Object.values(descriptors).some(item => !Object.hasOwn(item, 'value') || !item.enumerable) ||
      Object.hasOwn(input, 'query') === Object.hasOwn(input, 'queries')) fail();
  if (Object.hasOwn(input, 'options') && input.options === undefined) fail();
}

function instructionRequest(input) {
  const fail = () => { throw new TypeError('instruction requires instruction, suite, scope, and optional globalRecall'); };
  if (!input || typeof input !== 'object' || types.isProxy(input) || Array.isArray(input) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(input))) fail();
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(input).some(key => typeof key !== 'string' || !['instruction', 'suite', 'scope', 'globalRecall'].includes(key)) ||
      Object.values(descriptors).some(item => !Object.hasOwn(item, 'value') || !item.enumerable) ||
      ['instruction', 'suite', 'scope'].some(key => !Object.hasOwn(input, key))) fail();
}

function options(args) {
  const [command, ...rest] = args;
  const flags = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (!['--store', '--owner', '--revision'].includes(rest[i]) || rest[i + 1] === undefined || Object.hasOwn(flags, rest[i])) throw new TypeError('Invalid CLI arguments');
    flags[rest[i]] = rest[i + 1];
  }
  const expectedRevision = flags['--revision'] === undefined ? undefined : Number(flags['--revision']);
  if (expectedRevision !== undefined && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)) throw new TypeError('Invalid expected revision');
  return { command, store: new FileLearningStore({ file: flags['--store'], ownerScope: flags['--owner'] }), expectedRevision };
}

/** Input is parsed JSON data, never a shell command or dynamically loaded module. */
export async function execute(args, input) {
  const { command, store, expectedRevision } = options(args);
  const transactionOptions = { expectedRevision };
  switch (command) {
    case 'status': {
      const state = await store.read();
      let exists = true;
      try { await access(store.file); } catch { exists = false; }
      return { schema: state.schema, revision: state.revision, persisted: exists,
        counts: Object.fromEntries(['events', 'attempts', 'lessons', 'proposals'].map(key => [key, Object.keys(state[key]).length])),
        proposals: Object.values(state.proposals), lessons: Object.values(state.lessons).map(({ id, domain, operation, state }) => ({ id, domain, operation, state })) };
    }
    case 'recall': return { lessons: recall(await store.read(), input) };
    case 'context': {
      contextRequest(input);
      // All scopes share one snapshot and one authority/conflict/budget decision.
      const state = await store.read();
      const queries = Object.hasOwn(input, 'queries') ? input.queries : [input.query];
      // Validate opted-in usage scopes before invoking the older recall helpers.
      const usage = Object.hasOwn(input, 'usageReview') ? usageReview(state, queries, input.usageReview) : undefined;
      const advice = Object.hasOwn(input, 'queries')
        ? recallContexts(state, input.queries, input.options)
        : recallContext(state, input.query, input.options);
      // All opt-in views use the exact same owner snapshot and requested scopes.
      return { ...advice,
        ...(Object.hasOwn(input, 'proposals') ? { proposalContext: proposalContext(state, queries, input.proposals) } : {}),
        ...(Object.hasOwn(input, 'usageReview') ? { usageReview: usage } : {}) };
    }
    case 'review': return prepareReview(await store.read(), input);
    case 'review-context': {
      if (expectedRevision !== undefined) throw new TypeError('review-context is read-only and does not accept a revision selector');
      return prepareReviewContext(await store.read(), input);
    }
    case 'candidate-evidence': {
      if (expectedRevision !== undefined) throw new TypeError('candidate-evidence is read-only and does not accept a revision selector');
      return prepareCandidateEvidence(await store.read(), input);
    }
    case 'instruction': {
      if (expectedRevision !== undefined) throw new TypeError('instruction is read-only; use its baseRevision when registering the candidate');
      instructionRequest(input);
      const state = await store.read();
      const hostOptions = { scope: input.scope,
        ...(Object.hasOwn(input, 'globalRecall') ? { globalRecall: input.globalRecall } : {}) };
      const prepared = createHostInstructionCandidate(state, input.instruction, input.suite, hostOptions);
      evaluatorFor(prepared.suite);
      return { baseRevision: state.revision, ...prepared, readOnly: true,
        externalEffects: false, activatedByThisCall: false };
    }
    case 'decision-view': return proposalDecisionView(await store.read(), input);
    case 'lesson-view': {
      if (expectedRevision !== undefined) throw new TypeError('lesson-view is read-only and does not accept a revision selector');
      return lessonView(await store.read(), input);
    }
    case 'usage-prepare': {
      if (expectedRevision !== undefined) throw new TypeError('usage-prepare is read-only and does not accept a revision selector');
      return prepareRuleUse(await store.read(), input, { now: new Date().toISOString() });
    }
    case 'usage-review': {
      if (expectedRevision !== undefined) throw new TypeError('usage-review is read-only and does not accept a revision selector');
      usageReviewRequest(input);
      const state = await store.read();
      const queries = Object.hasOwn(input, 'queries') ? input.queries : [input.query];
      return usageReview(state, queries, input.options);
    }
    case 'progress': return proposalProgressView(await store.read(), input);
    case 'task-view': return taskView(await store.read(), input);
    case 'observe': {
      if (expectedRevision !== undefined) throw new TypeError('observe uses payload.expectedRevision inside its atomic transaction');
      const result = await store.transact(state => observeTask(state, input, { now: new Date().toISOString() }));
      const { state, ...receipt } = result;
      return { revision: state.revision, ...receipt };
    }
    case 'decide': {
      if (expectedRevision !== undefined) throw new TypeError('decide uses payload.expectedRevision inside its atomic transaction');
      const result = await store.transact(state => decideProposal(state, input, { now: new Date().toISOString() }));
      return { revision: result.state.revision, proposal: result.proposal,
        receipt: result.receipt, duplicate: result.duplicate, externalEffects: false,
        activatedByThisCall: false, liveExecutionVerified: false };
    }
    case 'curate': {
      if (!input || Object.keys(input).some(key => !['review', 'suite'].includes(key))) throw new TypeError('curate requires review and suite');
      evaluatorFor(input.suite);
      return createReviewedCandidate(await store.read(), input.review, input.suite);
    }
    case 'curate-register': {
      if (expectedRevision !== undefined) throw new TypeError('curate-register uses review.baseRevision inside its atomic transaction');
      if (!input || Object.keys(input).some(key => !['review', 'suite'].includes(key))) throw new TypeError('curate-register requires review and suite');
      evaluatorFor(input.suite);
      const saved = await store.transact(state => registerReviewedCandidate(state, input.review, input.suite),
        { expectedRevision: input.review?.baseRevision });
      return { revision: saved.state.revision, lesson: saved.state.lessons[saved.lesson.id],
        suite: saved.suite, reviewSummary: saved.reviewSummary, link: saved.link, duplicate: saved.duplicate,
        activatedByThisCall: false, externalEffects: false };
    }
    case 'ingest': {
      const events = Array.isArray(input) ? input : [input];
      if (!events.length || events.length > 100) throw new TypeError('Ingest 1–100 structured events');
      const result = await store.transact(state => {
        let recorded = 0; let duplicates = 0;
        for (const event of events) {
          const next = ingest(state, event);
          state = next.state;
          if (next.duplicate) duplicates++; else recorded++;
        }
        return { ...propose(state), recorded, duplicates };
      }, transactionOptions);
      return { revision: result.state.revision, recorded: result.recorded,
        duplicates: result.duplicates, newProposals: result.proposals };
    }
    case 'propose': {
      const result = await store.transact(state => propose(state, input ?? {}), transactionOptions);
      return { revision: result.state.revision, newProposals: result.proposals };
    }
    case 'candidate': {
      if (!input || Object.keys(input).some(key => !['lesson', 'suite'].includes(key))) throw new TypeError('candidate requires lesson and suite only');
      evaluatorFor(input.suite);
      const bound = bindRegression(input.lesson, input.suite);
      const result = await store.transact(state => addLesson(state, bound), transactionOptions);
      return { revision: result.revision, lesson: result.lessons[bound.id] };
    }
    case 'check': {
      if (expectedRevision !== undefined) throw new TypeError('check uses an atomic lesson transaction, not a caller-supplied state revision');
      if (!input || Object.keys(input).some(key => !['lesson', 'suite'].includes(key))) throw new TypeError('check requires lesson and suite only');
      return checkLesson(store, input.lesson, input.suite, evaluatorFor(input.suite));
    }
    case 'proposal-status': {
      const result = await store.transact(state => setProposalStatus(state, input.id, input.status, input.verification), transactionOptions);
      return { revision: result.revision, proposal: result.proposals[input.id] };
    }
    default: throw new TypeError('Use status, ingest, observe, task-view, recall, context, review, review-context, candidate-evidence, instruction, decision-view, lesson-view, usage-prepare, usage-review, progress, decide, curate, curate-register, propose, candidate, check, or proposal-status');
  }
}

async function main() {
  const args = process.argv.slice(2);
  let source = '';
  if (!['status'].includes(args[0])) {
    for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
      source += line + '\n';
      if (Buffer.byteLength(source) > 1024 * 1024) throw new TypeError('JSON input exceeds 1 MiB');
    }
  }
  const result = await execute(args, source.trim() ? JSON.parse(source) : undefined);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    // A malformed payload can contain private data. Do not print it or the error stack.
    process.stderr.write(JSON.stringify({ ok: false, code: error.code ?? 'LEARNING_INPUT_OR_OPERATION_FAILED' }) + '\n');
    process.exitCode = 1;
  });
}
