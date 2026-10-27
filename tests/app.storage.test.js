'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const E = require('../src/engine.js');

const source = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
const storageKey = 'mirutet-finesse.v1';
// Read the migration constant so the legacy spelling has one source of truth.
const legacyKey = source.match(/const LEGACY_STORAGE = '([^']+)'/)[1];
const startupEnd = source.indexOf("  let screen = 'menu'");
assert.ok(startupEnd > 0);

function load(entries = {}, failure = '') {
  const values = new Map(Object.entries(entries)), calls = [];
  const context = { MiruTet: { ...E, mascot: require('../src/mascot.js') }, localStorage: {
    getItem(key) {
      calls.push(['get', key]);
      if (failure === 'get' || failure === 'all' || failure === 'legacy-get' && key === legacyKey) throw new Error('storage unavailable');
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      calls.push(['set', key]);
      if (failure === 'set' || failure === 'all') throw new Error('storage full');
      values.set(key, value);
    },
    removeItem(key) {
      calls.push(['remove', key]);
      if (failure === 'remove' || failure === 'all') throw new Error('removal blocked');
      values.delete(key);
    }
  } };
  // Execute the real load/save functions, stopping before DOM setup. Keep the
  // initial snapshot separate so migration failures can be checked before save.
  vm.runInNewContext(source.slice(0, startupEnd) + `
    globalThis.inspect = () => JSON.stringify({ storageKey: STORAGE, settings, ui,
      bindings, practice, progress, totalStats: totalStats.snapshot(), storageOK });
    globalThis.persist = save;
    globalThis.validate = data => JSON.stringify(validatePreferences(data));
  })();`, context);
  return { values, calls, state: JSON.parse(context.inspect()), validate(data) {
    return JSON.parse(context.validate(data));
  }, save() {
    context.persist();
    return JSON.parse(context.inspect());
  } };
}

function profile() {
  const bindings = load().state.bindings;
  bindings.left = ['KeyQ'];
  return { version: 1, settings: { das: 173, arr: 7, are: 95 },
    ui: { sound: false, volume: .55 }, bindings,
    practice: { pieces: ['T', 'I'], area: 'custom', minColumn: 2, maxColumn: 8, weakSpot: true },
    progress: { current: 4, completed: [0, 1, 3] },
    stats: { attempts: 9, placements: 8, perfect: 6, faults: 2, misses: 1,
      streak: 2, bestStreak: 4, bestTimes: { 40: 65000 } } };
}

function assertProfile(actual, expected) {
  for (const key of ['das', 'arr', 'are']) assert.equal(actual.settings[key], expected.settings[key], `settings.${key}`);
  assert.equal(actual.ui.sound, expected.ui.sound);
  assert.equal(actual.ui.volume, expected.ui.volume);
  assert.deepEqual(actual.bindings, expected.bindings);
  assert.deepEqual(actual.practice, expected.practice);
  assert.deepEqual(actual.progress, expected.progress);
  const stats = actual.totalStats || actual.stats;
  for (const key of ['attempts', 'placements', 'perfect', 'faults', 'misses', 'streak', 'bestStreak']) {
    assert.equal(stats[key], expected.stats[key], `stats.${key}`);
  }
  assert.deepEqual(stats.bestTimes, expected.stats.bestTimes);
}

test('storage migration restores the complete v1 profile across saving and reloading', () => {
  const saved = profile(), raw = JSON.stringify(saved, null, 2);
  const loaded = load({ [legacyKey]: raw }), { values, calls, state } = loaded;
  assert.equal(state.storageKey, storageKey);
  assertProfile(JSON.parse(values.get(storageKey)), saved);
  assert.equal(values.has(legacyKey), false);
  assert.deepEqual(calls, [['get', storageKey], ['get', legacyKey], ['set', storageKey], ['remove', legacyKey], ['set', storageKey]]);
  assert.equal(state.storageOK, true);
  assertProfile(state, saved);
  assert.deepEqual(loaded.save(), state);
  const persisted = JSON.parse(values.get(storageKey));
  assertProfile(persisted, saved);
  assert.deepEqual(persisted.settings, state.settings);
  assert.equal(persisted.version, 1);
  assert.deepEqual(calls.at(-1), ['set', storageKey]);
  const reloaded = load(Object.fromEntries(values));
  assert.deepEqual(reloaded.state, state);
  assert.deepEqual(reloaded.calls, [['get', storageKey], ['set', storageKey]]);
});

test('an existing new profile takes priority without reading or changing the legacy profile', () => {
  const saved = profile(), legacy = JSON.stringify(saved);
  saved.settings = { das: 221, arr: 11, are: 120 }; saved.stats.perfect = 7;
  saved.progress = { current: 8, completed: [0, 8] };
  const raw = JSON.stringify(saved);
  const loaded = load({ [storageKey]: raw, [legacyKey]: legacy }), { state, values, calls } = loaded;
  assertProfile(state, saved);
  assert.deepEqual(calls, [['get', storageKey], ['set', storageKey]]);
  assert.deepEqual(loaded.save(), state);
  assertProfile(JSON.parse(values.get(storageKey)), saved);
  assert.equal(values.get(legacyKey), legacy);
  assert.deepEqual(calls, [['get', storageKey], ['set', storageKey], ['set', storageKey]]);
  const reloaded = load(Object.fromEntries(values));
  assertProfile(reloaded.state, saved);
  assert.equal(reloaded.values.get(legacyKey), legacy);
  assert.deepEqual(reloaded.calls, [['get', storageKey], ['set', storageKey]]);
});

test('a fresh profile uses defaults and creates the new key on save', () => {
  const loaded = load(), { state, values, calls } = loaded;
  assert.equal(state.storageKey, storageKey);
  assert.equal(state.settings.das, E.DEFAULT_SETTINGS.das);
  assert.equal(state.ui.pieceCueTiming, 'next');
  assert.equal(state.ui.pieceCueVolume, 60);
  assert.equal(state.ui.hairSkin, 'center');
  assert.equal(state.ui.outfitSkin, 'uniform');
  assert.equal(state.storageOK, true);
  assert.equal(values.size, 0);
  assert.deepEqual(calls, [['get', storageKey], ['get', legacyKey]]);
  assert.deepEqual(loaded.save(), state);
  assert.deepEqual(JSON.parse(values.get(storageKey)).settings, state.settings);
  assert.equal(values.has(legacyKey), false);
});

test('old current and legacy profiles persist normalized defaults on load without losing their preferences', () => {
  for (const key of [storageKey, legacyKey]) {
    const saved = profile(), loaded = load({ [key]: JSON.stringify(saved) });
    assertProfile(loaded.state, saved);
    assert.equal(loaded.state.ui.pieceCueTiming, 'next');
    assert.equal(loaded.state.ui.pieceCueVolume, 60);
    assert.equal(loaded.state.ui.hairSkin, 'center');
    assert.equal(loaded.state.ui.outfitSkin, 'uniform');
    // Inspect storage before a user action or explicit save can hide a missing
    // startup write, as the browser migration check does.
    const persisted = JSON.parse(loaded.values.get(storageKey));
    assert.equal(persisted.ui.pieceCueTiming, 'next');
    assert.equal(persisted.ui.pieceCueVolume, 60);
    assert.equal(persisted.ui.hairSkin, 'center');
    assert.equal(persisted.ui.outfitSkin, 'uniform');
    assert.deepEqual(persisted.ui, loaded.state.ui);
    assert.deepEqual(persisted.settings, loaded.state.settings);
    assertProfile(persisted, saved);
    assert.equal(persisted.version, 1);
    const reloaded = load(Object.fromEntries(loaded.values));
    assert.deepEqual(reloaded.state, loaded.state);
    assert.deepEqual(JSON.parse(reloaded.values.get(storageKey)), persisted);
  }
});

test('cue preferences survive migration, export/import validation, save and reload', () => {
  for (const timing of ['next', 'current', 'off']) for (const volume of [0, 37, 100]) {
    const saved = profile();
    Object.assign(saved.ui, { pieceCueTiming: timing, pieceCueVolume: volume });
    const loaded = load({ [legacyKey]: JSON.stringify(saved) });
    assert.equal(loaded.state.ui.pieceCueTiming, timing);
    assert.equal(loaded.state.ui.pieceCueVolume, volume);
    assert.deepEqual(JSON.parse(loaded.values.get(storageKey)).ui, loaded.state.ui);
    loaded.save();
    const persisted = JSON.parse(loaded.values.get(storageKey));
    assert.deepEqual(loaded.validate(persisted).ui, loaded.state.ui);
    assert.deepEqual(load(Object.fromEntries(loaded.values)).state, loaded.state);
  }
});

test('profiles without ui preferences persist the complete defaults on load', () => {
  const defaults = load().state.ui;
  for (const key of [storageKey, legacyKey]) {
    const saved = profile();
    delete saved.ui;
    const loaded = load({ [key]: JSON.stringify(saved) });
    assert.deepEqual(loaded.state.ui, defaults);
    assert.deepEqual(JSON.parse(loaded.values.get(storageKey)).ui, defaults);
  }
});

test('cue import validates timing and numeric volume atomically and clamps the volume range', () => {
  const loaded = load();
  for (const timing of ['', 'NEXT', 'other', true, null, 0]) {
    assert.throws(() => loaded.validate({ ui: { pieceCueTiming: timing } }), /NEXT/);
  }
  for (const volume of ['50', null, true, NaN, Infinity]) {
    assert.throws(() => loaded.validate({ ui: { pieceCueVolume: volume } }), /音量/);
  }
  assert.equal(loaded.validate({ ui: { pieceCueVolume: -10 } }).ui.pieceCueVolume, 0);
  assert.equal(loaded.validate({ ui: { pieceCueVolume: 150 } }).ui.pieceCueVolume, 100);
  assert.equal(loaded.validate({}).ui.pieceCueTiming, 'next');
  assert.deepEqual(loaded.state, load().state);
});

test('empty or malformed values respect new-key priority and save usable defaults', () => {
  for (const raw of ['', '{invalid']) {
    for (const hasNewProfile of [false, true]) {
      const legacy = hasNewProfile ? JSON.stringify(profile()) : raw;
      const loaded = load({ [legacyKey]: legacy, ...(hasNewProfile ? { [storageKey]: raw } : {}) });
      const { state, values, calls } = loaded;
      assert.deepEqual(state.settings, E.DEFAULT_SETTINGS);
      assert.equal(state.totalStats.attempts, 0);
      assert.equal(state.storageOK, raw === '');
      assert.equal(values.get(storageKey), raw);
      // Migration copies and removes even unparsable legacy JSON before validation.
      assert.equal(values.get(legacyKey), hasNewProfile ? legacy : undefined);
      assert.deepEqual(calls, hasNewProfile ? [['get', storageKey]] :
        [['get', storageKey], ['get', legacyKey], ['set', storageKey], ['remove', legacyKey]]);
      assert.equal(loaded.save().storageOK, true);
      const persisted = JSON.parse(values.get(storageKey));
      assert.deepEqual(persisted.settings, E.DEFAULT_SETTINGS);
      assert.equal(persisted.stats.attempts, 0);
      assert.equal(values.get(legacyKey), hasNewProfile ? legacy : undefined);
    }
  }
});

test('failed migration writes keep legacy data and still load preferences for this session', () => {
  const saved = profile(), raw = JSON.stringify(saved);
  const loaded = load({ [legacyKey]: raw }, 'set'), { state, values, calls } = loaded;
  assert.equal(state.storageOK, false);
  assertProfile(state, saved);
  assert.equal(loaded.save().storageOK, false);
  assert.equal(values.get(legacyKey), raw);
  assert.equal(values.has(storageKey), false);
  assert.ok(!calls.some(([operation]) => operation === 'remove'));
});

test('failed normalization writes keep the existing profile and usable session preferences', () => {
  const saved = profile(), raw = JSON.stringify(saved);
  const { state, values, calls } = load({ [storageKey]: raw }, 'set');
  assertProfile(state, saved);
  assert.equal(state.ui.pieceCueTiming, 'next');
  assert.equal(state.ui.pieceCueVolume, 60);
  assert.equal(state.storageOK, false);
  assert.equal(values.get(storageKey), raw);
  assert.deepEqual(calls, [['get', storageKey], ['set', storageKey]]);
});

test('failed legacy cleanup keeps both copies and still restores the profile', () => {
  const saved = profile(), raw = JSON.stringify(saved);
  const loaded = load({ [legacyKey]: raw }, 'remove'), { state, values } = loaded;
  assert.equal(state.storageOK, false);
  assertProfile(state, saved);
  assertProfile(JSON.parse(values.get(storageKey)), saved);
  assert.equal(loaded.save().storageOK, true);
  assertProfile(JSON.parse(values.get(storageKey)), saved);
  assert.equal(values.get(legacyKey), raw);
  const reloaded = load(Object.fromEntries(values));
  assertProfile(reloaded.state, saved);
  assert.equal(reloaded.state.storageOK, true);
  assert.deepEqual(reloaded.calls, [['get', storageKey], ['set', storageKey]]);
});

test('unavailable storage leaves usable defaults without throwing', () => {
  for (const failure of ['get', 'legacy-get', 'all']) {
    const raw = JSON.stringify(profile());
    const loaded = load({ [legacyKey]: raw }, failure), { state, values, calls } = loaded;
    assert.equal(state.storageOK, false);
    assert.deepEqual(state.settings, E.DEFAULT_SETTINGS);
    assert.equal(state.totalStats.attempts, 0);
    assert.equal(values.has(storageKey), false);
    assert.deepEqual(calls, failure === 'legacy-get' ? [['get', storageKey], ['get', legacyKey]] : [['get', storageKey]]);
    // A later successful save clears storageOK's error; fully blocked storage cannot.
    assert.equal(loaded.save().storageOK, failure !== 'all');
    assert.equal(values.has(storageKey), failure !== 'all');
    if (values.has(storageKey)) assert.deepEqual(JSON.parse(values.get(storageKey)).settings, E.DEFAULT_SETTINGS);
    assert.equal(values.get(legacyKey), raw);
  }
});

test('hair choice persists without changing records, handling, keys or progress', () => {
  for (const hairSkin of ['side', 'center', 'intake']) {
    const saved = profile(); saved.ui.hairSkin = hairSkin;
    const loaded = load({ [storageKey]: JSON.stringify(saved) });
    assertProfile(loaded.state, saved);
    assert.equal(loaded.state.ui.hairSkin, hairSkin);
    loaded.save();
    const reloaded = load(Object.fromEntries(loaded.values));
    assert.equal(reloaded.state.ui.hairSkin, hairSkin);
    assertProfile(reloaded.state, saved);
  }
});

test('missing or invalid cosmetic choice falls back without losing an existing profile', () => {
  for (const hairSkin of [undefined, null, '', 'original', 'lifted', '<svg>', false, 7, {}, []]) {
    const saved = profile(); Object.assign(saved.ui, { hairSkin, outfitSkin: 'cape', pieceCueTiming: 'current', pieceCueVolume: 37 });
    for (const key of [storageKey, legacyKey]) {
      const loaded = load({ [key]: JSON.stringify(saved) });
      assert.equal(loaded.state.ui.hairSkin, 'center');
      assert.equal(loaded.state.ui.outfitSkin, 'cape');
      assert.equal(loaded.state.ui.pieceCueTiming, 'current'); assert.equal(loaded.state.ui.pieceCueVolume, 37);
      assert.equal(loaded.state.storageOK, true);
      assertProfile(loaded.state, saved);
      assert.deepEqual(JSON.parse(loaded.values.get(storageKey)).ui, loaded.state.ui);
      assert.deepEqual(loaded.validate(saved).ui, loaded.state.ui);
    }
  }
});

test('outfit, hair and cue choices normalize and persist together before any user action', () => {
  for (const outfitSkin of ['uniform', 'cape']) for (const hairSkin of ['side', 'center', 'intake']) {
    const saved = profile(); Object.assign(saved.ui, { outfitSkin, hairSkin, pieceCueTiming: 'current', pieceCueVolume: 37 });
    for (const key of [storageKey, legacyKey]) {
      const loaded = load({ [key]: JSON.stringify(saved) });
      const persisted = JSON.parse(loaded.values.get(storageKey));
      assert.deepEqual(persisted.ui, loaded.state.ui, 'startup must persist the full normalized UI');
      assert.deepEqual(loaded.validate(persisted).ui, loaded.state.ui, 'JSON import retains both features');
      const state = load(Object.fromEntries(loaded.values)).state;
      assertProfile(state, saved); assert.equal(state.ui.outfitSkin, outfitSkin); assert.equal(state.ui.hairSkin, hairSkin);
      assert.equal(state.ui.pieceCueTiming, 'current'); assert.equal(state.ui.pieceCueVolume, 37);
    }
  }
});

test('invalid or missing outfit uses uniform without losing the profile or selected hair', () => {
  for (const outfitSkin of [undefined, null, '', 'goth', 1, false, {}, []]) {
    const saved = profile(); Object.assign(saved.ui, { outfitSkin, hairSkin: 'side', pieceCueTiming: 'off', pieceCueVolume: 24 });
    for (const key of [storageKey, legacyKey]) {
      const loaded = load({ [key]: JSON.stringify(saved) }), { state } = loaded;
      assertProfile(state, saved); assert.equal(state.ui.outfitSkin, 'uniform'); assert.equal(state.ui.hairSkin, 'side');
      assert.equal(state.ui.pieceCueTiming, 'off'); assert.equal(state.ui.pieceCueVolume, 24);
      assert.deepEqual(JSON.parse(loaded.values.get(storageKey)).ui, state.ui);
      assert.deepEqual(loaded.validate(saved).ui, state.ui);
    }
  }
});
