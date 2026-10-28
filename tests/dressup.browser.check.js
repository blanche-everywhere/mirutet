'use strict';
const {chromium}=require('playwright-core'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{pathToFileURL}=require('node:url');
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true});
 try {
 const context=await b.newContext({viewport:{width:1440,height:1000}});
 await context.addInitScript(()=>{window.audioStarts=0;const C=window.AudioContext;if(C){const orig=C.prototype.createOscillator;C.prototype.createOscillator=function(...args){const o=orig.apply(this,args),start=o.start;o.start=function(...a){window.audioStarts++;return start.apply(this,a);};return o;};}});
 const p=await context.newPage(),errors=[],requests=[];p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
 const url=pathToFileURL(path.resolve(__dirname,'../dist/mirutet.html')).href,click=a=>p.locator(`[data-act="${a}"]`).first().click(),state=()=>p.evaluate(()=>window.__mirutet.getState());
 const choose=(k,v)=>p.locator(`[data-act=dressup-select][data-kind=${k}][data-value=${v}]`).click();
 const check=async(h,o,e)=>assert.deepEqual(await p.locator('#avatar svg').evaluate(s=>[s.dataset.hairSkin,s.dataset.outfitSkin,s.dataset.expression]),[h,o,e]);
 await p.goto(url);await p.locator('.menu [data-act=dressup]').click();
 for(const h of ['side','center','intake'])for(const o of ['uniform','cape']){await choose('hair',h);await choose('outfit',o);for(const e of ['normal','happy','surprised','thinking','sorry']){await click('dressup-face');await p.locator(`[data-act=dressup-face][data-value=${e}]`).click();await check(h,o,e);}
 await p.locator('[data-act=dressup-face][data-value=happy]').click();for(const t of [0,2440,2510,2550,2630,3000,5700,8250]){const eyes=await p.locator('#avatar svg').evaluate((s,t)=>{s.getAnimations({subtree:true}).forEach(a=>{a.pause();a.currentTime=t;});return ['.mirufi-eyes-open','.mirufi-eyes-closed'].map(q=>Number(getComputedStyle(s.querySelector(q)).opacity));},t);assert.deepEqual(eyes,[2510,2550,8250].includes(t)?[0,1]:[1,0]);}}
 await choose('hair','intake');await choose('outfit','cape');await p.locator('[data-act=dressup-face][data-value=happy]').click();
 fs.mkdirSync(path.resolve(__dirname,'../screens'),{recursive:true});await p.screenshot({path:path.resolve(__dirname,'../screens/dressup.png'),fullPage:true});
 await p.evaluate(()=>{for(let i=0;i<120;i++){document.querySelectorAll('[data-act=dressup-select][data-kind=hair]')[i%3].click();document.querySelectorAll('[data-act=dressup-select][data-kind=outfit]')[i%2].click();}});await check('intake','cape','happy');
 await p.locator('[data-kind=hair][data-value=center]').focus();await p.keyboard.press('Enter');await check('center','cape','happy');assert(await p.locator('[data-kind=hair][data-value=center]').evaluate(e=>e===document.activeElement));
 await click('dressup-motion');await p.locator('#avatar').evaluate(e=>Promise.all(e.getAnimations({subtree:true}).map(a=>a.ready)));const before=await p.locator('#avatar').evaluate(e=>e.getAnimations({subtree:true}).map(a=>a.currentTime));await p.waitForTimeout(100);assert.deepEqual(await p.locator('#avatar').evaluate(e=>e.getAnimations({subtree:true}).map(a=>a.currentTime)),before);await click('dressup-motion');
 await click('settings');await click('dressup');assert.equal((await state()).screen,'dressup');await p.keyboard.press('Escape');assert.equal((await state()).screen,'menu');
 await click('settings');await click('dressup');await click('settings');assert.equal((await state()).screen,'settings');await p.keyboard.press('Escape');assert.equal((await state()).screen,'menu');
 await p.reload();assert.equal((await state()).ui.outfitSkin,'cape');await click('drill');await p.waitForFunction(()=>!!window.__mirutet.getState().active);
 await p.evaluate(()=>window.__mirutet.chooseTarget('O',{rot:0,x:4},{delay:0}));await p.waitForFunction(()=>!!window.__mirutet.getState().active);await p.locator('#board').focus();await p.keyboard.press('Space');await p.waitForFunction(()=>window.__mirutet.getState().totalStats.attempts>0);
 const statsBefore=(await state()).totalStats;await p.locator('#board').focus();await p.keyboard.down('ArrowLeft');await click('dressup');await p.keyboard.up('ArrowLeft');assert.equal((await state()).paused,true);
 const activeBefore=(await state()).active,sounds=await p.evaluate(()=>window.audioStarts);
 await p.evaluate(()=>document.activeElement.blur());
 for(const key of ['Space','ArrowRight','KeyR','KeyN','KeyH','Comma'])await p.keyboard.press(key);
 await p.waitForTimeout(200);assert.deepEqual((await state()).active,activeBefore);assert.deepEqual((await state()).totalStats,statsBefore);assert.equal(await p.evaluate(()=>window.audioStarts),sounds);
 await choose('hair','side');await choose('outfit','uniform');await p.locator('[data-act=dressup-face][data-value=sorry]').click();await click('close-dressup');assert.equal((await state()).screen,'play');assert.equal((await state()).paused,true);assert.equal(await p.locator('#coach-mascot svg').getAttribute('data-outfit-skin'),'uniform');assert.notEqual(await p.locator('#coach-mascot svg').getAttribute('data-expression'),'sorry');await click('resume');assert.equal((await state()).paused,false);
 await click('menu');await click('tutorial');await click('dressup');await click('close-dressup');assert.equal((await state()).screen,'tutorial');
 await click('try-it');await click('dressup');await click('close-dressup');assert.equal((await state()).paused,true);await click('resume');
 await click('menu');await click('dressup');await p.setViewportSize({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await choose('outfit','cape');await p.screenshot({path:path.resolve(__dirname,'../screens/dressup-small.png'),fullPage:true});
 await click('close-dressup');await p.reload();await click('dressup');await check('side','cape','normal');
 const saved=await p.evaluate(()=>JSON.parse(localStorage.getItem(window.__mirutet.storageKey)));delete saved.ui.hairSkin;delete saved.ui.outfitSkin;
 // Seed on the next document before app startup; pagehide saves the current profile.
 await p.addInitScript(v=>localStorage.setItem('mirutet-finesse.v1',JSON.stringify(v)),saved);await p.reload();await click('dressup');await check('center','uniform','normal');
 const invalid=await context.newPage();await invalid.addInitScript(v=>localStorage.setItem('mirutet-finesse.v1',JSON.stringify(v)),{...saved,ui:{...saved.ui,hairSkin:'unknown',outfitSkin:{bad:true}}});await invalid.goto(url);await invalid.locator('[data-act=dressup]').first().click();assert.equal(await invalid.locator('#avatar svg').getAttribute('data-hair-skin'),'center');assert.equal(await invalid.locator('#avatar svg').getAttribute('data-outfit-skin'),'uniform');const restored=await invalid.evaluate(()=>window.__mirutet.getState().totalStats);for(const key of Object.keys(saved.stats))assert.deepEqual(restored[key],saved.stats[key]);
 await context.close();
 const blocked=await b.newContext();await blocked.addInitScript(()=>{Storage.prototype.setItem=function(){throw new Error('quota');};});const q=await blocked.newPage();await q.goto(url);await q.locator('[data-act=dressup]').first().click();await q.locator('[data-kind=outfit][data-value=cape]').click();assert((await q.locator('#dressup-storage').textContent()).includes('起動中'));await q.locator('[data-act=close-dressup]').click();assert.equal(await q.locator('.menu-art svg').getAttribute('data-outfit-skin'),'cape');await q.reload();assert.equal(await q.locator('.menu-art svg').getAttribute('data-outfit-skin'),'uniform');await blocked.close();
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);console.log('Dress-up checks passed: six combinations, five faces, blinking, rapid selection, keyboard, persistence, paused gameplay/audio, return/resume, lesson transitions, 390px, legacy/invalid data, quota failure, offline.');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
