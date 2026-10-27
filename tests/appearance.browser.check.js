'use strict';
const {chromium}=require('playwright-core');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const fs=require('node:fs');

async function main() {
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
  try {
    const context=await browser.newContext({viewport:{width:1280,height:720}});
    const page=await context.newPage(), errors=[],requests=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
    const url=pathToFileURL(path.resolve(__dirname,'../dist/mirutet.html')).href;
    const click=act=>page.locator(`[data-act="${act}"]`).first().click();
    const state=()=>page.evaluate(()=>window.__mirutet.getState());
    let outfit = 'uniform';
    const check=async skin=>{const found=await page.locator('svg.mirufi').evaluateAll(es=>es.map(e=>e.dataset.hairSkin));assert(found.length>0);assert(found.every(v=>v===skin));assert((await page.locator('svg.mirufi').evaluateAll(es=>es.map(e=>e.dataset.outfitSkin))).every(v=>v===outfit));};
    await page.goto(url);await check('center');
    for(const chosenOutfit of ['uniform','cape']) for(const skin of ['side','center','intake']) {
      outfit=chosenOutfit;
      await click('settings');
      assert.deepEqual(await page.locator('#hair-skin option').evaluateAll(es=>es.map(e=>e.value)),['side','center','intake']);
      await page.selectOption('#outfit-skin',outfit);await page.selectOption('#hair-skin',skin);await check(skin);
      assert.equal(await page.locator('#appearance-preview .mirufi--happy').count(),1);
      await click('close-settings');await check(skin);await page.reload();await check(skin);
      // Every lesson expression and the other mascot-bearing screens use the selection.
      await click('tutorial');
      for(let i=0;i<12;i++){await page.locator(`[data-act="lesson"][data-index="${i}"]`).click();await check(skin);}
      await click('menu');await click('lessons');
      if(await page.locator('svg.mirufi').count())await check(skin);
      await click('menu');await click('drill');await check(skin);
      await page.evaluate(()=>window.__mirutet.chooseTarget('O',{rot:0,x:4},{delay:0}));
      await page.waitForFunction(()=>!!window.__mirutet.getState().active);
      await page.locator('#board').focus();await page.keyboard.press('Space');
      await page.waitForFunction(()=>!!document.querySelector('#coach-mascot .mirufi--happy'));await check(skin);
      await click('hint');await check(skin);
      await click('menu');await click('sprint');await check(skin);
      await page.locator('#custom-length').fill('1');await click('custom-sprint');
      await page.evaluate(()=>window.__mirutet.chooseTarget('O',{rot:0,x:4},{delay:0}));
      await page.waitForFunction(()=>!!window.__mirutet.getState().active);await page.locator('#board').focus();await page.keyboard.press('Space');
      await page.waitForFunction(()=>window.__mirutet.getState().screen==='result');await check(skin);
      await click('menu');await click('records');assert.equal((await state()).ui.hairSkin,skin);await click('menu');
    }
    const prior=await state();await click('settings');await click('export');
    const exported=JSON.parse(await page.locator('#settings-json').inputValue());assert.equal(exported.ui.hairSkin,'intake');assert.equal(exported.ui.outfitSkin,'cape');
    await page.selectOption('#outfit-skin','uniform');
    await page.selectOption('#hair-skin','side');await page.locator('#settings-json').fill(JSON.stringify(exported));await click('import');await check('intake');
    const after=await state();assert.deepEqual(after.totalStats,prior.totalStats);assert.deepEqual(after.progress,prior.progress);
    for(const value of ['lifted',null,77]){exported.ui.hairSkin=value;await page.locator('#settings-json').fill(JSON.stringify(exported));await click('import');await check('center');}
    delete exported.ui.hairSkin;await page.locator('#settings-json').fill(JSON.stringify(exported));await click('import');await check('center');
    await page.selectOption('#hair-skin','intake');await page.locator('#settings-json').fill('{bad');await click('import');await check('intake');
    await click('reset-settings');outfit='uniform';await check('center');assert.deepEqual((await state()).totalStats,prior.totalStats);
    await page.selectOption('#hair-skin','intake');
    for(const value of ['goth',null,77]) { exported.ui.outfitSkin=value; exported.ui.hairSkin='intake'; await page.locator('#settings-json').fill(JSON.stringify(exported)); await click('import'); await check('intake'); }
    delete exported.ui.outfitSkin; await page.locator('#settings-json').fill(JSON.stringify(exported)); await click('import'); await check('intake');
    await page.locator('#outfit-skin').focus();await page.keyboard.press('End');await page.keyboard.press('Enter');outfit='cape';await check('intake');
    assert(await page.locator('#outfit-skin').evaluate(e=>e===document.activeElement));
    // Native select remains focused after changing it and supports keyboard use.
    await page.locator('#hair-skin').focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
    assert.equal(await page.locator('#hair-skin').inputValue(),'center');assert.equal(await page.locator('#hair-skin').evaluate(e=>e===document.activeElement),true);await check('center');
    await page.keyboard.press('Escape');await check('center');
    await click('settings');await page.selectOption('#hair-skin','intake');
    fs.mkdirSync(path.resolve(__dirname,'../screens'),{recursive:true});
    await page.screenshot({path:path.resolve(__dirname,'../screens/appearance-settings.png')});
    await page.setViewportSize({width:800,height:600});await page.locator('#hair-skin').scrollIntoViewIfNeeded();
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    const rect=await page.locator('#hair-skin').boundingBox();assert(rect.x>=0&&rect.x+rect.width<=800);assert(rect.y>=0&&rect.y+rect.height<=600);
    await page.selectOption('#hair-skin','side');await check('side');await page.screenshot({path:path.resolve(__dirname,'../screens/appearance-small.png')});
    await click('close-settings');await page.reload();await check('side');
    // Storage denied: choices still work for the session, with a clear fallback.
    const blocked=await browser.newContext();await blocked.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked');}});});
    const p=await blocked.newPage();await p.goto(url);await p.locator('[data-act=settings]').first().click();await p.selectOption('#hair-skin','intake');await p.selectOption('#outfit-skin','cape');
    assert((await p.locator('#appearance-storage').textContent()).includes('起動中'));
    await p.locator('[data-act=close-settings]').click();assert.equal(await p.locator('svg.mirufi').getAttribute('data-hair-skin'),'intake');assert.equal(await p.locator('svg.mirufi').getAttribute('data-outfit-skin'),'cape');await p.reload();assert.equal(await p.locator('svg.mirufi').getAttribute('data-outfit-skin'),'uniform');assert.equal(await p.locator('svg.mirufi').getAttribute('data-hair-skin'),'center');await blocked.close();
    assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
    console.log('Appearance browser checks passed: two outfits x three hair skins, every lesson, menu/drill/sprint/result, persistence, import/export, invalid/legacy values, records preserved, keyboard, 800x600, blocked storage, zero errors/network.');
  } finally {await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
