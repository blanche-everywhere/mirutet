'use strict';
// The fixture was captured from the approved standalone preview, not this renderer.
const {chromium}=require('playwright-core');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const M=require('../src/mascot.js');
const {samples}=require('./fixtures/angry-approved-v2.json');

(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),raster=await browser.newPage({viewport:{width:400,height:400}});
    const errors=[],requests=[];
    for(const p of [page,raster]){p.on('pageerror',e=>errors.push(e.message));p.on('console',e=>{if(e.type()==='error')errors.push(e.text());});p.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});}
    await page.goto(pathToFileURL(path.resolve(__dirname,'../dist/mirutet.html')).href);
    await page.locator('.menu [data-act=dressup]').click();
    const face=value=>page.locator(`[data-act=dressup-face][data-value=${value}]`);
    assert.equal(await face('angry').textContent(),'むっ');
    const picture=async(svg,width,time)=>{
      await raster.setContent(`<style>body{margin:0;background:white}${M.MASCOT_CSS}svg.mirufi{width:${width}px;height:auto}</style>${svg}`);
      await raster.locator('svg').evaluate((s,t)=>s.getAnimations({subtree:true}).forEach(a=>{a.pause();a.currentTime=t;}),time);
      return raster.locator('svg').screenshot();
    };
    let comparisons=0;
    for(const hair of M.HAIR_SKINS)for(const outfit of M.OUTFIT_SKINS){
      await page.locator(`[data-act=dressup-select][data-kind=hair][data-value=${hair}]`).click();
      await page.locator(`[data-act=dressup-select][data-kind=outfit][data-value=${outfit}]`).click();
      await face('angry').click();
      assert.equal(await face('angry').getAttribute('aria-pressed'),'true');
      assert.equal(await page.locator('#avatar .anger-mark > path').count(),4);
      assert(await page.locator('#avatar .anger-mark').evaluate(e=>!!e.closest('.mirufi-bob')));
      const actual=await page.evaluate(({hair,outfit})=>MiruTet.mascot.mascotSVG('angry',{hairSkin:hair,outfitSkin:outfit,idPrefix:'production'}),{hair,outfit});
      for(const [width,time] of [[300,0],[300,1500],[300,2550],[300,2630],[150,0],[150,2550],[300*320/328,0]]){
        const expected=await picture(samples[`${hair}-${outfit}`],width,time),observed=await picture(actual,width,time);
        // Fractional game scaling can round antialiased hair edges by one RGB level.
        // Compare decoded pixels with only that tolerance, not a visual percentage threshold.
        if(!expected.equals(observed)){
          const maxDifference=await raster.evaluate(async urls=>{
            const pixels=await Promise.all(urls.map(async src=>{const img=new Image();img.src=src;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);return ctx.getImageData(0,0,c.width,c.height).data;}));
            if(pixels[0].length!==pixels[1].length)return Infinity;
            let max=0;for(let i=0;i<pixels[0].length;i++)max=Math.max(max,Math.abs(pixels[0][i]-pixels[1][i]));return max;
          },[expected,observed].map(b=>'data:image/png;base64,'+b.toString('base64')));
          assert(maxDifference<=1,`approved appearance: ${hair}/${outfit}, width ${width}, time ${time}, max channel difference ${maxDifference}`);
        }
        comparisons++;
      }
      const offsets=[];
      for(const t of [0,1500,2510,2550,2630,3000,5700,8250]){
        const state=await page.locator('#avatar svg').evaluate((s,t)=>{
          s.getAnimations({subtree:true}).forEach(a=>{a.pause();a.currentTime=t;});
          const mark=s.querySelector('.anger-mark').getBoundingClientRect(),head=s.querySelector('[data-part=face-base]').getBoundingClientRect();
          return {eyes:['.mirufi-eyes-open','.mirufi-eyes-closed'].map(q=>+getComputedStyle(s.querySelector(q)).opacity),offset:[mark.x-head.x,mark.y-head.y]};
        },t);
        assert.deepEqual(state.eyes,[2510,2550,8250].includes(t)?[0,1]:[1,0]);offsets.push(state.offset);
      }
      offsets.forEach(v=>v.forEach((x,i)=>assert(Math.abs(x-offsets[0][i])<.01,'mark follows head')));
      for(const other of M.EXPRESSIONS.filter(e=>e!=='angry')){
        await face(other).click();assert.equal(await page.locator('#avatar .anger-mark').count(),0);
        assert.equal(await page.locator('#avatar svg').getAttribute('data-expression'),other);
        await face('angry').click();assert.equal(await page.locator('#avatar .anger-mark').count(),1);
      }
    }
    await face('normal').click();await face('angry').focus();await page.keyboard.press('Enter');
    assert.equal(await page.locator('#avatar svg').getAttribute('data-expression'),'angry');
    const a=await page.locator('#avatar .mirufi-bob').evaluate(e=>getComputedStyle(e).transform);await page.waitForTimeout(300);
    assert.notEqual(await page.locator('#avatar .mirufi-bob').evaluate(e=>getComputedStyle(e).transform),a,'animation runs naturally');
    await page.screenshot({path:path.resolve(__dirname,'../screens/angry-dressup.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await face('angry').scrollIntoViewIfNeeded();assert(await face('angry').isVisible());
    await page.locator('[data-act=close-dressup]').click();await page.locator('.menu [data-act=dressup]').click();
    assert.equal(await page.locator('#avatar .anger-mark').count(),0,'preview choice does not persist into a new visit');
    await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await page.locator('.menu [data-act=dressup]').click();await face('angry').click();
    assert.equal(await page.locator('#avatar .mirufi-eyes-open').evaluate(e=>getComputedStyle(e).opacity),'1');
    assert.equal(await page.locator('#avatar .mirufi-bob').evaluate(e=>getComputedStyle(e).animationName),'none');
    assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
    console.log(`Angry checks passed: ${comparisons} pixel comparisons to approved v2 (maximum 1/255 rounding tolerance), 6 cosmetic combinations, all expression transitions, blink/head anchoring, animation, keyboard, mobile, reduced motion, offline.`);
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
