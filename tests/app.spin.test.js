'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const E = require('../src/engine');
const M = require('../src/mascot');
const A = require('../src/audio');

// Exercise real app input/events with DOM sinks and observed audio calls.
// Chrome checks cover native focus, canvas rendering and geometry.
function loadApp(profile = {}) {
  let time = 0, frame, overlay = false;
  const listeners = new Map(), nodes = new Map(), sounds = [], cues = [], combos = [], values = new Map();
  const node = () => ({ innerHTML: '', textContent: '', dataset: {}, style: {}, hidden: false,
    focus() {}, classList: { add() {}, remove() {} }, getBoundingClientRect: () => ({ width: 0, height: 0 }) });
  const app = node(); app.insertAdjacentHTML = () => { overlay = true; };
  const document = {
    activeElement: null, body: { dataset: {} }, querySelectorAll: () => [],
    querySelector(selector) {
      if (selector === '#app') return app;
      if (selector === '.overlay') return overlay ? { remove() { overlay = false; } } : null;
      if (selector === '.lesson-board') return null;
      if (!nodes.has(selector)) nodes.set(selector, node());
      return nodes.get(selector);
    },
    addEventListener: (name, fn) => listeners.set(name, fn),
    dispatchEvent(event) { event.target = document; event.preventDefault = () => {}; listeners.get(event.type)(event); }
  };
  const window = { scrollTo() {}, addEventListener() {} };
  values.set('mirutet-finesse.v1', JSON.stringify({ settings: { are: 80, sdf: 1 }, ...profile }));
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/app.js'), 'utf8'), {
    MiruTet: { ...E, mascot: M }, MiruTetAudio: { ...A, createAudioEngine: () => ({
      configure() {}, unlock() {}, stopCues() {}, stopCombo() {},
      sound: kind => sounds.push(kind), piece: type => cues.push(type), combo: count => combos.push(count)
    }) }, document, window, HTMLElement: class {},
    KeyboardEvent: class { constructor(type, options) { Object.assign(this, { type }, options); } },
    performance: { now: () => time }, matchMedia: () => ({ matches: true }),
    localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
    requestAnimationFrame: fn => { frame = fn; return 1; }
  });
  const state = () => JSON.parse(JSON.stringify(window.__mirutet.getState()));
  const tap = action => {
    const code = state().bindings[action][0];
    window.__mirutet.dispatch(code, true); window.__mirutet.dispatch(code, false);
  };
  return {
    app, sounds, cues, combos, tap, state, nodes,
    saved: () => JSON.parse(values.get('mirutet-finesse.v1')),
    click(act) { listeners.get('click')({ target: { closest: () => ({ dataset: { act }, disabled: false }) } }); },
    advance(ms) { time += ms; frame(); },
    solve() {
      const drill = E.SPIN_DRILLS.find(d => d.id === state().round.drillId);
      for (const action of E.solveSpinDrill(drill)) {
        if (action === 'floor') {
          for (;;) {
            const before = state().active.y; tap('softDrop');
            if (state().active.y === before) break;
          }
        } else tap(action);
      }
      tap('hardDrop');
    }
  };
}

test('spin automatic rounds retain result, coach reaction and hints while sharing finesse audio timing', () => {
  const r = loadApp({ ui: { repeatOnMiss: false, repeatOnFault: true, zeroFault: true } });
  r.click('spin-continue'); r.advance(80); r.tap('hint');
  assert.equal(r.state().hint, true);
  const beforeCues = r.cues.length;
  r.solve();
  assert.equal(r.state().lastResult.status, 'perfect'); assert.equal(r.state().expression, 'happy');
  assert.equal(r.state().round.drillId, 't-single-right'); assert.equal(r.state().hint, true);
  assert.equal(r.state().active, null); assert.deepEqual(r.sounds, ['perfect']);
  assert.equal(r.cues.length, beforeCues, 'Next cue waits for spawn');
  assert.match(r.nodes.get('#result-panel').innerHTML, /回転入れ成功/);
  r.advance(80); assert.equal(r.cues.length, beforeCues + 1);
  assert.equal(r.state().expression, 'happy'); assert.equal(r.state().lastResult.status, 'perfect');
  r.tap('hardDrop');
  assert.equal(r.state().lastResult.reason, 'position'); assert.equal(r.state().expression, 'thinking');
  assert.equal(r.state().round.drillId, 't-single-right'); assert.equal(r.state().hint, true);
  assert.deepEqual(r.sounds, ['perfect', 'fault']); assert.equal(r.state().combo.count, 0);
  assert.match(r.nodes.get('#result-panel').innerHTML, /置き場所を確認/);
  r.advance(80); assert.equal(r.cues.length, beforeCues + 1, 'Automatic retry does not advance the cue');
  assert.equal(r.state().expression, 'thinking'); assert.equal(r.state().lastResult.status, 'miss');
  r.solve(); r.advance(80); r.solve();
  assert.equal(r.state().combo.count, 2); assert.deepEqual(r.combos, [2]);
  assert.equal(r.saved().spin.current, 't-double-right');
  assert.deepEqual(r.saved().spin.completed, ['t-single-left', 't-single-right', 't-double-left']);
  assert.equal(r.saved().spin.stats.attempts, 4); assert.equal(r.saved().spin.stats.retries, 0);
  assert.equal(r.saved().stats.attempts, 0);
});

test('spin pending automatic spawn and feedback survive settings/pause; manual keys replace it', () => {
  const r = loadApp(); r.click('spin-continue'); r.advance(80); r.solve();
  r.advance(20); r.click('settings'); r.advance(2000);
  assert.equal(r.state().paused, true); assert.equal(r.state().active, null);
  r.click('close-settings'); assert.equal(r.state().paused, true);
  assert.match(r.nodes.get('#result-panel').innerHTML, /回転入れ成功/);
  r.click('resume'); r.advance(59); assert.equal(r.state().active, null);
  r.advance(1); assert.ok(r.state().active); assert.equal(r.state().expression, 'happy');
  r.tap('retry'); assert.equal(r.state().lastResult, null); assert.equal(r.state().round.drillId, 't-single-right');
  r.tap('skip'); assert.equal(r.state().round.drillId, 't-double-left');
  r.advance(80); assert.ok(r.state().active);
  assert.equal(r.state().stats.retries, 1); assert.equal(r.state().stats.skips, 1);
});

test('spin end-of-list saves first unfinished target, then all-clear wraps with one inline message', () => {
  const completed = E.SPIN_DRILLS.slice(1, -1).map(d => d.id);
  const r = loadApp({ spin: { current: E.SPIN_DRILLS.at(-1).id, completed } });
  r.click('spin-continue'); r.advance(80); r.solve();
  assert.equal(r.saved().spin.current, E.SPIN_DRILLS[0].id);
  assert.doesNotMatch(r.nodes.get('#result-panel').innerHTML, /全14問達成/);
  r.advance(80); r.solve();
  assert.equal(r.state().lastResult.allClear, true);
  assert.match(r.nodes.get('#result-panel').innerHTML, /全14問達成/);
  r.advance(80); r.solve();
  assert.doesNotMatch(r.nodes.get('#result-panel').innerHTML, /全14問達成/);
  assert.equal(r.saved().spin.completed.length, 14);
});
