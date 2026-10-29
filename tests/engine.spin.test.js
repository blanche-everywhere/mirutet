'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine');
const stateKey = s => [s.x, s.y, s.rot].join(',');

test('expanded catalog preserves the original four sets and all saved progress', () => {
  const legacy = require('./spin-legacy.json');
  assert.deepEqual(E.SPIN_SETS.slice(0, 4), legacy);
  assert.equal(E.SPIN_DRILLS.length, 36);
  assert.equal(E.SPIN_SETS.length, 8);
  assert.equal(new Set(E.SPIN_DRILLS.map(d => d.id)).size, 36);
  const completed = legacy.flatMap(s => s.drills.map(d => d.id));
  for (const current of completed) assert.deepEqual(E.normalizeSpinProgress({ current, completed }), { current, completed });
  const layouts = new Set();
  for (const d of E.SPIN_DRILLS) {
    assert.ok(d.rows.every(r => /^[.#]{10}$/.test(r)), d.id);
    const layout = JSON.stringify([d.type, d.rows, d.cells]);
    assert.ok(!layouts.has(layout), `Duplicate board/target: ${d.id}`);
    layouts.add(layout);
  }
});

test('new hint routes exercise downward, sideways and upward kicks, without 180', () => {
  const entries = {};
  for (const d of E.SPIN_DRILLS.slice(14)) {
    const board = E.spinBoard(d), route = E.solveSpinDrill(d, { allow180: false });
    let state = E.spawnPiece(d.type), before;
    for (const action of route) {
      before = state;
      state = action === 'floor' ? E.hardDrop(board, state) : action === 'softDrop' ?
        E.movePiece(board, state, 0, -1) : E.applyAction(board, state, action, { allow180: false });
    }
    assert.ok(E.sameCells(E.cells(state), d.cells), d.id);
    entries[d.id] = { dx: state.x - before.x, dy: state.y - before.y };
    assert.ok(entries[d.id].dx || entries[d.id].dy, `${d.id}: hint must demonstrate a kick`);
  }
  for (const id of ['s-pocket', 'z-pocket', 's-triple', 'z-triple']) assert.equal(entries[id].dy, -2, id);
  for (const id of ['l-shelf', 'j-shelf', 'i-shelf-left', 'i-shelf-right']) {
    assert.equal(entries[id].dy, 0, id); assert.equal(Math.abs(entries[id].dx), 1, id);
  }
  for (const id of ['i-lift-left', 'i-lift-right']) assert.equal(entries[id].dy, 2, id);
});

// Exhaust the complete reachable graph, including deliberate descent, hard
// drops, both directions, and optionally 180. Do not use the hint solver here.
function audit(drill, options) {
  const board = E.spinBoard(drill), start = E.spawnPiece(drill.type, { board, ...options });
  const queue = [start], seen = new Set([stateKey(start)]);
  let rotations = 0, translations = 0, kicks = 0, fifthKicks = 0;
  for (let head = 0; head < queue.length; head++) {
    const state = queue[head];
    const actions = ['left', 'right', 'down', 'drop', 'cw', 'ccw', ...(options.allow180 ? ['rotate180'] : [])];
    for (const action of actions) {
      const next = action === 'down' ? E.movePiece(board, state, 0, -1) : action === 'drop' ? E.hardDrop(board, state) : E.applyAction(board, state, action, options);
      if (!next || stateKey(state) === stateKey(next)) continue;
      if (E.sameCells(E.cells(next), drill.cells)) {
        if (['cw', 'ccw', 'rotate180'].includes(action)) {
          rotations++;
          const tests = E.kickTests(drill.type, state.rot, next.rot);
          const index = tests.findIndex(([x, y]) => x === next.x - state.x && y === next.y - state.y);
          if (index > 0) kicks++;
          if (index === 4 && action !== 'rotate180') fifthKicks++;
        } else translations++;
      }
      if (!seen.has(stateKey(next))) { seen.add(stateKey(next)); queue.push(next); }
    }
  }
  return { rotations, translations, kicks, fifthKicks };
}

for (const drill of E.SPIN_DRILLS) test(`SRS insertion: ${drill.id} — rotation required in every reachable path`, () => {
  const board = E.spinBoard(drill);
  assert.ok(board.fits(drill.target));
  assert.equal(E.movePiece(board, drill.target, 0, -1), null, 'Target must be grounded');
  assert.equal(board.clone().clearLines(), 0, 'Preset has no pre-completed lines');
  const locked = board.clone(); locked.lock(drill.target);
  assert.equal(locked.clearLines(), drill.lines, 'Named single/double/triple has the advertised clear');
  for (const allow180 of [false, true]) for (const spawnDrop of [false, true]) {
    const report = audit(drill, { allow180, spawnDrop });
    assert.ok(report.rotations > 0, 'Spawn can reach target through SRS');
    assert.ok(report.kicks > 0, 'A real kick can insert the piece');
    assert.equal(report.translations, 0, 'No path can end with a shift, fall or positive-distance hard drop');
    if (drill.id.startsWith('t-triple')) assert.ok(report.fifthKicks > 0, 'TST uses the fifth quarter-turn kick');
  }
});

function playSolution(session, t = 0) {
  const actions = E.solveSpinDrill(session.drill, session.settings);
  for (const action of actions) {
    if (action === 'floor') {
      while (E.movePiece(session.handler.board, session.handler.active, 0, -1)) {
        session.keyDown('softDrop', ++t); session.keyUp('softDrop', ++t);
      }
    } else { session.keyDown(action, ++t); session.keyUp(action, ++t); }
  }
  session.keyDown('hardDrop', ++t); session.keyUp('hardDrop', ++t);
  return t;
}

for (const drill of E.SPIN_DRILLS) test(`real inputs solve and judge ${drill.id}`, () => {
  for (const spawnDrop of [false, true]) {
    const totals = new E.Stats(), events = [];
    const session = new E.SpinSession({ drillId: drill.id, time: 0, totalStats: totals,
      settings: { are: 0, sdf: 1, allow180: false, spawnDrop }, onEvent: e => events.push(e) });
    session.start(0);
    const t = playSolution(session);
    assert.equal(session.lastResult.status, 'perfect');
    assert.equal(session.lastResult.lastMove, 'rotation');
    assert.equal(session.lastResult.lines, drill.lines);
    assert.equal(session.awaitingNext, true); assert.equal(session.handler.active, null);
    assert.equal(session.stats.perfect, 1); assert.equal(totals.perfect, 1);
    assert.equal(events.filter(e => e.kind === 'result').length, 1);
    session.retry(t + 1);
    assert.equal(session.drill.id, drill.id); assert.equal(session.lastResult, null);
    assert.deepEqual(session.handler.board.rows, E.spinBoard(drill).rows);
    assert.equal(session.combo.count, 0);
    session.skip(t + 2); assert.notEqual(session.drill.id, drill.id);
    assert.deepEqual(events.filter(e => e.kind === 'spawn').map(e => e.queueDrawn), [true, false, true], 'Retry does not advance the audio cue');
  }
});

test('spin judge requires exact cells and last successful move, independently of input count', () => {
  const drill = E.SPIN_DRILLS[0], lock = { type: drill.type, cells: drill.cells, used: 999, lastMove: 'rotation' };
  assert.equal(E.judgeSpinPlacement(lock, drill).status, 'perfect');
  for (const lastMove of [null, 'shift', 'drop', 'fall']) {
    const result = E.judgeSpinPlacement({ ...lock, lastMove }, drill);
    assert.equal(result.status, 'miss'); assert.equal(result.reason, 'rotation');
  }
  assert.equal(E.judgeSpinPlacement({ ...lock, cells: drill.cells.map(([x, y]) => [x + 1, y]) }, drill).reason, 'position');
});

test('input handler tracks successful moves, including IRS, gravity, DAS, drops and failed inputs', () => {
  let result;
  const handler = new E.InputHandler({ time: 0, autoNext: false, settings: { are: 0, das: 10, arr: 0 }, onLock: r => { result = r; } });
  handler.spawn('T', 0); handler.keyDown('cw', 1); handler.keyUp('cw', 2);
  assert.equal(handler.lastMove, 'rotation');
  handler.keyDown('left', 3); handler.update(20); handler.keyUp('left', 21);
  assert.equal(handler.lastMove, 'shift');
  handler.keyDown('cw', 22); handler.keyUp('cw', 23); handler.keyDown('hardDrop', 24);
  assert.equal(result.lastMove, 'drop', 'Positive-distance hard drop invalidates rotation');
  handler.keyUp('hardDrop', 25); handler.spawn('T', 26);
  assert.equal(handler.lastMove, null, 'New piece resets history');
  handler.keyDown('cw', 27); handler.setSettings({ gravity: 1 }, 28); handler.update(50);
  assert.equal(handler.lastMove, 'fall');
  const board = new E.Board(); for (let x = 0; x < 10; x++) board.set(x, 0);
  const h = new E.InputHandler({ board, time: 0, autoNext: false, settings: { sdf: 41 }, onLock: r => { result = r; } });
  h.spawn('T', 0); h.keyDown('softDrop', 1); h.keyUp('softDrop', 2);
  h.keyDown('cw', 3); h.keyUp('cw', 4);
  // Fill every empty cell except the active piece, so attempted movements fail.
  const active = E.cells(h.active);
  for (let y = 0; y < 5; y++) for (let x = 0; x < 10; x++) if (!active.some(c => c[0] === x && c[1] === y)) board.set(x, y);
  h.keyDown('ccw', 5); h.keyUp('ccw', 6); h.keyDown('left', 7); h.keyUp('left', 8);
  h.keyDown('softDrop', 9); h.keyUp('softDrop', 10); h.keyDown('hardDrop', 11);
  assert.equal(result.lastMove, 'rotation', 'Failed moves and zero-distance lock preserve rotation');
  const irs = new E.InputHandler({ time: 0, autoNext: false, settings: { are: 100 } });
  irs.scheduleSpawn('T', 0, 100); irs.keyDown('cw', 10); irs.update(100);
  assert.equal(irs.lastMove, 'rotation');
});

test('spin progress normalizes stale or malformed IDs and deduplicates completed drills', () => {
  const id = E.SPIN_DRILLS[0].id;
  assert.deepEqual(E.normalizeSpinProgress({ current: 'stale', completed: [id, id, 'bad', 0, null] }), { current: id, completed: [id] });
  for (const value of [null, false, [], { completed: {} }]) assert.deepEqual(E.normalizeSpinProgress(value), { current: id, completed: [] });
});


test('mini presets have three occupied pivot corners and one front corner; full T spins have both fronts', () => {
  for (const drill of E.SPIN_DRILLS.filter(d => d.type === 'T')) {
    const board = E.spinBoard(drill), { x, y, rot } = drill.target;
    const corners = [[x, y], [x + 2, y], [x + 2, y + 2], [x, y + 2]];
    const occupied = corners.map(([cx, cy]) => !board.inside(cx, cy) || !!board.get(cx, cy));
    const fronts = [[2, 3], [1, 2], [0, 1], [0, 3]][rot];
    assert.ok(occupied.filter(Boolean).length >= 3, drill.id);
    assert.equal(fronts.filter(i => occupied[i]).length, drill.id.startsWith('t-mini') ? 1 : 2, drill.id);
  }
});
