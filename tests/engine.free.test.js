'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');
const A = require('../src/audio.js');

function rig(options = {}) {
  const events = [];
  const s = new E.FreeSession({ clock: () => 0, time: 0, seed: 'free', settings: { are: 80 },
    ...options, onEvent: event => events.push(structuredClone(event)) });
  const ready = () => { if (s.handler.pending) s.update(s.handler.pending.at); assert.ok(s.handler.active); };
  const tap = action => {
    const t = s.handler.time + 1;
    s.keyDown(action, t); s.keyUp(action, t + 1);
  };
  return { s, events, ready, tap };
}

test('free play spawns endlessly from full seven-bags, with five previews and no targets/quota/finish', () => {
  const { s, ready, tap, events } = rig({ pieces: ['O'], sprintLength: 1, zeroFault: true });
  s.start(0);
  const drawn = [];
  for (let i = 0; i < 140; i++) {
    const preview = s.nextQueue();
    assert.equal(preview.length, 5); assert.deepEqual(s.nextQueue(), preview);
    ready(); assert.equal(s.handler.active.type, preview[0]);
    assert.deepEqual(s.nextQueue(), preview.slice(1).concat(s.bag.peek(5)[4]));
    drawn.push(s.handler.active.type);
    tap('hardDrop');
    assert.equal(s.pieces, i + 1); assert.equal(s.running, true);
    assert.equal(s.snapshot(s.handler.time).gameOver, false);
    // Isolate the supply/absence of a completion limit from stacking strategy.
    s.handler.board.clear();
  }
  for (let i = 0; i < drawn.length; i += 7) assert.deepEqual(drawn.slice(i, i + 7).sort(), [...E.PIECE_TYPES].sort());
  assert.equal(s.round, undefined); assert.equal(s.sprintLength, undefined);
  assert.equal(s.snapshot().finished, undefined);
  assert.ok(events.every(e => !['target', 'finish'].includes(e.kind)));
  assert.equal(events.filter(e => e.kind === 'result').length, 140);
});

test('placements accumulate, clear one/multiple lines, and count locked pieces independently of finesse', () => {
  const { s, ready, tap } = rig({ rng: () => .99999 }); s.start(0); ready();
  assert.equal(s.handler.active.type, 'I');
  for (const x of [0, 1, 2, 7, 8, 9]) s.handler.board.set(x, 0, 'J');
  tap('hardDrop');
  assert.equal(s.lines, 1); assert.equal(s.pieces, 1); assert.equal(s.lastResult.lines, 1);
  assert.equal(s.lastResult.status, 'perfect'); assert.ok(s.handler.board.isEmpty());
  ready(); assert.equal(s.handler.active.type, 'O');
  for (let y = 0; y < 2; y++) for (let x = 0; x < 10; x++) if (![4, 5].includes(x)) s.handler.board.set(x, y, 'J');
  tap('cw'); tap('hardDrop');
  assert.equal(s.lines, 3); assert.equal(s.pieces, 2); assert.equal(s.lastResult.lines, 2);
  assert.equal(s.lastResult.status, 'fault'); assert.ok(s.handler.board.isEmpty());
  ready(); tap('hardDrop');
  const before = s.handler.board.rows.map(row => [...row]);
  assert.equal(before.flat().filter(Boolean).length, 4);
  ready(); tap('hardDrop');
  assert.equal(s.handler.board.rows.flat().filter(Boolean).length, 8);
  assert.equal(s.lines, 3); assert.equal(s.pieces, 4);
});

test('line-clear judgement uses the pre-lock stack and surviving cells shift down', () => {
  const { s, tap } = rig({ rng: () => .99999, settings: { are: 0 } });
  s.start(0); tap('hold'); // O at the spawn columns, with no counted inputs.
  for (let x = 0; x < 10; x++) if (![4, 5].includes(x)) s.handler.board.set(x, 0, 'J');
  s.handler.board.set(0, 2, 'T');
  tap('hardDrop');
  assert.equal(s.lastResult.status, 'perfect'); assert.equal(s.lastResult.optimal, 0);
  assert.equal(s.lastResult.used, 0); assert.equal(s.lastResult.lines, 1);
  assert.equal(s.lines, 1); assert.equal(s.pieces, 1);
  const occupied = s.handler.board.rows.flatMap((row, y) => row.flatMap((type, x) => type ? [[x, y, type]] : []));
  assert.deepEqual(occupied, [[4, 0, 'O'], [5, 0, 'O'], [0, 1, 'T']]);
});

test('hold draws once, cannot repeat before lock, swaps without consuming NEXT or counting pieces', () => {
  const { s, ready, tap, events } = rig(); s.start(0); ready();
  const original = s.handler.active.type, incoming = s.nextQueue()[0];
  tap('hold');
  assert.equal(s.handler.heldPiece, original); assert.equal(s.handler.active.type, incoming);
  assert.equal(s.pieces, 0); assert.equal(s.handler.inputCount, 0);
  const queue = s.nextQueue(); tap('hold'); assert.deepEqual(s.nextQueue(), queue);
  assert.equal(s.handler.active.type, incoming);
  tap('hardDrop'); ready();
  const replacing = s.handler.active.type, before = s.nextQueue();
  tap('hold');
  assert.equal(s.handler.active.type, original); assert.equal(s.handler.heldPiece, replacing);
  assert.deepEqual(s.nextQueue(), before); assert.equal(s.pieces, 1);
  const spawns = events.filter(e => e.kind === 'spawn');
  assert.equal(A.selectCue(spawns[0]), incoming);
  assert.equal(A.selectCue(spawns[1], 'current'), incoming);
  assert.equal(A.selectCue(spawns.at(-1)), null);
});

test('IHS and IRS share input accounting and announce a queue draw exactly once', () => {
  for (const held of [null, 'T']) {
    const { s, events } = rig({ settings: { ihs: true, are: 80 } });
    s.handler.heldPiece = held; s.start(0);
    const original = s.handler.pending.type;
    s.keyDown('hold', 10); s.keyUp('hold', 11); s.keyDown('cw', 20); s.update(80);
    assert.equal(s.handler.heldPiece, original); assert.equal(s.handler.flags.ihs, true);
    assert.equal(s.handler.inputCount, 1); assert.equal(s.handler.inputs[0].irs, true);
    assert.equal(s.handler.active.rot, 1); assert.equal(s.pieces, 0);
    const spawns = events.filter(e => e.kind === 'spawn'); assert.equal(spawns.length, 1);
    assert.equal(A.selectCue(spawns[0]), s.bag.peek(1)[0]);
    assert.equal(A.selectCue(spawns[0], 'current'), s.handler.active.type);
  }
});

test('every reachable placement is judged on the existing stack, and faults reset consecutive Perfects', () => {
  const { s, ready, tap } = rig(); s.start(0);
  for (let i = 0; i < 3; i++) {
    ready(); if (i === 2) { tap('cw'); tap('ccw'); }
    tap('hardDrop');
    assert.equal(s.lastResult.status, i === 2 ? 'fault' : 'perfect');
    assert.equal(s.lastResult.optimal, 0); assert.equal(s.lastResult.used, i === 2 ? 2 : 0);
    assert.equal(s.combo.count, i === 2 ? 0 : i + 1);
    assert.equal(s.lastResult.targetKey, E.cellsKey(s.lastResult.cells));
  }
  assert.equal(s.pieces, 3); assert.equal(s.running, true);
});

test('a tuck outside the descent-free solver is unjudged and still locks normally', () => {
  const { s, ready, tap } = rig({ rng: () => .99999, settings: { are: 80, sdf: 41 } });
  s.start(0); ready(); tap('hold'); // O, under an overhang at the left.
  s.handler.board.set(0, 3, 'J'); s.handler.board.set(1, 3, 'J');
  tap('softDrop');
  s.keyDown('left', s.handler.time + 1); s.update(s.handler.time + s.settings.das + 1);
  s.keyUp('left', s.handler.time + 1); tap('hardDrop');
  assert.equal(s.lastResult.status, 'unjudged'); assert.equal(s.lastResult.optimal, null);
  assert.equal(s.combo.count, 0); assert.equal(s.pieces, 1); assert.equal(s.running, true);
});

test('spawn obstruction and locks fully above the field end play, freeze time and stop spawning', () => {
  for (const reason of ['blockout', 'lockout']) {
    const { s, ready, tap, events } = rig({ rng: () => .99999 }); s.start(0);
    if (reason === 'blockout') {
      for (const [x, y] of E.cells(E.spawnPiece('I'))) s.handler.board.set(x, y, 'J');
      s.update(80);
    } else {
      ready(); for (let x = 3; x <= 6; x++) s.handler.board.set(x, 19, 'J');
      tap('hardDrop');
    }
    const result = s.snapshot(s.handler.time);
    assert.equal(result.gameOver, true); assert.equal(result.reason, reason); assert.equal(result.running, false);
    assert.equal(s.pieces, reason === 'lockout' ? 1 : 0);
    assert.equal(s.handler.active, null); assert.equal(s.handler.pending, null); assert.equal(s.handler.held.size, 0);
    s.update(10000); assert.equal(s.elapsed(10000), result.elapsed);
    assert.equal(s.keyDown('hardDrop', 10001), false);
    assert.equal(events.filter(e => e.kind === 'gameover').length, 1);
    assert.ok(events.every(e => e.kind !== 'finish'));
  }
});

test('restart resets field, hold, queue, timer, counts, feedback and combo; retry key uses restart', () => {
  const { s, ready, tap } = rig(); s.start(0); ready(); tap('hold'); tap('hardDrop'); ready();
  tap('hardDrop'); s.pause(s.handler.time + 1); s.resume(s.handler.time + 1001);
  s.restart(s.handler.time + 1);
  assert.ok(s.handler.board.isEmpty()); assert.equal(s.handler.heldPiece, null);
  assert.equal(s.startedAt, null); assert.equal(s.elapsed(s.handler.time), 0);
  assert.equal(s.lines, 0); assert.equal(s.pieces, 0); assert.equal(s.combo.count, 0);
  assert.equal(s.pausedDuration, 0); assert.equal(s.pausedAt, null); assert.equal(s.lastResult, null);
  assert.equal(s.gameOver, false); assert.equal(s.running, true); assert.equal(s.nextQueue().length, 5);
  ready(); tap('hardDrop'); tap('retry');
  assert.equal(s.pieces, 0); assert.ok(s.handler.board.isEmpty()); assert.equal(s.handler.held.size, 0);
  // Restart after actual game over uses the same reset path.
  for (const [x, y] of E.cells(E.spawnPiece(s.handler.pending.type))) s.handler.board.set(x, y, 'J');
  s.update(s.handler.pending.at); assert.equal(s.gameOver, true);
  s.restart(s.handler.time + 1); ready(); assert.equal(s.gameOver, false); assert.equal(s.pieces, 0);
});

test('gravity falls and locks after 500ms; instant soft drop permits adjustment before locking', () => {
  const r = rig({ settings: { are: 0 } }); r.s.start(0);
  assert.equal(r.s.settings.gravity, 1 / 60);
  r.s.update(999); assert.equal(E.bounds(r.s.handler.active).minY, 20);
  r.s.update(1000); assert.equal(E.bounds(r.s.handler.active).minY, 19);
  r.s.update(20499); assert.equal(r.s.pieces, 0);
  r.s.update(20500); assert.equal(r.s.pieces, 1);
  const { s, tap } = rig({ settings: { are: 0, sdf: 41 } }); s.start(0); tap('softDrop');
  assert.equal(E.bounds(s.handler.active).minY, 0); assert.equal(s.pieces, 0);
  const deadline = s.handler.lockAt; tap('right'); assert.ok(s.handler.lockAt > deadline);
  s.update(s.handler.lockAt); assert.equal(s.pieces, 1);
});

test('grounded movement/rotation can extend lock delay at most fifteen times', () => {
  const { s, tap } = rig({ rng: () => .99999, settings: { are: 0, sdf: 41 } });
  s.start(0); tap('hold'); tap('softDrop'); // O stays grounded through every turn.
  for (let i = 0; i < 15; i++) { s.update(s.handler.time + 20); tap('cw'); }
  assert.equal(s.handler.lockResets, 15);
  const deadline = s.handler.lockAt;
  tap('cw'); assert.equal(s.handler.lockAt, deadline);
  s.update(deadline); assert.equal(s.pieces, 1);
});

test('ledge recontact by movement, soft drop or gravity cannot bypass the fifteen-reset budget', () => {
  for (const action of ['right', 'softDrop', 'gravity']) for (const expired of [false, true]) {
    const { s, tap, events } = rig({ rng: () => .99999, settings: { are: 0, sdf: 41 } });
    s.start(0); tap('hold'); s.handler.board.set(5, 0, 'J'); tap('softDrop');
    for (let i = 0; i < 15; i++) { s.update(s.handler.time + 20); tap('cw'); }
    const deadline = s.handler.lockAt;
    assert.equal(s.handler.lockResets, 15);
    tap('left'); // O loses its one-cell support without descending yet.
    assert.ok(E.movePiece(s.handler.board, s.handler.active, 0, -1));
    assert.equal(s.handler.lockAt, Infinity);
    if (expired) s.update(deadline + 50);
    assert.equal(s.pieces, 0, 'an airborne piece must not lock at the old deadline');
    if (action === 'gravity') {
      const fallAt = s.handler.fallAt;
      s.update(fallAt);
      assert.equal(s.pieces, 1);
      assert.equal(events.find(e => e.kind === 'result').result.t, fallAt);
    } else {
      const contactAt = s.handler.time + 1;
      tap(action);
      if (expired) {
        assert.equal(s.pieces, 1, 'expired budget locks immediately on recontact');
        assert.equal(events.find(e => e.kind === 'result').result.t, contactAt);
      } else {
        assert.equal(s.handler.lockResets, 15);
        assert.equal(s.handler.lockAt, deadline);
        s.update(deadline - 1); assert.equal(s.pieces, 0);
        s.update(deadline); assert.equal(s.pieces, 1);
      }
    }
  }
});

test('pause preserves the airborne gravity interval when releasing inputs keeps the same fall rate', () => {
  for (const action of [null, 'left', 'softDrop']) {
    const { s } = rig({ settings: { are: 0, sdf: 1 } }); s.start(0);
    if (action) s.keyDown(action, 100);
    const deadline = s.handler.fallAt, pauseAt = deadline - 100;
    s.pause(pauseAt);
    const active = { ...s.handler.active };
    s.handler.releaseAll(pauseAt); s.update(pauseAt + 1000);
    s.handler.releaseAll(pauseAt + 1000); // The app also releases on resume.
    assert.equal(s.handler.fallAt, deadline);
    assert.equal(s.handler.held.size, 0); assert.deepEqual(s.handler.active, active);
    s.resume(pauseAt + 1000);
    s.update(deadline + 999); assert.deepEqual(s.handler.active, active);
    s.update(deadline + 1000); assert.equal(s.handler.active.y, active.y - 1);
    assert.equal(s.elapsed(deadline + 1000), deadline);
  }
});

test('a blocked hold spawn ends play without a placement or another piece announcement', () => {
  const { s, ready, tap, events } = rig({ rng: () => .99999 }); s.start(0); ready();
  s.handler.board.set(4, 21, 'J'); tap('hold');
  assert.equal(s.gameOver, true); assert.equal(s.reason, 'blockout'); assert.equal(s.pieces, 0);
  assert.equal(s.handler.pending, null);
  assert.equal(events.filter(e => e.kind === 'spawn').length, 1);
});

test('pause freezes lock delay, gravity and elapsed time; updates are independent of frame cadence', () => {
  const replay = step => {
    const { s, events, tap } = rig({ settings: { are: 0, sdf: 41 } }); s.start(0); tap('softDrop');
    s.pause(100); s.handler.releaseAll(100); s.update(1100);
    assert.equal(s.elapsed(1100), 100); assert.equal(s.pieces, 0);
    s.resume(1100);
    assert.equal(s.handler.lockAt, 1501);
    for (let t = 1100 + step; t < 3000; t += step) s.update(t);
    s.update(3000);
    return { snapshot: s.snapshot(3000), rows: s.handler.board.rows, active: s.handler.active, events };
  };
  const one = replay(1);
  assert.deepEqual(replay(16), one); assert.deepEqual(replay(1000), one);
  assert.equal(one.snapshot.pieces, 1); assert.equal(one.snapshot.elapsed, 2000);
  assert.equal(one.snapshot.pps, .5);
});
