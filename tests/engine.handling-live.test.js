'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');

const rig = settings => new E.InputHandler({ time: 0, clock: () => 0, autoNext: false, settings });
const column = h => E.bounds(h.active).minX;

test('live DAS preserves held age when shortened or lengthened, including the inactive direction', () => {
  const h = rig({ das: 200, arr: 50 }); h.spawn('O', 0); h.keyDown('left', 0);
  h.setSettings({ das: 80 }, 60);
  h.update(79); assert.equal(column(h), 3);
  h.update(80); assert.equal(column(h), 2);
  h.setSettings({ das: 300 }, 90);
  h.update(299); assert.equal(column(h), 2);
  h.update(300); assert.equal(column(h), 1);
  h.setSettings({ das: 20 }, 310); assert.equal(column(h), 0);
  assert.equal(h.inputCount, 1);

  const b = rig({ das: 400, arr: 40 }); b.spawn('O', 0);
  b.keyDown('left', 0); b.keyDown('right', 10);
  b.setSettings({ das: 50 }, 100); assert.equal(column(b), 5);
  b.keyUp('right', 101); assert.equal(column(b), 4);
  b.update(140); assert.equal(column(b), 4);
  b.update(141); assert.equal(column(b), 3);
  assert.equal(b.inputCount, 2);
});

test('live ARR restarts the charged repeat phase once, switches to instant, and resumes finite repeats', () => {
  const h = rig({ das: 100, arr: 80 }); h.spawn('O', 0); h.keyDown('right', 0);
  h.update(100); assert.equal(column(h), 6);
  h.setSettings({ arr: 25 }, 110); assert.equal(column(h), 7);
  h.update(134); assert.equal(column(h), 7);
  h.update(135); assert.equal(column(h), 8);
  h.setSettings({ arr: 0 }, 136); assert.equal(column(h), 8);
  h.keyDown('left', 137); assert.equal(column(h), 7);
  h.setSettings({ arr: 40 }, 200); assert.equal(column(h), 7, 'uncharged direction still waits for DAS');
  h.update(237); assert.equal(column(h), 6);
  h.setSettings({ arr: 0 }, 238); assert.equal(column(h), 0);
  assert.equal(h.inputCount, 2);
});

test('live finite/instant SDF and gravity update a held soft drop without a new input or manual lock', () => {
  const h = rig({ sdf: 2 }); h.spawn('T', 0); h.keyDown('softDrop', 0);
  assert.equal(h.active.y, 18);
  h.setSettings({ sdf: 10 }, 100);
  h.update(199); assert.equal(h.active.y, 18);
  h.update(200); assert.equal(h.active.y, 17);
  h.setSettings({ gravity: 1 / 60, sdf: 5 }, 210);
  h.update(409); assert.equal(h.active.y, 17);
  h.update(410); assert.equal(h.active.y, 16);
  h.setSettings({ sdf: 41 }, 411);
  assert.equal(E.bounds(h.active).minY, 0); assert.equal(h.inputCount, 1);
  assert.equal(h.flags.softDrop, true); assert.ok(h.active);
  h.setSettings({ sdf: 1, gravity: 0 }, 412);
  h.update(2000); assert.ok(h.active, 'practice remains manually locked');
});

test('live DCD recalculates the current gate from spawn/rotation while retaining charge', () => {
  const h = rig({ das: 0, arr: 30, dcd: 100 }); h.keyDown('left', 0); h.spawn('T', 0);
  h.setSettings({ dcd: 200 }, 50);
  h.update(199); assert.equal(column(h), 3);
  h.setSettings({ dcd: 50 }, 199); assert.equal(column(h), 2);
  h.keyDown('cw', 200);
  const before = h.active.x;
  h.setSettings({ dcd: 120 }, 210);
  h.update(319); assert.equal(h.active.x, before);
  h.update(320); assert.equal(h.active.x, before - 1);
  assert.equal(h.inputCount, 2);
});

test('live ARE shortening/lengthening uses the original start and buffered keys use the new handling', () => {
  const h = rig({ are: 200, das: 100, arr: 0, dcd: 0, sdf: 2 });
  h.scheduleSpawn('T', 0); h.keyDown('left', 10); h.keyDown('cw', 20); h.keyDown('softDrop', 30);
  h.setSettings({ are: 400, das: 80, arr: 20, dcd: 40, sdf: 10 }, 100);
  h.update(300); assert.equal(h.active, null); assert.equal(h.pending.at, 400);
  h.setSettings({ are: 250 }, 300);
  assert.equal(h.pending, null); assert.equal(h.active.rot, 1); assert.equal(h.inputCount, 1);
  h.update(339); assert.equal(h.active.x, 3);
  h.update(340); assert.equal(h.active.x, 2); assert.equal(h.inputCount, 2);
  h.update(400); assert.equal(h.active.y, 18); assert.equal(h.inputCount, 3);
  assert.equal(h.inputs.filter(i => i.irs).length, 1);
  h.setSettings({ are: 500 }, 401); assert.ok(h.active, 'ARE edits never respawn an active piece');
});

test('unrelated or unchanged handling edits preserve running fall, ARR, ARE and lock timers', () => {
  const s = new E.FreeSession({ time: 0, clock: () => 0, settings: { are: 0, arr: 50, das: 100 } });
  s.start(0); s.keyDown('left', 0); s.update(120);
  const fallAt = s.handler.fallAt, nextAt = s.handler._direction().nextAt;
  s.setSettings({ are: 20, dcd: 0, sdf: 40 }, 130);
  assert.equal(s.handler.fallAt, fallAt); assert.equal(s.handler._direction().nextAt, nextAt);
  s.setSettings({ arr: 25 }, 140); assert.equal(s.handler.fallAt, fallAt);
  s.keyUp('left', 141); s.setSettings({ sdf: 41 }, 142); s.keyDown('softDrop', 143);
  const deadline = s.handler.lockAt;
  s.setSettings({ das: 200, arr: 0, are: 30 }, 150);
  assert.equal(s.handler.lockAt, deadline); s.update(deadline); assert.equal(s.pieces, 1);
});

test('handling edits keep sprint records, stats, combo and the current target valid', () => {
  const s = new E.DrillSession({ time: 0, clock: () => 0, pieces: ['O'], rng: () => 4.5 / 9,
    sprintLength: 3, settings: { are: 0 } });
  s.start(0); s.keyDown('hardDrop', 10); s.keyUp('hardDrop', 11);
  const round = structuredClone(s.round), stats = s.stats.toJSON();
  s.setSettings({ das: 250, arr: 20, sdf: 41, dcd: 10, gravity: .01 }, 20);
  assert.deepEqual(s.round, round); assert.deepEqual(s.stats.toJSON(), stats); assert.equal(s.combo.count, 1);
  s.keyDown('hardDrop', 30); s.keyUp('hardDrop', 31);
  s.setSettings({ are: 20 }, 40); s.keyDown('hardDrop', 50);
  assert.equal(s.running, false); assert.equal(s.totalStats.bestTimes[3], 40);
  assert.equal(s.stats.perfect, 3); assert.equal(s.pausedDuration, 0);
});

test('edits during pause use the frozen clock and take effect only on resume', () => {
  const h = rig({ are: 200 }); h.scheduleSpawn('T', 0); h.pause(50);
  h.setSettings({ are: 20 }, 100); assert.ok(h.pending); assert.equal(h.active, null);
  h.resume(150); assert.equal(h.pending, null); assert.ok(h.active);
  const g = rig({ das: 200, arr: 50 }); g.spawn('O', 0); g.keyDown('left', 0); g.pause(100);
  g.setSettings({ das: 50 }, 500); assert.equal(column(g), 3);
  g.resume(600); assert.equal(column(g), 2);
  g.update(649); assert.equal(column(g), 2); g.update(650); assert.equal(column(g), 1);
});
