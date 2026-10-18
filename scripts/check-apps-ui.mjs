// Exercises real components with fixture responses. This is not an OAuth live test.
import {createRequire} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {build}=require(process.env.TEST_TOOLS_DIR+'/node_modules/esbuild');
const chromiumBinary=await import(process.env.TEST_TOOLS_DIR+'/node_modules/@sparticuz/chromium/build/index.js');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const result=await build({stdin:{contents:"import React from 'react';import {createRoot} from 'react-dom/client';import {PluginMarketplace} from './components/plugins/plugin-marketplace';createRoot(document.getElementById('root')).render(<PluginMarketplace tools={[{id:'crossref',name:'Crossref',kind:'research',model:'Research metadata',status:'AVAILABLE',allowance:'Free public metadata',docs:'https://www.crossref.org',checkedAt:null}]}/>);",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const css=(await Promise.all((await readdir('.next/static/chunks')).filter(f=>f.endsWith('.css')).map(f=>readFile('.next/static/chunks/'+f,'utf8')))).join('\n');
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>'+css+'</style></head><body><div id="root"></div><script>'+result.outputFiles[0].text+'</script></body></html>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const binary=chromiumBinary.default;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||await binary.executablePath(),args:binary.args});
const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/integrations/github',r=>r.fulfill({json:{state:'DISCONNECTED',installUrl:'https://github.com/apps/unbound-ai-development/installations/new'}}));
await page.route('**/api/integrations',r=>r.fulfill({json:{content:'Research fixture result',sources:[]}}));
try{
 await page.goto('http://127.0.0.1:'+server.address().port);
 for(const width of [375,768,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.locator('html').evaluate(el=>el.scrollWidth<=innerWidth+1));}
 await page.getByLabel('Search apps').fill('github');await page.getByRole('button',{name:/GitHub Connect your account/}).click();
 await page.getByText('Not connected',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Connect GitHub',exact:true}).isEnabled(),true);
 await page.getByRole('button',{name:'All apps',exact:true}).click();await page.getByLabel('Search apps').fill('');
 await page.getByRole('button',{name:'Research',exact:true}).click();await page.getByRole('button',{name:/Crossref Research metadata/}).click();
 await page.getByLabel('Search query').fill('solar energy');await page.getByRole('button',{name:'Run tool',exact:true}).click();await page.getByText('Research fixture result',{exact:true}).waitFor();
 await page.getByRole('button',{name:'All apps',exact:true}).click();await page.getByRole('button',{name:'All',exact:true}).click();await page.getByLabel('Search apps').fill('');
 await page.setViewportSize({width:1440,height:1000});if(process.env.SCREENSHOT_PATH)await page.screenshot({path:process.env.SCREENSHOT_PATH,fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS: Apps search, categories, GitHub connection panel, research request, back navigation, three viewport widths; no script errors. API fixtures, not live OAuth.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
