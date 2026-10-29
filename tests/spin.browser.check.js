'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright-core');
const E = require('../src/engine');

async function runSpinChecks(browser, root) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage(), errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) requests.push(r.url()); });
  const state = () => page.evaluate(() => window.__mirutet.getState());
  const click = act => page.locator(`[data-act="${act}"]`).first().click();
  const ready = () => page.waitForFunction(() => window.__mirutet.getState().active && !window.__mirutet.getState().paused);
  const tap = async action => {
    const code = (await state()).bindings[action][0];
    await page.evaluate(code => { window.__mirutet.dispatch(code, true); window.__mirutet.dispatch(code, false); }, code);
  };
  const layout = async label => {
    const result = await page.evaluate(() => {
      const selectors = window.__mirutet.getState().screen === 'play' ?
        ['.board-shell', '.play-buttons', '.play-footer', '#spin-info', '#result-panel', '.key-help'] : ['.spin-set-list', '.footer'];
      return { width: innerWidth, height: innerHeight, sw: document.scrollingElement.scrollWidth, sh: document.scrollingElement.scrollHeight,
        rects: selectors.map(s => {
          const e = document.querySelector(s), r = e.getBoundingClientRect();
          return { s, x: r.x, y: r.y, right: r.right, bottom: r.bottom, sw: e.scrollWidth, cw: e.clientWidth };
        }) };
    });
    assert.ok(result.sw <= result.width && result.sh <= result.height, `${label}: ${JSON.stringify(result)}`);
    for (const r of result.rects) assert.ok(r.x >= 0 && r.y >= 0 && r.right <= result.width && r.bottom <= result.height && r.sw <= r.cw, `${label}: ${JSON.stringify(r)}`);
  };
  try {
    await page.goto(pathToFileURL(path.join(root, 'dist/mirutet.html')).href);
    await page.waitForFunction(() => !!window.__mirutet);
    // The seed URL is consumed before app startup, so reload never reseeds it.
    // Seed a full valid profile with non-default physical bindings. All gameplay
    // below dispatches normal key events, never edits an active piece or result.
    const initial = await state();
    const bindings = { ...initial.bindings, left: ['KeyQ'], right: ['KeyW'], cw: ['KeyE'], ccw: ['KeyD'],
      softDrop: ['KeyS'], hardDrop: ['KeyF'], retry: ['KeyV'], skip: ['KeyB'], hint: ['KeyG'] };
    await page.addInitScript(profile => {
      if (location.hash !== '#spin-seed') return;
      localStorage.setItem('mirutet-finesse.v1', JSON.stringify(profile));
      history.replaceState(null, '', location.href.split('#')[0]);
    }, {
      settings: { das: 137, arr: 17, sdf: 1, are: 80, gravity: 0, allow180: false }, bindings,
      ui: { sound: false, zeroFault: true, repeatOnMiss: false }, progress: { current: 3, completed: [1, 3] },
      stats: { attempts: 5, perfect: 3 }
    });
    await page.goto(pathToFileURL(path.join(root, 'dist/mirutet.html')).href + '#spin-seed');
    await page.reload(); await page.waitForFunction(() => !!window.__mirutet);
    const finesseBefore = (await state()).totalStats;
    await click('mode-spin');
    assert.equal(await page.locator('[data-act=tutorial],[data-act=lessons],[data-act=sprint]').count(), 0, 'Drills only');
    await click('spins');
    assert.equal(await page.locator('.spin-set').count(), 4);
    assert.equal(await page.locator('[data-act=spin-drill]').count(), 14);
    await layout('spin selection');
    await page.locator('[data-act=spin-drill][data-id=t-single-left]').click();
    for (const drill of E.SPIN_DRILLS) {
      await ready();
      assert.equal((await state()).mode, 'spin');
      assert.equal((await state()).round.drillId, drill.id);
      assert.equal((await state()).settings.das, 137); assert.equal((await state()).settings.arr, 17);
      await tap('hold'); assert.equal((await state()).heldPiece, null);
      if (!(await state()).hint) await tap('hint');
      assert.equal(await page.locator('#hint-route').isVisible(), true);
      assert.doesNotMatch(await page.locator('#result-panel').innerText(), /最短|フォルト/);
      if (drill === E.SPIN_DRILLS[0]) {
        const serial = (await state()).round.serial;
        await page.locator('#board').focus();
        await page.evaluate(() => {
          for (const action of ['hardDrop', 'pause']) {
            const code = window.__mirutet.getState().bindings[action][0];
            window.__mirutet.dispatch(code, true); window.__mirutet.dispatch(code, false);
          }
        });
        assert.equal((await state()).lastResult.status, 'miss');
        assert.equal((await state()).round.drillId, drill.id);
        assert.equal((await state()).spinProgress.completed.length, 0);
        assert.equal((await state()).expression, 'thinking');
        assert.equal((await state()).round.serial, serial + 1, 'Miss restores the same drill automatically');
        await page.waitForTimeout(120);
        assert.equal((await state()).active, null, 'Retry ARE freezes under pause');
        await click('resume'); await ready();
        assert.match(await page.locator('#result-panel').innerText(), /置き場所を確認/);
        assert.equal((await state()).lastResult.status, 'miss', 'Retry feedback remains after automatic spawn');
        assert.equal((await state()).stats.retries, 0);
        assert.equal(await page.locator('#board').evaluate(el => el === document.activeElement), true);
        await tap('retry'); await ready(); assert.equal((await state()).lastResult, null);
      }
      const solution = E.solveSpinDrill(drill);
      // One browser evaluation avoids frame timing changing one-cell soft drops.
      await page.evaluate(({ solution, bindings, pauseAfter }) => {
        const tap = action => { window.__mirutet.dispatch(bindings[action][0], true); window.__mirutet.dispatch(bindings[action][0], false); };
        for (const action of solution) {
          if (action === 'floor') {
            for (;;) {
              const s = window.__mirutet.getState(), before = s.active.y;
              tap('softDrop');
              if (window.__mirutet.getState().active.y === before) break;
            }
          } else tap(action);
        }
        tap('hardDrop');
        if (pauseAfter) tap('pause');
      }, { solution, bindings, pauseAfter: drill === E.SPIN_DRILLS[0] });
      const solved = await state();
      assert.equal(solved.lastResult.status, 'perfect', drill.id);
      assert.equal(solved.lastResult.lastMove, 'rotation'); assert.equal(solved.lastResult.lines, drill.lines);
      const next = E.SPIN_DRILLS[(E.SPIN_DRILLS.indexOf(drill) + 1) % E.SPIN_DRILLS.length];
      assert.equal(solved.round.drillId, next.id, 'Success selects the next drill automatically');
      assert.equal(solved.spinProgress.current, next.id);
      if (drill === E.SPIN_DRILLS[0]) {
        assert.equal(solved.paused, true);
        await page.waitForTimeout(120);
        assert.equal((await state()).active, null, 'Automatic advance ARE freezes under pause');
        await page.locator('.overlay [data-act=settings]').click(); assert.equal((await state()).paused, true);
        await click('close-settings'); assert.equal(await page.locator('.overlay').count(), 1);
        await click('resume');
      }
      await ready();
      assert.equal((await state()).active.type, next.type);
      assert.equal((await state()).lastResult.drillId, drill.id, 'Success feedback survives the next spawn');
      assert.equal(solved.expression, 'happy'); assert.ok(solved.spinProgress.completed.includes(drill.id));
      assert.match(await page.locator('#result-panel').innerText(), /回転入れ成功/);
      await layout(drill.id);
    }
    assert.match(await page.locator('#result-panel').innerText(), /全14問達成/);
    await layout('all clear');
    await page.screenshot({ path: path.join(root, 'screens', 'spin-auto-advance.png') });
    // Buttons and rebound keys still replace the current target manually.
    await tap('retry'); await ready(); assert.equal((await state()).lastResult, null);
    assert.doesNotMatch(await page.locator('#result-panel').innerText(), /全14問達成/);
    await tap('skip'); await ready(); assert.equal((await state()).round.drillId, 't-single-right');
    await click('retry'); await ready(); assert.equal((await state()).round.drillId, 't-single-right');
    await click('skip'); await ready(); assert.equal((await state()).round.drillId, 't-double-left');
    await click('spins');
    const completed = await state();
    assert.equal(completed.spinProgress.completed.length, 14); assert.equal(completed.spinStats.perfect, 14);
    assert.equal(completed.spinStats.attempts, 15); assert.deepEqual(completed.totalStats, finesseBefore);
    assert.deepEqual(completed.progress, { current: 3, completed: [1, 3] });
    await page.reload(); await page.waitForFunction(() => !!window.__mirutet);
    assert.deepEqual((await state()).spinProgress, completed.spinProgress);
    assert.deepEqual((await state()).spinStats, completed.spinStats);
    await click('mode-spin'); await click('spin-continue'); await ready();
    assert.equal((await state()).round.drillId, 't-double-left');
    await click('spins'); assert.equal(await page.locator('.lesson-card.done').count(), 14);
    for (const [width, height] of [[1920, 1080], [1280, 720], [800, 600]]) {
      await page.setViewportSize({ width, height }); await layout(`selection ${width}`);
      await page.locator('[data-id=t-triple-right]').click(); await ready();
      await tap('hint'); await layout(`play hint ${width}`);
      await click('toggle-handling'); await layout(`handling ${width}`);
      await click('toggle-handling');
      await page.screenshot({ path: path.join(root, 'screens', `spin-${width}.png`) });
      await click('spins');
    }
    // Preferences JSON and reset must keep achievement data intact.
    const progressBeforeSettings = (await state()).spinProgress;
    await click('settings'); await click('export'); await click('import');
    assert.deepEqual((await state()).spinProgress, progressBeforeSettings);
    await click('reset-settings');
    assert.deepEqual((await state()).spinProgress, progressBeforeSettings);
    await click('close-settings');

    const fallback = await context.newPage();
    fallback.on('pageerror', e => errors.push(e.message));
    await fallback.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('storage unavailable'); } });
      Object.defineProperty(window, 'AudioContext', { value: undefined });
      Object.defineProperty(window, 'webkitAudioContext', { value: undefined });
    });
    await fallback.goto(pathToFileURL(path.join(root, 'dist/mirutet.html')).href);
    await fallback.locator('[data-act=mode-spin]').click();
    await fallback.locator('[data-act=spin-continue]').click();
    await fallback.waitForFunction(() => !!window.__mirutet.getState().active);
    await fallback.evaluate(solution => {
      const tap = action => {
        const code = window.__mirutet.getState().bindings[action][0];
        window.__mirutet.dispatch(code, true); window.__mirutet.dispatch(code, false);
      };
      for (const action of solution) {
        if (action === 'floor') {
          for (;;) {
            const before = window.__mirutet.getState().active.y;
            tap('softDrop'); if (window.__mirutet.getState().active.y === before) break;
          }
        } else tap(action);
      }
      tap('hardDrop');
    }, E.solveSpinDrill(E.SPIN_DRILLS[0]));
    const fallbackState = await fallback.evaluate(() => window.__mirutet.getState());
    assert.equal(fallbackState.storageOK, false);
    assert.equal(fallbackState.lastResult.status, 'perfect');
    assert.deepEqual(fallbackState.spinProgress.completed, ['t-single-left']);
    await fallback.close();
    assert.deepEqual(errors, []); assert.deepEqual(requests, []);
    console.log('Spin browser checks passed: 14 drill solutions, 4 sets, 3 viewport sizes; automatic success/next-set/wrap, automatic miss reset with retained feedback, manual retry/next, hints, custom bindings/handling, settings pause, reload/progress, preference import/reset, isolated finesse records, storage/audio fallback, no network.');
  } finally { await context.close(); }
}
module.exports = { runSpinChecks };
if (require.main === module) (async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  try { await runSpinChecks(browser, path.resolve(__dirname, '..')); } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
