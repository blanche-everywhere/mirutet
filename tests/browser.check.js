'use strict';
// Run after `npm run build`. A launch failure is a failure, never a silent skip.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright-core');

async function main() {
  const root = path.resolve(__dirname, '..');
  fs.mkdirSync(path.join(root, 'screens'), { recursive: true });
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await context.newPage(), errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.stack || error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => { if (!request.url().startsWith('file:') && !request.url().startsWith('data:')) requests.push(request.url()); });
    const state = () => page.evaluate(() => window.__moetet.getState());
    const waitScreen = screen => page.waitForFunction(value => window.__moetet.getState().screen === value, screen);
    const ready = () => page.waitForFunction(() => !!window.__moetet.getState().active && !window.__moetet.getState().paused);
    const shot = name => page.screenshot({ path: path.join(root, 'screens', name + '.png') });
    const click = act => page.locator(`[data-act="${act}"]`).first().click();
    const pressAction = async action => {
      const s = await state();
      const base = action === 'dasLeft' ? 'left' : action === 'dasRight' ? 'right' : action;
      const code = s.bindings[base][0];
      if (action.startsWith('das')) {
        await page.keyboard.down(code);
        await page.waitForTimeout(s.settings.das + s.settings.dcd + 11 * s.settings.arr + 50);
        await page.keyboard.up(code);
      } else await page.keyboard.press(code);
    };
    const placeOptimal = async () => {
      await ready();
      const s = await state();
      for (const action of s.round.target.actions) await pressAction(action);
      await pressAction('hardDrop');
    };
    const target = async (type, rot, x, delay) => {
      await page.evaluate(({ type, rot, x, delay }) => window.__moetet.chooseTarget(type, { rot, x }, { delay }), { type, rot, x, delay });
    };
    const settingsOpen = async () => { await click('settings'); await waitScreen('settings'); };
    const setNumber = async (key, value) => {
      const number = page.locator(`input[type=number][data-setting="${key}"]`);
      await number.fill(String(value)); await number.dispatchEvent('change');
      assert.equal(await page.locator(`input[type=range][data-setting="${key}"]`).inputValue(), String(value));
      assert.equal((await state()).settings[key], value);
    };
    const closeSettings = async () => {
      await click('close-settings');
      if ((await state()).screen === 'play') { await click('resume'); await ready(); }
    };
    const checkLayout = async () => {
      const layout = await page.evaluate(() => {
        const board = document.querySelector('.board-shell').getBoundingClientRect();
        const overlaps = [...document.querySelectorAll('.coach,.right-stack,.play-buttons')].some(el => {
          const r = el.getBoundingClientRect();
          return r.left < board.right && r.right > board.left && r.top < board.bottom && r.bottom > board.top;
        });
        return { scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight,
          width: innerWidth, height: innerHeight, board: { top: board.top, bottom: board.bottom, center: (board.left + board.right) / 2 },
          controlsBottom: document.querySelector('.play-buttons').getBoundingClientRect().bottom, overlaps };
      });
      assert.ok(layout.scrollWidth <= layout.width, JSON.stringify(layout));
      assert.ok(layout.scrollHeight <= layout.height, JSON.stringify(layout));
      assert.ok(layout.board.bottom < layout.height && layout.controlsBottom <= layout.height, JSON.stringify(layout));
      assert.ok(Math.abs(layout.board.center - layout.width / 2) < 5, JSON.stringify(layout));
      assert.equal(layout.overlaps, false);
    };
    function clean() { assert.deepEqual(errors, [], 'Browser errors:\n' + errors.join('\n')); assert.deepEqual(requests, [], 'External network requests'); }

    await page.goto(pathToFileURL(path.join(root, 'dist', 'moetet-finesse.html')).href);
    await page.waitForFunction(() => !!window.__moetet);
    // Keep subsequent reloads intact: do not use an init script that clears data.
    await page.evaluate(() => localStorage.clear()); await page.reload();
    await waitScreen('menu'); await shot('menu'); clean();

    // Start the first lesson using the focused menu button, then use genuine
    // engine inputs to finish its zero-input mini-drill.
    await page.keyboard.press('Enter'); await waitScreen('tutorial');
    assert.equal((await state()).lessonIndex, 0);
    await page.waitForTimeout(800); await shot('tutorial');
    await click('try-it'); await ready(); await pressAction('hardDrop');
    await page.waitForFunction(() => window.__moetet.getState().tryDone);
    assert.ok((await state()).progress.completed.includes(0));
    await click('next-lesson'); assert.equal((await state()).lessonIndex, 1);
    await page.keyboard.press('ArrowRight'); assert.equal((await state()).lessonIndex, 2);
    await page.keyboard.press('ArrowRight'); assert.equal((await state()).lessonIndex, 3);

    // Both animated spawn-buffer demos run through actual InputHandler timers.
    await page.waitForFunction(() => window.__moetet.getState().inputs?.some(input => input.irs));
    assert.equal((await state()).inputCount, 1);
    await page.locator('.demo-tabs [data-act="demo"][data-index="1"]').click();
    await page.waitForFunction(() => window.__moetet.getState().flags?.ihs === true);
    assert.equal((await state()).heldPiece, 'T');
    await page.locator('.lesson-steps [data-index="4"]').click();
    assert.ok(await page.locator('.lesson-table tbody tr').count() > 5);
    await click('try-it');
    for (let i = 0; i < 3; i++) {
      await placeOptimal();
      await page.waitForFunction(index => window.__moetet.getState().tryIndex === index + 1, i);
    }
    assert.ok((await state()).progress.completed.includes(4)); clean();

    await page.keyboard.press('Escape'); await waitScreen('menu');
    await click('drill'); await waitScreen('play'); await ready();
    await checkLayout();
    assert.equal(await page.locator('#next-preview canvas').count(), 5);

    // Known case: flat O at spawn is zero inputs. O rotation is visibly a no-op
    // but still counts, which gives a deterministic finesse fault at that target.
    await target('O', 0, 4); await ready(); await page.keyboard.press('Space');
    let s = await state();
    assert.equal(s.lastResult.status, 'perfect'); assert.equal(s.lastResult.used, 0); assert.equal(s.stats.streak, 1);
    assert.equal(s.expression, 'happy'); await shot('drill-perfect');
    await target('O', 0, 4); await ready(); await page.keyboard.press('KeyX'); await page.keyboard.press('Space');
    s = await state();
    assert.equal(s.lastResult.status, 'fault'); assert.equal(s.lastResult.extra, 1); assert.equal(s.stats.faults, 1);
    assert.equal(s.stats.streak, 0); assert.equal(s.expression, 'thinking');
    await page.keyboard.press('KeyH'); assert.equal((await state()).hint, true);
    assert.equal(await page.locator('#hint-route').isVisible(), true);
    await checkLayout(); await shot('drill-fault'); clean();

    // A miss is separate from finesse faults and repeats the same cell target.
    await target('O', 0, 0); await ready();
    const targetKey = (await state()).round.target.key;
    await page.keyboard.press('Space'); s = await state();
    assert.equal(s.lastResult.status, 'miss'); assert.equal(s.stats.faults, 1);
    assert.equal(s.round.target.key, targetKey);
    await page.keyboard.press('KeyR'); assert.equal((await state()).round.target.key, targetKey);

    // Settings synchronization in both directions, conflict capture, JSON
    // validation, and persistent settings/bindings survive file:// reload.
    await settingsOpen();
    await setNumber('das', 300); await setNumber('arr', 0); await setNumber('are', 400);
    await page.locator('input[type=range][data-setting=arr]').evaluate(el => { el.value = '80'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.equal(await page.locator('#setting-arr').inputValue(), '80');
    await setNumber('arr', 0);
    await page.locator('input[data-engine-toggle=irs]').check();
    await page.locator('[data-act=capture][data-action=cw][data-index="0"]').click();
    await page.keyboard.press('KeyZ');
    assert.equal(await page.locator('[data-act=swap-key]').count(), 1);
    await click('swap-key');
    s = await state(); assert.equal(s.bindings.cw[0], 'KeyZ'); assert.equal(s.bindings.ccw[0], 'ArrowUp');
    await click('reset-keys');
    await page.locator('[data-act=capture][data-action=cw][data-index="0"]').click();
    await page.keyboard.press('KeyQ'); assert.equal((await state()).bindings.cw[0], 'KeyQ');
    await click('export');
    const exported = JSON.parse(await page.locator('#settings-json').inputValue());
    assert.equal(exported.settings.das, 300);
    await page.locator('#settings-json').fill('{bad JSON'); await click('import');
    assert.match(await page.locator('#import-status').innerText(), /読み込めません/);
    assert.equal((await state()).settings.das, 300);
    await page.locator('#settings-json').fill(JSON.stringify(exported)); await click('import');
    assert.match(await page.locator('#import-status').innerText(), /保存しました/);
    await page.screenshot({ path: path.join(root, 'screens/settings.png'), fullPage: true });
    await page.reload(); await waitScreen('menu');
    s = await state(); assert.equal(s.settings.das, 300); assert.equal(s.settings.arr, 0); assert.equal(s.settings.are, 400);
    assert.equal(s.bindings.cw[0], 'KeyQ'); assert.ok(s.progress.completed.includes(4)); assert.ok(s.totalStats.faults >= 1);
    await click('drill'); await ready();

    // No repeat from the OS can create extra inputs; a synthetic normal event
    // uses exactly the same listener as the real page.keyboard events.
    await target('O', 0, 0); await ready();
    await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(25);
    assert.equal((await state()).active.x, 2, 'DAS must wait after its first tap');
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft', repeat: true, bubbles: true, cancelable: true })));
    assert.equal((await state()).inputCount, 1);
    await page.waitForTimeout(330); s = await state();
    assert.equal(s.active.x, -1, 'ARR=0 must slide O to the left wall');
    assert.equal(s.inputCount, 1); assert.equal(s.inputs[0].slide, true);
    await page.keyboard.up('ArrowLeft'); await page.keyboard.press('Space');
    assert.equal((await state()).lastResult.status, 'perfect');

    // Live IRS: press during ARE and hold through the spawn instant. The one
    // initial rotation is counted once; its indicator must visibly flash.
    const irsBefore = (await state()).irsCount;
    await target('T', 1, 4, 400);
    assert.equal((await state()).active, null);
    assert.equal(await page.locator('#are-bar').isVisible(), true);
    await page.keyboard.down('KeyQ'); await ready(); s = await state();
    assert.equal(s.active.rot, 1); assert.equal(s.inputCount, 1); assert.equal(s.inputs[0].irs, true);
    assert.equal(s.irsCount, irsBefore + 1);
    assert.equal(await page.locator('#irs-indicator').evaluate(el => el.classList.contains('visible')), true);
    await page.keyboard.up('KeyQ'); await page.keyboard.press('Space');
    assert.equal((await state()).lastResult.status, 'perfect');

    // Pause releases held keys and freezes both piece motion and session time.
    await target('O', 0, 4); await ready(); await page.keyboard.down('ArrowLeft');
    await page.keyboard.press('Escape'); s = await state();
    assert.equal(s.paused, true); assert.deepEqual(s.held, []);
    const frozen = s.active, elapsed = s.stats.elapsed;
    await page.waitForTimeout(400); s = await state();
    assert.deepEqual(s.active, frozen); assert.equal(s.stats.elapsed, elapsed);
    await page.keyboard.up('ArrowLeft'); await page.keyboard.press('Escape');
    assert.equal((await state()).paused, false);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.equal((await state()).paused, true); assert.deepEqual((await state()).held, []);
    await click('resume');

    // Piece/area filters preserve the live session, enforce singleton hold, and
    // zero-fault resets record the attempt while leaving progress unchanged.
    for (const type of ['I', 'T', 'S', 'Z', 'J', 'L']) await page.locator(`[data-piece-filter="${type}"]`).uncheck();
    await page.locator('#area').selectOption('left');
    s = await state(); assert.deepEqual(s.practice.pieces, ['O']); assert.ok(s.round.target.x <= 2);
    await ready(); await page.keyboard.press('ShiftLeft'); assert.equal((await state()).heldPiece, null);
    await page.locator('[data-practice=weakSpot]').check();
    await page.locator('[data-ui=zeroFault]').check();
    await target('O', 0, 4); await ready();
    const completed = (await state()).stats.completed;
    await page.keyboard.press('KeyX'); await page.keyboard.press('Space'); s = await state();
    assert.equal(s.lastResult.status, 'fault'); assert.equal(s.stats.completed, completed); assert.equal(s.round.target.x, 4);
    await page.locator('[data-ui=zeroFault]').uncheck();
    await page.locator('#area').selectOption('all'); clean();

    // Finish a short custom sprint with actual optimal key sequences. The
    // screenshot and saved best time exercise the same result path as 40/100.
    await click('menu'); await click('sprint');
    assert.equal(await page.locator('[data-act=start-sprint][data-length="40"]').count(), 1);
    assert.equal(await page.locator('[data-act=start-sprint][data-length="100"]').count(), 1);
    await page.locator('#custom-length').fill('3'); await click('custom-sprint');
    for (let i = 0; i < 3; i++) await placeOptimal();
    await waitScreen('result'); s = await state();
    assert.equal(s.sprintResult.completed, 3); assert.equal(s.sprintResult.perfect, 3);
    assert.equal(s.sprintResult.accuracy, 100); assert.ok(s.sprintResult.elapsed > 0);
    assert.equal(s.totalStats.bestTimes[3], s.sprintResult.elapsed);
    await shot('sprint-result'); await page.reload();
    assert.ok((await state()).totalStats.bestTimes[3] > 0); clean();

    // Graceful fallbacks for unavailable storage and AudioContext are covered
    // in a separate page, without altering the persistence tests above.
    const fallback = await context.newPage();
    fallback.on('pageerror', error => errors.push(error.message));
    fallback.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await fallback.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('storage unavailable'); } });
      Object.defineProperty(window, 'AudioContext', { value: undefined });
      Object.defineProperty(window, 'webkitAudioContext', { value: undefined });
    });
    await fallback.goto(pathToFileURL(path.join(root, 'dist', 'moetet-finesse.html')).href);
    await fallback.locator('[data-act=drill]').click();
    await fallback.waitForFunction(() => !!window.__moetet.getState().active);
    await fallback.evaluate(() => window.__moetet.chooseTarget('O', { rot: 0, x: 4 }, { delay: 0 }));
    await fallback.keyboard.press('Space');
    assert.equal(await fallback.evaluate(() => window.__moetet.getState().lastResult.status), 'perfect');
    clean();
    console.log('Browser checks passed: tutorial, perfect/fault/miss, handling, IRS, pause, filters, settings persistence, sprint, offline fallbacks.');
    console.log('Screenshots: screens/{menu,tutorial,drill-perfect,drill-fault,settings,sprint-result}.png');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
