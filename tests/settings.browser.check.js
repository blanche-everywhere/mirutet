'use strict';
const {chromium}=require('playwright-core');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{pathToFileURL}=require('node:url');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true});
 try {
  await require('./tooltips.browser.check').checkSettingTooltips(browser);
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const state=()=>page.evaluate(()=>window.__mirutet.getState());
  const click=act=>page.locator(`[data-act="${act}"]`).first().click();
  await page.goto(pathToFileURL(path.resolve(__dirname,'../dist/mirutet.html')).href);
  await click('settings'); assert.equal(await page.locator('.handling-presets>span').textContent(),'近い設定'); assert.equal(await page.locator('h2').textContent(),'ゲーム設定');
  for(const key of ['das','arr','sdf','dcd','are','gravity','lockDelay']) {
    const input=page.locator(`#setting-${key}`),range=page.locator(`[data-setting=${key}][type=range]`);
    await input.fill('');await input.blur();assert.notEqual(await input.inputValue(),'');
    await input.fill('9999');await input.blur();assert.equal(await input.inputValue(),await range.getAttribute('max'));
    await input.fill('-2');await input.blur();assert.equal(await input.inputValue(),await range.getAttribute('min'));
    await input.fill(key==='gravity'?'1.2':key==='lockDelay'?'120':'12');await input.blur();assert.equal(await input.inputValue(),await range.inputValue());
    await range.focus();await page.keyboard.press('ArrowRight');assert.equal(await input.inputValue(),await range.inputValue());
    const before=(await state()).settings[key];
    await page.locator(`[data-act=adjust-handling][data-handling-key=${key}][data-step="1"]`).click();
    assert(Math.abs((await state()).settings[key]-before-(key==='gravity'?.1:key==='lockDelay'?10:1))<1e-8);
    assert.equal(await input.inputValue(),await range.inputValue());
  }
  // Regression: browser range values must equal number fields and stored state.
  for (const [attribute,key,raw,expected] of [
    ['ui','volume','.33',.35], ['ui','volume','.325',.35], ['ui','pieceCueVolume','37.6',38],
    ['setting','das','12.6',13], ['setting','arr','12.5',13], ['setting','sdf','12.4',12],
    ['setting','lockDelay','125',130], ['setting','dcd','12.6',13], ['setting','are','12.6',13], ['setting','gravity','.35',.4]
  ]) {
    const number=page.locator(`[data-${attribute}=${key}][type=number]`);
    const range=page.locator(`[data-${attribute}=${key}][type=range]`);
    await number.fill(raw); await number.blur();
    assert.equal(await number.inputValue(),String(expected));assert.equal(await range.inputValue(),String(expected));
    assert.equal((await state())[attribute==='ui'?'ui':'settings'][key],expected);
    const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem(window.__mirutet.storageKey)));
    assert.equal(stored[attribute==='ui'?'ui':'settings'][key],expected);
  }
  // Real keystrokes, not fill(): intermediate decimal text must survive.
  for (const [key, group, raw, expected, commit] of [
    ['volume','ui','.324',.3,'blur'], ['volume','ui','.349',.35,'Enter'],
    ['volume','ui','0.325',.35,'Tab'], ['gravity','setting','.349',.3,'Enter'],
    ['gravity','setting','0.349',.3,'blur'], ['gravity','setting','.451',.5,'Tab']
  ]) {
    const number=page.locator(`[data-${group}=${key}][type=number]`);
    const range=page.locator(`[data-${group}=${key}][type=range]`);
    const before=(await state())[group==='ui'?'ui':'settings'][key];
    await number.focus();await number.press('ControlOrMeta+A');await number.press('Backspace');
    for(const char of raw) {
      await number.pressSequentially(char);
      assert.equal((await state())[group==='ui'?'ui':'settings'][key],before,'draft must not reach engine/audio');
      assert.equal(await range.inputValue(),String(before));
    }
    assert.equal(Number(await number.inputValue()),Number(raw),'all typed digits survive');
    if(commit==='blur') await number.blur(); else await number.press(commit);
    assert.equal(await number.inputValue(),String(expected));assert.equal(await range.inputValue(),String(expected));
    const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem(window.__mirutet.storageKey)));
    assert.equal(stored[group==='ui'?'ui':'settings'][key],expected);
  }
  for(const raw of ['.', '-', '1e', '']) {
    const number=page.locator('#ui-volume'),before=(await state()).ui.volume;
    await number.focus();await number.press('ControlOrMeta+A');await number.press('Backspace');
    await number.pressSequentially(raw);await number.blur();
    assert.equal(await number.inputValue(),String(before));assert.equal((await state()).ui.volume,before);
  }
  await page.locator('#setting-das').fill('173');
  for(let i=0;i<24;i++) await page.locator('[data-act=handling-preset]').nth(i%3).click();
  assert.equal((await state()).settings.das,173);
  for(const key of ['das','arr','sdf','dcd','are','gravity','lockDelay']) assert.equal(await page.locator(`#setting-${key}`).inputValue(),String((await state()).settings[key]));
  for(const key of ['irs','ihs','allow180','lockDelayOn']) assert.equal(await page.locator(`[data-engine-toggle=${key}]`).isChecked(),(await state()).settings[key]);
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
  await page.locator('.preset-notes').evaluate(e=>e.open=false);
  await page.locator('.settings-grid').evaluate(e=>e.scrollIntoView({block:'start'}));
  await page.screenshot({path:path.resolve(__dirname,'../screens/bl137-settings.png'),fullPage:false});
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
  await live.focus();await live.press('ControlOrMeta+A');await live.press('Backspace');
  await live.pressSequentially('181.6');await live.press('Enter');assert.equal((await state()).settings.das,182);
  await live.focus();await live.press('ControlOrMeta+A');await live.press('Backspace');await live.pressSequentially('191.6');
  await page.locator('[data-act=adjust-handling][data-handling-key=das][data-step="1"]').click();
  assert.equal((await state()).settings.das,193,'pointer stepper commits draft before incrementing');
  await live.focus();
  const active=(await state()).active;
  await page.keyboard.press('ArrowRight');await page.keyboard.press('Space');
  assert.equal((await state()).active.x,active.x);assert.equal((await state()).active.rot,active.rot);
  await page.keyboard.press('Enter');assert(await page.locator('#board').evaluate(e=>e===document.activeElement));
  await click('settings');await page.locator('[data-preset=ppt2]').click();await click('close-settings');
  assert.equal((await state()).screen,'play');assert.equal((await state()).settings.are,117);
  assert.equal(await page.locator('[data-live-handling] input[type=number][data-setting=are]').inputValue(),'117');
  await click('resume');
  await page.screenshot({path:path.resolve(__dirname,'../screens/bl122-live.png'),fullPage:false});
  const precision=await browser.newPage();precision.on('pageerror',e=>errors.push(e.message));
  await precision.goto(pathToFileURL(path.resolve(__dirname,'../dist/mirutet.html')).href);
  const pclick=act=>precision.locator(`[data-act="${act}"]`).first().click();
  const pstate=()=>precision.evaluate(()=>window.__mirutet.getState());
  await pclick('settings');
  await precision.locator('#settings-json').fill(JSON.stringify({settings:{gravity:1/60,das:177.6},ui:{volume:.333,pieceCueVolume:37.6}}));
  await pclick('import');
  const original=await precision.evaluate(()=>localStorage.getItem(window.__mirutet.storageKey));
  for(let repeat=0;repeat<3;repeat++) {
    for(const selector of ['#setting-gravity','#setting-das','#ui-volume','#ui-pieceCueVolume']) {
      const number=precision.locator(selector),before=await number.inputValue();
      await number.focus();await number.blur();assert.equal(await number.inputValue(),before);
      await number.focus();await number.press('Enter');await number.blur();assert.equal(await number.inputValue(),before);
    }
    await pclick('close-settings');await pclick('settings');
    assert.equal((await pstate()).settings.gravity,1/60);assert.equal((await pstate()).settings.das,177.6);
    assert.equal((await pstate()).ui.volume,.333);assert.equal((await pstate()).ui.pieceCueVolume,37.6);
    assert.equal(await precision.evaluate(()=>localStorage.getItem(window.__mirutet.storageKey)),original);
  }
  await precision.locator('#setting-das').focus();
  await precision.locator('[data-handling-key=das][data-step="1"]').click();assert.equal((await pstate()).settings.das,178.6);
  const gravity=precision.locator('#setting-gravity');
  await gravity.focus();await gravity.press('ControlOrMeta+A');await gravity.pressSequentially(String(1/60));await gravity.press('Enter');
  assert.equal((await pstate()).settings.gravity,1/60,'restoring original draft preserves precision');
  await gravity.focus();await gravity.press('ControlOrMeta+A');await gravity.pressSequentially('.349');await gravity.press('Enter');await gravity.blur();
  assert.equal((await pstate()).settings.gravity,.3);
  await precision.locator('[data-setting=gravity][type=range]').focus();await precision.keyboard.press('ArrowRight');
  assert.equal((await pstate()).settings.gravity,.4);assert.equal(await gravity.inputValue(),'0.4');
  await pclick('close-settings');await pclick('mode-free');await pclick('free');await pclick('toggle-handling');
  const liveDas=precision.locator('[data-setting=das][type=number]');
  await liveDas.focus();await liveDas.blur();await liveDas.focus();await liveDas.press('Enter');assert.equal((await pstate()).settings.das,178.6);
  await liveDas.focus();await precision.locator('[data-handling-key=das][data-step="1"]').click();assert.equal((await pstate()).settings.das,179.6);
  await liveDas.focus();await liveDas.press('ControlOrMeta+A');await liveDas.pressSequentially('181.6');
  await precision.locator('[data-handling-key=das][data-step="1"]').click();assert.equal((await pstate()).settings.das,183);
  await liveDas.focus();await liveDas.blur();assert.equal((await pstate()).settings.das,183);
  await precision.close();
  let lockScenarios = 0;
  for (const mode of ['free','drill','sprint','spin','lesson']) {
    const p = await browser.newPage({viewport:{width:1280,height:720}});
    p.on('pageerror',e=>errors.push(e.message));
    const c = act => p.locator(`[data-act="${act}"]`).first().click();
    const s = () => p.evaluate(()=>window.__mirutet.getState());
    await p.goto(pathToFileURL(path.resolve(__dirname,'../dist/mirutet.html')).href);
    await c('settings');
    assert.equal(await p.locator('[data-engine-toggle=lockDelayOn]').isChecked(),true);
    assert.equal(await p.locator('#setting-lockDelay').inputValue(),'500');
    await p.locator('#settings-json').fill(JSON.stringify({settings:{are:0,sdf:41,lockDelay:100,lockDelayOn:false}}));
    await c('import'); await c('close-settings');
    if (mode==='free') { await c('mode-free'); await c('free'); }
    else if (mode==='sprint') { await c('mode-finesse'); await c('sprint'); await c('start-sprint'); }
    else if (mode==='spin') { await c('mode-spin'); await c('spin-continue'); }
    else if (mode==='lesson') { await c('mode-finesse'); await c('tutorial'); await c('try-it'); }
    else { await c('mode-finesse'); await c('drill'); }
    await p.waitForFunction(()=>!!window.__mirutet.getState().active);
    await c('toggle-handling');
    const auto=p.locator('[data-live-handling] [data-engine-toggle=lockDelayOn]');
    assert.equal(await auto.isChecked(),false);
    assert.equal(await p.locator('[data-handling-value=lockDelay]').textContent(),'OFF');
    await p.locator('#board').focus(); await p.keyboard.press('ArrowDown');
    const piece=(await s()).active;
    await p.waitForTimeout(200); assert.deepEqual((await s()).active,piece);
    const number=p.locator('[data-setting=lockDelay][type=number]');
    await number.fill('500'); await number.press('Enter');
    assert.equal(await p.locator('[data-setting=lockDelay][type=range]').inputValue(),'500');
    await auto.check();
    assert.equal(await p.locator('[data-handling-value=lockDelay]').textContent(),'500 ms');
    assert.equal((await s()).paused,false); assert.equal((await s()).inputCount,1);
    await auto.focus(); await p.keyboard.press('Space');
    assert.equal(await auto.isChecked(),false,'checkbox keyboard input does not hard drop');
    assert.deepEqual((await s()).active,piece);
    await number.fill('100'); await number.press('Enter'); await auto.check();
    await p.waitForFunction(()=>!!window.__mirutet.getState().lastResult);
    assert.equal((await s()).lastResult.used,1);
    await p.close(); lockScenarios++;
  }
  assert.equal(lockScenarios,5);
  console.log('BL-137 browser checks passed: 5 player modes, OFF/ON auto-lock, synced numeric/slider, keyboard toggle isolation; screens/bl137-settings.png.');
  assert.deepEqual(errors,[]);console.log('BL-122 browser checks passed: bounds, empty input, synchronization, repeated presets, manual edits, audio, persistence, defaults, keyboard, mobile, dressup/free transitions, live editing.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
