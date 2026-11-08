import test from 'node:test';
import assert from 'node:assert/strict';
import { planRoute, catalog } from '../scripts/router.mjs';

// The host has already interpreted the request. These are routing-contract
// regressions, not image recognition or Korean natural-language evaluations.
const available = { skills: catalog.entries.flatMap(entry => entry.skill ? [entry.skill] : []), capabilities: [] };
const base = { threadId: 'art-expansion-thread', sourceRef: 'test:art-expansion', available };

test('a purchase goal can use art advice while retaining shopping and explicit exclusions', () => {
  const route = planRoute({ ...base, intent: {
    kind: 'task', primary: 'shopping', topics: ['art', 'shopping'],
    helpers: ['art', 'personal'], excluded: ['personal', 'critique']
  } });
  assert.equal(route.lead, 'shopping');
  assert.deepEqual(route.helpers, ['art']);
  assert.deepEqual(route.requiredSkills, ['jh-shoppingbiseo', 'jh-geubiseo']);
  assert.deepEqual(route.participantBadges, [
    { id: 'shopping', prefix: '🏴‍☠️ 쇼핑비서:' },
    { id: 'art', prefix: '🏴‍☠️ 그비서:' }
  ]);
  assert.equal(route.critiqueOffer, null);
  assert.equal(route.authorizesExecution, false);
  assert.equal(route.dispatchesTools, false);
});

test('an unavailable art helper does not block the available shopping goal or gain a badge', () => {
  const route = planRoute({ ...base,
    available: { skills: ['jh-shoppingbiseo'], capabilities: [] },
    intent: { kind: 'task', primary: 'shopping', helpers: ['art'] }
  });
  assert.equal(route.ready, true);
  assert.deepEqual(route.requiredSkills, ['jh-shoppingbiseo']);
  assert.deepEqual(route.unavailableCapabilities, ['art']);
  assert.deepEqual(route.participantBadges, [{ id: 'shopping', prefix: '🏴‍☠️ 쇼핑비서:' }]);
  assert.equal(route.changesPersistentState, false);
});

test('outfit and product aesthetics do not require shopping or trigger consumer review without that goal', () => {
  const route = planRoute({ ...base,
    available: { skills: ['jh-geubiseo', 'jh-ddanbiseo'], capabilities: [] },
    intent: { kind: 'task', primary: 'art', topics: ['art', 'shopping'] }
  });
  assert.equal(route.ready, true);
  assert.equal(route.lead, 'art');
  assert.deepEqual(route.requiredSkills, ['jh-geubiseo']);
  assert.deepEqual(route.helpers, []);
  assert.equal(route.critiqueOffer, null);
});

test('a new edit or visit goal does not consume the previous art task or menu', () => {
  const activeTask = {
    id: 'building-art-task', threadId: base.threadId, lead: 'art', helpers: [],
    mode: 'explain', status: 'active', effects: {},
    menu: { id: 'building-art-menu', threadId: base.threadId }
  };
  for (const [primary, skill] of [['photo', 'jh-pyeonbiseo'], ['travel', 'jh-yeobiseo']]) {
    const route = planRoute({ ...base, activeTask,
      intent: { kind: 'task', primary, topics: ['art', primary] }
    });
    assert.equal(route.action, 'route');
    assert.equal(route.lead, primary);
    assert.equal(route.taskId, null);
    assert.deepEqual(route.requiredSkills, [skill]);
    assert.equal(route.authorizesExecution, false);
    assert.equal(route.dispatchesTools, false);
  }
  const continued = planRoute({ ...base, activeTask,
    intent: { kind: 'select', menuId: 'building-art-menu' }
  });
  assert.equal(continued.lead, 'art');
  assert.equal(continued.taskId, activeTask.id);
  assert.equal(continued.action, 'select');
});
