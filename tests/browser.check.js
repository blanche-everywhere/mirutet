'use strict';
// Run after `npm run build`. A launch failure is a failure, never a silent skip.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright-core');

async function main() {
  const root = path.resolve(__dirname, '..');
  // Inspect the delivered text before Chrome launches, including inert JS
  // comments. This app has no text links; only SVG namespace URLs are allowed.
  const html = fs.readFileSync(path.join(root, 'dist/moetet-finesse.html'), 'utf8');
  const urls = html.match(/https?:\/\/[^\s"'<>`\\)]+/gi) || [];
  assert.deepEqual(urls.filter(url => !['http://www.w3.org/2000/svg', 'http://www.w3.org/1999/xlink'].includes(url)), [], 'Unexpected URL in offline HTML');
  fs.mkdirSync(path.join(root, 'screens'), { recursive: true });
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  try {
    // Mutated preferences and reload/persistence checks stay in this context.
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await context.newPage(), errors = [], requests = [];
    const observe = targetPage => {
      targetPage.on('pageerror', error => errors.push(error.stack || error.message));
      targetPage.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      targetPage.on('request', request => { if (!request.url().startsWith('file:') && !request.url().startsWith('data:')) requests.push(request.url()); });
    };
    observe(page);
    const state = () => page.evaluate(() => window.__moetet.getState());
    const waitScreen = screen => page.waitForFunction(value => window.__moetet.getState().screen === value, screen);
    const ready = () => page.waitForFunction(() => !!window.__moetet.getState().active && !window.__moetet.getState().paused);
    const shot = (name, targetPage = page) => targetPage.screenshot({ path: path.join(root, 'screens', name + '.png') });
    const click = act => page.locator(`[data-act="${act}"]`).first().click();
    const tabTo = async selector => {
      const control = page.locator(selector).first();
      for (let attempt = 0; attempt < 180; attempt++) {
        if (await control.evaluate(el => el === document.activeElement)) return;
        await page.keyboard.press('Tab');
      }
      assert.fail('Keyboard could not reach ' + selector);
    };
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
    const checkViewport = async (screenName, selectors = [], targetPage = page) => {
      // A document check alone can miss content clipped by overflow:hidden.
      const layout = await targetPage.evaluate(selectors => {
        const scrolling = document.scrollingElement;
        return { width: innerWidth, height: innerHeight, scrollWidth: scrolling.scrollWidth, scrollHeight: scrolling.scrollHeight,
          elements: selectors.flatMap(selector => [...document.querySelectorAll(selector)].map(el => {
            const r = el.getBoundingClientRect();
            return { selector, top: r.top, bottom: r.bottom, left: r.left, right: r.right, button: el.matches('button'),
              scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
          })) };
      }, selectors);
      assert.ok(layout.scrollHeight <= layout.height && layout.scrollWidth <= layout.width, `${screenName}: ${JSON.stringify(layout)}`);
      for (const selector of selectors) assert.ok(layout.elements.some(el => el.selector === selector), `${screenName}: missing ${selector}`);
      for (const r of layout.elements) {
        assert.ok(r.top >= 0 && r.bottom <= layout.height && r.left >= 0 && r.right <= layout.width, `${screenName}: clipped ${JSON.stringify(r)}`);
        assert.ok(r.scrollWidth <= r.clientWidth, `${screenName}: horizontal overflow ${JSON.stringify(r)}`);
        if (r.button) assert.ok(r.bottom > r.top && r.right > r.left, `${screenName}: hidden button ${JSON.stringify(r)}`);
      }
      return layout;
    };
    const checkText = async (targetPage = page) => {
      const sizes = await targetPage.evaluate(() => [...document.querySelectorAll('.bubble-text,.tiny,.handling-note,.stat label,.route-label,.piece-bar')]
        .filter(el => el.getClientRects().length).map(el => ({ text: el.textContent.slice(0, 45), size: parseFloat(getComputedStyle(el).fontSize), bubble: el.matches('.bubble-text') })));
      for (const entry of sizes) assert.ok(entry.size >= (entry.bubble ? 15 : 13), JSON.stringify(entry));
    };
    const checkLesson = async () => {
      const s = await state();
      await checkViewport(`lesson ${s.lessonIndex + 1} ${s.tryMode ? 'try-it' : 'demo'}`, [
        '.lesson-heading', '.lesson-coach .speech', '.lesson-coach .milfy', '.lesson-board .board-shell', '.lesson-board .column-labels',
        '#demo-keys', '#demo-caption', '#tutorial-result', '.lesson-content', '.lesson-nav',
        '[data-act=previous-lesson]', '[data-act=next-lesson]', '.lesson-shortcuts'
      ]);
      await checkText();
    };
    const checkSettings = (label, targetPage = page) => checkViewport(label,
      ['.page-heading', '[data-act=close-settings]', '.settings-content', '.footer'], targetPage);
    const checkDrill = async () => {
      await checkLayout();
      await checkViewport('drill', ['.coach .speech', '.coach .milfy', '.board-shell', '.column-labels', '.board-note', '.practice-options',
        '.play-buttons', '.play-buttons button', '[data-act=pause]', '.play-footer']);
      await checkText();
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
    await waitScreen('menu'); await checkViewport('menu', ['.menu-buttons', '.first-note', '.menu-art .speech', '.menu-art .milfy', '.mascot-caption', '.footer']);
    await checkText(); await shot('menu'); clean();

    // Start the first lesson using the focused menu button, then use genuine
    // engine inputs to finish its zero-input mini-drill.
    await page.keyboard.press('Enter'); await waitScreen('tutorial');
    assert.equal((await state()).lessonIndex, 0);
    await page.waitForTimeout(800); await checkLesson(); await shot('tutorial');
    // Native keyboard activation must reach lesson controls, including after
    // blur pauses an interactive lesson (there used to be no resume path).
    await page.locator('[data-act=try-it]').focus(); await page.keyboard.press('Enter'); await ready();
    await page.keyboard.down('ArrowLeft'); await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.equal((await state()).paused, true); assert.deepEqual((await state()).held, []);
    await page.keyboard.up('ArrowLeft'); await page.keyboard.press('Enter'); await ready();
    await page.keyboard.press('KeyR'); await ready();
    await checkLesson(); await pressAction('hardDrop');
    await page.waitForFunction(() => window.__moetet.getState().tryDone);
    assert.ok((await state()).progress.completed.includes(0));
    await checkLesson();
    await page.locator('[data-act=next-lesson]').focus(); await page.keyboard.press('Enter'); assert.equal((await state()).lessonIndex, 1);
    await page.keyboard.press('ArrowRight'); assert.equal((await state()).lessonIndex, 2);
    await page.keyboard.press('ArrowRight'); assert.equal((await state()).lessonIndex, 3);

    // Both animated spawn-buffer demos run through actual InputHandler timers.
    await page.waitForFunction(() => window.__moetet.getState().inputs?.some(input => input.irs));
    assert.equal((await state()).inputCount, 1);
    await checkLesson(); await shot('tutorial-irs');
    await page.locator('.demo-tabs [data-act="demo"][data-index="1"]').click();
    await page.waitForFunction(() => window.__moetet.getState().flags?.ihs === true);
    assert.equal((await state()).heldPiece, 'T');
    await page.locator('.lesson-steps [data-index="4"]').click();
    await checkLesson();
    assert.ok(await page.locator('.lesson-table tbody tr').count() > 5);
    await click('try-it');
    for (let i = 0; i < 3; i++) {
      await placeOptimal();
      await page.waitForFunction(index => window.__moetet.getState().tryIndex === index + 1, i);
    }
    assert.ok((await state()).progress.completed.includes(4)); clean();
    await checkLesson();

    // Every lesson must keep both nav buttons on screen in every demo and in
    // try-it mode, even when the explanation/table is scrolled to its end.
    // Check actual button rectangles; document overflow alone misses clipping.
    const checkLessonScroll = async () => {
      const navBefore = await page.locator('.lesson-nav').boundingBox();
      await page.locator('.lesson-content').evaluate(el => { el.scrollTop = el.scrollHeight; });
      await checkLesson();
      assert.deepEqual(await page.locator('.lesson-nav').boundingBox(), navBefore, 'Lesson scroll moved navigation');
      assert.equal(await page.evaluate(() => document.scrollingElement.scrollTop), 0);
      await page.locator('.lesson-content').evaluate(el => { el.scrollTop = 0; });
      await checkLesson();
    };
    for (let lessonIndex = 0; lessonIndex < 12; lessonIndex++) {
      await page.locator(`.lesson-steps [data-index="${lessonIndex}"]`).click();
      assert.equal((await state()).lessonIndex, lessonIndex);
      await checkLessonScroll();
      const demos = page.locator('.demo-tabs [data-act=demo]');
      for (let demoIndex = 0; demoIndex < await demos.count(); demoIndex++) {
        await demos.nth(demoIndex).click();
        await checkLessonScroll();
      }
      const tableRows = page.locator('.lesson-table [data-act=table-demo]');
      if (await tableRows.count()) {
        await tableRows.first().click(); await checkLessonScroll();
        await tableRows.last().click(); await checkLessonScroll();
      }
      if (lessonIndex === 6) {
        assert.equal(await page.locator('.lesson-heading h2').innerText(), 'Tミノのレッスン');
        assert.ok(await tableRows.count() > 5);
        // Show the placement table, along with the mascot, board and nav.
        await page.locator('.lesson-table').evaluate(el => el.scrollIntoView({ block: 'start' }));
        await checkLesson(); await shot('tutorial-t');
      }
      await click('try-it'); await ready(); await checkLessonScroll();
    }
    clean();

    await page.keyboard.press('Escape'); await waitScreen('menu');
    await click('drill'); await waitScreen('play'); await ready();
    await checkDrill();
    assert.equal(await page.locator('#next-preview canvas').count(), 5);
    await target('T', 0, 0, 0); await ready();
    assert.equal((await state()).active.y, 19); assert.equal((await state()).inputCount, 0);
    assert.equal((await state()).ui.showTarget, true);
    // Wait for a painted purple outline at the left floor, separate from the
    // spawn piece/its center ghost, before taking the requested pre-lock shot.
    await page.waitForFunction(() => {
      const canvas = document.querySelector('#board'), ctx = canvas.getContext('2d');
      const pixels = ctx.getImageData(0, Math.floor(canvas.height * 20 / 22), Math.floor(canvas.width * .3), Math.floor(canvas.height * 2 / 22)).data;
      let colored = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > pixels[i + 1] + 20 && pixels[i + 2] > pixels[i + 1] + 20) colored++;
      return colored > 8;
    });
    await shot('drill-target');
    const smallBoard = await page.locator('.board-shell').boundingBox();
    await page.setViewportSize({ width: 1920, height: 1080 });
    await checkLayout(); await checkViewport('drill 1080p', ['.practice-options', '.board-note', '.play-buttons', '.play-footer']);
    const largeBoard = await page.locator('.board-shell').boundingBox();
    assert.ok(largeBoard.height > smallBoard.height * 1.3); await shot('drill-1080');
    await page.setViewportSize({ width: 1280, height: 720 });
    await checkDrill();

    // Known case: flat O at spawn is zero inputs. O rotation is visibly a no-op
    // but still counts, which gives a deterministic finesse fault at that target.
    await target('O', 0, 4); await ready(); await page.keyboard.press('Space');
    let s = await state();
    assert.equal(s.lastResult.status, 'perfect'); assert.equal(s.lastResult.used, 0); assert.equal(s.stats.streak, 1);
    assert.equal(s.expression, 'happy'); await checkDrill(); await page.waitForTimeout(350); await shot('drill-perfect');
    await target('O', 0, 4); await ready(); await page.keyboard.press('KeyX'); await page.keyboard.press('Space');
    s = await state();
    assert.equal(s.lastResult.status, 'fault'); assert.equal(s.lastResult.extra, 1); assert.equal(s.stats.faults, 1);
    assert.equal(s.stats.streak, 0); assert.equal(s.expression, 'thinking');
    await page.keyboard.press('KeyH'); assert.equal((await state()).hint, true);
    assert.equal(await page.locator('#hint-route').isVisible(), true);
    await page.waitForTimeout(350);
    for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }]) {
      await page.setViewportSize(viewport);
      await checkDrill();
      await checkViewport(`drill fault ${viewport.width}x${viewport.height}`, ['#result-panel', '#hint-route']);
      const result = await page.locator('#result-panel').evaluate(el => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
      assert.ok(result.scrollHeight <= result.clientHeight, `Drill fault result clipped at ${viewport.width}x${viewport.height}: ${JSON.stringify(result)}`);
    }
    await shot('drill-fault'); clean();

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
    await checkSettings('settings'); await checkText();
    await setNumber('das', 300); await setNumber('arr', 0); await setNumber('are', 400);
    await setNumber('sdf', 41); await setNumber('sdf', 40);
    await setNumber('dcd', 120); await setNumber('dcd', 0);
    await page.locator('input[type=range][data-setting=arr]').evaluate(el => { el.value = '80'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.equal(await page.locator('#setting-arr').inputValue(), '80');
    await setNumber('arr', 0);
    await page.locator('input[data-engine-toggle=irs]').check();
    await page.locator('[data-act=capture][data-action=cw][data-index="0"]').click();
    await page.keyboard.press('KeyZ');
    assert.equal(await page.locator('[data-act=swap-key]').count(), 1);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('[data-act=cancel-capture]').evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Enter');
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
    await page.locator('.settings-content').evaluate(el => { el.scrollTop = 0; });
    await checkSettings('settings after import');
    // Esc also exits while a native number field has focus.
    await page.locator('#setting-das').focus(); await page.keyboard.press('Escape');
    assert.equal((await state()).screen, 'play'); await click('resume');
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
    await page.waitForFunction(() => document.querySelector('#are-bar').classList.contains('visible') && Number(document.querySelector('#are-bar').getAttribute('aria-valuenow')) > 0);
    await page.keyboard.down('KeyQ'); await page.waitForTimeout(60);
    assert.equal((await state()).active, null, 'rotation is held inside ARE, before spawn');
    await ready(); s = await state();
    assert.equal(s.active.rot, 1); assert.equal(s.inputCount, 1); assert.equal(s.inputs[0].irs, true);
    assert.equal(s.irsCount, irsBefore + 1);
    assert.equal(await page.locator('#irs-indicator').evaluate(el => el.classList.contains('visible')), true);
    await page.keyboard.up('KeyQ'); await page.keyboard.press('Space');
    s = await state(); assert.equal(s.lastResult.status, 'perfect'); assert.equal(s.lastResult.used, 1);
    assert.equal(s.lastResult.inputs.filter(input => input.irs).length, 1);
    // The next ARE is the real lock-to-spawn transition, without chooseTarget.
    assert.ok(s.pending); assert.equal(s.active, null);
    await page.keyboard.down('KeyQ'); await ready(); s = await state();
    assert.equal(s.active.rot, 1); assert.equal(s.inputCount, 1); assert.equal(s.inputs[0].irs, true);
    await page.keyboard.up('KeyQ');

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
    await ready(); await page.locator('#board').focus(); await page.keyboard.press('ShiftLeft'); assert.equal((await state()).heldPiece, null);
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
    await checkViewport('sprint setup', ['.sprint-setup .speech', '.sprint-setup .milfy']);
    assert.equal(await page.locator('[data-act=start-sprint][data-length="40"]').count(), 1);
    assert.equal(await page.locator('[data-act=start-sprint][data-length="100"]').count(), 1);
    await page.locator('#custom-length').fill('3'); await click('custom-sprint');
    for (let i = 0; i < 3; i++) await placeOptimal();
    await waitScreen('result'); s = await state();
    assert.equal(s.sprintResult.completed, 3); assert.equal(s.sprintResult.perfect, 3);
    assert.equal(s.sprintResult.accuracy, 100); assert.ok(s.sprintResult.elapsed > 0);
    assert.equal(s.totalStats.bestTimes[3], s.sprintResult.elapsed);
    await checkViewport('sprint results', ['.result-layout .speech', '.result-layout .milfy', '.result-summary']);
    await shot('sprint-result'); await page.reload();
    assert.ok((await state()).totalStats.bestTimes[3] > 0); clean();

    // Visit every remaining screen using only native Tab/Enter/Esc. Focused
    // controls must survive global game shortcuts and scroll only their panel.
    await tabTo('[data-act=records]'); await page.keyboard.press('Enter'); await waitScreen('records');
    await tabTo('[data-act=reset-stats]');
    await page.keyboard.press('Escape'); await waitScreen('menu');
    await tabTo('[data-act=lessons]'); await page.keyboard.press('Enter'); await waitScreen('lessons');
    await tabTo('[data-act=lesson][data-index="3"]'); await page.keyboard.press('Enter'); await waitScreen('tutorial');
    await checkLesson(); await page.keyboard.press('Escape'); await waitScreen('menu');
    await tabTo('[data-act=sprint]'); await page.keyboard.press('Enter'); await waitScreen('sprint');
    await tabTo('#custom-length'); await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Escape'); await waitScreen('menu');
    await tabTo('[data-act=settings]'); await page.keyboard.press('Enter'); await waitScreen('settings');
    await tabTo('[data-act=reset-settings]');
    await checkSettings('settings keyboard scroll');
    await page.keyboard.press('Escape'); await waitScreen('menu');
    await checkViewport('menu after keyboard tour', ['.menu-buttons', '.footer']); clean();

    // Capture defaults from a genuinely fresh profile, isolated from all the
    // edits/reloads above. Resetting the persistence profile would hide leaks.
    const defaultContext = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    try {
      const defaultPage = await defaultContext.newPage();
      observe(defaultPage);
      await defaultPage.goto(pathToFileURL(path.join(root, 'dist', 'moetet-finesse.html')).href);
      await defaultPage.waitForFunction(() => !!window.__moetet);
      assert.equal(await defaultPage.evaluate(() => localStorage.getItem(window.__moetet.storageKey)), null);
      await checkViewport('clean title', ['.menu-buttons', '.menu-buttons button', '.first-note', '.menu-art .speech', '.menu-art .milfy', '.mascot-caption', '.footer'], defaultPage);
      await checkText(defaultPage); await shot('title', defaultPage);
      await defaultPage.locator('.topbar [data-act=settings]').click();
      await defaultPage.waitForFunction(() => window.__moetet.getState().screen === 'settings');
      const defaults = await defaultPage.evaluate(() => window.__moetet.getState());
      assert.deepEqual(defaults.bindings.cw, ['ArrowUp', 'KeyX']);
      assert.deepEqual(defaults.bindings.hold, ['ShiftLeft', 'KeyC']);
      assert.equal(defaults.settings.das, 110); assert.equal(defaults.settings.are, 80);
      assert.deepEqual(await defaultPage.locator('[data-act=capture][data-action=cw][data-index]').allTextContents(), ['↑', 'X']);
      assert.deepEqual(await defaultPage.locator('[data-act=capture][data-action=hold][data-index]').allTextContents(), ['Shift(左)', 'C']);
      assert.equal(await defaultPage.locator('#setting-das').inputValue(), '110');
      assert.equal(await defaultPage.locator('#setting-are').inputValue(), '80');
      await checkSettings('default settings', defaultPage); await checkText(defaultPage);
      const saveBefore = await defaultPage.locator('[data-act=close-settings]').boundingBox();
      await defaultPage.locator('[data-act=reset-settings]').focus();
      assert.ok(await defaultPage.locator('.settings-content').evaluate(el => el.scrollTop > 0), 'Settings should scroll internally');
      await checkSettings('default settings scrolled to last control', defaultPage);
      assert.deepEqual(await defaultPage.locator('[data-act=close-settings]').boundingBox(), saveBefore, 'Settings scroll moved save button');
      assert.equal(await defaultPage.evaluate(() => document.scrollingElement.scrollTop), 0);
      await defaultPage.locator('.settings-content').evaluate(el => { el.scrollTop = 0; });
      await shot('settings', defaultPage);

      // Notifications stay in the header, expire, and disappear on navigation.
      await defaultPage.locator('[data-act=reset-handling]').click();
      assert.equal(await defaultPage.locator('#toast.visible').count(), 1);
      assert.ok(await defaultPage.evaluate(() => document.querySelector('#toast').getBoundingClientRect().bottom <= document.querySelector('.topbar').getBoundingClientRect().bottom));
      await defaultPage.waitForFunction(() => getComputedStyle(document.querySelector('#toast')).visibility === 'hidden', null, { timeout: 5500 });
      await defaultPage.locator('[data-act=reset-handling]').click();
      await defaultPage.locator('[data-act=close-settings]').click();
      assert.equal(await defaultPage.locator('#toast.visible').count(), 0);
      assert.equal(await defaultPage.evaluate(() => window.__moetet.getState().screen), 'menu');
      clean();
    } finally { await defaultContext.close(); }

    // Graceful fallbacks for unavailable storage and AudioContext are covered
    // in a separate page, without altering the persistence tests above.
    const fallback = await context.newPage();
    observe(fallback);
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
    console.log('Browser checks passed: all 12 lessons (demo/try-it/internal scroll), drill buttons, perfect/fault/miss, handling, IRS, pause, filters, clean default settings, settings persistence/scroll, toast expiry, sprint, offline fallbacks.');
    console.log('Screenshots: screens/{title,menu,tutorial,tutorial-irs,tutorial-t,drill-target,drill-1080,drill-perfect,drill-fault,settings,sprint-result}.png');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
