'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const E = require('../src/engine.js');
const M = require('../src/mascot.js');
const A = require('../src/audio.js');

// Real delegated app events and engine with minimal DOM sinks. Actual native
// focus, activation and geometry are also checked in the Chrome scenarios.
function loadApp(profile = {}, blocked = false) {
  let time = 0, frame, markup = '', overlay = false;
  const listeners = new Map(), nodes = new Map(), values = new Map();
  values.set('mirutet-finesse.v1', JSON.stringify({ settings: { are: 0 }, ...profile }));
  class Element {
    constructor(dataset = {}) { this.dataset = dataset; this.style = {}; this.hidden = false; this.value = ''; this.textContent = ''; this.innerHTML = ''; this.disabled = false; }
    focus() { document.activeElement = this; }
    select() {}
    closest(selector) {
      if (selector === '[data-live-handling]') return this.live ? panel : null;
      if (selector === 'button' || selector === 'button[data-act]') return this.dataset.act ? this : null;
      return null;
    }
    hasAttribute(attr) { return attr === 'data-live-handling' && this === panel; }
    matches(selector) { return this.input && selector.includes('input'); }
    setAttribute(name, value) { this[name] = String(value); }
    querySelector() { return this.icon ||= new Element(); }
    getBoundingClientRect() { return { width: 0, height: 0 }; }
    classList = { add() {}, remove() {} };
  }
  const app = new Element(), panel = new Element();
  Object.defineProperty(app, 'innerHTML', { get: () => markup, set(value) { markup = value; nodes.clear(); overlay = false; } });
  app.insertAdjacentHTML = () => { overlay = true; };
  const get = selector => {
    if (selector === '#app') return app;
    if (selector === '.lesson-board') return null;
    if (selector === '.overlay') return overlay ? { remove() { overlay = false; } } : null;
    if (selector.startsWith('#') && selector !== '#toast' && !markup.includes(`id="${selector.slice(1).split(' ')[0]}"`)) return null;
    if (!nodes.has(selector)) {
      const el = new Element();
      const key = selector.match(/^\[data-handling-value="(.+)"\]$/)?.[1];
      if (key) el.textContent = markup.match(new RegExp(`data-handling-value="${key}"[^>]*>([^<]*)`))?.[1];
      if (selector.startsWith('#setting-')) el.value = markup.match(new RegExp(`id="${selector.slice(1)}"[^>]*value="([^"]*)"`))?.[1];
      nodes.set(selector, el);
    }
    return nodes.get(selector);
  };
  const document = { activeElement: null, body: new Element(), querySelector: get, querySelectorAll: () => [],
    addEventListener: (name, fn) => listeners.set(name, fn) };
  const window = { addEventListener() {}, scrollTo() {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/app.js'), 'utf8'), {
    MiruTet: { ...E, mascot: M }, MiruTetAudio: A, document, window, HTMLElement: Element,
    performance: { now: () => time }, matchMedia: () => ({ matches: false }),
    localStorage: { getItem: key => values.get(key) ?? null, setItem(key, value) {
      if (blocked) throw new Error('storage unavailable'); values.set(key, value);
    } }, requestAnimationFrame: fn => { frame = fn; return 1; }
  });
  const event = (type, target, extra = {}) => {
    const e = { type, target, ...extra, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    listeners.get(type)(e); return e;
  };
  return {
    app, get, values, document,
    state: () => JSON.parse(JSON.stringify(window.__mirutet.getState())),
    saved: () => JSON.parse(values.get('mirutet-finesse.v1')),
    click(act, dataset = {}) {
      const el = new Element({ act, ...dataset }); el.live = ['toggle-handling', 'adjust-handling'].includes(act);
      const down = event('mousedown', el);
      if (!down.defaultPrevented) el.focus();
      event('click', el); return { el, down };
    },
    adjust(key, step = 1) { return this.click('adjust-handling', { handlingKey: key, step: String(step) }); },
    key(code, target = document.activeElement, down = true) { time++; return event(down ? 'keydown' : 'keyup', target, { code, repeat: false }); },
    tap(code, target = document.activeElement) { const e = this.key(code, target); this.key(code, target, false); return e; },
    advance(ms) { time += ms; frame(); },
    toggleLock(checked) {
      const input = new Element({ engineToggle: 'lockDelayOn' }); input.input = input.live = true; input.checked = checked;
      event('change', input); return input;
    },
    set(key, value) {
      const input = new Element({ setting: key }); input.input = true; input.value = String(value);
      event('input', input); event('change', input); return input;
    }
  };
}

function enterMode(app, mode) {
  app.click(mode === 'free' ? 'mode-free' : mode === 'spin' ? 'mode-spin' : 'mode-finesse');
  if (mode === 'sprint') { app.click('sprint'); app.click('start-sprint', { length: '40' }); }
  else if (mode === 'lesson') { app.click('tutorial'); app.click('try-it'); }
  else app.click(mode === 'spin' ? 'spin-continue' : mode);
}

for (const mode of ['free', 'drill', 'sprint', 'lesson']) test(`${mode}: handling edits save immediately without pausing, replacing the piece or losing held keys`, () => {
  const app = loadApp();
  enterMode(app, mode);
  assert.match(app.app.innerHTML, /data-live-handling/);
  assert.match(app.app.innerHTML, /tabindex="-1" aria-expanded="false"/);
  assert.equal((app.app.innerHTML.match(/data-handling-value=/g) || []).length, 7);
  const before = app.state();
  app.key('ArrowRight');
  const count = app.state().inputCount;
  const opened = app.click('toggle-handling'); assert.equal(opened.down.defaultPrevented, true);
  assert.equal(app.get('#live-handling-controls').hidden, false);
  for (const [key, expected] of [['das',111], ['arr',1], ['sdf',41], ['dcd',1], ['are',1], ['gravity',.1], ['lockDelay',510]]) {
    app.adjust(key);
    assert.equal(app.state().settings[key], expected); assert.equal(app.saved().settings[key], expected);
    assert.equal(app.document.activeElement, app.get('#board'));
    assert.ok(app.state().held.includes('ArrowRight')); assert.equal(app.state().paused, false);
  }
  assert.equal(app.state().inputCount, count);
  assert.equal(app.state().stats.running, true);
  assert.equal(app.state().active.type, before.active.type);
  if (before.round) assert.deepEqual(app.state().round, before.round);
  assert.deepEqual(app.state().totalStats, before.totalStats);
  app.key('ArrowRight', app.document.activeElement, false);
  const arr = app.state().settings.arr, x = app.state().active.x;
  assert.equal(app.tap('ArrowLeft').defaultPrevented, true);
  assert.equal(app.state().active.x, x - 1);
  assert.equal(app.state().settings.arr, arr);
  assert.equal(app.tap('Space').defaultPrevented, true);
  assert.equal(app.state().settings.arr, arr);
  assert.ok(app.state().lastResult);
});

for (const mode of ['free', 'drill', 'sprint', 'spin', 'lesson']) test(`${mode}: shared live lock controls apply OFF/ON and duration changes immediately`, () => {
  const app = loadApp({ settings: { are: 0, sdf: 41 } });
  enterMode(app, mode);
  app.click('toggle-handling');
  assert.match(app.app.innerHTML, /data-engine-toggle="lockDelayOn"/);
  assert.equal(app.get('[data-handling-value="lockDelay"]').textContent, '500 ms');
  app.toggleLock(false); app.tap('ArrowDown');
  const piece = app.state().active;
  app.advance(2000); assert.deepEqual(app.state().active, piece); assert.equal(app.state().lastResult, null);
  assert.equal(app.get('[data-handling-value="lockDelay"]').textContent, 'OFF');
  app.set('lockDelay', 1000); app.adjust('lockDelay');
  assert.equal(app.saved().settings.lockDelayOn, false); assert.equal(app.saved().settings.lockDelay, 1010);
  app.toggleLock(true); app.advance(900); assert.equal(app.state().lastResult, null);
  app.set('lockDelay', 100); assert.ok(app.state().lastResult, 'shortening an elapsed lock deadline judges now');
});

test('panel and full settings round-trip through the same validation, persistence, JSON and reset', () => {
  const settings = { das: -20, arr: 900, sdf: 0, dcd: 999, are: -5, gravity: 90 };
  const app = loadApp({ settings });
  assert.deepEqual(app.state().settings, E.normalizeSettings(settings));
  assert.deepEqual(app.saved().settings, app.state().settings);
  enterMode(app, 'free'); app.click('toggle-handling');
  app.adjust('das', -1); app.adjust('arr'); app.adjust('sdf', -1); app.adjust('dcd'); app.adjust('are', -1); app.adjust('gravity');
  assert.deepEqual(app.state().settings, E.normalizeSettings(settings));
  app.adjust('arr', -1); app.click('settings');
  assert.match(app.app.innerHTML, /id="setting-arr"[^>]*value="199"/);
  app.set('arr', 17); app.set('das', 900); app.set('gravity', -.1);
  assert.equal(app.saved().settings.arr, 17); assert.equal(app.saved().settings.das, 500); assert.equal(app.saved().settings.gravity, 0);
  app.click('close-settings'); app.click('resume');
  assert.equal(app.get('[data-handling-value="arr"]').textContent, '17 ms');
  assert.equal(app.get('[data-handling-value="das"]').textContent, '500 ms');
  app.click('settings'); app.click('reset-handling'); app.click('close-settings'); app.click('resume');
  assert.equal(app.get('[data-handling-value="das"]').textContent, '110 ms');
  const reloaded = loadApp(app.saved()); assert.deepEqual(reloaded.state().settings, E.DEFAULT_SETTINGS);
  app.click('settings'); app.click('export');
  const exported = JSON.parse(app.get('#settings-json').value);
  exported.settings.arr = 21;
  app.get('#settings-json').value = JSON.stringify(exported); app.click('import');
  app.click('close-settings'); app.click('resume');
  assert.equal(app.get('[data-handling-value="arr"]').textContent, '21 ms');
  assert.equal(app.saved().settings.arr, 21);
});

test('steppers preserve fractional imported values using the existing normalization rules', () => {
  const app = loadApp({ settings: { are: 0, das: 110.25, gravity: .25 } });
  enterMode(app, 'free'); app.click('toggle-handling'); app.adjust('das'); app.adjust('gravity');
  assert.equal(app.state().settings.das, 111.25); assert.equal(app.saved().settings.das, 111.25);
  assert.equal(app.state().settings.gravity, .35); assert.equal(app.saved().settings.gravity, .35);
});

test('pointer controls and even assistive focus route rebound arrows, Space and letter keys to gameplay', () => {
  const defaults = loadApp().state().bindings;
  const bindings = E.rebindKeys(E.rebindKeys(defaults, 'left', 0, 'KeyQ'), 'cw', 0, 'Space');
  const app = loadApp({ bindings }); enterMode(app, 'free'); app.click('toggle-handling');
  const { el } = app.adjust('arr'), settings = app.state().settings;
  el.focus(); const x = app.state().active.x;
  assert.equal(app.tap('KeyQ', el).defaultPrevented, true); assert.equal(app.state().active.x, x - 1);
  el.focus(); const rot = app.state().active.rot;
  assert.equal(app.tap('Space', el).defaultPrevented, true); assert.equal(app.state().active.rot, (rot + 1) % 4);
  el.focus(); assert.equal(app.tap('ArrowRight', el).defaultPrevented, true);
  assert.deepEqual(app.state().settings, settings); assert.equal(app.document.activeElement, app.get('#board'));
});

test('lesson player handling follows saved preferences rather than slow demonstration overrides; failed storage stays usable', () => {
  const app = loadApp({ settings: { das: 210, arr: 30, are: 300, sdf: 8, gravity: .01 } }, true);
  app.click('mode-finesse'); app.click('tutorial'); app.click('next-lesson');
  assert.doesNotMatch(app.app.innerHTML, /data-live-handling/);
  app.click('try-it'); assert.equal(app.state().pending.at, 300);
  app.click('toggle-handling'); app.adjust('are'); assert.equal(app.state().pending.at, 301);
  app.advance(301); app.key('ArrowLeft'); app.advance(100);
  assert.equal(app.state().active.x, 2, 'saved DAS 210 still waits; teaching demo DAS 110 is not used');
  app.adjust('das', -1); assert.equal(app.state().settings.das, 209);
  assert.equal(app.state().storageOK, false); assert.equal(app.state().paused, false);
});

test('the IRS challenge keeps its ARE window even with saved ARE 0, and shows the value in effect', () => {
  const app = loadApp({ settings: { are: 0, irs: false } });
  app.click('mode-finesse'); app.click('tutorial'); for (let i = 0; i < 3; i++) app.click('next-lesson');
  app.click('try-it');
  assert.equal(app.state().pending.at, 350); assert.equal(app.state().settings.are, 0);
  assert.equal(app.get('[data-handling-value="are"]').textContent, '350 ms');
  app.click('toggle-handling'); app.adjust('are');
  assert.equal(app.saved().settings.are, 1); assert.equal(app.state().pending.at, 350);
  app.adjust('are', -1);
  assert.equal(app.saved().settings.are, 0); assert.equal(app.get('[data-handling-value="are"]').textContent, '350 ms');
  const board = app.get('#board'); app.key('KeyX', board); app.advance(350); app.key('KeyX', board, false);
  assert.ok(app.state().active, 'challenge still spawns after its window'); assert.equal(app.state().active.rot, 1, 'IRS stays on in its challenge');
});

test('unbound arrows and Space on the board are consumed instead of walking focus onto buttons', () => {
  const defaults = loadApp().state().bindings;
  const app = loadApp({ bindings: { ...E.rebindKeys(defaults, 'softDrop', 0, 'KeyS') } });
  enterMode(app, 'free'); app.click('toggle-handling'); app.adjust('arr');
  const board = app.document.activeElement, pieces = app.state().stats.pieces;
  assert.equal(app.tap('ArrowDown', board).defaultPrevented, true);
  assert.equal(app.document.activeElement, board); assert.equal(app.state().stats.pieces, pieces);
});

test('compact values: SDF 41 is ∞ and imported fractions stay readable', () => {
  const app = loadApp({ settings: { sdf: 41, gravity: 1 / 60 } });
  enterMode(app, 'free');
  assert.equal(app.get('[data-handling-value="sdf"]').textContent, '∞');
  assert.match(app.app.innerHTML, /data-handling-value="gravity"[^>]*>0\.017 G</);
  assert.equal(app.state().settings.gravity, 1 / 60);
});
