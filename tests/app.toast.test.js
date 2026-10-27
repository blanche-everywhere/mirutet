'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const E = require('../src/engine.js');
const M = require('../src/mascot.js');
const A = require('../src/audio.js');

const root = path.resolve(__dirname, '..');

test('toast visibility is immediate; transitions only animate opacity and transform', () => {
  // Node cannot compute innerText/layout. Guard the CSS responsible for keeping
  // visibility:hidden at transition progress 0 even after .visible is added.
  const css = fs.readFileSync(path.join(root, 'src/style.css'), 'utf8');
  const rules = [...css.matchAll(/#toast(?:\.visible)?\s*\{([^}]+)\}/g)];
  assert.equal(rules.length, 2);
  for (const [, body] of rules) {
    for (const [, property, value] of body.matchAll(/\b(transition(?:-property)?)\s*:\s*([^;}]+)/g)) {
      for (const entry of value.split(',')) {
        const name = entry.trim().split(/\s+/)[0];
        assert.ok(['none', 'opacity', 'transform'].includes(name),
          `${property}:${value} must not transition visibility (including implicit all)`);
      }
    }
  }
});

function loadApp() {
  let time = 100, nextFrame;
  const listeners = new Map(), classes = new Set(), values = new Map();
  const toast = { textContent: '', classList: {
    add: name => classes.add(name), remove: name => classes.delete(name),
    contains: name => classes.has(name)
  } };
  const app = { innerHTML: '' };
  const document = {
    activeElement: null, body: { dataset: {} },
    querySelector: selector => ({ '#app': app, '#toast': toast })[selector] || null,
    querySelectorAll: () => [],
    addEventListener: (name, callback) => listeners.set(name, callback)
  };
  const window = { addEventListener() {}, scrollTo() {} };
  // Run the entire app, including its real delegated click handler and frame
  // loop. The DOM stub only represents the stable toast and replaced app root.
  vm.runInNewContext(fs.readFileSync(path.join(root, 'src/app.js'), 'utf8'), {
    MiruTet: { ...E, mascot: M }, MiruTetAudio: A, document, window,
    performance: { now: () => time }, matchMedia: () => ({ matches: false }),
    localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
    requestAnimationFrame: callback => { nextFrame = callback; return 1; }
  });
  return {
    toast,
    click(act) {
      const button = { dataset: { act }, disabled: false };
      listeners.get('click')({ target: { closest: () => button } });
    },
    advance(ms) { time += ms; nextFrame(); }
  };
}

test('handling reset keeps its toast text through frames, refreshes expiry, and dismisses on navigation', () => {
  const app = loadApp(), message = 'ハンドリング、初期値に戻せましたっ。';
  const assertToast = visible => {
    assert.equal(app.toast.textContent, message);
    assert.equal(app.toast.classList.contains('visible'), visible);
  };
  app.click('settings');
  app.click('reset-handling');
  assertToast(true);
  app.advance(2999);
  assertToast(true);
  app.click('reset-handling');
  app.advance(1); // The previous notification's deadline must not hide this one.
  assertToast(true);
  app.advance(2998);
  assertToast(true);
  app.advance(1);
  assertToast(false);
  app.click('reset-handling');
  assertToast(true);
  app.click('close-settings');
  assertToast(false);
});
