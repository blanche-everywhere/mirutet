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
    page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
    page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
    const url=pathToFileURL(path.resolve(__dirname,'../dist/mirutet.html')).href;
    const click=act=>page.locator(`[data-act="${act}"]`).first().click();
    const state=()=>page.evaluate(()=>window.__mirutet.getState());
    let outfit = 'uniform';
    const check=async skin=>{const found=await page.locator('svg.mirufi').evaluateAll(es=>es.map(e=>e.dataset.hairSkin));assert(found.length>0);assert(found.every(v=>v===skin));assert((await page.locator('svg.mirufi').evaluateAll(es=>es.map(e=>e.dataset.outfitSkin))).every(v=>v===outfit));};
    await page.goto(url);await check('center');
    await click('settings');
    const sharedAppearance = page.locator('[role=group][aria-labelledby=shared-appearance]');
    assert.equal(await sharedAppearance.locator('#hair-skin,#outfit-skin').count(), 2);
    assert.equal(await page.locator('[aria-labelledby=finesse-settings] #hair-skin,[aria-labelledby=finesse-settings] #outfit-skin').count(), 0);
    await page.selectOption('[data-ui=pieceCueTiming]', 'current');
    await page.locator('[data-ui=pieceCueVolume][type=range]').evaluate(el => {
      el.value = '37';
      el.dispatchEvent(new Event('input', {bubbles:true}));
      el.dispatchEvent(new Event('change', {bubbles:true}));
    });
    await click('close-settings');
    for(const chosenOutfit of ['uniform','cape']) for(const skin of ['side','center','intake']) {
      outfit=chosenOutfit;
      await click('settings');
      assert.deepEqual(await page.locator('#hair-skin option').evaluateAll(es=>es.map(e=>e.value)),['side','center','intake']);
      await page.selectOption('#outfit-skin',outfit);await page.selectOption('#hair-skin',skin);await check(skin);
      assert.equal(await page.locator('#appearance-preview .mirufi--happy').count(),1);
      await click('close-settings');await check(skin);await page.reload();await check(skin);
      assert.equal((await state()).ui.pieceCueTiming, 'current');
      assert.equal((await state()).ui.pieceCueVolume, 37);
      // Every lesson expression and the other mascot-bearing screens use the selection.
      await click('mode-finesse');await click('tutorial');
      for(let i=0;i<12;i++){await page.locator(`[data-act="lesson"][data-index="${i}"]`).click();await check(skin);}
      await click('menu');await click('mode-finesse');await click('lessons');
      if(await page.locator('svg.mirufi').count())await check(skin);
      await click('menu');await click('mode-finesse');await click('drill');await check(skin);
      await page.evaluate(()=>window.__mirutet.chooseTarget('O',{rot:0,x:4},{delay:0}));
      await page.waitForFunction(()=>!!window.__mirutet.getState().active);
      await page.locator('#board').focus();await page.keyboard.press('Space');
      await page.waitForFunction(()=>!!document.querySelector('#coach-mascot .mirufi--happy'));await check(skin);
      // The actual game happy face must blink without duplicate or missing eyes.
      for (const time of [0, 2440, 2510, 2550, 2630, 3000, 5700, 8250]) {
        const eyes = await page.locator('#coach-mascot svg').evaluate((svg, time) => {
          svg.getAnimations({subtree:true}).forEach(a => { a.pause(); a.currentTime=time; });
          return ['.mirufi-eyes-open','.mirufi-eyes-closed'].map(s => Number(getComputedStyle(svg.querySelector(s)).opacity));
        }, time);
        assert.deepEqual(eyes, [2510,2550,8250].includes(time) ? [0,1] : [1,0]);
      }
      await page.locator('#coach-mascot svg').evaluate(svg => svg.getAnimations({subtree:true}).forEach(a=>{a.currentTime=0;a.play();}));

      await click('hint');await check(skin);
      await click('menu');await click('mode-finesse');await click('sprint');await check(skin);
      await page.locator('#custom-length').fill('1');await click('custom-sprint');
      await page.evaluate(()=>window.__mirutet.chooseTarget('O',{rot:0,x:4},{delay:0}));
      await page.waitForFunction(()=>!!window.__mirutet.getState().active);await page.locator('#board').focus();await page.keyboard.press('Space');
      await page.waitForFunction(()=>window.__mirutet.getState().screen==='result');await check(skin);
      await click('menu');await click('records');assert.equal((await state()).ui.hairSkin,skin);await click('menu');
    }
    const prior=await state();await click('settings');await click('export');
    const exported=JSON.parse(await page.locator('#settings-json').inputValue());assert.equal(exported.ui.hairSkin,'intake');assert.equal(exported.ui.outfitSkin,'cape');
    assert.equal(exported.ui.pieceCueTiming, 'current');assert.equal(exported.ui.pieceCueVolume, 37);
    await page.selectOption('#outfit-skin','uniform');
    await page.selectOption('#hair-skin','side');await page.locator('#settings-json').fill(JSON.stringify(exported));await click('import');await check('intake');
    const after=await state();assert.deepEqual(after.totalStats,prior.totalStats);assert.deepEqual(after.progress,prior.progress);
    for(const value of ['lifted',null,77]){exported.ui.hairSkin=value;await page.locator('#settings-json').fill(JSON.stringify(exported));await click('import');await check('center');}
    delete exported.ui.hairSkin;await page.locator('#settings-json').fill(JSON.stringify(exported));await click('import');await check('center');
    await page.selectOption('#hair-skin','intake');await page.locator('#settings-json').fill('{bad');await click('import');await check('intake');
    await click('reset-settings');outfit='uniform';await check('center');assert.deepEqual((await state()).totalStats,prior.totalStats);
    assert.equal((await state()).ui.pieceCueTiming, 'next');assert.equal((await state()).ui.pieceCueVolume, 60);
    assert.deepEqual((await state()).progress,prior.progress);
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
    // Capture endless play at desktop and at the smaller supported viewport.
    await page.setViewportSize({width:1280,height:720});
    await click('mode-free');await click('free');
    for(let i=0;i<4;i++) {
      await page.waitForFunction(()=>!!window.__mirutet.getState().active);
      await page.locator('#board').focus();await page.keyboard.press('Space');
    }
    await page.waitForFunction(()=>document.querySelector('#pieces').textContent==='4');
    const checkFree=async()=>{
      await check('side');
      assert.doesNotMatch(await page.locator('.topbar').innerText(),/フィネス編|フリーモード/);
      const board=await page.locator('#board').boundingBox();
      assert(board&&board.width>=160&&board.height>=352,`Unusable free board: ${JSON.stringify(board)}`);
      assert.doesNotMatch(await page.locator('#result-panel').innerText(),/最短|\d+\s*\//);
      const layout=await page.evaluate(()=>({width:innerWidth,height:innerHeight,
        scrollWidth:document.scrollingElement.scrollWidth,scrollHeight:document.scrollingElement.scrollHeight,
        rects:[...document.querySelectorAll('.coach .speech,.coach .mirufi,.board-shell,.column-labels,.board-note,#hold-preview,#next-preview,.free-stats,.free-stats .stat,.play-buttons button')].map(el=>{
          const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth};
        })}));
      assert(layout.scrollWidth<=layout.width&&layout.scrollHeight<=layout.height,JSON.stringify(layout));
      for(const r of layout.rects)assert(r.top>=0&&r.bottom<=layout.height&&r.left>=0&&r.right<=layout.width&&r.scrollWidth<=r.clientWidth,JSON.stringify(r));
    };
    await checkFree();await page.screenshot({path:path.resolve(__dirname,'../screens/free.png')});
    await page.setViewportSize({width:800,height:600});await checkFree();
    await page.screenshot({path:path.resolve(__dirname,'../screens/free-small.png')});
    // Keep the controls open in each actual player mode. Check rectangles as
    // well as document overflow: clipped children can otherwise go unnoticed.
    const captureHandling=async (name,open=true)=>{
      await page.waitForFunction(()=>!!window.__mirutet.getState().active);
      // Lesson boards are fitted by the window resize handler. Headless
      // viewport emulation can fire it before the new size is laid out, so
      // wait for the final size and deliver the event again.
      const size=page.viewportSize();
      await page.waitForFunction(([w,h])=>innerWidth===w&&innerHeight===h&&document.documentElement.clientWidth===w,[size.width,size.height]);
      await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>{window.dispatchEvent(new Event('resize'));requestAnimationFrame(r);})));
      if((await page.locator('[data-act=toggle-handling]').getAttribute('aria-expanded')==='true')!==open)await click('toggle-handling');
      const layout=await page.evaluate(()=>{
        const panel=document.querySelector('.handling-panel').getBoundingClientRect();
        const selectors='.handling-panel,.handling-stepper,.handling-stepper button,.play-stats,.play-stats .stat,.board-shell,.column-labels,.board-note,#hold-preview,#next-preview,.play-buttons button,.practice-options,.coach .speech,.coach .mirufi,.lesson-coach .speech,.lesson-coach .mirufi,.lesson-nav,.lesson-heading,#demo-keys,#demo-caption,#tutorial-result';
        const rects=[...document.querySelectorAll(selectors)].filter(el=>el.getClientRects().length).map(el=>{
          const r=el.getBoundingClientRect();return {name:el.className||el.id,top:r.top,bottom:r.bottom,left:r.left,right:r.right,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth};
        });
        const overlaps=[...document.querySelectorAll('.board-shell,#hold-preview,#next-preview,.play-buttons,.lesson-nav')].some(el=>{
          const r=el.getBoundingClientRect();return panel.left<r.right&&panel.right>r.left&&panel.top<r.bottom&&panel.bottom>r.top;
        });
        return {width:innerWidth,height:innerHeight,scrollWidth:document.scrollingElement.scrollWidth,scrollHeight:document.scrollingElement.scrollHeight,rects,overlaps};
      });
      assert(layout.scrollWidth<=layout.width&&layout.scrollHeight<=layout.height,`${name}: ${JSON.stringify(layout)}`);
      for(const r of layout.rects)assert(r.top>=0&&r.bottom<=layout.height&&r.left>=0&&r.right<=layout.width&&r.scrollWidth<=r.clientWidth,`${name}: ${JSON.stringify(r)}`);
      assert.equal(layout.overlaps,false,`${name}: handling overlaps play`);
      assert.equal((await state()).paused,false);
      if(name)await page.screenshot({path:path.resolve(__dirname,`../screens/${name}.png`)});
    };
    await page.setViewportSize({width:1280,height:720});await captureHandling('handling-live');
    await page.setViewportSize({width:800,height:600});await captureHandling('handling-live-small');
    await page.setViewportSize({width:1280,height:720});await click('menu');await click('mode-finesse');await click('drill');
    await captureHandling('handling-drill');
    await page.setViewportSize({width:800,height:600});await captureHandling('handling-drill-small');
    await captureHandling('drill-small',false);
    assert.equal(await page.locator('#play-stats').isVisible(),true);
    await page.setViewportSize({width:1280,height:720});await click('menu');await click('mode-finesse');await click('sprint');await page.locator('[data-act=start-sprint][data-length="40"]').click();
    await captureHandling('handling-sprint');
    await page.setViewportSize({width:800,height:600});await captureHandling('handling-sprint-small');
    await captureHandling('sprint-small',false);
    await page.setViewportSize({width:1280,height:720});await click('menu');await click('mode-finesse');await click('tutorial');await page.locator('[data-act=lesson][data-index="1"]').click();await click('try-it');
    await captureHandling('handling-lesson');
    await page.setViewportSize({width:800,height:600});await captureHandling('handling-lesson-small');
    for(let i=0;i<12;i++){
      await page.locator(`.lesson-steps [data-index="${i}"]`).click();await click('try-it');await captureHandling(null);
    }
    await page.setViewportSize({width:1280,height:720});await click('menu');
    // Storage denied: choices still work for the session, with a clear fallback.
    const blocked=await browser.newContext();await blocked.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked');}});});
    const p=await blocked.newPage();await p.goto(url);await p.locator('[data-act=settings]').first().click();await p.selectOption('#hair-skin','intake');await p.selectOption('#outfit-skin','cape');
    assert((await p.locator('#appearance-storage').textContent()).includes('起動中'));
    await p.locator('[data-act=close-settings]').click();assert.equal(await p.locator('svg.mirufi').getAttribute('data-hair-skin'),'intake');assert.equal(await p.locator('svg.mirufi').getAttribute('data-outfit-skin'),'cape');await p.reload();assert.equal(await p.locator('svg.mirufi').getAttribute('data-outfit-skin'),'uniform');assert.equal(await p.locator('svg.mirufi').getAttribute('data-hair-skin'),'center');await blocked.close();
    assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
    console.log('Appearance browser checks passed: two outfits x three hair skins, every lesson, menu/drill/sprint/result, live handling in all play modes at desktop/800x600 (all 12 challenges), persistence, import/export, invalid/legacy values, records preserved, keyboard, blocked storage, zero errors/network.');
  } finally {await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
