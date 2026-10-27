'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../src/engine.js');
const { assertOfflineHTML } = require('../build.js');

function rig(settings = {}, extra = {}) {
  return new E.InputHandler({ time: 0, clock: () => 0, autoNext: false, settings, ...extra });
}

test('atomic release cannot resume an older charged direction and clears a released IHS tap', () => {
  const h = rig({ das: 0, arr: 0, ihs: true }, { pieceProvider: () => 'L' });
  h.spawn('O', 0); h.keyDown('left', 1); h.keyDown('right', 2);
  const before = { ...h.active }, count = h.inputCount;
  h.releaseAll(2); h.update(100);
  assert.deepEqual(h.active, before); assert.equal(h.inputCount, count); assert.equal(h.held.size, 0);
  h.scheduleSpawn('T', 101, 80); h.keyDown('hold', 110); h.keyUp('hold', 111);
  assert.equal(h.initialHoldBuffered, true);
  h.pause(120); h.releaseAll(120); h.resume(220); h.update(281);
  assert.equal(h.active.type, 'T'); assert.equal(h.heldPiece, null); assert.equal(h.flags.ihs, false);
  assert.equal(h.inputCount, 0);
});

test('live DCD edits shorten and lengthen the current gate relative to its trigger', () => {
  const h = rig({ das: 0, arr: 0, dcd: 200 });
  h.keyDown('left', 0); h.spawn('T', 0); h.update(50);
  assert.equal(h.active.x, 3);
  h.setSettings({ dcd: 100 }, 50); h.update(99); assert.equal(h.active.x, 3);
  h.update(100); assert.equal(E.bounds(h.active).minX, 0); assert.equal(h.inputCount, 1);
  h.keyDown('cw', 101); assert.equal(E.bounds(h.active).minX, 1);
  h.setSettings({ dcd: 200 }, 120); h.update(300); assert.equal(E.bounds(h.active).minX, 1);
  h.update(301); assert.equal(E.bounds(h.active).minX, 0); assert.equal(h.inputCount, 2);
});

test('spawn callback pause prevents charged horizontal input and preserves the frozen piece', () => {
  const h = rig({ das: 0, arr: 0, gravity: 1 }, { onSpawn: (_, handler) => handler.pause(handler.time) });
  h.keyDown('left', 0); h.scheduleSpawn('T', 0, 80); h.update(1000);
  assert.deepEqual(h.active, E.spawnPiece('T')); assert.equal(h.inputCount, 0);
  h.releaseAll(1000); h.callbacks.onSpawn = null; h.resume(1080);
  assert.deepEqual(h.active, E.spawnPiece('T'));
  h.update(1097); assert.equal(h.active.y, E.spawnPiece('T').y - 1);
});

test('keys exactly on an ARE deadline follow timer-first ordering without a double IRS', () => {
  const h = rig(); h.scheduleSpawn('T', 0, 80); h.keyDown('cw', 80);
  assert.equal(h.active.rot, 1); assert.equal(h.inputCount, 1); assert.equal(h.inputs[0].irs, false);
  h.keyDown('hardDrop', 81); h.scheduleSpawn('T', 81, 0);
  assert.equal(h.active.rot, 1); assert.equal(h.inputCount, 1); assert.equal(h.inputs[0].irs, true);
  h.keyDown('cw', 82, { repeat: true }); h.update(1000); assert.equal(h.inputCount, 1);
});

function bindings() { return Object.fromEntries(E.INPUT_ACTIONS.map((action, i) => [action, ['Key' + String.fromCharCode(65 + i)]])); }
test('pure rebinding swaps conflicts atomically, supports extra keys and rejects invalid imports', () => {
  const original = bindings(), before = structuredClone(original);
  const swapped = E.rebindKeys(original, 'left', 0, original.right[0]);
  assert.deepEqual(swapped.left, original.right); assert.deepEqual(swapped.right, original.left);
  assert.deepEqual(original, before);
  const extra = E.rebindKeys(original, 'left', null, 'ShiftRight');
  assert.deepEqual(extra.left, ['KeyA', 'ShiftRight']); assert.deepEqual(E.validateBindings(extra), extra);
  assert.deepEqual(E.rebindKeys(extra, 'left', 0, 'ShiftRight'), extra);
  assert.deepEqual(E.rebindKeys(original, 'left', null, original.right[0]), swapped);
  for (const invalid of [{ ...original, left: [] }, { ...original, left: ['KeyB'] }, { ...original, left: ['<script>'] }]) {
    assert.throws(() => E.validateBindings(invalid));
  }
  assert.throws(() => E.rebindKeys(original, 'left', 4, 'KeyQ'));
  const full = { ...original, left: ['Digit0','Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7'] };
  assert.throws(() => E.rebindKeys(full, 'left', null, 'Digit8'));
});

test('offline guard rejects resource URLs, comment URLs and local dependencies; allows SVG namespace/paint', () => {
  assert.doesNotThrow(() => assertOfflineHTML('<svg xmlns="http://www.w3.org/2000/svg"><path fill="url(#paint)"/><use href="#local"/></svg>'));
  for (const html of ['<script src="local.js"></script>', '<link href="local.css">', '<style>@import "local.css";</style>',
    '<style>x{background:url(local.png)}</style>', '<image href="local.svg">', '<a href="local.html">link</a>',
    '<!-- https://example.org -->', '<script>const u="http://example.org"</script>',
    '<svg xmlns="http://www.w3.org/2000/svg/evil"/>']) assert.throws(() => assertOfflineHTML(html));
});

test('built artifact is a self-contained classic-script HTML and both outputs match', () => {
  const root = path.resolve(__dirname, '..'), bytes = fs.readFileSync(path.join(root, 'dist/mirutet.html'));
  const html = bytes.toString('utf8');
  assertOfflineHTML(html);
  assert.deepEqual(fs.readFileSync(path.join(root, 'index.html')), bytes);
  assert.equal((html.match(/<script>/g) || []).length, 4);
  assert.match(html, /<title>ミルテト<\/title>/);
  assert.match(html, /<meta property="og:title" content="ミルテト">/);
  const description = html.match(/<meta name="description" content="([^"]+)">/)[1];
  assert.match(description, /^ミルテトは、.*ブラウザゲームシリーズです。現在.*「フィネス編」/);
  assert.equal(html.match(/<meta property="og:description" content="([^"]+)">/)[1], description);
  assert.match(html, /<h1 class="logo">ミル<span>テト<\/span><\/h1>/);
  assert.match(html, /WELCOME TO MIRUTET ACADEMY/);
  assert.doesNotMatch(html, /type=["']module|APP_STYLES|ENGINE_SCRIPT|AUDIO_SCRIPT|MASCOT_SCRIPT|APP_SCRIPT/);
});
