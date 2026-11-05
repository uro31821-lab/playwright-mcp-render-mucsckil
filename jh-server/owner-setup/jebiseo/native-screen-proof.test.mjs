import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectJebiseoNativeScreen as inspect, inspectJebiseoPostActionObservation as inspectPost}
  from './native-screen-proof.mjs';

// Synthetic native-schema fixtures. A positive toolbar row tests a conditional
// parser contract; it is NOT evidence that the current RIGHT APK emits that row.
const now = Date.parse('2026-11-05T12:00:00.000Z');
const protocol = 'com.koreanlifehub.bridge.protocol';
const session = '11111111-2222-4333-8444-555555555555';
const request = '66666666-7777-4888-9999-aaaaaaaaaaaa';
const field = `f_${'b'.repeat(24)}`, notice = `f_${'c'.repeat(24)}`;
const revision = 'd'.repeat(64);
const carrier = (op, target = '', option = '', value = '') => ({action: 'set_text',
  text: `__JH_FORM_V1__|${session}|${request}|${op}|${target}|${option}`, value});
const editor = () => ({fieldId: field, label: 'Ask Gemini', kind: 'TEXT', filled: false,
  enabled: true, ambiguous: false, error: '', labelSource: 'hint', controlRole: 'textbox'});
const page = () => ({ok: true, code: 'form_scanned', origin: 'gemini.google.com', revision,
  coverage: 'VISIBLE_ACCESSIBILITY_ONLY', hasSensitiveFields: false, siteErrors: [],
  fields: [editor()], buttons: [{targetId: notice, label: '주의사항 닫기', approvalRequired: false,
    activateToolArguments: carrier('form_activate', notice, 'visible-only')}]});
const pair = () => ({kind: 'split_screen_evidence', package: protocol, version: '1', verified: 'true',
  layout: 'LEFT_RIGHT', chatPackage: 'com.openai.chatgpt', chatKind: 'NATIVE', chatWindowId: '11',
  workPackage: 'com.android.chrome', workWindowId: '22', chatBounds: '0,0,500,1000',
  workBounds: '500,0,1000,1000', chatDisplayId: '0', workDisplayId: '0', displayId: '0',
  displayVerified: 'true', observedAtMs: String(now - 300)});
const address = () => ({kind: 'browser_address_readback', package: protocol,
  source: 'ANDROID_ACCESSIBILITY_TOOLBAR', workPackage: 'com.android.chrome',
  windowId: '22', displayId: '0', observedUrl: 'https://gemini.google.com/app',
  observedAtMs: String(now - 400), pageContentVerified: 'false'});
function fixture({toolbar = true} = {}) {
  const guide = page();
  const rows = [{package: protocol, guidedForm: JSON.stringify(guide),
    inputSelection15ToolArguments: JSON.stringify(carrier('form15_discover'))},
    {kind: 'screen_scope', package: 'com.android.chrome', windowId: '22',
      workBounds: '500 0 1000 1000', chatBounds: '0 0 500 1000', placement: 'RIGHT',
      verifiedRightPane: 'true', verifiedWorkPane: 'true', workPaneSide: 'RIGHT'},
    {package: 'com.android.chrome', windowId: '22', displayId: '0',
      viewId: 'com.android.chrome:id/url_bar', text: '주소 검색 또는 입력', focused: 'false', sensitive: 'false'},
    pair(), ...(toolbar ? [address()] : [])];
  const snapshot = {type: 'agent_snapshot', status: 'complete', error: null,
    completedAt: new Date(now - 100).toISOString(),
    result: {ok: true, splitScreenRequired: true, splitScreen: pair(), url: JSON.stringify(rows)}};
  const discovered = {...guide, coverage: 'VISIBLE_ONLY', feature: 'input_selection_15',
    form15ToolArguments: {fields: [{fieldId: field, kind: 'TEXT', write: carrier('form15_type', field, '', '<값>')}]}};
  const discovery = {type: 'agent_step', status: 'complete', error: null,
    completedAt: new Date(now - 600).toISOString(), result: {ok: true, url: JSON.stringify(discovered)}};
  return {snapshot, discovery, now};
}
const changeRows = (f, update) => {
  const rows = JSON.parse(f.snapshot.result.url); update(rows); f.snapshot.result.url = JSON.stringify(rows);
};
const changePage = (f, update) => changeRows(f, rows => {
  const p = JSON.parse(rows[0].guidedForm); update(p); rows[0].guidedForm = JSON.stringify(p);
});
const changeDiscovery = (f, update) => {
  const p = JSON.parse(f.discovery.result.url); update(p); f.discovery.result.url = JSON.stringify(p);
};

test('RIGHT origin, URL-bar label and valid native carrier cannot replace an absent trusted current address', () => {
  const f = fixture({toolbar: false});
  const result = inspect({...f, operation: 'TYPE'});
  assert.equal(result.code, 'PROVIDER_ADDRESS_UNVERIFIED');
  assert.equal(result.ok, false); assert.equal(result.authorityVerified, false);
  assert.equal(result.diagnostics.rightScopeMatched, true);
  assert.equal(result.diagnostics.displayMatched, true);
  assert.equal(result.diagnostics.formOriginMatchesGemini, true);
  assert.equal(result.diagnostics.nativeTargetCandidateSelected, true);
  assert.equal(result.diagnostics.issuedArgumentsParsed, true);
  assert.equal(result.diagnostics.providerAddressMatched, false);
  assert.equal(Object.hasOwn(result, 'evidence'), false);
  assert.equal(JSON.stringify(result).includes(field), false);
  assert.equal(JSON.stringify(result).includes(session), false);
  f.snapshot.originalOpen = {rightAddressConfirmed: true};
  assert.equal(inspect({...f, operation: 'TYPE'}).code, 'PROVIDER_ADDRESS_UNVERIFIED');
});

test('explicit original toolbar schema binds a unique empty native f target without item conversion or authentication claims', () => {
  const f = fixture(), before = structuredClone(f);
  const result = inspect({...f, operation: 'TYPE'});
  assert.equal(result.ok, true); assert.equal(result.authorityVerified, false);
  assert.equal(result.evidence.nativeTarget.fieldId, field);
  assert.equal(result.evidence.nativeTarget.purpose, 'GEMINI_PROMPT');
  assert.equal(result.evidence.nativeTarget.filled, false);
  assert.equal(result.evidence.windowId, 22); assert.equal(result.evidence.displayId, 0);
  assert.equal(result.evidence.formRevision, result.evidence.discoveryRevision);
  assert.deepEqual(result.evidence.issuedArguments, carrier('form15_type', field, '', '<값>'));
  assert.equal(JSON.stringify(result.evidence).includes('item_'), false);
  assert.deepEqual(f, before);
  assert.equal(inspect({...f, operation: 'TYPE', fieldId: field}).ok, false);
});

test('discovery and exact non-sensitive notice dismissal preserve the original issued action only', () => {
  const f = fixture();
  const discover = inspect({...f, operation: 'DISCOVER_INPUT'});
  assert.equal(discover.ok, true); assert.equal(discover.evidence.nativeTarget, null);
  assert.deepEqual(discover.evidence.issuedArguments, carrier('form15_discover'));
  const dismiss = inspect({...f, operation: 'DISMISS_NOTICE'});
  assert.equal(dismiss.ok, true); assert.equal(dismiss.evidence.nativeTarget.fieldId, notice);
  assert.deepEqual(dismiss.evidence.issuedArguments, carrier('form_activate', notice, 'visible-only'));
  for (const label of ['닫기', 'Close', 'Dismiss']) {
    const generic = fixture(); changePage(generic, p => {p.buttons[0].label = label;});
    const result = inspect({...generic, operation: 'DISMISS_NOTICE'});
    assert.equal(result.code, 'NATIVE_NOTICE_PURPOSE_UNVERIFIED');
    assert.equal(Object.hasOwn(result, 'evidence'), false);
  }
  for (const update of [
    p => {p.hasSensitiveFields = true;},
    p => {p.buttons[0].approvalRequired = true;},
    p => {p.buttons[0].label = '닫기 및 전송';},
    p => {p.buttons.push({...p.buttons[0], targetId: field});},
    p => {p.buttons[0].activateToolArguments = carrier('form_activate', field, 'visible-only');}
  ]) {
    const altered = fixture(); changePage(altered, update);
    assert.equal(inspect({...altered, operation: 'DISMISS_NOTICE'}).ok, false);
  }
});

test('scope, display, freshness and completion order reject mismatched or stale screen evidence', () => {
  const mutations = [
    f => {f.snapshot.status = 'queued';},
    f => {f.snapshot.completedAt = new Date(now + 1).toISOString();},
    f => {f.snapshot.completedAt = new Date(now - 46000).toISOString();},
    f => changeRows(f, rows => {rows[1].windowId = '33';}),
    f => changeRows(f, rows => {rows[1].placement = 'LEFT';}),
    f => changeRows(f, rows => {rows[1].workBounds = '501 0 1000 1000';}),
    f => changeRows(f, rows => {rows[2].displayId = '1';}),
    f => {f.snapshot.result.splitScreen.displayVerified = 'false';},
    f => changeRows(f, rows => {rows[3].observedAtMs = String(now + 5001);}),
    f => changeRows(f, rows => {rows.push({...rows[1]});})
  ];
  for (const mutate of mutations) {
    const f = fixture(); mutate(f);
    assert.equal(inspect({...f, operation: 'TYPE'}).ok, false);
  }
});

test('phone observations preserve the original bounded clock skew while server completion time stays strict', () => {
  for (const offset of [1000, -1000]) {
    const f = fixture();
    f.snapshot.result.splitScreen.observedAtMs = String(now + offset);
    changeRows(f, rows => {
      rows[3].observedAtMs = String(now + offset);
      rows[4].observedAtMs = String(now + offset - 100);
    });
    assert.equal(inspect({...f, operation: 'TYPE'}).ok, true);
    f.snapshot.completedAt = new Date(now + 1).toISOString();
    assert.equal(inspect({...f, operation: 'TYPE'}).code, 'NATIVE_COMPLETION_TIME_UNVERIFIED');
  }
  const beyond = fixture();
  beyond.snapshot.result.splitScreen.observedAtMs = String(now + 5001);
  changeRows(beyond, rows => {
    rows[3].observedAtMs = String(now + 5001); rows[4].observedAtMs = String(now + 4901);
  });
  assert.equal(inspect({...beyond, operation: 'TYPE'}).ok, false);
});

test('current-address source, scope, time and exact HTTPS Gemini app origin cannot be supplied by page text', () => {
  for (const update of [
    a => {a.source = 'PAGE_TEXT';}, a => {a.windowId = '33';}, a => {a.displayId = '1';},
    a => {a.observedAtMs = String(now + 1);}, a => {a.observedAtMs = String(now - 10000);},
    a => {a.observedUrl = 'http://gemini.google.com/app';},
    a => {a.observedUrl = 'https://gemini.google.com.evil.example/app';},
    a => {a.observedUrl = 'https://user:secret@gemini.google.com/app';},
    a => {a.observedUrl = 'https://gemini.google.com/settings';}
  ]) {
    const f = fixture(); changeRows(f, rows => update(rows[4]));
    assert.equal(inspect({...f, operation: 'TYPE'}).ok, false);
  }
  const duplicate = fixture(); changeRows(duplicate, rows => rows.push({...rows[4]}));
  assert.equal(inspect({...duplicate, operation: 'TYPE'}).code, 'PROVIDER_ADDRESS_AMBIGUOUS');
  const origin = fixture(); changePage(origin, p => {p.origin = 'example.com';});
  assert.equal(inspect({...origin, operation: 'DISCOVER_INPUT'}).code, 'NATIVE_FORM_ORIGIN_MISMATCH');
});

test('only an unambiguous semantically Gemini prompt with explicit empty metadata can be selected', () => {
  for (const update of [
    p => {p.fields[0].label = 'Search history';},
    p => {p.fields.push({...p.fields[0], fieldId: notice});},
    p => {p.fields[0].filled = true;}, p => {delete p.fields[0].filled;},
    p => {p.fields[0].ambiguous = true;}, p => {p.fields[0].enabled = false;},
    p => {p.fields[0].error = 'validation error';}, p => {p.fields[0].labelSource = 'previous_view';},
    p => {p.fields[0].kind = 'SENSITIVE';}, p => {p.siteErrors.push('validation error');}
  ]) {
    const f = fixture(); changePage(f, update);
    assert.equal(inspect({...f, operation: 'TYPE'}).ok, false);
  }
  for (const mutate of [
    f => {f.snapshot.result.restricted = true;},
    f => changeRows(f, rows => {rows[2].sensitive = 'true';}),
    f => changePage(f, p => {p.fields.push({...p.fields[0], fieldId: `f_${'e'.repeat(24)}`,
      label: 'Password', kind: 'SENSITIVE'});})
  ]) {
    const f = fixture(); mutate(f);
    assert.equal(inspect({...f, operation: 'TYPE'}).code, 'NATIVE_SENSITIVE_SCOPE');
  }
  // Filled metadata is a pre-action refusal, never proof that our requested
  // text was entered or that an outstanding effect can be released.
  const filled = fixture(); changePage(filled, p => {p.fields[0].filled = true;});
  assert.equal(inspect({...filled, operation: 'TYPE'}).code, 'NATIVE_EMPTY_EDITOR_REQUIRED');
  assert.equal(Object.hasOwn(inspect({...filled, operation: 'TYPE'}), 'evidence'), false);
});

test('the original discovery must precede the snapshot and match its revision, field facts and issuer session', () => {
  const mutations = [
    f => {f.discovery.completedAt = new Date(now).toISOString();},
    f => {
      f.snapshot.result.splitScreen.observedAtMs = String(now - 10000);
      changeRows(f, rows => {rows[3].observedAtMs = String(now - 10000); rows[4].observedAtMs = String(now - 10100);});
    },
    f => changeDiscovery(f, d => {d.revision = 'e'.repeat(64);}),
    f => changeDiscovery(f, d => {d.origin = 'example.com';}),
    f => changeDiscovery(f, d => {d.fields[0].filled = true;}),
    f => changeDiscovery(f, d => {d.fields[0].error = 'site validation error';}),
    f => changeDiscovery(f, d => {d.fields.push({...d.fields[0]});}),
    f => changeDiscovery(f, d => {d.form15ToolArguments.fields[0].write.text =
      d.form15ToolArguments.fields[0].write.text.replace(session, '99999999-8888-4777-8666-555555555555');})
  ];
  for (const mutate of mutations) {
    const f = fixture(); mutate(f);
    assert.equal(inspect({...f, operation: 'TYPE'}).ok, false);
  }
});

test('malformed, duplicate and partial protocol payloads fail without exposing source values', () => {
  const cases = [
    f => {f.snapshot.result.url = '{broken';},
    f => {f.snapshot.result.url = 'x'.repeat(2 * 1024 * 1024 + 1);},
    f => changeRows(f, rows => rows.push({...rows[0]})),
    f => changePage(f, p => {p.ok = false; p.code = 'guided_form_budget_partial';}),
    f => changePage(f, p => {delete p.hasSensitiveFields;})
  ];
  for (const mutate of cases) {
    const f = fixture(); mutate(f);
    const result = inspect({...f, operation: 'DISCOVER_INPUT'});
    assert.equal(result.ok, false); assert.equal(result.authorityVerified, false);
    assert.equal(Object.hasOwn(result, 'evidence'), false);
  }
});

function postFixture(operation = 'TYPE') {
  const original = fixture(), proof = inspect({...original, operation});
  assert.equal(proof.ok, true);
  const after = fixture(), later = now + 1000;
  after.snapshot.createdAtMs = later - 900;
  after.snapshot.startedAtMs = later - 800;
  after.snapshot.completedAt = new Date(later - 100).toISOString();
  after.snapshot.result.splitScreen.observedAtMs = String(later - 300);
  changeRows(after, rows => {
    rows[3].observedAtMs = String(later - 300);
    rows[4].observedAtMs = String(later - 400);
  });
  changePage(after, p => {
    p.revision = 'e'.repeat(64);
    if (operation === 'TYPE') p.fields[0].filled = true;
  });
  return {operation, beforeEvidence: proof.evidence, afterSnapshot: after.snapshot, now: later};
}
function assertPostUnverified(result) {
  assert.equal(result.ok, false);
  assert.equal(result.authorityVerified, false);
  assert.equal(result.readbackRequired, true);
  assert.equal(result.currentValueVerified, false);
  assert.equal(result.noticeDismissedVerified, false);
}

test('post TYPE accepts changed revision and filled metadata as observations without verifying any value', () => {
  const input = postFixture(), before = structuredClone(input);
  const result = inspectPost(input);
  assertPostUnverified(result);
  assert.equal(result.observationValidated, true);
  assert.equal(result.code, 'NATIVE_POST_TYPE_VALUE_UNVERIFIED');
  assert.equal(result.facts.targetFieldMatched, true);
  assert.equal(result.facts.targetFieldFilled, true);
  assert.equal(result.facts.formRevisionChanged, true);
  assert.equal(result.facts.visibleScopeOnly, true);
  assert.ok(Object.values(result.facts).every(value => typeof value === 'boolean'));
  assert.deepEqual(input, before);
  for (const value of [field, session, request, 'https://gemini.google.com/app', revision])
    assert.equal(JSON.stringify(result).includes(value), false);
  const empty = postFixture();
  changePage({snapshot: empty.afterSnapshot}, p => {p.fields[0].filled = false;});
  const stillUnverified = inspectPost(empty);
  assertPostUnverified(stillUnverified);
  assert.equal(stillUnverified.observationValidated, true);
  assert.equal(stillUnverified.facts.targetFieldFilled, false);
});

test('post notice visibility and absence never establish that the original notice was dismissed', () => {
  for (const [variant, targetVisible, labelVisible] of [
    ['same', true, true], ['absent', false, false], ['another', false, true]
  ]) {
    const input = postFixture('DISMISS_NOTICE');
    changePage({snapshot: input.afterSnapshot}, p => {
      if (variant === 'absent') p.buttons = [];
      if (variant === 'another') {
        const id = 'f_' + 'a'.repeat(24);
        p.buttons[0] = {...p.buttons[0], targetId: id,
          activateToolArguments: carrier('form_activate', id, 'visible-only')};
      }
    });
    const result = inspectPost(input);
    assertPostUnverified(result);
    assert.equal(result.observationValidated, true);
    assert.equal(result.code, 'NATIVE_POST_NOTICE_STATE_UNVERIFIED');
    assert.equal(result.facts.noticeTargetVisible, targetVisible);
    assert.equal(result.facts.noticeExplicitLabelVisible, labelVisible);
    assert.equal(result.facts.visibleScopeOnly, true);
    assert.equal(JSON.stringify(result).includes(notice), false);
    assert.equal(JSON.stringify(result).includes(session), false);
  }
});

test('post observations reject absent addresses, changed panes and invalid or sensitive native responses', () => {
  const cases = [
    ['PROVIDER_ADDRESS_UNVERIFIED', input => changeRows({snapshot: input.afterSnapshot}, rows => rows.splice(4, 1))],
    ['NATIVE_POST_SCOPE_CHANGED', input => {
      input.afterSnapshot.result.splitScreen.workWindowId = '33';
      changeRows({snapshot: input.afterSnapshot}, rows => {
        rows[1].windowId = '33'; rows[2].windowId = '33';
        rows[3].workWindowId = '33'; rows[4].windowId = '33';
      });
    }],
    ['NATIVE_POST_SCOPE_CHANGED', input => {
      input.afterSnapshot.result.splitScreen.workBounds = '510,0,1000,1000';
      changeRows({snapshot: input.afterSnapshot}, rows => {
        rows[1].workBounds = '510 0 1000 1000'; rows[3].workBounds = '510,0,1000,1000';
      });
    }],
    ['NATIVE_POST_SCOPE_CHANGED', input => {
      const ids = {chatDisplayId: '1', workDisplayId: '1', displayId: '1'};
      Object.assign(input.afterSnapshot.result.splitScreen, ids);
      changeRows({snapshot: input.afterSnapshot}, rows => {
        Object.assign(rows[3], ids); rows[2].displayId = '1'; rows[4].displayId = '1';
      });
    }],
    ['NATIVE_ORIGINAL_COMPLETION_REQUIRED', input => {input.afterSnapshot.status = 'queued';}],
    ['NATIVE_COMPLETION_TIME_UNVERIFIED', input => {input.afterSnapshot.completedAt = new Date(input.now + 1).toISOString();}],
    ['NATIVE_PAYLOAD_INVALID', input => {input.afterSnapshot.result.url = '{broken';}],
    ['NATIVE_POST_JOB_TIME_UNVERIFIED', input => {delete input.afterSnapshot.startedAtMs;}],
    ['NATIVE_POST_OBSERVATION_ORDER_UNVERIFIED', input => {
      const stale = input.afterSnapshot.startedAtMs - 5001;
      input.afterSnapshot.result.splitScreen.observedAtMs = String(stale);
      changeRows({snapshot: input.afterSnapshot}, rows => {
        rows[3].observedAtMs = String(stale); rows[4].observedAtMs = String(stale - 100);
      });
    }],
    ['NATIVE_POST_OBSERVATION_ORDER_UNVERIFIED', input => {
      const start = input.afterSnapshot.startedAtMs;
      input.afterSnapshot.result.splitScreen.observedAtMs = String(start - 1);
      changeRows({snapshot: input.afterSnapshot}, rows => {
        rows[3].observedAtMs = String(start - 5001); rows[4].observedAtMs = String(start - 5101);
      });
    }],
    ['NATIVE_FORM_PROTOCOL_AMBIGUOUS', input => changeRows({snapshot: input.afterSnapshot}, rows => rows.push({...rows[0]}))],
    ['NATIVE_FORM_METADATA_UNVERIFIED', input => changePage({snapshot: input.afterSnapshot}, p => {
      p.ok = false; p.code = 'guided_form_budget_partial';
    })],
    ['NATIVE_FORM_METADATA_UNVERIFIED', input => changePage({snapshot: input.afterSnapshot}, p => {delete p.fields[0].filled;})],
    ['NATIVE_SENSITIVE_SCOPE', input => changeRows({snapshot: input.afterSnapshot}, rows => {rows[2].sensitive = 'true';})],
    ['NATIVE_GEMINI_EDITOR_UNVERIFIED', input => changePage({snapshot: input.afterSnapshot}, p => {p.fields[0].label = 'Search history';})],
    ['NATIVE_GEMINI_EDITOR_UNVERIFIED', input => changePage({snapshot: input.afterSnapshot}, p => {p.fields[0].labelSource = 'description';})]
  ];
  for (const [code, mutate] of cases) {
    const input = postFixture(); mutate(input);
    const result = inspectPost(input);
    assertPostUnverified(result);
    assert.equal(result.observationValidated, false, code);
    assert.equal(result.code, code);
    assert.equal(Object.hasOwn(result, 'facts'), false);
  }
});

test('post observations cannot accept a mismatched before identity, changed issuer or older snapshot', () => {
  for (const mutate of [
    b => {b.schema = 'caller-proof';},
    b => {b.operation = 'DISMISS_NOTICE';},
    b => {b.nativeTarget.fieldId = notice;},
    b => {b.nativeTarget.label = 'Search history';},
    b => {b.identity.session = '99999999-8888-4777-8666-555555555555';},
    b => {b.identity.requestId = 'a-different-request';},
    b => {b.identity.option = 'visible-only';},
    b => {b.issuedArguments.command_id = 'a'.repeat(32);}
  ]) {
    const input = postFixture();
    input.beforeEvidence = structuredClone(input.beforeEvidence); mutate(input.beforeEvidence);
    const result = inspectPost(input);
    assertPostUnverified(result);
    assert.equal(result.observationValidated, false);
    assert.equal(result.code, 'NATIVE_POST_BEFORE_EVIDENCE_INVALID');
  }
  const changedIssuer = postFixture();
  changeRows({snapshot: changedIssuer.afterSnapshot}, rows => {
    const args = JSON.parse(rows[0].inputSelection15ToolArguments);
    args.text = args.text.replace(session, '99999999-8888-4777-8666-555555555555');
    rows[0].inputSelection15ToolArguments = JSON.stringify(args);
  });
  const issuerResult = inspectPost(changedIssuer);
  assertPostUnverified(issuerResult);
  assert.equal(issuerResult.observationValidated, false);
  assert.equal(issuerResult.code, 'NATIVE_ISSUER_SESSION_CHANGED');
  const old = postFixture();
  old.afterSnapshot.createdAtMs = old.beforeEvidence.snapshotCompletedAtMs - 600;
  old.afterSnapshot.startedAtMs = old.beforeEvidence.snapshotCompletedAtMs - 500;
  old.afterSnapshot.completedAt = new Date(old.beforeEvidence.snapshotCompletedAtMs - 1).toISOString();
  const oldResult = inspectPost(old);
  assertPostUnverified(oldResult);
  assert.equal(oldResult.observationValidated, false);
  assert.equal(oldResult.code, 'NATIVE_POST_OBSERVATION_ORDER_UNVERIFIED');
  assert.equal(inspectPost({...postFixture(), fieldId: field}).code, 'NATIVE_POST_ARGUMENTS_INVALID');
  // A perfectly consistent synthetic fixture is still not authenticated proof.
  assert.equal(inspectPost(postFixture()).authorityVerified, false);
});
