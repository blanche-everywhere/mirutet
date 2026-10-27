'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');

test('combo counts only Perfects, detects exact milestones and resets on either mistake', () => {
  const combo = new E.ComboTracker();
  assert.deepEqual(combo.snapshot(), { count: 0, tier: 0 });
  for (const status of ['fault', 'miss']) {
    const milestones = [];
    for (let count = 1; count <= 60; count++) {
      const result = combo.next({ status: 'perfect' });
      assert.equal(result.count, count);
      assert.equal(result.tier, [...E.COMBO_MILESTONES].reverse().find(n => n <= count) || 0);
      if (result.milestone) milestones.push(result.milestone);
    }
    assert.deepEqual(milestones, [5, 10, 20, 50]);
    assert.deepEqual(combo.next({ status }), { count: 0, tier: 0, milestone: 0 });
    assert.deepEqual(combo.next({ status: 'perfect' }), { count: 1, tier: 0, milestone: 0 });
    assert.deepEqual(combo.reset(), { count: 0, tier: 0 });
  }
  for (const result of [null, {}, { status: 'skip' }, { status: 'Perfect' }]) {
    assert.throws(() => combo.next(result), RangeError);
    assert.equal(combo.count, 0);
  }
  const snapshot = combo.next({ status: 'perfect' });
  snapshot.count = 100;
  assert.equal(combo.count, 1, 'returned transitions do not mutate the tracker');
});

function session(options = {}) {
  const events = [];
  const s = new E.DrillSession({ time: 0, clock: () => 0, pieces: ['O'], rng: () => 4.5 / 9,
    settings: { are: 0 }, ...options, onEvent: e => events.push(structuredClone(e)) });
  s.start(0);
  let time = 0;
  return { s, events, tap(action) { s.keyDown(action, ++time); s.keyUp(action, ++time); } };
}

test('real session judgements update combo once; retry and a new session restart it without changing records', () => {
  const r = session();
  for (let count = 1; count <= 51; count++) {
    r.tap('hardDrop');
    assert.equal(r.s.combo.count, count, 'each lock counts once');
  }
  const results = r.events.filter(e => e.kind === 'result');
  const fifth = results[4].result.combo;
  assert.deepEqual(fifth, { count: 5, tier: 5, milestone: 5 });
  for (const milestone of [10, 20, 50]) {
    assert.deepEqual(results[milestone - 1].result.combo, { count: milestone, tier: milestone, milestone });
    assert.deepEqual(results[milestone].result.combo, { count: milestone + 1, tier: milestone, milestone: 0 });
  }
  r.s.retry(r.s.handler.time);
  assert.equal(r.s.combo.count, 0);
  assert.equal(r.s.stats.perfect, 51);
  assert.equal(r.s.stats.bestStreak, 51);
  assert.equal(session({ totalStats: r.s.totalStats }).s.combo.count, 0, 'lifetime streak never seeds a combo');
  r.tap('hardDrop');
  assert.equal(r.s.combo.count, 1);
  r.tap('cw'); r.tap('hardDrop');
  assert.equal(r.s.lastResult.status, 'fault'); assert.equal(r.s.combo.count, 0);
  r.tap('hardDrop'); r.tap('hardDrop');
  r.tap('left'); r.tap('hardDrop');
  assert.equal(r.s.lastResult.status, 'miss'); assert.equal(r.s.combo.count, 0);
  assert.deepEqual(fifth, { count: 5, tier: 5, milestone: 5 }, 'queued milestone remains a snapshot');
  assert.ok(!('combo' in r.s.totalStats.toJSON()), 'no persistence format changes');
});

test('zero-fault repetitions break combo; pauses and unjudged skips do not count as placements', () => {
  const r = session({ zeroFault: true });
  r.tap('hardDrop'); r.tap('hardDrop');
  r.s.pause(r.s.handler.time); r.s.resume(r.s.handler.time);
  r.s.skip(r.s.handler.time);
  assert.equal(r.s.combo.count, 2);
  r.tap('cw'); r.tap('hardDrop');
  assert.equal(r.s.lastResult.status, 'fault');
  assert.equal(r.s.completed, 2); assert.equal(r.s.combo.count, 0);
  r.tap('hardDrop'); assert.equal(r.s.combo.count, 1);
});
