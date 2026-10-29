'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const E = require('../src/engine');

// Called by browser.check.js. Use visible categories and native clicks/keys to
// audit every former home entry against the delivered file:// bundle.
async function runNavigationChecks(browser, root = path.resolve(__dirname, '..')) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errors = [], requests = [];
  try {
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
    await page.addInitScript(() => {
      // Seed once; subsequent navigation must preserve the user's profile.
      if (localStorage.getItem('mirutet-finesse.v1') === null) localStorage.setItem('mirutet-finesse.v1', JSON.stringify({
        settings: { are: 80, gravity: 0 }, progress: { current: 3, completed: [1, 3] },
        stats: { attempts: 5, perfect: 3 },
        spin: { current: 't-single-right', completed: ['t-single-left'], stats: { attempts: 4, perfect: 1 } }
      }));
    });
    await page.goto(pathToFileURL(path.join(root, 'dist/mirutet.html')).href);
    await page.waitForFunction(() => !!window.__mirutet);
    const state = () => page.evaluate(() => window.__mirutet.getState());
    const screen = value => page.waitForFunction(value => window.__mirutet.getState().screen === value, value);
    const click = act => page.locator(`[data-act="${act}"]`).first().click();
    const home = async () => { await page.locator('.top-actions [data-act=menu]').click(); await screen('menu'); };
    const ready = () => page.waitForFunction(() => !!window.__mirutet.getState().active);
    const actions = ['mode-free', 'mode-finesse', 'mode-spin', 'dressup', 'records', 'settings'];
    const labels = ['フリー', 'フィネス', '回転入れ', 'きせかえ', '記録', '設定'];
    fs.mkdirSync(path.join(root, 'screens'), { recursive: true });
    for (const [width, height] of [[1280, 720], [800, 600]]) {
      await page.setViewportSize({ width, height });
      assert.deepEqual(await page.locator('.home-categories button').evaluateAll(es => es.map(e => e.dataset.act)), actions);
      assert.deepEqual(await page.locator('.home-categories b').allTextContents(), labels);
      assert.equal(await page.locator('button').count(), 6, 'Only the six category entrances on top');
      assert.equal(await page.locator('.category-practice').count(), 3);
      assert.equal(await page.locator('.category-secondary').count(), 3);
      assert.equal(await page.locator('.menu-art .speaker').innerText(), 'ミルフィ');
      assert.equal(await page.locator('[data-act=tutorial],[data-act=lessons],[data-act=drill],[data-act=sprint],[data-act=spin-continue],.first-note').count(), 0);
      const layout = await page.evaluate(() => {
        const rect = el => { const r = el.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom }; };
        return {
          width:innerWidth, height:innerHeight, scrollWidth:document.scrollingElement.scrollWidth, scrollHeight:document.scrollingElement.scrollHeight,
          rects:[...document.querySelectorAll('.category-card,.category-card small,.menu-art .speech,.menu-art .mirufi,.mascot-caption,.footer')].map(rect),
          cards:[...document.querySelectorAll('.category-card')].map(el => ({ ...rect(el), size:parseFloat(getComputedStyle(el.querySelector('b')).fontSize) })),
          descriptions:[...document.querySelectorAll('.category-card small')].map(el => ({ text:el.textContent, whiteSpace:getComputedStyle(el).whiteSpace, scroll:el.scrollWidth, client:el.clientWidth }))
        };
      });
      assert(layout.scrollWidth <= width && layout.scrollHeight <= height, JSON.stringify(layout));
      for (const r of layout.rects) assert(r.left >= 0 && r.right <= width && r.top >= 0 && r.bottom <= height && r.bottom > r.top, JSON.stringify(r));
      for (const description of layout.descriptions) {
        assert.match(description.text, /[ぁ-んァ-ン一-龠]/);
        assert.equal(description.whiteSpace, 'nowrap');
        assert(description.scroll <= description.client, JSON.stringify(description));
      }
      for (const card of layout.cards.slice(0, 3)) {
        assert(card.size > layout.cards[3].size);
        assert(card.right - card.left > layout.cards[3].right - layout.cards[3].left);
      }
      await page.screenshot({ path:path.join(root, 'screens', `bl145-top-${width}.png`) });
    }
    await page.setViewportSize({ width:1280, height:720 });
    for (const action of actions) {
      assert.equal(await page.evaluate(() => document.activeElement.dataset.act), action);
      await page.keyboard.press('ArrowRight');
    }
    assert.equal(await page.evaluate(() => document.activeElement.dataset.act), actions[0]);
    // Every category has an explicit home button and Esc back to top.
    for (const [i, target] of ['free', 'finesse', 'spins', 'dressup', 'records', 'settings'].entries()) {
      await click(actions[i]); await screen(target);
      assert.equal(await page.locator('.top-actions [data-act=menu]').innerText(), 'タイトルへ');
      await page.keyboard.press('Escape'); await screen('menu');
      await click(actions[i]); await home();
    }
    await page.keyboard.press('Enter'); await screen('free');
    await page.keyboard.press('Comma'); await screen('settings');
    await page.keyboard.press('Escape'); await screen('free');
    await click('free'); await screen('play'); await ready();
    assert.equal((await state()).mode, 'free');
    await page.keyboard.press('Escape');
    await page.locator('.overlay [data-act=menu]').click(); await screen('menu');

    await click('mode-finesse'); await screen('finesse');
    assert.deepEqual(await page.locator('.menu-buttons button').evaluateAll(es => es.map(e => e.dataset.act)), ['tutorial', 'lessons', 'drill', 'sprint']);
    assert.match(await page.locator('.first-note').innerText(), /2 \/ 12/);
    const finesseLayout = await page.locator('.menu-buttons button,.first-note,.menu-art .speech,.menu-art .mirufi,.footer').evaluateAll(es => es.map(el => {
      const r = el.getBoundingClientRect();
      return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, scroll:el.scrollWidth, client:el.clientWidth };
    }));
    for (const r of finesseLayout) assert(r.left >= 0 && r.right <= 1280 && r.top >= 0 && r.bottom <= 720 && r.scroll <= r.client, JSON.stringify(r));
    await page.screenshot({ path:path.join(root, 'screens', 'bl145-finesse.png') });
    await page.keyboard.press('Enter'); await screen('tutorial');
    assert.equal((await state()).lessonIndex, 3, 'Continue the saved lesson');
    await page.keyboard.press('Escape'); await screen('menu');
    for (let i = 0; i < 12; i++) {
      await click('mode-finesse'); await click('lessons'); await screen('lessons');
      assert.equal(await page.locator('.lesson-card').count(), 12);
      await page.locator(`.lesson-card[data-index="${i}"]`).click(); await screen('tutorial');
      assert.equal((await state()).lessonIndex, i);
      await home();
    }
    await click('mode-finesse'); await click('drill'); await ready();
    assert.equal(await page.locator('[data-piece-filter]').count(), 7);
    assert.equal(await page.locator('#area,[data-practice=weakSpot],[data-ui=zeroFault]').count(), 3);
    await home(); await click('mode-finesse'); await click('sprint'); await screen('sprint');
    for (const length of [40, 100]) assert.equal(await page.locator(`[data-act=start-sprint][data-length="${length}"]`).count(), 1);
    assert.equal(await page.locator('#custom-length,[data-act=custom-sprint]').count(), 2);
    await page.keyboard.press('Escape'); await screen('menu');

    await click('mode-spin'); await screen('spins');
    assert.equal(await page.locator('.spin-set').count(), E.SPIN_SETS.length);
    assert.deepEqual(await page.locator('[data-act=spin-drill]').evaluateAll(es => es.map(e => e.dataset.id)), E.SPIN_DRILLS.map(d => d.id));
    assert.equal(await page.locator('.lesson-card.done').count(), 1);
    await click('spin-continue'); await ready(); assert.equal((await state()).round.drillId, 't-single-right');
    await click('spins'); await screen('spins');
    for (const drill of E.SPIN_DRILLS) {
      await page.locator(`[data-act=spin-drill][data-id="${drill.id}"]`).click(); await ready();
      assert.equal((await state()).round.drillId, drill.id);
      await home(); await click('mode-spin'); await screen('spins');
    }
    await page.keyboard.press('Escape'); await screen('menu');
    await click('records'); await screen('records');
    const records = await page.locator('main').innerText();
    for (const text of ['2 / 12', '1 / 36', '1 成功 / 4 試行', '試行数', '正確率', '最高連続', 'フォルト', '置き場所ミス', '平均入力 / 最短', 'ミノごとの記録', 'スプリントのベストタイム']) assert(records.includes(text), text);
    assert.equal(await page.locator('[data-act=reset-stats]').count(), 1);
    await click('lessons'); await screen('lessons'); await home();
    await click('records'); await click('spins'); await screen('spins'); await home();
    await click('dressup'); await screen('dressup');
    assert.equal(await page.locator('[data-act=dressup-select][data-kind=hair]').count(), 3);
    assert.equal(await page.locator('[data-act=dressup-select][data-kind=outfit]').count(), 2);
    assert.equal(await page.locator('[data-act=dressup-face]').count(), 6);
    assert.equal(await page.locator('[data-act=dressup-motion]').count(), 1);
    await click('close-dressup'); await screen('menu');
    await click('settings'); await screen('settings');
    for (const selector of ['#setting-das', '[data-act=capture]', '#hair-skin', '#outfit-skin', '[data-ui=sound]', '[data-ui=zeroFault]', '[data-act=export]', '[data-act=import]', '[data-act=reset-settings]']) assert(await page.locator(selector).count() > 0, selector);
    await click('close-settings'); await screen('menu');
    assert.equal((await state()).totalStats.attempts, 5);
    assert.deepEqual((await state()).progress.completed, [1, 3]);
    assert.deepEqual(errors, []); assert.deepEqual(requests, []);
    console.log('BL-145 navigation passed: six ordered cards at 1280/800, all former entries, 12 lessons, 8 sets/36 drills, progress, native keys and home/Esc; screenshots bl145-top-{1280,800}.png and bl145-finesse.png.');
  } finally { await context.close(); }
}

module.exports = { runNavigationChecks };
