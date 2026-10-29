'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const E = require('../src/engine.js');
const M = require('../src/mascot.js');
const A = require('../src/audio.js');

// Run real keyboard input, judgements and automatic retries with DOM sinks.
function loadApp() {
  let time = 0, frame, overlay = false;
  const listeners = new Map(), nodes = new Map();
  const node = () => ({ innerHTML: '', textContent: '', dataset: {}, style: {}, hidden: true,
    classList: { add() {}, remove() {} }, focus() {}, setAttribute() {}, getAnimations: () => [],
    getBoundingClientRect: () => ({ width: 0, height: 0 }) });
  const app = node();
  app.insertAdjacentHTML = () => { overlay = true; };
  nodes.set('#app', app);
  const document = {
    activeElement: null, body: { dataset: {} }, querySelectorAll: () => [],
    querySelector(selector) {
      if (selector === '.lesson-board') return null;
      if (selector === '.overlay') return overlay ? { remove() { overlay = false; } } : null;
      if (selector.startsWith('#') && !['#app', '#toast'].includes(selector) &&
          !app.innerHTML.includes(`id="${selector.slice(1).split(' ')[0]}"`)) return null;
      if (!nodes.has(selector)) nodes.set(selector, node());
      return nodes.get(selector);
    },
    addEventListener: (name, callback) => listeners.set(name, callback),
    dispatchEvent(event) { event.target = document; event.preventDefault = () => {}; listeners.get(event.type)(event); }
  };
  const window = { addEventListener() {}, scrollTo() {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/app.js'), 'utf8'), {
    MiruTet: { ...E, mascot: M }, MiruTetAudio: { ...A, createAudioEngine: () => ({
      configure() {}, unlock() {}, sound() {}, piece() {}, combo() {}, stopCombo() {}, stopCues() {}
    }) }, document, window, HTMLElement: class {},
    KeyboardEvent: class { constructor(type, options) { Object.assign(this, { type }, options); } },
    performance: { now: () => time }, matchMedia: () => ({ matches: true }),
    localStorage: { getItem: () => JSON.stringify({ settings: { are: 0 },
      ui: { repeatOnFault: true, repeatOnMiss: true } }), setItem() {} },
    requestAnimationFrame: callback => { frame = callback; return 1; }
  });
  const tap = code => {
    time++; window.__mirutet.dispatch(code, true);
    time++; window.__mirutet.dispatch(code, false);
  };
  return {
    tap,
    state: () => JSON.parse(JSON.stringify(window.__mirutet.getState())),
    click(act) { listeners.get('click')({ target: { closest: () => ({ dataset: { act }, disabled: false }) } }); },
    advance(ms) { time += ms; frame(); },
    target() { window.__mirutet.chooseTarget('O', { rot: 0, x: 4 }, { delay: 0 }); },
    fail(status) { tap(status === 'fault' ? 'KeyX' : 'ArrowLeft'); tap('Space'); },
    enter() { this.click('mode-finesse'); this.click('drill'); this.target(); }
  };
}

for (const status of ['fault', 'miss']) test(`third consecutive ${status} becomes angry, including retries of the same target`, () => {
  const r = loadApp(); r.enter();
  const target = r.state().round.target;
  for (let count = 1; count <= 4; count++) {
    r.fail(status);
    const state = r.state();
    assert.equal(state.lastResult.status, status);
    assert.equal(state.failStreak, count);
    assert.deepEqual(state.round.target, target, 'automatic retries retain the same target');
    assert.equal(state.expression, count >= 3 ? 'angry' : status === 'fault' ? 'thinking' : 'sorry');
    if (count >= 3) assert.ok(M.ANGRY_LINES.includes(state.bubble));
    else if (status === 'miss') assert.ok(M.MISS_LINES.includes(state.bubble));
    else assert.equal(state.bubble, M.hintText('O', state.lastResult.used, 0, []));
    r.click('retry');
    assert.equal(r.state().failStreak, count, 'manual retry also preserves the failure streak');
  }
});

test('mixed failures accumulate, Perfect restores happy feedback and combo milestones remain success-only', () => {
  const r = loadApp(); r.enter();
  for (const status of ['fault', 'miss', 'fault']) r.fail(status);
  assert.equal(r.state().failStreak, 3); assert.equal(r.state().expression, 'angry');
  r.tap('Space');
  assert.equal(r.state().lastResult.status, 'perfect');
  assert.equal(r.state().failStreak, 0); assert.equal(r.state().expression, 'happy');
  assert.ok(M.PRAISE_LINES.includes(r.state().bubble));
  for (let i = 0; i < 4; i++) { r.target(); r.tap('Space'); }
  assert.equal(r.state().combo.count, 5);
  assert.ok(M.COMBO_LINES[5].includes(r.state().bubble));
  r.target();
  for (const status of ['miss', 'fault', 'miss', 'fault']) {
    r.fail(status);
    const state = r.state();
    assert.equal(state.combo.count, 0);
    assert.equal(state.expression, state.failStreak >= 3 ? 'angry' : status === 'fault' ? 'thinking' : 'sorry');
    if (state.failStreak >= 3) assert.ok(M.ANGRY_LINES.includes(state.bubble));
  }
});

test('new sessions and leaving finesse reset failures, while pause preserves them', () => {
  for (const destination of ['drill', 'menu', 'mode-free', 'mode-spin', 'tutorial', 'settings', 'records-session', 'dressup']) {
    const r = loadApp(); r.enter();
    for (let i = 0; i < 3; i++) r.fail('fault');
    r.click('pause'); assert.equal(r.state().failStreak, 3);
    r.click('resume'); assert.equal(r.state().failStreak, 3);
    r.click(destination);
    assert.equal(r.state().failStreak, 0, destination);
    r.enter(); r.fail('miss');
    assert.equal(r.state().failStreak, 1);
    assert.equal(r.state().expression, 'sorry');
  }
});

test('free play, spin and tutorial failures do not accumulate finesse failures', () => {
  for (const mode of ['free', 'spin', 'tutorial']) {
    const r = loadApp();
    if (mode === 'free') { r.click('mode-free'); r.click('free'); }
    else if (mode === 'spin') { r.click('mode-spin'); r.click('spin-continue'); }
    else { r.click('mode-finesse'); r.click('tutorial'); r.click('try-it'); r.target(); }
    for (let i = 0; i < 4; i++) {
      if (mode === 'free') for (let turn = 0; turn < 4; turn++) r.tap('KeyX');
      if (mode === 'tutorial') r.tap('KeyX');
      r.tap('Space');
      const state = r.state();
      assert.ok(['fault', 'miss'].includes(state.lastResult.status));
      assert.equal(state.failStreak, 0);
      assert.notEqual(state.expression, 'angry');
      if (mode === 'spin') r.advance(0);
    }
  }
});
