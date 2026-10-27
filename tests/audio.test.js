'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');
const A = require('../src/audio.js');

function session(options = {}) {
  const events = [];
  const s = new E.DrillSession({ time: 0, clock: () => 0, seed: 'cue-tests',
    settings: { are: 10 }, ...options, onEvent: event => events.push(structuredClone(event)) });
  return { s, events, spawns: () => events.filter(e => e.kind === 'spawn') };
}
function ready(s) { if (s.handler.pending) s.update(s.handler.pending.at); }
function lock(s, waste = false) {
  ready(s);
  let t = s.handler.time + 1;
  const tap = action => { s.keyDown(action, t++); s.keyUp(action, t++); };
  if (waste) { tap('cw'); tap('ccw'); }
  for (const action of s.round.target.actions) {
    const direction = { dasLeft: 'left', dasRight: 'right' }[action];
    if (!direction) tap(action);
    else {
      s.keyDown(direction, t);
      t += s.settings.das + s.settings.dcd + 1; s.update(t);
      s.keyUp(direction, t++);
    }
  }
  tap('hardDrop');
}

test('cue selection uses the spawn snapshot for NEXT/current and is silent for off or no draw', () => {
  const event = { kind: 'spawn', type: 'I', nextType: 'T', queueDrawn: true };
  assert.equal(A.selectCue(event), 'T');
  assert.equal(A.selectCue(event, 'current'), 'I');
  for (const timing of ['off', 'bad', null]) assert.equal(A.selectCue(event, timing), null);
  for (const timing of ['next', 'current']) {
    for (const invalid of [null, { ...event, kind: 'hold' }, { ...event, queueDrawn: false }]) {
      assert.equal(A.selectCue(invalid, timing), null);
    }
  }
  assert.equal(A.selectCue({ ...event, nextType: undefined }), null);
  assert.equal(A.selectCue({ ...event, type: 'bad' }, 'current'), null);
});

test('drill and sprint capture the new first NEXT at spawn, independently of later queue changes', () => {
  for (const sprintLength of [0, 3]) {
    const { s, spawns } = session({ sprintLength }); s.start(0);
    assert.equal(spawns().length, 0); ready(s);
    const first = spawns()[0], next = s.bag.peek(1)[0];
    assert.equal(A.selectCue(first), next);
    assert.equal(A.selectCue(first, 'current'), s.handler.active.type);
    s.skip(11); ready(s);
    assert.equal(A.selectCue(spawns()[1], 'current'), next);
    assert.equal(A.selectCue(spawns()[1]), s.nextQueue(1)[0]);
    // Queued UI events must not consult the now-advanced live bag.
    assert.equal(A.selectCue(first), next);
  }
});

test('empty hold cues the drawn piece; occupied hold swaps and repeated hold presses stay silent', () => {
  const { s, spawns } = session(); s.start(0); ready(s);
  const held = s.handler.active.type, incoming = s.bag.peek(1)[0];
  s.keyDown('hold', 11); s.keyUp('hold', 12);
  assert.equal(spawns().length, 2);
  assert.equal(A.selectCue(spawns()[1], 'current'), incoming);
  assert.equal(A.selectCue(spawns()[1]), s.bag.peek(1)[0]);
  s.keyDown('hold', 13); s.keyUp('hold', 14);
  assert.equal(spawns().length, 2);
  s.skip(15); ready(s);
  const queue = s.bag.peek(5);
  s.keyDown('hold', 26); s.keyUp('hold', 27);
  const swap = spawns().at(-1);
  assert.equal(swap.type, held);
  assert.deepEqual(s.bag.peek(5), queue);
  assert.equal(A.selectCue(swap), null);
  assert.equal(A.selectCue(swap, 'current'), null);
});

test('buffered empty/full IHS produces one cue for the draw, including the final active piece', () => {
  for (const held of [null, 'T']) {
    const { s, spawns } = session({ settings: { are: 10, ihs: true } });
    s.handler.heldPiece = held; s.start(0);
    s.keyDown('hold', 1); s.keyUp('hold', 2); ready(s);
    assert.equal(spawns().length, 1);
    assert.equal(A.selectCue(spawns()[0]), s.bag.peek(1)[0]);
    assert.equal(A.selectCue(spawns()[0], 'current'), s.handler.active.type);
    if (held) assert.equal(s.handler.active.type, held);
  }
});

test('retry and automatic repeats do not advance or re-announce NEXT; an unspawned draw is retained', () => {
  const { s, spawns } = session(); s.start(0); s.retry(1); ready(s);
  assert.equal(spawns().length, 1); assert.ok(A.selectCue(spawns()[0]));
  const queue = s.bag.peek(5);
  s.retry(12); ready(s);
  assert.deepEqual(s.bag.peek(5), queue);
  assert.equal(A.selectCue(spawns().at(-1)), null);
  for (const options of [{ zeroFault: true }, { repeatOnFault: true }]) {
    const r = session(options); r.s.start(0); lock(r.s, true);
    assert.equal(r.s.lastResult.status, 'fault'); ready(r.s);
    assert.equal(A.selectCue(r.spawns().at(-1)), null);
  }
  const r = session(); r.s.start(0); ready(r.s);
  // Force a real miss by dropping at a different occupied-left column.
  const target = r.s.round.target.x;
  const direction = target < 4 ? 'right' : 'left';
  r.s.keyDown(direction, 11); r.s.update(500); r.s.keyUp(direction, 501);
  r.s.keyDown('hardDrop', 502); r.s.keyUp('hardDrop', 503);
  assert.equal(r.s.lastResult.status, 'miss'); ready(r.s);
  assert.equal(A.selectCue(r.spawns().at(-1)), null);
});

test('pause defers cues, blockout never cues, sprint finish never draws, and restart announces afresh', () => {
  const paused = session(); paused.s.start(0); paused.s.pause(5); paused.s.update(100);
  assert.equal(paused.spawns().length, 0);
  paused.s.resume(105); ready(paused.s);
  assert.equal(paused.spawns().length, 1); assert.ok(A.selectCue(paused.spawns()[0]));
  const blocked = session(); blocked.s.start(0);
  for (const [x, y] of E.cells(E.spawnPiece(blocked.s.round.type))) blocked.s.handler.board.set(x, y);
  ready(blocked.s); assert.equal(blocked.s.handler.blocked, true);
  assert.equal(blocked.spawns().length, 0); assert.equal(blocked.s.cueDrawPending, false);
  const finished = session({ sprintLength: 1 }); finished.s.start(0); lock(finished.s);
  assert.equal(finished.s.running, false); assert.equal(finished.spawns().length, 1);
  assert.equal(finished.s.handler.pending, null); finished.s.update(10000);
  assert.equal(finished.spawns().length, 1);
  const restarted = session(); restarted.s.start(0); ready(restarted.s);
  assert.ok(A.selectCue(restarted.spawns()[0]));
});

test('lesson try-it target starts once at ARE=0 and target replacement retains the pending draw', () => {
  const { s, spawns } = session({ pieces: ['T'], settings: { are: 0 } });
  const target = E.placementFor('T', { rot: 1, x: 0 });
  s.start(0, target);
  assert.equal(s.round.target.key, target.key);
  assert.equal(spawns().length, 1); assert.equal(A.selectCue(spawns()[0]), 'T');
  const pending = session({ pieces: ['O'] }); pending.s.start(0);
  pending.s._newRound('O', E.placementFor('O', { rot: 0, x: 4 })); pending.s._schedule(1); ready(pending.s);
  assert.equal(pending.spawns().length, 1); assert.equal(A.selectCue(pending.spawns()[0]), 'O');
});

function audioRig({ state = 'running', resumeError = false } = {}) {
  const options = { sound: true, volume: .3, pieceCueVolume: 60 }, contexts = [];
  class Param {
    constructor() { this.value = 0; this.events = []; }
  }
  for (const method of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime', 'cancelAndHoldAtTime']) {
    Param.prototype[method] = function (...args) { this.events.push([method, ...args]); };
  }
  class Node {
    constructor() { this.gain = new Param(); this.frequency = new Param(); this.stops = []; }
    connect(to) { this.to = to; }
    disconnect() { this.disconnected = true; }
    start(t) { this.startAt = t; }
    stop(t) { this.stops.push(t); }
  }
  class Audio {
    constructor() { this.state = state; this.currentTime = 1; this.destination = {}; this.gains = []; this.oscillators = []; this.resumes = 0; contexts.push(this); }
    createGain() { const node = new Node(); this.gains.push(node); return node; }
    createOscillator() { const node = new Node(); this.oscillators.push(node); return node; }
    resume() { this.resumes++; return resumeError ? Promise.reject(new Error('blocked')) : Promise.resolve(); }
  }
  const audio = A.createAudioEngine(() => options, () => Audio);
  return { audio, options, contexts };
}

test('seven original cues have distinct motifs, soft attacks and bounded 80–160ms duration', () => {
  assert.deepEqual(Object.keys(A.CUES), E.PIECE_TYPES);
  assert.equal(new Set(Object.values(A.CUES).map(JSON.stringify)).size, 7);
  for (const type of E.PIECE_TYPES) {
    const r = audioRig(); r.audio.unlock(); r.audio.piece(type);
    const c = r.contexts[0], duration = Math.max(...c.oscillators.map(o => o.stops[0] - 1));
    assert.ok(duration >= .08 && duration <= .16, type);
    for (const oscillator of c.oscillators) {
      assert.ok(['sine', 'triangle'].includes(oscillator.type));
      assert.equal(oscillator.to.to, c.gains[1]);
      const envelope = oscillator.to.gain.events;
      assert.deepEqual(envelope[0], ['setValueAtTime', 0, oscillator.startAt]);
      assert.ok(envelope[1][2] - oscillator.startAt >= .0049);
      assert.deepEqual(envelope.at(-1), ['linearRampToValueAtTime', 0, oscillator.stops[0]]);
      oscillator.onended();
      assert.equal(oscillator.disconnected, true); assert.equal(oscillator.to.disconnected, true);
    }
  }
});

test('audio context is lazy and reused; previews respect live master and cue volume independently', () => {
  const r = audioRig(); r.audio.piece('T'); r.audio.sound('perfect');
  assert.equal(r.contexts.length, 0);
  r.audio.unlock(); r.audio.unlock(); assert.equal(r.contexts.length, 1);
  const c = r.contexts[0]; r.audio.piece('I');
  assert.equal(c.oscillators.length, 1);
  assert.deepEqual(c.gains[0].gain.events.at(-1), ['setTargetAtTime', .3, 1, .004]);
  assert.deepEqual(c.gains[1].gain.events.at(-1), ['setTargetAtTime', .6, 1, .004]);
  r.options.sound = false; r.audio.configure(); r.audio.piece('O'); r.audio.sound('fault');
  assert.equal(c.oscillators.length, 1); assert.equal(c.gains[0].gain.events.at(-1)[1], 0);
  r.options.sound = true; r.options.volume = 0; r.audio.piece('O');
  assert.equal(c.oscillators.length, 1);
  r.options.volume = .8; r.options.pieceCueVolume = 0; r.audio.piece('O');
  assert.equal(c.oscillators.length, 1);
  r.audio.sound('perfect'); assert.equal(c.oscillators.length, 4);
  assert.equal(c.oscillators[1].to.to, c.gains[0]);
  r.options.pieceCueVolume = 100; r.audio.piece('L');
  assert.equal(c.gains[1].gain.events.at(-1)[1], 1);
  // Timing=off disables automatic selection, but explicit previews still work.
  r.options.pieceCueTiming = 'off'; r.audio.piece('J');
  assert.equal(c.oscillators.length, 8);
  r.audio.piece('bad'); assert.equal(c.oscillators.length, 8);
});

test('fast cue replacement and pause cancel old voices with a short fade; ended nodes disconnect', () => {
  const r = audioRig(); r.audio.unlock(); r.audio.piece('L');
  const c = r.contexts[0], old = c.oscillators.slice();
  r.audio.piece('I');
  for (const voice of old) {
    assert.equal(voice.stops.at(-1), 1.012);
    assert.deepEqual(voice.to.gain.events.at(-1), ['setTargetAtTime', 0, 1, .002]);
    voice.onended();
  }
  r.audio.stopCues(); assert.equal(c.oscillators.at(-1).stops.at(-1), 1.012);
});

test('suspended first previews schedule without awaiting resume; rejected resume and unsupported audio stay safe', async () => {
  const r = audioRig({ state: 'suspended', resumeError: true });
  r.audio.unlock(); r.audio.unlock(); r.audio.piece('I');
  assert.equal(r.contexts[0].resumes, 1); assert.equal(r.contexts[0].oscillators.length, 1);
  r.audio.sound('fault');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(r.contexts[0].oscillators[0].stops.at(-1), 1.012);
  assert.ok(r.contexts[0].oscillators.every(o => o.stops.at(-1) === 1.012));
  r.audio.piece('O'); r.audio.sound('perfect');
  assert.equal(r.contexts[0].oscillators.length, 3, 'Failed resume must not queue more sounds');
  for (const getAudio of [() => undefined, () => class { constructor() { throw new Error('blocked'); } }]) {
    const a = A.createAudioEngine(() => r.options, getAudio);
    assert.doesNotThrow(() => { a.unlock(); a.piece('I'); a.sound('perfect'); a.stopCues(); a.configure(); });
  }
  const muted = audioRig(); muted.options.sound = false; muted.audio.unlock();
  assert.equal(muted.contexts.length, 0);
});
