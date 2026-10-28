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
    click(act, dataset = {}) {
      const button = { dataset: { act, ...dataset }, disabled: false };
      listeners.get('click')({ target: { closest: () => button } });
    },
    change(dataset, value, event = 'change', type) {
      const input = { dataset, value, type, hasAttribute: attr =>
        attr === 'data-hair-skin' && 'hairSkin' in dataset || attr === 'data-outfit-skin' && 'outfitSkin' in dataset };
      listeners.get(event)({ target: input }); return input;
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


test('numeric settings clamp invalid commits and preserve repeated edits across presets and reload', () => {
  const app = loadApp({settings:{das:173,arr:19,sdf:12,dcd:9,gravity:0.3,spawnDrop:true}});
  app.click('settings');
  for (const [key, [min,max]] of Object.entries(E.SETTING_LIMITS)) {
    app.change({setting:key}, String(max+100), 'input');
    assert.equal(app.state().settings[key],max);
    app.change({setting:key}, String(min-100), 'input');
    assert.equal(app.state().settings[key],min);
    for (const invalid of ['', 'NaN', 'Infinity', 'abc']) {
      app.change({setting:key},invalid,'input');app.change({setting:key},invalid);
      assert.equal(app.state().settings[key],min);
    }
  }
  app.change({setting:'das'},'173','input');
  app.change({setting:'dcd'},'9','input');
  for(let i=0;i<50;i++) app.click('adjust-handling',{handlingKey:'das',step:'1'});
  assert.equal(app.state().settings.das,223);
  for(const preset of ['ppt2','tec','tgm3']) {
    app.change({setting:'arr'},'19','input');
    app.click('handling-preset',{preset});
    const value=app.state().settings;
    assert.equal(value.are,{ppt2:117,tec:100,tgm3:67}[preset]);
    assert.equal(value.arr,preset==='tgm3'?19:33);
    assert.equal(value.irs,preset!=='ppt2');assert.equal(value.ihs,preset!=='ppt2');
    assert.equal(value.allow180,false);assert.equal(value.spawnDrop,true);
    assert.equal(value.das,223);assert.equal(value.dcd,9);
    assert.deepEqual(app.persisted().settings,value);
  }
  app.change({setting:'are'},'81','input');assert.equal(app.state().settings.are,81);
  const reloaded=loadApp(app.persisted());assert.deepEqual(reloaded.state().settings,app.state().settings);
  app.click('reset-handling');assert.deepEqual(app.state().settings,E.DEFAULT_SETTINGS);
  app.click('close-settings');assert.equal(app.state().screen,'menu');
});


test('direct numeric edits snap to slider steps before saving, including decimal ties', () => {
  const app = loadApp(); app.click('settings');
  assert.match(app.nodes['#app'].innerHTML, /<span>近い設定<\/span>/);
  for (const [key, raw, expected] of [
    ['volume', '.33', .35], ['volume', '.325', .35], ['volume', '.324', .3],
    ['volume', '1.01', 1], ['volume', '-.1', 0], ['pieceCueVolume', '37.6', 38]
  ]) {
    app.change({ui:key},raw,'input'); app.change({ui:key},raw);
    assert.equal(app.state().ui[key],expected); assert.equal(app.persisted().ui[key],expected);
  }
  for (const [key, raw, expected] of [
    ['das','12.6',13], ['arr','12.5',13], ['sdf','12.4',12], ['dcd','12.6',13],
    ['are','12.6',13], ['gravity','.33',.3], ['gravity','.35',.4]
  ]) {
    app.change({setting:key},raw,'input');app.change({setting:key},raw);
    assert.equal(app.state().settings[key],expected);assert.equal(app.persisted().settings[key],expected);
  }
  const restored=loadApp(app.persisted());
  assert.deepEqual(restored.state().settings,app.state().settings);
  assert.deepEqual(restored.state().ui,app.state().ui);
});


test('number drafts preserve incomplete text and only commit on change or focusout', () => {
  const app = loadApp({ui:{volume:.55}}); app.click('settings');
  for (const [dataset, group, key, raw, expected, event] of [
    [{ui:'volume'},'ui','volume','.324',.3,'change'],
    [{setting:'gravity'},'settings','gravity','.349',.3,'focusout'],
    [{ui:'volume'},'ui','volume','.349',.35,'focusout']
  ]) {
    const before=app.state()[group][key];
    for(let i=1;i<=raw.length;i++) {
      const draft=raw.slice(0,i), input=app.change(dataset,draft,'input','number');
      assert.equal(input.value,draft);assert.equal(app.state()[group][key],before);
    }
    app.change(dataset,raw,event,'number');
    assert.equal(app.state()[group][key],expected);assert.equal(app.persisted()[group][key],expected);
  }
  for(const raw of ['', '.', '-', '1e']) {
    const before=app.state().ui.volume;
    app.change({ui:'volume'},raw,'input','number');
    const input=app.change({ui:'volume'},raw,'focusout','number');
    assert.equal(Number(input.value),before);assert.equal(app.state().ui.volume,before);
  }
});
