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
  const html = fs.readFileSync(path.join(root, 'dist/mirutet.html'), 'utf8');
  const urls = html.match(/https?:\/\/[^\s"'<>`\\)]+/gi) || [];
  assert.deepEqual(urls.filter(url => !['http://www.w3.org/2000/svg', 'http://www.w3.org/1999/xlink'].includes(url)), [], 'Unexpected URL in offline HTML');
  fs.mkdirSync(path.join(root, 'screens'), { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
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
    const state = () => page.evaluate(() => window.__mirutet.getState());
    const waitScreen = screen => page.waitForFunction(value => window.__mirutet.getState().screen === value, screen);
    const ready = () => page.waitForFunction(() => !!window.__mirutet.getState().active && !window.__mirutet.getState().paused);
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
      await page.evaluate(({ type, rot, x, delay }) => window.__mirutet.chooseTarget(type, { rot, x }, { delay }), { type, rot, x, delay });
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
        '.lesson-heading', '.lesson-coach .speech', '.lesson-coach .mirufi', '.lesson-board .board-shell', '.lesson-board .column-labels',
        '#demo-keys', '#demo-caption', '#tutorial-result', '.lesson-content', '.lesson-nav',
        '[data-act=previous-lesson]', '[data-act=next-lesson]', '.lesson-shortcuts'
      ]);
      await checkText();
    };
    const checkSettings = async (label, targetPage = page) => {
      await checkViewport(label, ['.page-heading', '[data-act=close-settings]', '.settings-content', '.footer'], targetPage);
      const appearance = targetPage.locator('[role=group][aria-labelledby=shared-appearance]');
      assert.equal(await appearance.locator('#hair-skin').count(), 1);
      assert.equal(await appearance.locator('#outfit-skin').count(), 1);
      const shared = targetPage.locator('[role=group][aria-labelledby=shared-display-sound]');
      for (const key of ['ghost', 'showKeys', 'sound', 'bubbles', 'volume', 'pieceCueTiming', 'pieceCueVolume']) {
        assert.equal(await shared.locator(`[data-ui="${key}"]`).count(), ['volume', 'pieceCueVolume'].includes(key) ? 2 : 1, `${key} is a series-wide setting`);
      }
      const finesse = targetPage.locator('[role=group][aria-labelledby=finesse-settings]');
      assert.deepEqual(await finesse.locator('[data-ui]').evaluateAll(es => es.map(e => e.dataset.ui)),
        ['zeroFault', 'repeatOnFault', 'repeatOnMiss', 'showTarget', 'showOptimal']);
      assert.equal(await finesse.locator('#hair-skin,#outfit-skin').count(), 0);
    };
    const checkDrill = async () => {
      await checkLayout();
      await checkViewport('drill', ['.coach .speech', '.coach .mirufi', '.board-shell', '.column-labels', '.board-note', '.practice-options',
        '.play-buttons', '.play-buttons button', '[data-act=pause]', '.play-footer']);
      await checkText();
    };
    const checkHandling = async label => {
      assert.equal(await page.locator('[data-live-handling]').count(), 1, label);
      await click('toggle-handling');
      assert.equal(await page.locator('[data-act=toggle-handling]').getAttribute('aria-expanded'), 'true');
      await checkViewport(label + ' handling', ['.handling-panel', '.handling-stepper', '.handling-stepper button']);
      const before = await state();
      await page.locator('[data-handling-key=arr][data-step="1"]').click();
      assert.equal((await state()).settings.arr, before.settings.arr + 1);
      assert.equal((await state()).paused, false);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'board');
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem(window.__mirutet.storageKey)).settings.arr), before.settings.arr + 1);
      await page.locator('[data-handling-key=arr][data-step="-1"]').click();
      assert.equal((await state()).settings.arr, before.settings.arr);
      await click('toggle-handling');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'board');
    };
    const checkCombo = async count => {
      assert.equal((await state()).combo.count, count);
      assert.equal(await page.locator('#combo-display').isVisible(), count >= 2);
      assert.equal(await page.locator('#combo-display').getAttribute('aria-live'), 'off');
      assert.equal(await page.locator('.finesse-combo').getAttribute('role'), null);
      assert.equal(await page.locator('#combo-announcement').getAttribute('aria-live'), 'polite');
      const milestone = [50, 20, 10, 5].find(value => value <= count);
      assert.equal(await page.locator('#combo-announcement').textContent(), milestone ? `${milestone} COMBO` : '');
      if (count < 2) return;
      assert.equal((await page.locator('#combo-display').innerText()).replace(/\s+/g, ' ').trim(), `${count} COMBO`);
      await checkViewport(`combo ${count}`, ['.finesse-combo', '#combo-display']);
      const overlaps = await page.locator('#combo-display').evaluate(el => {
        const r = el.getBoundingClientRect();
        return [...document.querySelectorAll('.board-shell,.coach .speech,.coach .mirufi,.play-buttons')].some(other => {
          const q = other.getBoundingClientRect();
          return r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top;
        });
      });
      assert.equal(overlaps, false, 'COMBO must stay clear of the board, mascot and controls');
      assert.equal(await page.locator('.topbar #combo-display,.footer #combo-display').count(), 0);
    };
    const checkLayout = async (minimumWidth = 0) => {
      const layout = await page.evaluate(() => {
        const board = document.querySelector('.board-shell').getBoundingClientRect();
        const canvas = document.querySelector('#board').getBoundingClientRect();
        const overlaps = [...document.querySelectorAll('.coach,.right-stack,.play-buttons,.side-queue')].some(el => {
          const r = el.getBoundingClientRect();
          return r.left < board.right && r.right > board.left && r.top < board.bottom && r.bottom > board.top;
        });
        return { scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight,
          width: innerWidth, height: innerHeight, canvas: { width: canvas.width, height: canvas.height },
          board: { top: board.top, bottom: board.bottom, left: board.left, right: board.right, center: (board.left + board.right) / 2 },
          controlsBottom: document.querySelector('.play-buttons').getBoundingClientRect().bottom, overlaps };
      });
      const playWidth = Math.max(layout.width, minimumWidth);
      assert.ok(layout.scrollWidth <= playWidth, JSON.stringify(layout));
      assert.ok(layout.scrollHeight <= layout.height, JSON.stringify(layout));
      assert.ok(layout.canvas.width >= 120 && layout.canvas.height >= 264, `Unusable board: ${JSON.stringify(layout)}`);
      assert.ok(layout.board.left >= 0 && layout.board.right <= playWidth, JSON.stringify(layout));
      assert.ok(layout.board.bottom < layout.height && layout.controlsBottom <= layout.height, JSON.stringify(layout));
      assert.ok(Math.abs(layout.board.center - playWidth / 2) < 5, JSON.stringify(layout));
      assert.equal(layout.overlaps, false);
      return layout;
    };
    function clean() { assert.deepEqual(errors, [], 'Browser errors:\n' + errors.join('\n')); assert.deepEqual(requests, [], 'External network requests'); }

    await page.goto(pathToFileURL(path.join(root, 'dist', 'mirutet.html')).href);
    await page.waitForFunction(() => !!window.__mirutet);
    // Keep subsequent reloads intact: do not use an init script that clears data.
    await page.evaluate(() => localStorage.clear()); await page.reload();
    await waitScreen('menu'); await checkViewport('menu', ['.menu-buttons', '.first-note', '.menu-art .speech', '.menu-art .mirufi', '.mascot-caption', '.footer']);
    assert.equal(await page.locator('.menu-art .speaker').innerText(), 'ミルフィ');
    assert.match(await page.locator('.menu-art .bubble-text').innerText(), /あなたの先輩、ミルフィですっ/);
    await checkText(); await shot('menu'); clean();

    // Start the first lesson using the focused menu button, then use genuine
    // engine inputs to finish its zero-input mini-drill.
    await page.keyboard.press('Enter'); await waitScreen('tutorial');
    assert.equal((await state()).lessonIndex, 0);
    await page.waitForTimeout(800); await checkLesson(); await shot('tutorial');
    // Native keyboard activation must reach lesson controls, including after
    // blur pauses an interactive lesson (there used to be no resume path).
    await page.locator('[data-act=try-it]').focus(); await page.keyboard.press('Enter'); await ready();
    await checkHandling('lesson challenge');
    await page.keyboard.down('ArrowLeft'); await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.equal((await state()).paused, true); assert.deepEqual((await state()).held, []);
    await page.keyboard.up('ArrowLeft'); await page.keyboard.press('Enter'); await ready();
    await page.keyboard.press('KeyR'); await ready();
    await checkLesson();
    await pressAction('cw'); await pressAction('hardDrop');
    const lessonFault = await state();
    assert.equal(lessonFault.lastResult.status, 'fault'); assert.equal(lessonFault.tryIndex, 0);
    assert.equal(lessonFault.bubble, '…今の1入力。最短は0入力。1入力多い。遠回りしないで。');
    await ready(); await pressAction('hardDrop');
    await page.waitForFunction(() => window.__mirutet.getState().tryDone);
    assert.ok((await state()).progress.completed.includes(0));
    assert.match((await state()).bubble, /大成功ですっ！あなた、最短の操作/);
    await checkLesson();
    await page.locator('[data-act=next-lesson]').focus(); await page.keyboard.press('Enter'); assert.equal((await state()).lessonIndex, 1);
    await page.keyboard.press('ArrowRight'); assert.equal((await state()).lessonIndex, 2);
    await page.keyboard.press('ArrowRight'); assert.equal((await state()).lessonIndex, 3);

    // Both animated spawn-buffer demos run through actual InputHandler timers.
    await page.waitForFunction(() => window.__mirutet.getState().inputs?.some(input => input.irs));
    assert.equal((await state()).inputCount, 1);
    await checkLesson(); await shot('tutorial-irs');
    await page.locator('.demo-tabs [data-act="demo"][data-index="1"]').click();
    await page.waitForFunction(() => window.__mirutet.getState().flags?.ihs === true);
    assert.equal((await state()).heldPiece, 'T');
    await page.locator('.lesson-steps [data-index="4"]').click();
    await checkLesson();
    assert.ok(await page.locator('.lesson-table tbody tr').count() > 5);
    await click('try-it');
    for (let i = 0; i < 3; i++) {
      await placeOptimal();
      await page.waitForFunction(index => window.__mirutet.getState().tryIndex === index + 1, i);
      assert.match((await state()).bubble, i === 2 ? /大成功ですっ/ : /パーフェクトですっ/);
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
    await checkHandling('drill');
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
    await checkCombo(1);
    const comboSlot = await page.locator('.finesse-combo').boundingBox();
    for (let count = 2; count <= 5; count++) {
      await target('O', 0, 4, 0); await ready(); await pressAction('hardDrop');
      await checkCombo(count);
      assert.deepEqual(await page.locator('.finesse-combo').boundingBox(), comboSlot, 'Combo pop must not move its reserved space');
    }
    assert.match((await state()).bubble, /5 COMBO.*あなた.*わたし.*ですっ/);
    // Choose a known next board without changing the judged combo, then let
    // the short pop settle for a repeatable five-COMBO capture.
    await target('T', 0, 0, 0); await ready(); await page.waitForTimeout(700);
    await checkCombo(5); await checkDrill(); await shot('combo');
    await page.setViewportSize({ width: 1920, height: 1080 });
    await checkCombo(5); await checkDrill();
    await page.setViewportSize({ width: 1280, height: 720 });
    await target('O', 0, 4); await ready(); await page.keyboard.press('KeyX'); await page.keyboard.press('Space');
    s = await state();
    assert.equal(s.lastResult.status, 'fault'); assert.equal(s.lastResult.extra, 1); assert.equal(s.stats.faults, 1);
    assert.equal(s.stats.streak, 0); assert.equal(s.expression, 'thinking');
    await checkCombo(0);
    assert.match(s.bubble, /…Oミノ、今の1回。最短は0回。1回多い。遠回りしないで。/);
    assert.match(s.bubble, /ハードドロップだけ。/);
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
    assert.match(s.bubble, /^…/); assert.doesNotMatch(s.bubble, /です|ます|ましょう|ください|♪/);
    assert.equal(s.round.target.key, targetKey);
    await page.keyboard.press('KeyR'); assert.equal((await state()).round.target.key, targetKey);
    for (let count = 1; count <= 2; count++) {
      await target('O', 0, 4, 0); await ready(); await pressAction('hardDrop');
    }
    await checkCombo(2);
    await pressAction('retry'); await checkCombo(0);
    for (let count = 1; count <= 2; count++) {
      await target('O', 0, 4, 0); await ready(); await pressAction('hardDrop');
    }

    // Settings synchronization in both directions, conflict capture, JSON
    // validation, and persistent settings/bindings survive file:// reload.
    await settingsOpen();
    assert.equal((await state()).combo.count, 0, 'Leaving finesse play for settings clears combo');
    assert.equal(await page.locator('#combo-display').count(), 0);
    await checkSettings('settings'); await checkText();
    assert.equal((await state()).ui.pieceCueTiming, 'next');
    assert.equal((await state()).ui.pieceCueVolume, 60);
    assert.equal(await page.locator('[data-act=preview-cue]').count(), 7);
    // Native controls remain keyboard reachable; slider change must not be
    // mistaken for a boolean checkbox by the delegated settings handler.
    await page.locator('[data-ui=pieceCueTiming]').selectOption('current');
    await page.locator('[data-ui=pieceCueVolume][type=range]').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal((await state()).ui.pieceCueVolume, 61);
    await tabTo('[data-act=preview-cue][data-piece=I]');
    for (const type of ['I', 'O', 'T', 'S', 'Z', 'J', 'L']) {
      assert.equal(await page.locator(`[data-act=preview-cue][data-piece=${type}]`).evaluate(el => el === document.activeElement), true);
      await page.keyboard.press('Enter'); await page.keyboard.press('Tab');
    }
    await page.locator('[data-ui=pieceCueTiming]').selectOption('off');
    assert.equal((await state()).ui.pieceCueTiming, 'off');
    await page.locator('[data-ui=pieceCueTiming]').selectOption('current');
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
    await page.selectOption('#hair-skin', 'side');
    await page.selectOption('#outfit-skin', 'cape');
    await click('export');
    const exported = JSON.parse(await page.locator('#settings-json').inputValue());
    assert.equal(exported.settings.das, 300);
    assert.equal(exported.ui.pieceCueTiming, 'current');
    assert.equal(exported.ui.pieceCueVolume, 61);
    assert.equal(exported.ui.hairSkin, 'side'); assert.equal(exported.ui.outfitSkin, 'cape');
    await page.locator('#settings-json').fill('{bad JSON'); await click('import');
    assert.match(await page.locator('#import-status').innerText(), /読み込めません/);
    assert.equal((await state()).settings.das, 300);
    await page.locator('#settings-json').fill(JSON.stringify(exported)); await click('import');
    assert.match(await page.locator('#import-status').innerText(), /保存しました/);
    await page.locator('.settings-content').evaluate(el => { el.scrollTop = 0; });
    await checkSettings('settings after import');
    // Esc dismisses the focused field's help; a second Esc exits settings.
    await page.locator('#setting-das').focus(); await page.keyboard.press('Escape');
    assert.equal(await page.locator('[role=tooltip]:visible').count(), 0);
    assert.equal((await state()).screen, 'settings');
    await page.keyboard.press('Escape');
    assert.equal((await state()).screen, 'play'); await click('resume');
    await page.reload(); await waitScreen('menu');
    s = await state(); assert.equal(s.settings.das, 300); assert.equal(s.settings.arr, 0); assert.equal(s.settings.are, 400);
    assert.equal(s.ui.pieceCueTiming, 'current'); assert.equal(s.ui.pieceCueVolume, 61);
    assert.equal(s.ui.hairSkin, 'side'); assert.equal(s.ui.outfitSkin, 'cape');
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
    await checkViewport('sprint setup', ['.sprint-setup .speech', '.sprint-setup .mirufi']);
    assert.equal(await page.locator('[data-act=start-sprint][data-length="40"]').count(), 1);
    assert.equal(await page.locator('[data-act=start-sprint][data-length="100"]').count(), 1);
    await page.locator('#custom-length').fill('3'); await click('custom-sprint');
    await ready(); await checkHandling('sprint');
    for (let i = 0; i < 3; i++) await placeOptimal();
    await waitScreen('result'); s = await state();
    assert.equal(s.sprintResult.completed, 3); assert.equal(s.sprintResult.perfect, 3);
    assert.equal(s.sprintResult.accuracy, 100); assert.ok(s.sprintResult.elapsed > 0);
    assert.equal(s.totalStats.bestTimes[3], s.sprintResult.elapsed);
    await checkViewport('sprint results', ['.result-layout .speech', '.result-layout .mirufi', '.result-summary']);
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

    // Free play uses the shared physical inputs on an accumulating board.
    // The saved drill profile has a singleton filter and zero-fault preferences;
    // neither may constrain the full seven-bag or end this session.
    assert.equal(await page.locator('[data-act=mode-free]').innerText(), 'フリーモード');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.act), 'tutorial');
    await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.act), 'mode-finesse');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.act), 'mode-free');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.act), 'free');
    await page.keyboard.press('Enter'); await ready();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'board');
    assert.equal((await state()).mode, 'free');
    assert.doesNotMatch(await page.locator('.topbar').innerText(), /フィネス編|フリーモード/);
    assert.equal(await page.locator('.practice-options,[data-setting]:not([data-live-handling] input),#hint-route').count(), 0);
    await checkHandling('free');
    // Real pointer adjustment must leave native arrows/Space and a rebound
    // rotation usable immediately, without adjusting ARR or pausing the run.
    await click('toggle-handling');
    const originalARR = (await state()).settings.arr;
    await page.locator('[data-handling-key=arr][data-step="1"]').click();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'board');
    const liveBefore = await state();
    await page.keyboard.press('ArrowLeft');
    assert.equal((await state()).active.x, liveBefore.active.x - 1);
    assert.equal((await state()).settings.arr, originalARR + 1);
    await page.locator('[data-handling-key=arr][data-step="1"]').focus();
    await pressAction('cw');
    assert.equal((await state()).active.rot, (liveBefore.active.rot + 1) % 4);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'board');
    await page.keyboard.press('Space');
    assert.equal((await state()).stats.pieces, 1);
    assert.equal((await state()).settings.arr, originalARR + 1);
    await settingsOpen();
    assert.equal(await page.locator('#setting-arr').inputValue(), String(originalARR + 1));
    await setNumber('arr', originalARR + 2); await closeSettings();
    assert.equal(await page.locator('[data-handling-value=arr]').innerText(), `${originalARR + 2} ms`);
    await page.locator('[data-handling-key=arr][data-step="-1"]').click();
    await page.locator('[data-handling-key=arr][data-step="-1"]').click();
    await click('toggle-handling'); await click('restart'); await ready();
    const freeTotal = (await state()).totalStats;
    await page.waitForTimeout(150);
    for (let i = 1; i <= 4; i++) {
      await ready(); await pressAction('hardDrop');
      await page.waitForFunction(n => Number(document.querySelector('#pieces').textContent) === n, i);
      assert.equal((await state()).stats.pieces, i);
      assert.ok(Number(await page.locator('#pps').innerText()) > 0);
      assert.doesNotMatch(await page.locator('#result-panel').innerText(), /最短|\d+\s*\//);
    }
    assert.notEqual(await page.locator('#elapsed').innerText(), '00:00.00');
    assert.equal(await page.locator('#next-preview canvas').count(), 5);
    await checkLayout();
    await checkViewport('free desktop', ['.coach .speech', '.coach .mirufi', '.board-shell', '.column-labels', '.board-note',
      '#hold-preview', '#next-preview', '.free-stats', '.free-stats .stat', '.play-buttons', '.play-buttons button']);
    await checkText();
    await page.setViewportSize({ width: 800, height: 600 });
    await checkLayout(); await checkViewport('free 800x600', ['.coach .speech', '.coach .mirufi', '.board-shell',
      '#hold-preview', '#next-preview', '.free-stats', '.free-stats .stat', '.play-buttons', '.play-buttons button']);
    for (const width of [550, 480, 390]) {
      await page.setViewportSize({ width, height: 600 });
      const layout = await checkLayout(800);
      assert.ok(layout.scrollWidth >= 800 && layout.scrollWidth > width, 'Small windows retain a scrollable play layout');
      assert.ok(layout.canvas.width >= 160 && layout.canvas.height >= 352, JSON.stringify(layout));
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    for (let i = 0; i < 20 && !(await state()).stats.gameOver; i++) {
      await ready(); await pressAction('hardDrop');
      await page.waitForTimeout((await state()).settings.are + 30);
    }
    assert.equal((await state()).stats.gameOver, true);
    assert.equal(await page.getByRole('dialog', { name: 'ゲームオーバー' }).count(), 1);
    const freeEnd = await state();
    assert.deepEqual(await page.locator('.gameover .stat label').allTextContents(), ['ライン', 'ミノ', '時間', 'PPS']);
    assert.deepEqual(await page.locator('.gameover .stat strong').allTextContents(),
      await Promise.all(['lines', 'pieces', 'elapsed', 'pps'].map(id => page.locator('#' + id).textContent())));
    await checkViewport('game over', ['.gameover .modal', '.gameover .stat', '.gameover button']);
    await page.setViewportSize({ width: 800, height: 600 });
    await checkViewport('game over 800x600', ['.gameover .modal', '.gameover .stat', '.gameover button']);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(550);
    assert.equal((await state()).stats.elapsed, freeEnd.stats.elapsed);
    assert.deepEqual(await page.locator('.gameover .primary').evaluate((button, codes) => codes.map(code =>
      button.dispatchEvent(new KeyboardEvent('keydown', { code, repeat: true, bubbles: true, cancelable: true }))),
    ['Space', 'Enter', freeEnd.bindings.retry[0]]), [false, false, false], 'Dialog key repeats must cancel native activation');
    assert.equal((await state()).stats.gameOver, true);
    await pressAction('retry'); await ready();
    assert.equal((await state()).stats.gameOver, false); assert.equal((await state()).stats.pieces, 0);
    assert.equal(await page.locator('.gameover').count(), 0);
    assert.equal((await state()).heldPiece, null); assert.equal((await state()).lastResult, null);
    await pressAction('hardDrop'); await click('restart'); await ready();
    assert.equal((await state()).stats.pieces, 0); assert.equal((await state()).stats.lines, 0);
    assert.deepEqual((await state()).totalStats, freeTotal, 'free placements do not change practice records');
    await click('menu'); await click('mode-finesse'); clean();

    await require('./spin.browser.check').runSpinChecks(browser, root);

    // Capture defaults from a genuinely fresh profile, isolated from all the
    // edits/reloads above. Resetting the persistence profile would hide leaks.
    const defaultContext = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    try {
      const defaultPage = await defaultContext.newPage();
      observe(defaultPage);
      await defaultPage.goto(pathToFileURL(path.join(root, 'dist', 'mirutet.html')).href);
      await defaultPage.waitForFunction(() => !!window.__mirutet);
      assert.equal(await defaultPage.evaluate(() => localStorage.getItem(window.__mirutet.storageKey)), null);
      await checkViewport('clean title', ['.menu-buttons', '.menu-buttons button', '.first-note', '.menu-art .speech', '.menu-art .mirufi', '.mascot-caption', '.footer'], defaultPage);
      await checkText(defaultPage); await shot('title', defaultPage);
      await defaultPage.locator('.topbar [data-act=settings]').click();
      await defaultPage.waitForFunction(() => window.__mirutet.getState().screen === 'settings');
      const defaults = await defaultPage.evaluate(() => window.__mirutet.getState());
      assert.deepEqual(defaults.bindings.cw, ['ArrowUp', 'KeyX']);
      assert.deepEqual(defaults.bindings.hold, ['ShiftLeft', 'KeyC']);
      assert.equal(defaults.settings.das, 110); assert.equal(defaults.settings.are, 80);
      assert.equal(defaults.ui.pieceCueTiming, 'next'); assert.equal(defaults.ui.pieceCueVolume, 60);
      assert.equal(defaults.ui.hairSkin, 'center'); assert.equal(defaults.ui.outfitSkin, 'uniform');
      assert.equal(await defaultPage.locator('#hair-skin').inputValue(), 'center');
      assert.equal(await defaultPage.locator('#outfit-skin').inputValue(), 'uniform');
      assert.equal(await defaultPage.locator('[data-ui=pieceCueTiming]').inputValue(), 'next');
      assert.equal(await defaultPage.locator('[data-ui=pieceCueVolume][type=range]').inputValue(), '60');
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
      assert.equal(await defaultPage.locator('#toast').innerText(), 'ハンドリング、初期値に戻せましたっ。');
      assert.ok(await defaultPage.evaluate(() => document.querySelector('#toast').getBoundingClientRect().bottom <= document.querySelector('.topbar').getBoundingClientRect().bottom));
      await defaultPage.waitForFunction(() => getComputedStyle(document.querySelector('#toast')).visibility === 'hidden', null, { timeout: 5500 });
      await defaultPage.locator('[data-act=reset-handling]').click();
      await defaultPage.locator('[data-act=close-settings]').click();
      assert.equal(await defaultPage.locator('#toast.visible').count(), 0);
      assert.equal(await defaultPage.evaluate(() => window.__mirutet.getState().screen), 'menu');
      clean();
    } finally { await defaultContext.close(); }

    // Seed before app startup in isolated profiles. The legacy key comes from
    // the app's single migration constant rather than duplicating its spelling.
    const appSource = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
    const legacyKey = appSource.match(/const LEGACY_STORAGE = '([^']+)'/)[1];
    const storageKey = 'mirutet-finesse.v1';
    const legacyProfile = { version: 1, settings: { das: 173, arr: 7, are: 95 },
      ui: { sound: false, volume: .55 },
      practice: { pieces: ['T', 'I'], area: 'custom', minColumn: 2, maxColumn: 8, weakSpot: true },
      progress: { current: 4, completed: [0, 1, 3] },
      stats: { attempts: 9, placements: 8, perfect: 6, faults: 2, misses: 1,
        bestStreak: 4, bestTimes: { 40: 65000 } } };
    const legacyRaw = JSON.stringify(legacyProfile, null, 2);
    for (const hasNewProfile of [false, true]) {
      const migrationContext = await browser.newContext();
      try {
        const migrationPage = await migrationContext.newPage();
        observe(migrationPage);
        // Playwright init scripts run before the inline app scripts.
        const newProfile = { ...legacyProfile, settings: { das: 221, arr: 11, are: 120 },
          stats: { ...legacyProfile.stats, perfect: 7 }, progress: { current: 8, completed: [0, 8] } };
        const newRaw = hasNewProfile ? JSON.stringify(newProfile) : null;
        await migrationPage.addInitScript(({ legacyKey, storageKey, legacyRaw, newRaw }) => {
          // Reloads must inspect the migrated values without seeding them again.
          if (sessionStorage.getItem('migration-seeded')) return;
          localStorage.setItem(legacyKey, legacyRaw);
          if (newRaw !== null) localStorage.setItem(storageKey, newRaw);
          sessionStorage.setItem('migration-seeded', 'true');
        }, { legacyKey, storageKey, legacyRaw, newRaw });
        await migrationPage.goto(pathToFileURL(path.join(root, 'dist', 'mirutet.html')).href);
        await migrationPage.waitForFunction(() => !!window.__mirutet);
        const expected = hasNewProfile ? newProfile : legacyProfile;
        const checkMigratedProfile = async () => {
          const saved = await migrationPage.evaluate(legacyKey => ({
            state: window.__mirutet.getState(), storageKey: window.__mirutet.storageKey,
            raw: localStorage.getItem(window.__mirutet.storageKey), legacy: localStorage.getItem(legacyKey)
          }), legacyKey);
          assert.equal(saved.storageKey, storageKey);
          assert.equal(saved.legacy, hasNewProfile ? legacyRaw : null);
          assert.equal(saved.state.storageOK, true);
          assert.equal(typeof saved.raw, 'string', 'The selected profile must be persisted');
          // save() fills defaults and serializes compact JSON. Compare the
          // seeded values in both the live state and the stored profile.
          const persisted = JSON.parse(saved.raw);
          assert.equal(persisted.version, 1);
          for (const [label, profile] of [['live', { ...saved.state, stats: saved.state.totalStats }], ['saved', persisted]]) {
            for (const key of ['das', 'arr', 'are']) assert.equal(profile.settings[key], expected.settings[key], `${label} settings.${key}`);
            assert.equal(profile.ui.sound, expected.ui.sound, `${label} ui.sound`);
            assert.equal(profile.ui.volume, expected.ui.volume, `${label} ui.volume`);
            assert.equal(profile.ui.pieceCueTiming, 'next', `${label} ui.pieceCueTiming`);
            assert.equal(profile.ui.pieceCueVolume, 60, `${label} ui.pieceCueVolume`);
            assert.equal(profile.ui.hairSkin, 'center', `${label} ui.hairSkin`);
            assert.equal(profile.ui.outfitSkin, 'uniform', `${label} ui.outfitSkin`);
            assert.deepEqual(profile.practice, expected.practice, `${label} practice`);
            assert.deepEqual(profile.progress, expected.progress, `${label} progress`);
            for (const key of ['attempts', 'placements', 'perfect', 'faults', 'misses', 'bestStreak']) {
              assert.equal(profile.stats[key], expected.stats[key], `${label} stats.${key}`);
            }
            assert.deepEqual(profile.stats.bestTimes, expected.stats.bestTimes, `${label} stats.bestTimes`);
          }
          assert.deepEqual(persisted.ui, saved.state.ui, 'startup persists every normalized UI field');
        };
        await checkMigratedProfile();
        await migrationPage.reload();
        await migrationPage.waitForFunction(() => !!window.__mirutet);
        await checkMigratedProfile();
        clean();
      } finally { await migrationContext.close(); }
    }

    // Graceful fallbacks for unavailable storage and AudioContext are covered
    // in a separate page, without altering the persistence tests above.
    const fallback = await context.newPage();
    observe(fallback);
    await fallback.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('storage unavailable'); } });
      Object.defineProperty(window, 'AudioContext', { value: undefined });
      Object.defineProperty(window, 'webkitAudioContext', { value: undefined });
    });
    await fallback.goto(pathToFileURL(path.join(root, 'dist', 'mirutet.html')).href);
    await fallback.locator('[data-act=drill]').click();
    await fallback.waitForFunction(() => !!window.__mirutet.getState().active);
    await fallback.evaluate(() => window.__mirutet.chooseTarget('O', { rot: 0, x: 4 }, { delay: 0 }));
    await fallback.keyboard.press('Space');
    assert.equal(await fallback.evaluate(() => window.__mirutet.getState().lastResult.status), 'perfect');
    clean();
    console.log('Browser checks passed: all 12 lessons, drill/sprint, combo, handling/IRS/pause, settings/storage, free-mode stats/top-out/restart/desktop/800x600, offline fallbacks.');
    console.log('Screenshots: screens/{title,menu,tutorial,tutorial-irs,tutorial-t,drill-target,drill-1080,drill-perfect,combo,drill-fault,settings,sprint-result}.png');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
