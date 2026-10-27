'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const E = require('../src/engine.js');
const M = require('../src/mascot.js');
const A = require('../src/audio.js');

// Execute the whole app and its delegated events without a browser. These nodes
// supply form values and rendering sinks; actual DOM/focus/layout checks remain
// in browser.check.js and appearance.browser.check.js.
function loadApp(saved, storageBlocked = false) {
  const listeners = new Map(), values = new Map();
  if (saved) values.set('mirutet-finesse.v1', JSON.stringify(saved));
  const classes = new Set(), nodes = {
    '#app': { innerHTML: '' },
    '#toast': { textContent: '', classList: { add: c => classes.add(c), remove: c => classes.delete(c) } },
    '#settings-json': { value: '', focus() {}, select() {} },
    '#import-status': { textContent: '' },
    '#appearance-preview': { innerHTML: '' },
    '#appearance-storage': { textContent: '' },
    '#cue-volume': { textContent: '' }
  };
  const document = {
    activeElement: null, body: { dataset: {} },
    querySelector: selector => nodes[selector] || null,
    querySelectorAll: () => [],
    addEventListener: (name, callback) => listeners.set(name, callback)
  };
  const window = { addEventListener() {}, scrollTo() {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8'), {
    MiruTet: { ...E, mascot: M }, MiruTetAudio: A, document, window,
    performance: { now: () => 100 }, matchMedia: () => ({ matches: false }),
    localStorage: {
      getItem: key => values.get(key) ?? null,
      setItem(key, value) { if (storageBlocked) throw new Error('storage full'); values.set(key, value); }
    },
    requestAnimationFrame: () => 1
  });
  return {
    nodes,
    state: () => JSON.parse(JSON.stringify(window.__mirutet.getState())),
    persisted: () => JSON.parse(values.get('mirutet-finesse.v1')),
    click(act) {
      const button = { dataset: { act }, disabled: false };
      listeners.get('click')({ target: { closest: () => button } });
    },
    change(dataset, value, event = 'change') {
      const input = { dataset, value, hasAttribute: attr =>
        attr === 'data-hair-skin' && 'hairSkin' in dataset || attr === 'data-outfit-skin' && 'outfitSkin' in dataset };
      listeners.get(event)({ target: input });
    }
  };
}

test('merged settings events, JSON round-trip and reset keep cues and appearance independent', () => {
  const app = loadApp({ settings: { das: 173 }, progress: { current: 4, completed: [0, 3] },
    stats: { attempts: 9, placements: 8, perfect: 6, faults: 2, misses: 1 } });
  const before = app.state(), originalRecords = before.totalStats, originalProgress = before.progress;
  app.click('settings');
  const markup = app.nodes['#app'].innerHTML;
  const appearance = markup.match(/<section\b[^>]*aria-labelledby="shared-appearance"[\s\S]*?<\/section>/)[0];
  assert.match(appearance, /共通の見た目/);
  assert.match(appearance, /id="hair-skin"/); assert.match(appearance, /id="outfit-skin"/);
  assert.ok(markup.indexOf(appearance) < markup.indexOf('id="finesse-settings"'));

  app.change({ ui: 'pieceCueTiming' }, 'current');
  app.change({ ui: 'pieceCueVolume' }, '37', 'input');
  app.change({ ui: 'pieceCueVolume' }, '37'); // A native range change must not store `checked`.
  app.change({ ui: 'volume' }, '.55', 'input');
  app.change({ ui: 'volume' }, '.55');
  app.change({ hairSkin: '' }, 'intake');
  app.change({ outfitSkin: '' }, 'cape');
  const chosen = app.state();
  assert.equal(chosen.ui.pieceCueTiming, 'current'); assert.equal(chosen.ui.pieceCueVolume, 37);
  assert.equal(chosen.ui.volume, .55); assert.equal(chosen.ui.hairSkin, 'intake'); assert.equal(chosen.ui.outfitSkin, 'cape');
  assert.equal(app.nodes['#cue-volume'].textContent, '37');
  assert.deepEqual(app.persisted().ui, chosen.ui);
  assert.equal((app.nodes['#appearance-preview'].innerHTML.match(/data-hair-skin="intake"/g) || []).length, 2);
  assert.equal((app.nodes['#appearance-preview'].innerHTML.match(/data-outfit-skin="cape"/g) || []).length, 2);

  app.click('export');
  const exported = app.nodes['#settings-json'].value;
  assert.deepEqual(JSON.parse(exported).ui, chosen.ui);
  app.click('reset-settings');
  const reset = app.state();
  assert.equal(reset.ui.pieceCueTiming, 'next'); assert.equal(reset.ui.pieceCueVolume, 60);
  assert.equal(reset.ui.hairSkin, 'center'); assert.equal(reset.ui.outfitSkin, 'uniform');
  assert.equal(reset.settings.das, E.DEFAULT_SETTINGS.das);
  assert.deepEqual(app.persisted().ui, reset.ui);

  app.nodes['#settings-json'].value = exported;
  app.click('import');
  assert.deepEqual(app.state().ui, chosen.ui);
  assert.deepEqual(app.state().settings, chosen.settings);
  assert.deepEqual(app.persisted().ui, chosen.ui);
  const persisted = app.persisted();
  for (const invalid of ['{bad', JSON.stringify({ ui: { hairSkin: 'side', pieceCueTiming: 'invalid' } }),
    JSON.stringify({ ui: { outfitSkin: 'uniform', pieceCueVolume: '37' } })]) {
    app.nodes['#settings-json'].value = invalid;
    app.click('import');
    assert.match(app.nodes['#import-status'].textContent, /読み込めません/);
    assert.deepEqual(app.state().ui, chosen.ui, 'failed import must leave every setting intact');
    assert.deepEqual(app.persisted(), persisted, 'failed import must not write a partial profile');
  }
  assert.deepEqual(app.state().totalStats, originalRecords);
  assert.deepEqual(app.state().progress, originalProgress);
  app.click('close-settings');
  assert.match(app.nodes['#app'].innerHTML, /data-hair-skin="intake" data-outfit-skin="cape"/);
  assert.equal(app.state().screen, 'menu');
});

test('appearance choices and cues remain usable when saving fails', () => {
  const app = loadApp(undefined, true);
  app.click('settings');
  app.change({ hairSkin: '' }, 'side');
  app.change({ outfitSkin: '' }, 'cape');
  app.change({ ui: 'pieceCueTiming' }, 'off');
  app.change({ ui: 'pieceCueVolume' }, '0', 'input');
  app.change({ ui: 'pieceCueVolume' }, '0');
  assert.equal(app.state().storageOK, false);
  assert.match(app.nodes['#appearance-storage'].textContent, /起動中/);
  assert.equal(app.state().ui.pieceCueTiming, 'off'); assert.equal(app.state().ui.pieceCueVolume, 0);
  app.click('close-settings');
  assert.match(app.nodes['#app'].innerHTML, /data-hair-skin="side" data-outfit-skin="cape"/);
});
