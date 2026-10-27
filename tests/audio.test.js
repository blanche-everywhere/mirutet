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

function audioRig({ state = 'running', resumeError = false, hold = true } = {}) {
  const options = { sound: true, volume: .3, pieceCueVolume: 60 }, contexts = [];
  class Param {
    constructor() { this.value = 0; this.events = []; }
  }
  for (const method of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime',
    'cancelScheduledValues', ...(hold ? ['cancelAndHoldAtTime'] : [])]) {
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

function cueSteps(voices) {
  const steps = new Map();
  for (const voice of voices) {
    const offset = voice[2];
    if (!steps.has(offset)) steps.set(offset, []);
    steps.get(offset).push(voice);
  }
  return [...steps.values()].sort((a, b) => a[0][2] - b[0][2])
    .map(partials => ({ partials, root: partials.reduce((a, b) => a[1] < b[1] ? a : b) }));
}
function close(actual, expected, message) { assert.ok(Math.abs(actual - expected) < 1e-9, message); }

test('seven immutable, soft additive cues have distinct immediate pitch signatures on a 60 Hz grid', () => {
  assert.deepEqual(Object.keys(A.CUES), E.PIECE_TYPES);
  assert.ok(Object.isFrozen(A.CUES));
  assert.equal(new Set(Object.values(A.CUES).map(JSON.stringify)).size, 7);
  const firstPitches = [];
  for (const voices of Object.values(A.CUES)) {
    assert.ok(Object.isFrozen(voices));
    assert.ok(voices.length >= 27 && voices.length <= 96, 'bounded finite echo bank');
    assert.equal(Math.min(...voices.map(v => v[2])), 0, 'no delayed recognition');
    firstPitches.push(Math.min(...voices.filter(v => v[2] === 0).map(v => v[1])));
    for (const voice of voices) {
      assert.ok(Object.isFrozen(voice));
      const [wave, hz, offset, duration, attack, level, endHz = hz] = voice;
      assert.equal(wave, 'sine', 'soft additive partials only');
      assert.ok([hz, offset, duration, attack, level, endHz].every(Number.isFinite));
      assert.ok(hz >= 240 && hz <= 8500);
      assert.equal(endHz, hz, 'fixed pitch, no smeared pitch slides');
      assert.ok(offset >= 0 && offset < .9);
      assert.ok(attack > 0 && attack < .001, 'sub-millisecond attack');
      assert.ok(duration >= 1 / 60 && duration <= 4 / 60);
      close(offset * 60, Math.round(offset * 60), 'note onset on the frame grid');
      close(duration * 60, Math.round(duration * 60), 'note length on the frame grid');
      assert.ok(level > 0 && level <= 1);
    }
    for (const { partials, root } of cueSteps(voices)) {
      assert.equal(partials.length, 3, 'one dominant soft tone with two quiet partials');
      for (const partial of partials.filter(v => v !== root)) {
        assert.ok(partial[5] <= root[5] * .25, 'no strong buzzy upper harmonics');
        assert.equal(partial[3], root[3], 'partials stop with the note');
      }
    }
  }
  // Even before a figure's second strike, roots are separated by two semitones.
  firstPitches.sort((a, b) => a - b);
  for (let i = 1; i < firstPitches.length; i++) {
    assert.ok(12 * Math.log2(firstPitches[i] / firstPitches[i - 1]) >= 1.99);
  }
});

test('short original figures have distinct contours and density, with three or four -20 dB passes', () => {
  const designs = {}, durations = {};
  for (const [type, voices] of Object.entries(A.CUES)) {
    const steps = cueSteps(voices), firstLevel = steps[0].root[5], passes = [];
    for (const step of steps) {
      const pass = Math.round(Math.log10(firstLevel / step.root[5]));
      (passes[pass] ||= []).push(step);
    }
    assert.ok(passes.length === 3 || passes.length === 4, type);
    const figure = passes[0], period = figure.at(-1).root[2] + figure.at(-1).root[3];
    assert.ok(period >= .2 - 1e-9 && period <= .25, `${type}: 200–250 ms figure`);
    assert.ok(figure.length >= 3 && figure.length <= 8);
    figure.forEach(({ root }, i) => {
      const [,, start, duration] = root;
      if (i) close(start, figure[i - 1].root[2] + figure[i - 1].root[3], 'adjacent pitch steps');
      close(root[5], firstLevel, 'flat pass level, no per-note swell or decay');
      if (!['I', 'T'].includes(type)) assert.ok(duration >= .05 && duration <= .07, '50–70 ms steps');
    });
    if (['I', 'T'].includes(type)) assert.ok(figure.some(s => s.root[3] <= 2 / 60), 'faster dense figures');
    passes.forEach((pass, index) => {
      assert.equal(pass.length, figure.length, 'echo repeats the complete figure');
      pass.forEach(({ partials }, note) => partials.forEach((voice, p) => {
        const original = figure[note].partials[p];
        assert.equal(voice[1], original[1], 'echo preserves pitch');
        close(voice[2], original[2] + index * period, 'even echo spacing');
        assert.equal(voice[3], original[3], 'echo preserves rhythm');
        close(voice[5] / original[5], .1 ** index, 'exactly -20 dB per repeat');
      }));
    });
    durations[type] = Math.max(...voices.map(v => v[2] + v[3]));
    assert.ok(durations[type] >= .6 - 1e-9 && durations[type] <= .9, 'bounded 600–900 ms cue');
    close(durations[type], period * passes.length, 'no tail or overlapping echo passes');
    const pitches = figure.map(s => s.root[1]);
    designs[type] = pitches.slice(1).map((hz, i) => Math.sign(hz - pitches[i]));
  }
  assert.ok(durations.I > durations.T && durations.O < durations.J, 'bright I longest; dark O shortest');
  assert.deepEqual(designs.S, [1, -1, 1], 'S climbs with a small dip');
  assert.deepEqual(designs.Z, [-1, -1, -1], 'Z tumbles down');
  assert.deepEqual(designs.J, [-1, 1], 'J dips then hops');
  assert.deepEqual(designs.L, [1, 1], 'L climbs in three steps');
  assert.ok(designs.I.length > designs.S.length && designs.T.length > designs.S.length);
});

test('piece envelopes attack instantly, sustain flat steps, end exactly and clean up every node', () => {
  for (const type of E.PIECE_TYPES) {
    const r = audioRig(); r.audio.unlock(); r.audio.piece(type);
    const c = r.contexts[0], duration = Math.max(...c.oscillators.map(o => o.stops[0] - 1));
    assert.equal(c.oscillators.length, A.CUES[type].length);
    assert.ok(duration >= .6 - 1e-9 && duration <= .9, type);
    for (const oscillator of c.oscillators) {
      assert.equal(oscillator.type, 'sine');
      assert.equal(oscillator.to.to, c.gains[1]);
      assert.deepEqual(oscillator.frequency.events, [['setValueAtTime', A.CUES[type][c.oscillators.indexOf(oscillator)][1], oscillator.startAt]], 'pitch is only set, never swept or modulated');
      const envelope = oscillator.to.gain.events;
      assert.deepEqual(envelope[0], ['setValueAtTime', 0, oscillator.startAt]);
      assert.equal(envelope[1][0], 'linearRampToValueAtTime');
      assert.ok(envelope[1][2] - oscillator.startAt > 0);
      assert.ok(envelope[1][2] - oscillator.startAt < .001);
      assert.equal(envelope[2][0], 'setValueAtTime');
      assert.equal(envelope[2][1], envelope[1][1], 'constant level across the step');
      assert.ok(envelope[2][2] - envelope[1][2] > .9 * (oscillator.stops[0] - oscillator.startAt));
      close(oscillator.stops[0] - envelope[2][2], .0005, 'tiny click-suppression release');
      assert.equal(envelope.length, 4, 'no tremolo or hidden decaying ramps');
      assert.deepEqual(envelope.at(-1), ['linearRampToValueAtTime', 0, oscillator.stops[0]]);
      oscillator.onended();
      assert.equal(oscillator.disconnected, true); assert.equal(oscillator.to.disconnected, true);
    }
  }
});

// Numerically render the scheduled sine oscillators and AudioParam ramps, with
// no browser or AudioContext implementation. Render every scheduled note and
// echo, including a silent margin, and measure the first pass separately.
function renderMetrics(oscillators, { offset = 0, duration = .9, sampleRate = 48000 } = {}) {
  function envelopeAt(events, time) {
    let value = 0, at = 0;
    for (const [method, target, end] of events) {
      if (time < end) {
        const u = (time - at) / (end - at);
        if (method === 'linearRampToValueAtTime') return value + (target - value) * u;
        if (method === 'exponentialRampToValueAtTime') return value * (target / value) ** u;
        assert.equal(method, 'setValueAtTime');
        return value;
      }
      value = target; at = end;
    }
    return value;
  }
  const count = Math.round(duration * sampleRate), origin = 1 + offset;
  const samples = new Float64Array(count), bounds = new Float64Array(count);
  for (const oscillator of oscillators) {
    const hz = oscillator.frequency.events[0][1];
    assert.equal(oscillator.type, 'sine');
    assert.equal(oscillator.frequency.events.length, 1, 'constant pitch');
    const first = Math.max(0, Math.ceil((oscillator.startAt - origin) * sampleRate - 1e-8));
    const last = Math.min(count, Math.ceil((oscillator.stops[0] - origin) * sampleRate - 1e-8));
    for (let i = first; i < last; i++) {
      const time = origin + i / sampleRate;
      const amplitude = envelopeAt(oscillator.to.gain.events, time);
      samples[i] += amplitude * Math.sin(2 * Math.PI * hz * (time - oscillator.startAt));
      bounds[i] += amplitude;
    }
  }
  let energy = 0, peak = 0, envelopePeak = 0;
  for (let i = 0; i < count; i++) {
    energy += samples[i] ** 2;
    peak = Math.max(peak, Math.abs(samples[i]));
    envelopePeak = Math.max(envelopePeak, bounds[i]);
  }
  return { rms: Math.sqrt(energy / count), peak, envelopePeak };
}

test('rendered figures stay balanced and below clipping with concurrent feedback; echoes drop 20 dB', () => {
  const cues = E.PIECE_TYPES.map(type => {
    const r = audioRig(); r.options.volume = 1; r.options.pieceCueVolume = 100;
    r.audio.unlock(); r.audio.piece(type);
    const oscillators = r.contexts[0].oscillators, steps = cueSteps(A.CUES[type]);
    const period = steps.find(s => s.root[5] < steps[0].root[5] / 2).root[2];
    const metrics = renderMetrics(oscillators, { duration: period });
    assert.ok(metrics.rms >= .06 && metrics.rms <= .07, `${type}: balanced flat first-pass level`);
    assert.ok(metrics.peak < .16, `${type}: leave mixing headroom`);
    const passCount = type === 'O' ? 3 : 4;
    for (let pass = 1; pass < passCount; pass++) {
      const echo = renderMetrics(oscillators, { offset: pass * period, duration: period });
      close(echo.rms / metrics.rms, .1 ** pass, `${type}: rendered echo level`);
    }
    const silence = renderMetrics(oscillators, { offset: passCount * period, duration: .05 });
    assert.equal(silence.peak, 0, `${type}: exact silence after the final echo`);
    return metrics;
  });
  const levels = cues.map(m => m.rms);
  assert.ok(20 * Math.log10(Math.max(...levels) / Math.min(...levels)) < 1, 'motif RMS spread below 1 dB');
  const feedback = ['perfect', 'fault', 'other'].map(kind => {
    const r = audioRig(); r.audio.unlock(); r.audio.sound(kind);
    const c = r.contexts[0], metrics = renderMetrics(c.oscillators, { duration: .12 });
    for (const oscillator of c.oscillators) {
      assert.equal(oscillator.to.to, c.gains[0], 'feedback bypasses cue volume');
      assert.ok(oscillator.stops[0] - 1 <= .100001, 'feedback uses the same short articulation');
      assert.ok(oscillator.to.gain.events[1][2] - oscillator.startAt <= .002);
    }
    assert.ok(metrics.rms > .008 && metrics.rms < Math.min(...levels), 'feedback supports the piece cue');
    return metrics;
  });
  // Sum absolute envelopes for a phase-independent bound, allowing another
  // cue AND feedback to overlap while their predecessors fade out.
  const cueBound = Math.max(...cues.map(m => m.envelopePeak));
  const feedbackBound = Math.max(...feedback.map(m => m.envelopePeak));
  assert.ok(2 * (cueBound + feedbackBound) < .6, 'ample headroom even during replacement');
});

test('audio context is lazy and reused; previews respect live master and cue volume independently', () => {
  const r = audioRig(); r.audio.piece('T'); r.audio.sound('perfect');
  assert.equal(r.contexts.length, 0);
  r.audio.unlock(); r.audio.unlock(); assert.equal(r.contexts.length, 1);
  const c = r.contexts[0]; r.audio.piece('I');
  assert.equal(c.gains[0].gain.value, .3, 'initial master level preserves the first attack');
  assert.equal(c.gains[1].gain.value, .6, 'initial cue level preserves the first attack');
  let count = A.CUES.I.length;
  assert.equal(c.oscillators.length, count);
  assert.deepEqual(c.gains[0].gain.events.at(-1), ['setTargetAtTime', .3, 1, .004]);
  assert.deepEqual(c.gains[1].gain.events.at(-1), ['setTargetAtTime', .6, 1, .004]);
  r.options.sound = false; r.audio.configure(); r.audio.piece('O'); r.audio.sound('fault');
  assert.equal(c.oscillators.length, count); assert.equal(c.gains[0].gain.events.at(-1)[1], 0);
  r.options.sound = true; r.options.volume = 0; r.audio.piece('O');
  assert.equal(c.oscillators.length, count);
  r.options.volume = .8; r.options.pieceCueVolume = 0; r.audio.piece('O');
  assert.equal(c.oscillators.length, count);
  r.audio.sound('perfect'); assert.ok(c.oscillators.length > count);
  assert.equal(c.oscillators[count].to.to, c.gains[0]);
  count = c.oscillators.length;
  r.options.pieceCueVolume = 100; r.audio.piece('L');
  count += A.CUES.L.length;
  assert.equal(c.gains[1].gain.events.at(-1)[1], 1);
  // Timing=off disables automatic selection, but explicit previews still work.
  r.options.pieceCueTiming = 'off'; r.audio.piece('J');
  count += A.CUES.J.length;
  assert.equal(c.oscillators.length, count);
  r.audio.piece('bad'); assert.equal(c.oscillators.length, count);
});

test('replacement and pause cancel every future note/echo immediately and fade sounding voices', () => {
  for (const hold of [true, false]) {
    const r = audioRig({ hold }); r.audio.unlock(); r.audio.piece('T');
    const c = r.contexts[0];
    // Replace just before a step: its onset falls INSIDE the 12 ms fade window.
    // With GainNode's real default of 1, holding future automation is unsafe.
    c.currentTime += .048;
    for (const oscillator of c.oscillators) {
      if (oscillator.stops[0] <= c.currentTime) oscillator.onended();
      else oscillator.to.gain.value = oscillator.startAt > c.currentTime ? 1 : .037;
    }
    const old = c.oscillators.filter(o => !o.disconnected);
    assert.ok(old.some(o => o.startAt > c.currentTime && o.startAt < c.currentTime + .012));
    assert.ok(old.some(o => o.startAt > 1.6), 'include quiet future echoes');
    r.audio.sound('perfect');
    const feedback = c.oscillators.slice(A.CUES.T.length);
    r.audio.piece('I');
    for (const voice of old) {
      const t = c.currentTime;
      if (voice.startAt >= t) {
        assert.equal(voice.stops.at(-1), t, 'future echo stopped before it can start');
        assert.deepEqual(voice.to.gain.events.slice(-2), [['cancelScheduledValues', t], ['setValueAtTime', 0, t]]);
        assert.ok(voice.disconnected && voice.to.disconnected, 'no pending echo nodes');
      } else {
        close(voice.stops.at(-1), t + .012, 'short fade for sounding partials');
        const tail = voice.to.gain.events.slice(hold ? -2 : -3);
        assert.deepEqual(tail[0], [hold ? 'cancelAndHoldAtTime' : 'cancelScheduledValues', t]);
        if (!hold) assert.deepEqual(tail[1], ['setValueAtTime', .037, t], 'fallback preserves current gain');
        assert.deepEqual(tail.at(-1), ['setTargetAtTime', 0, t, .002]);
      }
      voice.onended();
      assert.ok(voice.disconnected && voice.to.disconnected);
    }
    r.audio.stopCues();
    for (const voice of c.oscillators.slice(A.CUES.T.length + feedback.length)) {
      assert.equal(voice.stops.at(-1), c.currentTime, 'immediate cancellation before first sample');
    }
    assert.ok(feedback.every(o => o.stops.length === 1), 'piece cancellation leaves feedback alone');
  }
});

test('60 Hz spawns keep only the new cue scheduled and release all nodes on completion or suspension', () => {
  const r = audioRig(); r.audio.unlock();
  const c = r.contexts[0];
  const finishDue = () => {
    for (const oscillator of c.oscillators) {
      if (!oscillator.ended && oscillator.stops.at(-1) <= c.currentTime) {
        oscillator.ended = true; oscillator.onended();
      }
    }
  };
  for (let frame = 0; frame < 60; frame++) {
    c.currentTime = 1 + frame / 60;
    finishDue();
    const type = E.PIECE_TYPES[frame % 7];
    r.audio.piece(type);
    assert.ok(c.oscillators.filter(o => !o.disconnected).length <= A.CUES[type].length + 3,
      'new cue plus at most one fading note; no surviving old echoes');
  }
  c.currentTime += 1; finishDue();
  assert.ok(c.oscillators.every(o => o.disconnected && o.to.disconnected));
  const stops = c.oscillators.map(o => o.stops.length);
  r.audio.stopCues();
  assert.deepEqual(c.oscillators.map(o => o.stops.length), stops, 'ended nodes removed from cancellation lists');
  r.audio.piece('I'); c.currentTime += .008; c.state = 'suspended';
  r.audio.stopCues();
  assert.ok(c.oscillators.every(o => o.disconnected && o.to.disconnected), 'suspended clocks retain no attached voices');
});

test('suspended first previews schedule without awaiting resume; rejected resume and unsupported audio stay safe', async () => {
  const r = audioRig({ state: 'suspended', resumeError: true });
  r.audio.unlock(); r.audio.unlock(); r.audio.piece('I');
  assert.equal(r.contexts[0].resumes, 1); assert.equal(r.contexts[0].oscillators.length, A.CUES.I.length);
  r.audio.sound('fault');
  const count = r.contexts[0].oscillators.length;
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(r.contexts[0].oscillators.every(o => o.stops.at(-1) === 1));
  assert.ok(r.contexts[0].oscillators.every(o => o.disconnected && o.to.disconnected));
  r.audio.piece('O'); r.audio.sound('perfect');
  assert.equal(r.contexts[0].oscillators.length, count, 'Failed resume must not queue more sounds');
  for (const getAudio of [() => undefined, () => class { constructor() { throw new Error('blocked'); } }]) {
    const a = A.createAudioEngine(() => r.options, getAudio);
    assert.doesNotThrow(() => { a.unlock(); a.piece('I'); a.sound('perfect'); a.stopCues(); a.configure(); });
  }
  const muted = audioRig(); muted.options.sound = false; muted.audio.unlock();
  assert.equal(muted.contexts.length, 0);
});
