'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const E = require('../src/engine.js');
const M = require('../src/mascot.js');
const A = require('../src/audio.js');

// Real app listeners and engine; DOM sinks follow app.combo.test.js. No test
// helper edits board cells, results or counters. Chrome checks layout/focus.
function loadApp(profile = {}) {
  let time = 0, frame, markup = '', overlay = '';
  const listeners = new Map(), windowListeners = new Map(), nodes = new Map(), cues = [], sounds = [];
  const node = () => ({ innerHTML: '', textContent: '', dataset: {}, style: {}, hidden: true,
    classList: { add() {}, remove() {} }, getAnimations: () => [], setAttribute() {}, focus() {}, getBoundingClientRect: () => ({ width: 0, height: 0 }) });
  const app = node();
  Object.defineProperty(app, 'innerHTML', {
    get: () => markup, set(value) { markup = value; overlay = ''; nodes.clear(); }
  });
  app.insertAdjacentHTML = (position, value) => { overlay += value; };
  const toast = node();
  const get = selector => {
    if (selector === '#app') return app;
    if (selector === '#toast') return toast;
    if (selector === '.lesson-board') return null;
    if (selector === '.overlay') return overlay ? { remove() { overlay = ''; }, querySelectorAll: () => [] } : null;
    if (selector.startsWith('#') && !markup.includes(`id="${selector.slice(1).split(' ')[0]}"`)) return null;
    if (!nodes.has(selector)) nodes.set(selector, node());
    return nodes.get(selector);
  };
  const document = {
    activeElement: null, hidden: false, body: { dataset: {} }, querySelector: get, querySelectorAll: () => [],
    addEventListener: (name, callback) => listeners.set(name, callback),
    dispatchEvent(event) {
      event.target ??= document; event.defaultPrevented = false;
      event.preventDefault = () => { event.defaultPrevented = true; };
      listeners.get(event.type)(event);
    }
  };
  const button = act => ({ dataset: { act }, disabled: false,
    closest(selector) {
      if (selector === '.gameover') return overlay.includes('overlay gameover') ? get('.overlay') : null;
      return ['button', 'button[data-act]'].includes(selector) ? this : null;
    }
  });
  const window = { innerWidth: 1280, innerHeight: 720, addEventListener: (name, callback) => windowListeners.set(name, callback), scrollTo() {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/app.js'), 'utf8'), {
    MiruTet: { ...E, mascot: M, FreeSession: class extends E.FreeSession {
      constructor(options) { super({ ...options, rng: () => .99999 }); }
    } },
    MiruTetAudio: { ...A, createAudioEngine: () => ({
      unlock() {}, configure() {}, stopCues() {}, stopCombo() {}, combo() {},
      piece: type => cues.push(type), sound: kind => sounds.push(kind)
    }) },
    document, window, HTMLElement: class {}, KeyboardEvent: class {
      constructor(type, options) { Object.assign(this, { type }, options); }
    },
    performance: { now: () => time }, matchMedia: () => ({ matches: false }),
    localStorage: { getItem: () => JSON.stringify({ settings: { are: 0 }, ...profile }), setItem() {} },
    requestAnimationFrame: callback => { frame = callback; return 1; },
    cancelAnimationFrame: () => { frame = null; }
  });
  return {
    app, cues, sounds, get,
    state: () => JSON.parse(JSON.stringify(window.__mirutet.getState())),
    dispatch(event) { document.dispatchEvent(event); return event; },
    get overlay() { return overlay; },
    get frameScheduled() { return !!frame; },
    blur() { windowListeners.get('blur')(); },
    visibility(hidden) { document.hidden = hidden; document.dispatchEvent({ type: 'visibilitychange' }); },
    pagehide() { windowListeners.get('pagehide')(); },
    pageshow() { windowListeners.get('pageshow')(); },
    click(act, data = {}) { const target = button(act); Object.assign(target.dataset, data); listeners.get('click')({ target }); },
    key(code, down = true, repeat = false, act) {
      const event = { type: down ? 'keydown' : 'keyup', code, repeat, target: act ? button(act) : document };
      time++; document.dispatchEvent(event); return event;
    },
    tap(code, act) { const event = this.key(code, true, false, act); this.key(code, false, false, act); return event; },
    advance(ms) { time += ms; const callback = frame; frame = null; callback?.(); },
    enter() { this.click('mode-free'); this.click('free'); }
  };
}

function topOut(app) {
  for (let i = 0; i < 20 && !app.state().stats.gameOver; i++) app.tap('Space');
  assert.equal(app.state().stats.gameOver, true);
}

test('category navigation exposes free play alongside finesse, then renders only four stats', () => {
  const app = loadApp({ practice: { pieces: ['O'], area: 'left' }, ui: { zeroFault: true } });
  assert.match(app.app.innerHTML, /aria-label="メインメニュー"/);
  assert.match(app.app.innerHTML, /data-act="mode-finesse"[^>]*><span><b>フィネス<\/b>/);
  assert.match(app.app.innerHTML, /data-act="mode-free"[^>]*><span><b>フリー<\/b>/);
  app.enter();
  const s = app.state(); assert.equal(s.screen, 'play'); assert.equal(s.mode, 'free');
  assert.match(app.app.innerHTML, /data-live-handling/);
  assert.equal(s.round, undefined); assert.equal(s.stats.running, true);
  assert.match(app.app.innerHTML, /<h1 class="play-title">フリーモード<\/h1>/);
  for (const id of ['lines', 'pieces', 'elapsed', 'pps']) assert.match(app.app.innerHTML, new RegExp(`id="${id}"`));
  assert.doesNotMatch(app.app.innerHTML, /practice-options|SESSION|目標|正確率|連続パーフェクト|フォルト \/ 試行|data-ui|data-act="hint"|data-act="skip"/);
  const header = app.app.innerHTML.match(/<header[\s\S]*?<\/header>/)[0];
  assert.match(header, /ミルテト/); assert.doesNotMatch(header, /フィネス編|フリーモード|COMBO/);
  assert.match(app.app.innerHTML, /class="speaker">ミルフィ<\/span>/);
  assert.match(s.bubble, /あなた.*わたし.*ですっ/);
  app.click('menu'); app.click('mode-finesse');
  assert.match(app.app.innerHTML, /data-act="drill"/); assert.doesNotMatch(app.app.innerHTML, /data-act="free"/);
  assert.match(app.app.innerHTML, /ミノとエリアを選んで/);
  app.click('drill'); assert.match(app.app.innerHTML, /<span class="tag">TARGET PRACTICE<\/span>/);
});

test('free gameplay updates stats, finesse and combo through real input, while preserving practice records', () => {
  const app = loadApp(), total = app.state().totalStats;
  app.enter(); assert.deepEqual(app.cues, ['O']);
  app.advance(1000);
  app.tap('Space'); app.advance(100);
  assert.equal(app.state().stats.pieces, 1); assert.equal(app.get('#pieces').textContent, 1);
  assert.equal(app.get('#lines').textContent, 0);
  assert.notEqual(app.get('#elapsed').textContent, '00:00.00');
  assert.ok(Number(app.get('#pps').textContent) > 0);
  assert.equal(app.get('#result-panel').innerHTML, '<div class="result-head"><strong>✔ Perfect</strong></div>');
  assert.doesNotMatch(app.get('#result-panel').innerHTML, /最短|\d+\s*\//);
  app.tap('Space'); assert.equal(app.state().combo.count, 2);
  app.tap('ArrowLeft'); app.tap('ArrowRight'); app.tap('Space');
  assert.equal(app.state().lastResult.status, 'fault'); assert.equal(app.state().combo.count, 0);
  assert.equal(app.get('#result-panel').innerHTML, '<div class="result-head"><strong>フォルト +2</strong></div>');
  assert.doesNotMatch(app.get('#result-panel').innerHTML, /最短|\d+\s*\//);
  assert.doesNotMatch(app.state().bubble, /です|ます|♪/);
  assert.equal(app.state().stats.pieces, 3); assert.deepEqual(app.state().totalStats, total);
  assert.deepEqual(app.sounds, ['perfect', 'perfect', 'fault']);
  assert.equal(app.cues.length, 4);
  app.tap('KeyH'); app.tap('KeyN'); assert.equal(app.state().stats.pieces, 3);
});

test('game over offers restart by key/button and return to menu; restart clears the entire session', () => {
  const app = loadApp(); app.enter(); app.tap('KeyC');
  assert.equal(app.state().heldPiece, 'I'); topOut(app);
  assert.match(app.overlay, /aria-label="ゲームオーバー"/);
  assert.match(app.overlay, /data-act="restart"/); assert.match(app.overlay, /data-act="menu"/);
  const ended = app.state(); app.advance(5000);
  assert.equal(app.state().stats.elapsed, ended.stats.elapsed);
  app.key('KeyR', true, true); assert.equal(app.state().stats.gameOver, true, 'OS repeat cannot restart');
  app.tap('KeyR');
  assert.equal(app.overlay, ''); assert.equal(app.state().stats.gameOver, false);
  assert.equal(app.state().stats.pieces, 0); assert.equal(app.state().stats.lines, 0);
  assert.equal(app.state().heldPiece, null); assert.equal(app.state().lastResult, null);
  assert.equal(app.state().combo.count, 0); assert.equal(app.state().stats.elapsed, 1);
  app.tap('Space'); app.click('restart'); assert.equal(app.state().stats.pieces, 0);
  topOut(app); app.advance(500); app.click('restart'); assert.equal(app.overlay, ''); assert.equal(app.state().stats.pieces, 0);
  topOut(app); app.tap('Escape'); assert.equal(app.state().screen, 'menu');
  app.enter(); topOut(app); app.advance(500); app.click('menu'); assert.equal(app.state().screen, 'menu');
});

test('game-over guard cancels Space/Enter/retry and dialog clicks, and always cancels key repeats', () => {
  for (const act of ['restart', 'menu', undefined]) {
    const app = loadApp(); app.enter(); topOut(app);
    for (const code of ['Space', 'Enter', 'KeyR']) {
      assert.equal(app.tap(code, act).defaultPrevented, true, `${code} on ${act || 'document'} during guard`);
    }
    app.click('restart'); app.click('menu');
    assert.equal(app.state().screen, 'play'); assert.equal(app.state().stats.gameOver, true);
    app.advance(500);
    for (const code of ['Space', 'Enter', 'KeyR', 'Escape']) {
      assert.equal(app.key(code, true, true, act).defaultPrevented, true, `repeat ${code} on ${act || 'document'}`);
      app.key(code, false, false, act);
    }
    assert.equal(app.state().screen, 'play'); assert.equal(app.state().stats.gameOver, true);
    if (act) {
      for (const code of ['Space', 'Enter']) {
        assert.equal(app.tap(code, act).defaultPrevented, false, 'fresh native button activation works after guard');
      }
      app.click(act);
      assert.equal(app.overlay, '');
      assert.equal(app.state().screen, act === 'menu' ? 'menu' : 'play');
    } else {
      app.tap('KeyR'); assert.equal(app.state().stats.gameOver, false);
    }
  }
});

test('retry becomes available exactly 500 ms after game over, using the app clock', () => {
  const app = loadApp(); app.enter(); topOut(app);
  // topOut releases Space 1 ms after the dialog opens.
  app.advance(496); app.tap('KeyR');
  assert.equal(app.state().stats.gameOver, true);
  app.key('KeyR');
  assert.equal(app.state().stats.gameOver, false); assert.equal(app.overlay, '');
  app.key('KeyR', false);
  topOut(app); app.click('restart');
  assert.equal(app.state().stats.gameOver, true, 'each game over starts a new guard');
  app.advance(500); app.click('restart'); assert.equal(app.state().stats.gameOver, false);
});

test('game-over dialog shows only the four final stats in HUD format and keeps them frozen', () => {
  const app = loadApp(); app.enter(); app.advance(1234); topOut(app);
  const final = app.state().stats, dialog = app.overlay;
  assert.ok(final.pieces > 0); assert.ok(final.elapsed > 0); assert.ok(final.pps > 0);
  const entries = [...dialog.matchAll(/<div class="stat"><label>([^<]+)<\/label><strong>([^<]+)<\/strong><\/div>/g)]
    .map(([, label, value]) => [label, value]);
  assert.deepEqual(entries, [['lines', 'ライン'], ['pieces', 'ミノ'], ['elapsed', '時間'], ['pps', 'PPS']]
    .map(([id, label]) => [label, String(app.get('#' + id).textContent)]));
  assert.doesNotMatch(dialog, /<p\b|<svg\b|speaker|eyebrow/);
  app.advance(5000);
  assert.deepEqual(app.state().stats, final); assert.equal(app.overlay, dialog);
});

test('free mode shares pause, sound/cue preferences and rebinding with a shared live handling panel', () => {
  const defaults = loadApp().state().bindings;
  const app = loadApp({ ui: { bubbles: false, sound: false, pieceCueTiming: 'off' },
    bindings: { ...defaults, retry: ['KeyQ'], pause: ['KeyP'] } });
  app.enter(); assert.doesNotMatch(app.app.innerHTML, /id="coach-speech"/);
  assert.deepEqual(app.cues, []);
  app.tap('Space'); app.advance(100); app.tap('Escape');
  assert.equal(app.state().paused, true);
  assert.match(app.overlay, /data-act="resume">再開 P<\/button>/);
  const paused = app.state(); app.advance(1000);
  assert.equal(app.state().stats.elapsed, paused.stats.elapsed); assert.deepEqual(app.state().active, paused.active);
  app.tap('Escape'); assert.equal(app.state().paused, false);
  app.tap('KeyQ'); assert.equal(app.state().stats.pieces, 0);
  topOut(app); assert.match(app.overlay, /もう一度 Q/);
  app.tap('KeyQ'); assert.equal(app.state().stats.gameOver, true);
  app.advance(500);
  app.tap('KeyQ'); assert.equal(app.state().stats.gameOver, false);
  app.click('settings'); assert.equal(app.state().screen, 'settings'); assert.equal(app.state().paused, true);
  assert.match(app.app.innerHTML, /0：練習はなし／フリーは毎秒1マス/);
  assert.doesNotMatch(app.app.innerHTML.match(/<header[\s\S]*?<\/header>/)[0], /フィネス編|フリーモード/);
  app.click('close-settings'); assert.equal(app.state().mode, 'free'); assert.match(app.overlay, /一時停止/);
  app.click('resume'); assert.equal(app.state().paused, false);
});

test('an airborne mid-interval pause resumes with the remaining gravity time', () => {
  const app = loadApp(); app.enter(); app.advance(900);
  const active = app.state().active;
  app.click('pause'); app.advance(1000);
  assert.deepEqual(app.state().active, active); assert.equal(app.state().stats.elapsed, 900);
  app.click('resume'); app.advance(99); assert.deepEqual(app.state().active, active);
  app.advance(1); assert.equal(app.state().active.y, active.y - 1);
  assert.equal(app.state().stats.elapsed, 1000);
});

for (const event of ['blur', 'hidden', 'pagehide']) test(`${event} pauses free play, clears held inputs and requires deliberate resume`, () => {
  const app = loadApp(); app.enter(); app.advance(150);
  app.key('ArrowLeft'); app.key('ArrowRight'); app.key('ArrowUp'); app.advance(200);
  assert.deepEqual(app.state().held, ['ArrowLeft', 'ArrowRight', 'ArrowUp']);
  const before = app.state();
  if (event === 'hidden') app.visibility(true); else app[event]();
  assert.equal(app.state().paused, true); assert.equal(app.state().stats.running, true);
  assert.deepEqual(app.state().held, []); assert.deepEqual(app.state().active, before.active);
  if (event === 'pagehide') assert.equal(app.frameScheduled, false);
  // Duplicate lifecycle signals produce one dialog; returning never resumes play.
  app.blur(); app.visibility(true); app.pagehide(); app.pageshow(); app.visibility(false);
  assert.equal(app.frameScheduled, true); assert.equal(app.state().paused, true);
  assert.equal((app.overlay.match(/role="dialog"/g) || []).length, 1);
  assert.match(app.overlay, /aria-label="一時停止"/);
  app.advance(5000); app.tap('Space');
  assert.equal(app.state().stats.elapsed, before.stats.elapsed);
  assert.deepEqual(app.state().active, before.active); assert.deepEqual(app.state().held, []);
  app.click('resume'); assert.equal(app.overlay, ''); assert.equal(app.state().paused, false);
  assert.deepEqual(app.state().active, before.active); assert.deepEqual(app.state().held, []);
  app.advance(100); assert.ok(app.state().stats.elapsed > before.stats.elapsed);
});


test('BL-145 top has exactly six ordered entrances, Japanese descriptions and Mirufi without progress clutter', () => {
  const app = loadApp({ progress: { current: 3, completed: [1, 3] } });
  const entries = [...app.app.innerHTML.matchAll(/<button class="category-card ([^"]+)" data-act="([^"]+)"><span><b>([^<]+)<\/b><small>([^<]+)<\/small>/g)];
  assert.deepEqual(entries.map(m => m[2]), ['mode-free', 'mode-finesse', 'mode-spin', 'dressup', 'records', 'settings']);
  assert.deepEqual(entries.map(m => m[3]), ['フリー', 'フィネス', '回転入れ', 'きせかえ', '記録', '設定']);
  assert.equal((app.app.innerHTML.match(/<button\b/g) || []).length, 6);
  entries.forEach((entry, i) => {
    assert.equal(entry[1], i < 3 ? 'category-practice' : 'category-secondary');
    assert.match(entry[4], /[ぁ-んァ-ン一-龠]/);
    assert.doesNotMatch(entry[4], /[\r\n]/);
  });
  assert.match(app.app.innerHTML, /ミルフィ/);
  assert.doesNotMatch(app.app.innerHTML, /data-act="(?:tutorial|lessons|drill|sprint|spins)"|チャレンジを達成|2 \/ 12/);
  const icons = [...app.app.innerHTML.matchAll(/<svg class="category-tetromino" data-mino="([^"]+)"[^>]*>(.*?)<\/svg>/g)];
  assert.deepEqual(icons.map(icon => icon[1]), ['O', 'I', 'T']);
  for (const [, type, svg] of icons) {
    const cells = [...svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"[^>]*fill="([^"]+)"/g)];
    assert.equal(cells.length, 4);
    const minX = Math.min(...E.SHAPES[type][0].map(([x]) => x));
    const maxY = Math.max(...E.SHAPES[type][0].map(([, y]) => y));
    assert.deepEqual(cells.map(([, x, y]) => [(Number(x) - 2) / 24, (Number(y) - 2) / 24]),
      E.SHAPES[type][0].map(([x, y]) => [x - minX, maxY - y]));
    for (const cell of cells) {
      assert.equal(cell[3], cell[4], 'Cells are square');
      assert.equal(cell[5], E.COLORS[type], 'Use the exact engine color');
    }
  }
});

test('BL-145 finesse contains former lesson, list, drill and sprint entries; all twelve lessons open', () => {
  const app = loadApp({ progress: { current: 3, completed: [1, 3] } });
  const category = () => { app.click('menu'); app.click('mode-finesse'); assert.equal(app.state().screen, 'finesse'); };
  category();
  for (const action of ['tutorial', 'lessons', 'drill', 'sprint']) assert.match(app.app.innerHTML, new RegExp(`data-act="${action}"`));
  assert.match(app.app.innerHTML, /2 \/ 12 レッスン/);
  app.click('tutorial'); assert.equal(app.state().screen, 'tutorial'); assert.equal(app.state().lessonIndex, 3);
  for (let i = 0; i < 12; i++) {
    category(); app.click('lessons'); assert.equal(app.state().screen, 'lessons');
    assert.equal((app.app.innerHTML.match(/data-act="lesson"/g) || []).length, 12);
    app.click('lesson', { index: String(i) }); assert.equal(app.state().screen, 'tutorial'); assert.equal(app.state().lessonIndex, i);
    app.tap('Escape'); assert.equal(app.state().screen, 'menu');
  }
  category(); app.click('drill'); assert.equal(app.state().mode, 'finesse');
  assert.match(app.app.innerHTML, /data-piece-filter="I"/);
  app.tap('Escape'); assert.match(app.overlay, /data-act="menu"/); app.click('menu');
  category(); app.click('sprint'); assert.equal(app.state().screen, 'sprint');
  for (const length of [40, 100]) assert.match(app.app.innerHTML, new RegExp(`data-length="${length}"`));
  assert.match(app.app.innerHTML, /id="custom-length"/);
  app.tap('Escape'); assert.equal(app.state().screen, 'menu');
});

test('BL-145 spin category contains continue, all eight sets and every selectable drill', () => {
  const app = loadApp({ spin: { current: 't-single-right', completed: ['t-single-left'] } });
  const category = () => { app.click('menu'); app.click('mode-spin'); assert.equal(app.state().screen, 'spins'); };
  category();
  assert.match(app.app.innerHTML, /data-act="spin-continue"/);
  assert.match(app.app.innerHTML, /問題一覧/);
  assert.equal((app.app.innerHTML.match(/class="spin-set"/g) || []).length, 8);
  assert.equal((app.app.innerHTML.match(/data-act="spin-drill"/g) || []).length, 36);
  assert.match(app.app.innerHTML, /1 \/ 36 達成/);
  app.click('spin-continue'); assert.equal(app.state().round.drillId, 't-single-right');
  for (const drill of E.SPIN_DRILLS) {
    category(); assert.ok(app.app.innerHTML.includes(`data-id="${drill.id}"`));
    app.click('spin-drill', { id: drill.id }); assert.equal(app.state().round.drillId, drill.id);
    assert.equal(app.state().mode, 'spin');
  }
});

test('BL-145 records holds lesson/spin progress and all existing statistics', () => {
  const app = loadApp({ progress: { current: 3, completed: [1, 3] }, spin: { completed: ['t-single-left'], stats: { attempts: 4, perfect: 1 } } });
  app.click('records'); assert.equal(app.state().screen, 'records');
  for (const text of ['学習の進捗', '2 / 12', '1 / 36', '1 成功 / 4 試行', '試行数', '正確率', '最高連続', 'フォルト', '置き場所ミス', '平均入力 / 最短', 'ミノごとの記録', 'スプリントのベストタイム']) assert.ok(app.app.innerHTML.includes(text), text);
  for (const action of ['reset-stats', 'lessons', 'spins']) assert.match(app.app.innerHTML, new RegExp(`data-act="${action}"`));
  app.click('lessons'); assert.equal(app.state().screen, 'lessons'); app.tap('Escape'); assert.equal(app.state().screen, 'menu');
  app.click('records'); app.click('spins'); assert.equal(app.state().screen, 'spins');
});

test('BL-145 category back buttons, Esc and settings shortcut preserve the navigation context', () => {
  const app = loadApp();
  for (const [act, screen] of [['mode-free', 'free'], ['mode-finesse', 'finesse'], ['mode-spin', 'spins'], ['records', 'records'], ['dressup', 'dressup'], ['settings', 'settings']]) {
    app.click(act); assert.equal(app.state().screen, screen);
    assert.match(app.app.innerHTML.match(/<header[\s\S]*?<\/header>/)[0], /data-act="menu">タイトルへ/);
    app.tap('Escape'); assert.equal(app.state().screen, 'menu');
    app.click(act); app.click('menu'); assert.equal(app.state().screen, 'menu');
  }
  for (const [act, screen] of [['mode-free', 'free'], ['mode-finesse', 'finesse'], ['mode-spin', 'spins']]) {
    app.click(act); app.tap('Comma'); assert.equal(app.state().screen, 'settings');
    app.tap('Escape'); assert.equal(app.state().screen, screen);
    app.click('dressup'); app.tap('Escape'); assert.equal(app.state().screen, screen);
    app.click('menu');
  }
});

test('BL-145 Esc returns past hovered settings help while focused help only dismisses', () => {
  for (const origin of ['menu', 'free']) for (const type of ['pointerover', 'focusin']) {
    const app = loadApp();
    if (origin === 'free') { app.click('mode-free'); app.tap('Comma'); }
    else app.click('settings');
    assert.equal(app.state().screen, 'settings');
    const settings = app.state().settings;
    const control = {
      dataset: { setting: 'das', settingHelp: 'das' }, isConnected: true,
      closest(selector) { return selector === '[data-setting-help]' ? this : null; },
      getBoundingClientRect: () => ({ left: 100, right: 200, top: 100, bottom: 140 })
    };
    const tooltip = app.get('#setting-help-das');
    app.dispatch({ type, pointerType: 'mouse', target: control });
    assert.equal(tooltip.hidden, false);
    const event = type === 'focusin'
      ? app.dispatch({ type: 'keydown', code: 'Escape', repeat: false, target: control })
      : app.tap('Escape', 'close-settings');
    assert.equal(event.defaultPrevented, true);
    assert.equal(tooltip.hidden, true);
    assert.deepEqual(app.state().settings, settings);
    assert.equal(app.state().screen, type === 'focusin' ? 'settings' : origin, `${origin}: ${type}`);
    if (type === 'focusin') {
      app.tap('Escape', 'close-settings');
      assert.equal(app.state().screen, origin);
    }
  }
});
