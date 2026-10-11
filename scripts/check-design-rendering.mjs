// Run: node --import ./scripts/test-loader.mjs scripts/check-design-rendering.mjs
// Uses the environment's existing Playwright; adds no production dependency.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {DEFAULT_DESIGN,DESIGN_STYLES,STYLE_PAIRS} from '../lib/design/registry.ts';
import {designDemo} from '../lib/design/render.ts';
import {assembleDocument} from '../lib/build/assemble.ts';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--single-process','--no-zygote','--in-process-gpu','--use-gl=angle','--use-angle=swiftshader']}:{})});
const page=await browser.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const requests=[];page.on('request',r=>requests.push(r.url()));
const output=process.env.SCREENSHOT_DIR||'/tmp/unbound-design-checks';
await mkdir(output,{recursive:true});
try{
 for(const style of DESIGN_STYLES){
  const config={...DEFAULT_DESIGN,mode:'manual',styles:[style.id]};
  for(const width of [375,768,1440]){
   await page.setViewportSize({width,height:960});
   await page.goto('about:blank');await page.setContent(assembleDocument(designDemo(config)));
   await page.locator('.ub-motion-toggle').waitFor();
   assert.equal(await page.locator('.ub-motion-toggle').count(),1);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),style.id+' horizontal overflow '+width);
   assert.ok(await page.locator('.ub-art').evaluate(el=>el.getBoundingClientRect().height>=180));
   assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--ub-background').trim()),style.tokens.background);
   if(style.id==='particle')assert.equal(await page.locator('canvas').count(),1);
   if(style.id==='wireframe')assert.equal(await page.locator('.ub-cube i').count(),6);
   if(style.id==='split-flap')assert.equal(await page.locator('.ub-flap span').count(),7);
   if(style.id==='ascii')assert.match(await page.locator('.ub-art pre').textContent(),/SYSTEM READY/);
   await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement?.tagName),'A');
   if(width===375||width===1440)await page.screenshot({path:output+'/'+style.id+'-'+width+'.png',fullPage:true});
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForFunction(()=>document.documentElement.dataset.ubPaused==='true');
  assert.equal(await page.locator('.ub-motion-toggle').isDisabled(),true);
  assert.equal(await page.locator('.ub-art').evaluate(el=>getComputedStyle(el,'::before').animationName),'none');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.locator('.ub-motion-toggle').click();
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.ubPaused),'true');
  console.log('PASS rendered '+style.name+' at mobile/tablet/desktop, keyboard focus and reduced motion');
 }
 for(const styles of STYLE_PAIRS){await page.goto('about:blank');await page.setContent(assembleDocument(designDemo({...DEFAULT_DESIGN,mode:'manual',styles})));await page.locator('.ub-motion-toggle').waitFor();assert.equal(await page.locator('#ub-design-style').count(),1);}
 await page.goto('about:blank');await page.setContent(assembleDocument(designDemo({...DEFAULT_DESIGN,mode:'manual',styles:['particle'],motion:'maximum',speed:2,density:64})));
 const canvas=page.locator('canvas');await canvas.waitFor();
 const before=await canvas.evaluate(c=>c.toDataURL());await page.waitForTimeout(180);assert.notEqual(await canvas.evaluate(c=>c.toDataURL()),before,'particles actually animate');
 await page.locator('.ub-motion-toggle').click();const paused=await canvas.evaluate(c=>c.toDataURL());await page.waitForTimeout(180);assert.equal(await canvas.evaluate(c=>c.toDataURL()),paused,'pause actually stops rendering');
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
 console.log('PASS six compatible combinations, real particle motion/pause, no network requests or browser errors');
}finally{await browser.close();}
