'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const E = require('../src/engine.js');
const M = require('../src/mascot.js');
const A = require('../src/audio.js');

// Run real app events and judgements with rendering sinks. Browser checks own
// layout/animation assertions; no helper injects a result or changes a count.
function loadApp(bubbles = true) {
  let time = 0, overlay = false, frame, comboPlaying = false;
  const listeners = new Map(), played = [], stopped = [];
  const node = () => ({ innerHTML: '', textContent: '', dataset: {}, style: {}, hidden: true,
    classList: { add() {}, remove() {} }, focus() {}, getBoundingClientRect: () => ({ width: 0, height: 0 }) });
  function observedNode() {
    const result = node(), writes = [];
    let html = '', text = '', hidden = true;
    Object.defineProperties(result, {
      innerHTML: { get: () => html, set(value) { writes.push(['innerHTML', value]); html = value; text = value.replace(/<[^>]*>/g, ''); } },
      textContent: { get: () => text, set(value) { writes.push(['textContent', value]); text = html = value; } },
      hidden: { get: () => hidden, set(value) { writes.push(['hidden', value]); hidden = value; } }
    });
    result.dataset = new Proxy({}, { set(target, key, value) { writes.push(['data-' + key, value]); target[key] = String(value); return true; } });
    result.classList = { add: value => writes.push(['addClass', value]), remove: value => writes.push(['removeClass', value]) };
    result.writes = writes;
    return result;
  }
  const app = node(), nodes = new Map([
    ['#app', app], ['#toast', node()], ['#board', node()], ['.key-help', node()],
    ['#coach-speech .bubble-text', node()], ['#coach-mascot', node()],
    ...['piece-bars', 'next-preview', 'hold-preview', 'hold-note', 'practice-wrap', 'play-footer', 'demo-keys', 'demo-caption', 'tutorial-result']
      .map(id => ['#' + id, node()]),
    ['[data-act=try-it]', node()], ['.overlay .primary', node()]
  ]);
  let markup = '', display, announcement;
  Object.defineProperty(app, 'innerHTML', {
    get: () => markup,
    set(value) { markup = value; display = observedNode(); announcement = observedNode(); }
  });
  app.insertAdjacentHTML = () => { overlay = true; };
  const document = {
    activeElement: null, body: { dataset: {} },
    querySelector(selector) {
      if (selector === '#combo-display') return app.innerHTML.includes('id="combo-display"') ? display : null;
      if (selector === '#combo-announcement') return app.innerHTML.includes('id="combo-announcement"') ? announcement : null;
      if (selector === '.overlay') return overlay ? { remove() { overlay = false; } } : null;
      return nodes.get(selector) || null;
    },
    querySelectorAll: () => [],
    addEventListener: (name, callback) => listeners.set(name, callback),
    dispatchEvent(event) { event.target = document; event.preventDefault = () => {}; listeners.get(event.type)(event); }
  };
  const window = { addEventListener() {}, scrollTo() {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/app.js'), 'utf8'), {
    MiruTet: { ...E, mascot: M },
    MiruTetAudio: { ...A, createAudioEngine(...args) {
      const engine = A.createAudioEngine(...args);
      return { ...engine,
        combo(count) { played.push(count); comboPlaying = true; engine.combo(count); },
        stopCombo() { stopped.push(args[0]().zeroFault); comboPlaying = false; engine.stopCombo(); }
      };
    } },
    document, window, HTMLElement: class {}, KeyboardEvent: class {
      constructor(type, options) { Object.assign(this, { type }, options); }
    },
    performance: { now: () => time }, matchMedia: () => ({ matches: false }),
    localStorage: { getItem: () => JSON.stringify({ settings: { are: 0 }, ui: { bubbles } }), setItem() {} },
    requestAnimationFrame: callback => { frame = callback; return 1; }
  });
  const key = (code, down) => { time++; window.__mirutet.dispatch(code, down); };
  const tap = code => { key(code, true); key(code, false); };
  return {
    app, played, stopped, tap, key, nodes,
    get display() { return display; }, get announcement() { return announcement; },
    get comboPlaying() { return comboPlaying; },
    advance(ms) { time += ms; frame(); },
    state: () => JSON.parse(JSON.stringify(window.__mirutet.getState())),
    click(act) { listeners.get('click')({ target: { closest: () => ({ dataset: { act, index: '0' }, disabled: false }) } }); },
    area(value) { listeners.get('change')({ target: { dataset: {}, id: 'area', value, hasAttribute: () => false } }); },
    zeroFault(checked) { listeners.get('change')({ target: { dataset: { ui: 'zeroFault' }, checked, hasAttribute: () => false } }); },
    target() { window.__mirutet.chooseTarget('O', { rot: 0, x: 4 }, { delay: 0 }); },
    perfect() { window.__mirutet.chooseTarget('O', { rot: 0, x: 4 }, { delay: 0 }); tap('Space'); }
  };
}

test('app shows COMBO from two real Perfects and speaks only at 5/10/20/50', () => {
  const r = loadApp(); r.click('drill');
  assert.equal(r.display.hidden, true);
  const visualMarkup = r.app.innerHTML.match(/<div class="finesse-combo"[\s\S]*?<\/div>/)[0];
  assert.doesNotMatch(visualMarkup, /role="status"|aria-live="polite"|aria-atomic/);
  assert.match(r.app.innerHTML, /<span id="combo-announcement"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
  const announcements = [];
  for (let count = 1; count <= 51; count++) {
    const displayWrites = r.display.writes.filter(([key]) => key === 'innerHTML').length;
    const announcementWrites = r.announcement.writes.length;
    r.perfect();
    const s = r.state();
    assert.equal(s.lastResult.status, 'perfect'); assert.equal(s.combo.count, count);
    assert.equal(r.display.hidden, count < 2);
    assert.equal(Number(r.display.dataset.tier), [...E.COMBO_MILESTONES].reverse().find(tier => tier <= count) || 0);
    assert.equal(r.display.writes.filter(([key]) => key === 'innerHTML').length - displayWrites, count >= 2 ? 1 : 0,
      'each visible count renders once, including the following target event');
    assert.equal(r.announcement.writes.length - announcementWrites, E.COMBO_MILESTONES.includes(count) ? 1 : 0);
    if (E.COMBO_MILESTONES.includes(count)) announcements.push(r.announcement.textContent);
    if (count >= 2) assert.match(r.display.innerHTML, new RegExp('>' + count + '<'));
    if (E.COMBO_MILESTONES.includes(count)) assert.equal(s.bubble, M.COMBO_LINES[count][0]);
    else assert.doesNotMatch(s.bubble, /COMBO/);
    const writes = [r.display.writes.length, r.announcement.writes.length];
    r.target(); r.click('skip');
    assert.deepEqual([r.display.writes.length, r.announcement.writes.length], writes,
      'unchanged-count target changes and skips do not mutate either combo node');
  }
  assert.deepEqual(announcements, ['5 COMBO', '10 COMBO', '20 COMBO', '50 COMBO']);
  assert.deepEqual(r.played, Array.from({ length: 50 }, (_, i) => i + 2));
  r.target(); r.tap('KeyX'); r.tap('Space');
  assert.equal(r.state().lastResult.status, 'fault'); assert.equal(r.state().combo.count, 0);
  assert.equal(r.display.hidden, true);
  assert.equal(r.announcement.textContent, '');
  assert.doesNotMatch(r.state().bubble, /です|ます|ましょう|ください|♪/);
  assert.doesNotMatch(r.app.innerHTML.match(/<header[\s\S]*?<\/header>/)[0], /COMBO|combo|フィネス編/);
});

test('IRS corrective and lesson-completion feedback take priority over milestone bubbles', () => {
  const r = loadApp(); r.click('tutorial');
  for (let i = 0; i < 3; i++) r.click('next-lesson');
  r.click('try-it');
  for (let count = 1; count <= 9; count++) {
    // Use the actual lesson target, rotating only after spawn: finesse-Perfect,
    // but no IRS. In particular the fifth placement must retain the correction.
    r.advance(350); r.tap('KeyX'); r.tap('Space');
    const s = r.state();
    assert.equal(s.lastResult.status, 'perfect');
    assert.ok(s.lastResult.inputs.every(input => !input.irs));
    assert.equal(s.combo.count, count); assert.equal(s.tryIndex, 0); assert.equal(s.tryDone, false);
    assert.equal(s.bubble, '出現前の待ち時間に、回転を長押ししてみましょうね。');
    assert.equal(s.expression, 'thinking');
    assert.equal(r.nodes.get('#coach-speech .bubble-text').textContent, s.bubble);
    assert.equal(r.nodes.get('#coach-mascot').dataset.expression, 'thinking');
    assert.equal(r.nodes.get('#tutorial-result').textContent, s.bubble);
  }
  r.key('KeyX', true); r.advance(350); r.key('KeyX', false); r.tap('Space');
  const s = r.state();
  assert.equal(s.combo.count, 10); assert.equal(s.tryDone, true);
  assert.ok(s.lastResult.inputs.some(input => input.irs));
  assert.equal(s.bubble, '大成功ですっ！あなた、最短の操作を覚えられましたね♪');
  assert.equal(s.expression, 'happy');
  assert.equal(r.nodes.get('#coach-speech .bubble-text').textContent, s.bubble);
});

test('inline zero-fault changes in either direction reset combo and cancel its audio', () => {
  const r = loadApp(); r.click('drill');
  for (const checked of [true, false]) {
    for (let count = 1; count <= 5; count++) r.perfect();
    const before = r.state(), stops = r.stopped.length;
    assert.equal(r.comboPlaying, true);
    r.zeroFault(before.ui.zeroFault);
    assert.equal(r.state().combo.count, 5, 'unchanged checkbox values preserve the combo');
    assert.equal(r.stopped.length, stops); assert.equal(r.comboPlaying, true);
    const writes = [r.display.writes.length, r.announcement.writes.length];
    r.zeroFault(checked);
    const after = r.state();
    assert.equal(after.ui.zeroFault, checked);
    assert.deepEqual(after.combo, { count: 0, tier: 0 });
    assert.equal(r.display.hidden, true); assert.equal(r.display.textContent, '');
    assert.equal(r.announcement.textContent, ''); assert.doesNotMatch(after.bubble, /COMBO/);
    assert.equal(r.comboPlaying, false); assert.ok(r.stopped.length > stops);
    assert.equal(r.stopped[stops], !checked, 'cancel combo audio before applying the new policy');
    assert.deepEqual(after.stats, before.stats, 'changing the policy preserves session records');
    assert.ok(r.display.writes.length > writes[0]); assert.ok(r.announcement.writes.length > writes[1]);
    r.perfect(); assert.equal(r.state().combo.count, 1);
    r.target(); r.tap('KeyX'); r.tap('Space');
    assert.equal(r.state().lastResult.status, 'fault'); assert.equal(r.state().combo.count, 0);
  }
});

test('retry/restart, practice changes and leaving play clear combo; pause alone preserves it', () => {
  const r = loadApp(); r.click('drill'); r.perfect(); r.perfect();
  r.click('pause'); assert.equal(r.state().combo.count, 2);
  r.click('resume'); assert.equal(r.state().combo.count, 2);
  r.click('retry'); assert.equal(r.state().combo.count, 0); assert.equal(r.display.hidden, true);
  for (let i = 0; i < 5; i++) r.perfect();
  assert.match(r.state().bubble, /5 COMBO/);
  r.click('settings'); r.click('close-settings'); r.click('resume');
  assert.equal(r.state().combo.count, 0);
  assert.doesNotMatch(r.state().bubble, /COMBO/, 'a previous milestone must not reappear after returning');
  r.perfect(); r.perfect(); r.area('left');
  assert.equal(r.state().combo.count, 0); assert.equal(r.display.hidden, true);
  for (const destination of ['settings', 'records-session', 'drill', 'tutorial', 'sprint', 'menu']) {
    r.click('drill'); r.perfect(); r.perfect();
    r.click(destination);
    assert.equal(r.state().combo?.count || 0, 0, destination);
    if (destination !== 'drill') assert.doesNotMatch(r.app.innerHTML, /id="combo-display"/);
    if (destination === 'settings') {
      r.click('close-settings'); r.click('resume');
      assert.equal(r.state().combo.count, 0, 'returning does not restore an old combo');
    }
  }
  r.click('tutorial'); r.click('try-it');
  assert.equal(r.state().combo.count, 0);
  assert.match(r.app.innerHTML, /id="combo-display"/);
  r.perfect(); assert.equal(r.state().combo.count, 1);
  r.click('try-it'); assert.equal(r.state().combo.count, 0, 'challenge restart');
  r.click('demo'); assert.equal(r.state().combo, undefined);
  assert.doesNotMatch(r.app.innerHTML, /id="combo-display"/);
});

test('combo milestone feedback respects bubbles off in drill and lesson challenge', () => {
  for (const challenge of [false, true]) {
    const r = loadApp(false);
    if (challenge) {
      r.click('tutorial');
      // The IRS lesson allows finesse-perfect placements without IRS to be
      // retried, so its live challenge can reach a five-placement combo.
      for (let i = 0; i < 3; i++) r.click('next-lesson');
      r.click('try-it');
    } else r.click('drill');
    for (let count = 1; count <= 5; count++) r.perfect();
    assert.equal(r.state().combo.count, 5);
    assert.doesNotMatch(r.state().bubble, /COMBO/);
    assert.equal(r.display.hidden, false);
    if (!challenge) assert.doesNotMatch(r.app.innerHTML, /id="coach-speech"/);
  }
});
