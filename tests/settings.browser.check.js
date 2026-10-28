'use strict';
const {chromium}=require('playwright-core');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{pathToFileURL}=require('node:url');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const state=()=>page.evaluate(()=>window.__mirutet.getState());
  const click=act=>page.locator(`[data-act="${act}"]`).first().click();
  await page.goto(pathToFileURL(path.resolve(__dirname,'../dist/mirutet.html')).href);
  await click('settings'); assert.equal(await page.locator('.handling-presets>span').textContent(),'近い設定'); assert.equal(await page.locator('h2').textContent(),'ゲーム設定');
  for(const key of ['das','arr','sdf','dcd','are','gravity']) {
    const input=page.locator(`#setting-${key}`),range=page.locator(`[data-setting=${key}][type=range]`);
    await input.fill('');await input.blur();assert.notEqual(await input.inputValue(),'');
    await input.fill('9999');await input.blur();assert.equal(await input.inputValue(),await range.getAttribute('max'));
    await input.fill('-2');await input.blur();assert.equal(await input.inputValue(),await range.getAttribute('min'));
    await input.fill(key==='gravity'?'1.2':'12');await input.blur();assert.equal(await input.inputValue(),await range.inputValue());
    await range.focus();await page.keyboard.press('ArrowRight');assert.equal(await input.inputValue(),await range.inputValue());
    const before=(await state()).settings[key];
    await page.locator(`[data-act=adjust-handling][data-handling-key=${key}][data-step="1"]`).click();
    assert(Math.abs((await state()).settings[key]-before-(key==='gravity'?.1:1))<1e-8);
    assert.equal(await input.inputValue(),await range.inputValue());
  }
  // Regression: browser range values must equal number fields and stored state.
  for (const [attribute,key,raw,expected] of [
    ['ui','volume','.33',.35], ['ui','volume','.325',.35], ['ui','pieceCueVolume','37.6',38],
    ['setting','das','12.6',13], ['setting','arr','12.5',13], ['setting','sdf','12.4',12],
    ['setting','dcd','12.6',13], ['setting','are','12.6',13], ['setting','gravity','.35',.4]
  ]) {
    const number=page.locator(`[data-${attribute}=${key}][type=number]`);
    const range=page.locator(`[data-${attribute}=${key}][type=range]`);
    await number.fill(raw); await number.blur();
    assert.equal(await number.inputValue(),String(expected));assert.equal(await range.inputValue(),String(expected));
    assert.equal((await state())[attribute==='ui'?'ui':'settings'][key],expected);
    const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem(window.__mirutet.storageKey)));
    assert.equal(stored[attribute==='ui'?'ui':'settings'][key],expected);
  }
  await page.locator('#setting-das').fill('173');
  for(let i=0;i<24;i++) await page.locator('[data-act=handling-preset]').nth(i%3).click();
  assert.equal((await state()).settings.das,173);
  for(const key of ['das','arr','sdf','dcd','are','gravity']) assert.equal(await page.locator(`#setting-${key}`).inputValue(),String((await state()).settings[key]));
  for(const key of ['irs','ihs','allow180']) assert.equal(await page.locator(`[data-engine-toggle=${key}]`).isChecked(),(await state()).settings[key]);
  await page.locator('#setting-are').fill('88');await page.locator('#setting-are').blur();
  await page.locator('#ui-volume').fill('.55');await page.locator('#ui-volume').blur();
  await page.locator('#ui-pieceCueVolume').fill('37');await page.locator('#ui-pieceCueVolume').blur();
  const saved=(await state()).settings;await page.reload();assert.deepEqual((await state()).settings,saved);
  assert.equal((await state()).ui.volume,.55);assert.equal((await state()).ui.pieceCueVolume,37);
  await click('settings');await click('reset-handling');assert.deepEqual((await state()).settings,require('../src/engine.js').DEFAULT_SETTINGS);
  await page.locator('[data-preset=tec]').focus();await page.keyboard.press('Enter');assert.equal((await state()).settings.are,100);
  await page.locator('.preset-notes').evaluate(e=>e.open=true);
  fs.mkdirSync(path.resolve(__dirname,'../screens'),{recursive:true});
  await page.screenshot({path:path.resolve(__dirname,'../screens/bl122-settings.png'),fullPage:false});
  await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('.preset-notes').evaluate(e=>e.open=false);
  await page.locator('#setting-das').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.resolve(__dirname,'../screens/bl122-settings-small.png'),fullPage:false});
  await page.setViewportSize({width:1440,height:1000});await click('close-settings');
  await click('dressup');await click('settings');await click('close-settings');assert.equal((await state()).screen,'dressup');await click('close-dressup');
  await click('mode-free');await click('free');await page.waitForFunction(()=>!!window.__mirutet.getState().active);
  await click('toggle-handling');
  const live=page.locator('[data-live-handling] input[type=number][data-setting=das]');
  await live.fill('181.6');assert.equal((await state()).settings.das,182);
  const active=(await state()).active;
  await page.keyboard.press('ArrowRight');await page.keyboard.press('Space');
  assert.equal((await state()).active.x,active.x);assert.equal((await state()).active.rot,active.rot);
  await page.keyboard.press('Enter');assert(await page.locator('#board').evaluate(e=>e===document.activeElement));
  await click('settings');await page.locator('[data-preset=ppt2]').click();await click('close-settings');
  assert.equal((await state()).screen,'play');assert.equal((await state()).settings.are,117);
  assert.equal(await page.locator('[data-live-handling] input[type=number][data-setting=are]').inputValue(),'117');
  await click('resume');
  await page.screenshot({path:path.resolve(__dirname,'../screens/bl122-live.png'),fullPage:false});
  assert.deepEqual(errors,[]);console.log('BL-122 browser checks passed: bounds, empty input, synchronization, repeated presets, manual edits, audio, persistence, defaults, keyboard, mobile, dressup/free transitions, live editing.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
