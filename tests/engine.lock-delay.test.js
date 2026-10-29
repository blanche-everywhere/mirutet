'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');

function drill(options = {}) {
  const s = new E.DrillSession({ time: 0, clock: () => 0, pieces: ['O'], seed: 'lock',
    ...options, settings: { are: 0, sdf: 41, ...options.settings } });
  s.start(0, E.finesseFor('O', { rot: 0, x: 4 }, { board: options.board }));
  return s;
}
function tap(s, action, t) { s.keyDown(action, t); s.keyUp(action, t + 1); }

for (const sprintLength of [0, 1]) test(`drill/sprint ${sprintLength}: zero gravity waits for ground, then auto-lock judges the same inputs as hard drop`, () => {
  const s = drill({ sprintLength, settings: { lockDelay: 700 } });
  const piece = { ...s.handler.active };
  s.update(10000); assert.deepEqual(s.handler.active, piece); assert.equal(s.handler.lockAt, Infinity);
  tap(s, 'softDrop', 10001);
  s.update(10700); assert.equal(s.stats.attempts, 0);
  s.update(10701);
  assert.equal(s.stats.attempts, 1); assert.equal(s.lastResult.t, 10701);
  assert.equal(s.lastResult.status, 'fault'); assert.equal(s.lastResult.used, 1);
  assert.equal(s.lastResult.optimal, 0); assert.equal(s.lastResult.flags.softDrop, true);
  assert.deepEqual(s.lastResult.inputs.map(i => i.action), ['softDrop']);
  assert.equal(s.completed, 1);
  if (sprintLength) { assert.equal(s.running, false); assert.equal(s.totalStats.bestTimes[1], 700); }
  const manual = drill({ sprintLength, settings: { lockDelayOn: false } });
  tap(manual, 'softDrop', 10001); tap(manual, 'hardDrop', 10701);
  for (const key of ['status', 'used', 'optimal', 'lastMove', 'cells', 'flags', 'advanced']) {
    assert.deepEqual(s.lastResult[key], manual.lastResult[key], key);
  }
});

for (const mode of ['free', 'drill', 'spin']) test(`${mode}: OFF prevents timed lock with gravity and soft drop; hard drop still judges`, () => {
  const Type = { free: E.FreeSession, drill: E.DrillSession, spin: E.SpinSession }[mode];
  const s = new Type({ time: 0, clock: () => 0, seed: 'off',
    settings: { are: 0, sdf: 41, gravity: 1, lockDelayOn: false, lockDelay: 100 } });
  s.start(0); tap(s, 'softDrop', 1);
  const piece = { ...s.handler.active };
  s.update(100000); assert.deepEqual(s.handler.active, piece);
  assert.equal(s.handler.lockAt, Infinity); assert.equal(s.lastResult, null);
  tap(s, 'hardDrop', 100001); assert.ok(s.lastResult);
});

test('drill grounded moves/rotations allow only fifteen resets, even across ledge recontacts', () => {
  for (const recontact of ['right', 'softDrop', 'gravity']) for (const expired of [false, true]) {
    const s = drill({ board: new E.Board().set(5, 0, 'J') });
    tap(s, 'softDrop', 1);
    tap(s, 'left', 10); tap(s, 'right', 20);
    assert.equal(s.handler.lockResets, 1, 'grounded recontact consumes one reset');
    for (let i = 0; i < 14; i++) tap(s, 'cw', 30 + i * 20);
    assert.equal(s.handler.lockResets, 15);
    const deadline = s.handler.lockAt;
    tap(s, 'cw', 320); assert.equal(s.handler.lockAt, deadline);
    tap(s, 'left', 330);
    assert.equal(s.handler.lockAt, Infinity); assert.equal(s.handler.lockDeadline, deadline);
    const at = expired ? deadline + 20 : 350;
    s.update(at); assert.equal(s.stats.attempts, 0);
    if (recontact === 'gravity') {
      s.setSettings({ gravity: 1 }, at);
      s.update(at + 1000 / 60);
    } else tap(s, recontact, at + 1);
    if (!expired) {
      assert.equal(s.handler.lockAt, deadline); assert.equal(s.handler.lockResets, 15);
      s.update(deadline - 1); assert.equal(s.stats.attempts, 0);
      s.update(deadline);
    }
    assert.equal(s.stats.attempts, 1);
    assert.equal(s.lastResult.t, expired ? at + (recontact === 'gravity' ? 1000 / 60 : 1) : deadline);
  }
});

test('drill pause excludes lock time and live duration edits keep elapsed contact time and reset count', () => {
  const s = drill(); tap(s, 'softDrop', 1); tap(s, 'cw', 100);
  assert.equal(s.handler.lockAt, 600); assert.equal(s.handler.lockResets, 1);
  s.pause(200); s.setSettings({ lockDelay: 300 }, 1000); s.update(5000);
  assert.equal(s.stats.attempts, 0); assert.equal(s.handler.lockAt, 400);
  s.resume(5200); assert.equal(s.handler.lockAt, 5400);
  s.update(5399); assert.equal(s.stats.attempts, 0);
  s.update(5400); assert.equal(s.lastResult.t, 5400); assert.equal(s.elapsed(5400), 399);
});

test('live lock duration/toggle edits apply now, including airborne and paused pieces, without replenishing resets', () => {
  const s = drill(); tap(s, 'softDrop', 1); tap(s, 'cw', 100);
  s.setSettings({ lockDelay: 1000 }, 200); assert.equal(s.handler.lockAt, 1100);
  s.setSettings({ lockDelayOn: false }, 300); assert.equal(s.handler.lockAt, Infinity);
  s.update(5000); assert.equal(s.stats.attempts, 0);
  s.setSettings({ lockDelayOn: true }, 5000);
  assert.equal(s.handler.lockAt, 6000); assert.equal(s.handler.lockResets, 1);
  s.setSettings({ lockDelay: 100 }, 5200); assert.equal(s.stats.attempts, 1, 'elapsed shorter deadline locks immediately');

  const air = drill({ board: new E.Board().set(5, 0, 'J') });
  tap(air, 'softDrop', 1); tap(air, 'left', 10);
  air.setSettings({ lockDelay: 100 }, 200);
  assert.equal(air.handler.lockDeadline, 101); assert.equal(air.handler.lockAt, Infinity);
  tap(air, 'right', 201); assert.equal(air.handler.lockAt, 301, 'available grounded reset uses the new duration');

  const paused = drill({ settings: { lockDelayOn: false } }); tap(paused, 'softDrop', 1);
  paused.pause(100); paused.setSettings({ lockDelayOn: true, lockDelay: 100 }, 1000);
  paused.update(2000); assert.equal(paused.stats.attempts, 0);
  paused.resume(2100); assert.equal(paused.handler.lockAt, 2200);
  paused.update(2200); assert.equal(paused.stats.attempts, 1);
});

for (const d of E.SPIN_DRILLS) test(`spin ${d.id}: auto-lock preserves the final rotation and normal judging`, () => {
  const s = new E.SpinSession({ time: 0, clock: () => 0, drillId: d.id,
    settings: { are: 0, sdf: 1, lockDelay: 500, allow180: false } });
  s.start(0); let t = 0;
  for (const action of E.solveSpinDrill(d, s.settings)) {
    if (action === 'floor') {
      while (E.movePiece(s.handler.board, s.handler.active, 0, -1)) { tap(s, 'softDrop', t += 2); }
    } else tap(s, action, t += 2);
  }
  assert.equal(s.handler.lastMove, 'rotation');
  assert.equal(E.movePiece(s.handler.board, s.handler.active, 0, -1), null);
  const deadline = s.handler.lockAt, used = s.handler.inputCount;
  s.update(deadline - 1); assert.equal(s.lastResult, null);
  s.update(deadline);
  assert.equal(s.lastResult.status, 'perfect'); assert.equal(s.lastResult.lastMove, 'rotation');
  assert.equal(s.lastResult.lines, d.lines); assert.equal(s.lastResult.used, used);
  assert.equal(s.stats.perfect, 1); assert.equal(s.awaitingNext, true);
});
