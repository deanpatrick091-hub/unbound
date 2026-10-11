// Render a real preview saved by check-design-live.mjs inside the production sandbox rules.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {PREVIEW_SANDBOX} from '../lib/build/assemble.ts';
if(!process.env.LIVE_RESULT_DIR)throw Error('Set LIVE_RESULT_DIR to the live test output directory.');
const html=await readFile(process.env.LIVE_RESULT_DIR+'/preview.html','utf8');
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--single-process','--no-zygote','--in-process-gpu','--use-gl=angle','--use-angle=swiftshader']}:{})});
const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
const output=process.env.SCREENSHOT_DIR||'/tmp/unbound-live-preview';await mkdir(output,{recursive:true});
try{
 for(const width of [375,768,1440]){
  await page.setViewportSize({width,height:1000});
  await page.goto('about:blank');await page.setContent('<html><body style="margin:0"><iframe style="display:block;border:0;width:100vw;height:100vh" title="Generated website"></iframe></body></html>');
  await page.locator('iframe').evaluate((el,{source,sandbox})=>{el.setAttribute('sandbox',sandbox);el.srcdoc=source;},{source:html,sandbox:PREVIEW_SANDBOX});
  const frame=page.frameLocator('iframe');await frame.locator('.ub-motion-toggle').waitFor({state:'attached'});
  assert.equal(await frame.locator('.ub-art').count(),1);
  assert.ok(await frame.locator('html').evaluate(el=>el.scrollWidth<=innerWidth+1),'no horizontal overflow at '+width);
  const missing=await frame.locator('a[href^="#"]').evaluateAll(links=>links.map(link=>link.getAttribute('href')).filter(href=>href.length>1&&!document.getElementById(href.slice(1))));assert.deepEqual(missing,[],'section navigation works');
  if(width===375){const menu=frame.locator('header button[aria-expanded],nav button[aria-expanded]').first();if(await menu.count()&&await menu.isVisible()){await menu.click();assert.equal(await menu.getAttribute('aria-expanded'),'true');await menu.click();assert.equal(await menu.getAttribute('aria-expanded'),'false');}}
  await frame.locator('a').first().focus();assert.equal(await frame.locator('a').first().evaluate(el=>document.activeElement===el),true);
  await page.screenshot({path:output+'/generated-'+width+'.png',fullPage:true});
 }
 await page.emulateMedia({reducedMotion:'reduce'});await page.frameLocator('iframe').locator('.ub-motion-toggle').waitFor();
 await page.waitForTimeout(1200);assert.equal(await page.frameLocator('iframe').locator('html').getAttribute('data-ub-paused'),'true');
 assert.deepEqual(errors,[]);console.log('PASS real generated website at mobile/tablet/desktop, section links, keyboard focus, reduced motion and no script errors');
}finally{await browser.close();}
