'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

// Run through test:settings against the shipped offline bundle.
async function checkSettingTooltips(browser) {
  const root = path.resolve(__dirname, '..');
  const url = pathToFileURL(path.join(root, 'dist/mirutet.html')).href;
  const context = await browser.newContext({viewport:{width:1280,height:720}});
  const errors = [], requests = [];
  const observe = page => {
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  };
  let showChecks = 0, touchChecks = 0;
  try {
    const page = await context.newPage(); observe(page);
    const click = act => page.locator(`[data-act="${act}"]`).first().click();
    await page.goto(url); await click('settings');
    const help = await page.evaluate(() => window.__mirutet.settingHelp);
    assert.equal(Object.keys(help).length, 25);
    assert.equal(help.das, 'Delayed Auto Shift：横キーを長押ししたとき、自動で連続移動が始まるまでの待ち時間');
    const checkShown = async (key, control) => {
      const id = `setting-help-${key}`;
      await page.waitForFunction(id => {
        const el = document.getElementById(id); return el && !el.hidden;
      }, id).catch(error => { error.message = `${key}: ${error.message}`; throw error; });
      assert.equal(await page.locator(`#${id}`).textContent(), help[key]);
      assert.equal(await page.locator(`#${id}`).getAttribute('role'), 'tooltip');
      assert((await control.getAttribute('aria-describedby')).split(/\s+/).includes(id));
      assert.equal(await page.locator('[role=tooltip]:visible').count(), 1);
      const box = await page.locator(`#${id}`).boundingBox(), viewport = page.viewportSize();
      assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height);
      showChecks++;
    };
    // Every value control has an accessible description before it receives focus.
    const descriptions = await page.locator('.settings-page input,.settings-page select').evaluateAll(controls => controls
      .filter(el => el.matches('[data-setting],[data-engine-toggle],[data-ui],[data-hair-skin],[data-outfit-skin]'))
      .map(el => ({key:el.dataset.setting || el.dataset.engineToggle || el.dataset.ui || (el.hasAttribute('data-hair-skin') ? 'hairSkin' : 'outfitSkin'),
        text:document.getElementById(el.getAttribute('aria-describedby'))?.textContent})));
    for (const {key, text} of descriptions) assert.equal(text, help[key], key);
    assert.deepEqual([...new Set(descriptions.map(item => item.key))].sort(), Object.keys(help).sort());
    assert.equal(await page.locator('svg[data-setting-help]').count(), 0, 'cosmetic metadata on artwork is not a settings control');
    for (const key of Object.keys(help)) {
      const control = key === 'hairSkin' || key === 'outfitSkin' ? page.locator(`#${key === 'hairSkin' ? 'hair' : 'outfit'}-skin`) :
        page.locator(`[data-setting="${key}"],[data-engine-toggle="${key}"],[data-ui="${key}"]`).first();
      await page.locator('[data-act=close-settings]').focus();
      await page.locator(`[data-setting-help="${key}"]`).first().hover();
      await checkShown(key, control);
      await page.mouse.move(0, 0);
      await control.focus();
      await checkShown(key, control);
    }
    // Escape dismisses help without closing settings or changing the value.
    await page.mouse.move(0, 0);
    await page.locator('#setting-das').focus();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('[role=tooltip]:visible').count(), 0);
    assert.equal(await page.evaluate(() => window.__mirutet.getState().screen), 'settings');
    assert.equal(await page.locator('#setting-das').inputValue(), '110');
    // A tooltip remains visible when the pointer enters it, then closes on leave.
    await page.locator('[data-act=close-settings]').focus();
    await page.locator('[data-setting-help=das]').first().hover();
    await page.locator('#setting-help-das').hover();
    await page.waitForTimeout(160);
    assert(await page.locator('#setting-help-das').isVisible());
    await page.mouse.move(0, 0);
    await page.waitForFunction(() => document.querySelector('#setting-help-das').hidden);
    await page.locator('[data-setting-help=das]').first().hover();
    await page.screenshot({path:path.join(root, 'screens/bl142-tooltip.png')});
    await click('close-settings');
    assert.equal(await page.locator('[role=tooltip]:visible').count(), 0);
    await click('drill'); await click('toggle-handling');
    const liveKeys = ['das','arr','sdf','dcd','are','gravity','lockDelay','lockDelayOn'];
    for (const key of liveKeys) {
      const control = page.locator(`[data-live-handling] [data-setting="${key}"][type=number],[data-live-handling] [data-engine-toggle="${key}"]`);
      await page.locator('#board').focus();
      await control.hover(); await checkShown(key, control);
      await page.mouse.move(0, 0);
      await control.focus(); await checkShown(key, control);
      const before = await page.evaluate(() => window.__mirutet.getState());
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.evaluate(() => window.__mirutet.getState().inputCount), before.inputCount);
    }
    assert.equal(await page.locator('.handling-stepper[title]').count(), 0, 'custom help replaces native title');
    await click('toggle-handling');
    assert.equal(await page.locator('[role=tooltip]:visible').count(), 0, 'collapsing the panel dismisses help');
    // Touch uses real taps on labels and controls; changing values remains native.
    for (const viewport of [{width:390,height:844}, {width:800,height:600}]) {
      const touchContext = await browser.newContext({viewport, hasTouch:true});
      try {
        const touch = await touchContext.newPage(); observe(touch);
        await touch.goto(url);
        await touch.locator('[data-act=settings]').first().tap();
        const dasLabel = touch.locator('label[for=setting-das]');
        await dasLabel.tap();
        assert.equal(await touch.locator('#setting-help-das').textContent(), help.das);
        assert(await touch.locator('#setting-help-das').isVisible()); touchChecks++;
        await touch.locator('h2').tap();
        assert.equal(await touch.locator('[role=tooltip]:visible').count(), 0);
        const toggle = touch.locator('[data-engine-toggle=lockDelayOn]');
        await toggle.tap();
        assert.equal(await toggle.isChecked(), false, 'touch help does not swallow the checkbox tap');
        assert(await touch.locator('#setting-help-lockDelayOn').isVisible()); touchChecks++;
        await touch.locator('[data-act=close-settings]').tap();
        await touch.locator('[data-act=drill]').tap();
        await touch.locator('[data-act=toggle-handling]').tap();
        await touch.locator('[data-live-handling] [data-setting-help=das]>span').tap();
        assert.equal(await touch.locator('#setting-help-das').textContent(), help.das);
        assert(await touch.locator('#setting-help-das').isVisible()); touchChecks++;
        const box = await touch.locator('#setting-help-das').boundingBox();
        assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height);
        await touch.locator('#board').tap();
        assert.equal(await touch.locator('[role=tooltip]:visible').count(), 0);
      } finally { await touchContext.close(); }
    }
    assert.deepEqual(errors, []); assert.deepEqual(requests, []);
    assert.equal(showChecks, 66); assert.equal(touchChecks, 6);
    console.log(`BL-142 browser checks passed: ${showChecks} hover/focus checks (25 full + 8 compact settings), ${touchChecks} touch checks at 390/800px, descriptions, viewport bounds, Escape/outside/hover dismissal and native controls; screens/bl142-tooltip.png.`);
  } finally { await context.close(); }
}
module.exports = {checkSettingTooltips};
