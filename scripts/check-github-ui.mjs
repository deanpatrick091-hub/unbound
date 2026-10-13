// Browser component workflow with mocked API responses; no GitHub account needed.
// Test packages live outside the application. Never a claim of OAuth live testing.
import { createRequire } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
if(!process.env.TEST_TOOLS_DIR || !process.env.CHROMIUM_EXECUTABLE) throw Error('Set TEST_TOOLS_DIR and CHROMIUM_EXECUTABLE to test-only installations.');
const {build}=require(process.env.TEST_TOOLS_DIR+'/node_modules/esbuild');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const bundle=await build({stdin:{contents:"import React from 'react'; import {createRoot} from 'react-dom/client'; import {GitHubIntegration} from './components/github/github-integration'; createRoot(document.getElementById('root')).render(<GitHubIntegration/>);",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},tsconfig:resolve('tsconfig.json')});
const cssFiles=(await readdir('.next/static/chunks')).filter(f=>f.endsWith('.css'));
const css=(await Promise.all(cssFiles.map(f=>readFile('.next/static/chunks/'+f,'utf8')))).join('\n');
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>'+css+'</style></head><body><div id="root"></div><script>'+bundle.outputFiles[0].text+'</script></body></html>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--single-process','--no-zygote','--in-process-gpu','--use-gl=angle','--use-angle=swiftshader']});
const page=await browser.newPage(),errors=[]; page.on('pageerror',e=>errors.push(e.message));
let state='SETUP_REQUIRED', action, failed=false;
await page.route('**/api/integrations/github**',async route=>{
 const path=new URL(route.request().url()).pathname;
 if(path.endsWith('/run')){action=route.request().postDataJSON();return route.fulfill({status:failed?401:200,json:failed?{error:'Reconnect GitHub to restore access.',code:'RECONNECT_REQUIRED'}:{result:{content:[{type:'text',text:'<script>window.untrustedExecuted=true</script>\nRead result fixture'}]}}});}
 if(path.endsWith('/disconnect')){state='DISCONNECTED';return route.fulfill({json:{disconnected:true,revoked:false,message:'Disconnected locally. Revoke the app on GitHub.'}});}
 if(path.endsWith('/verify'))return route.fulfill({json:{verified:true}});
 if(path.endsWith('/connect'))return route.fulfill({json:{url:'https://github.com/login/oauth/authorize?client_id=fixture'}});
 return route.fulfill({json:{state,...(state==='CONNECTED'?{login:'fixture',verifiedAt:new Date().toISOString()}:{}),installUrl:'https://github.com/apps/fixture/installations/new'}});
});
try{
 await page.goto(url); await page.getByText('Setup required',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Connect GitHub',exact:true}).isDisabled(),true);
 state='CONNECTED'; await page.reload();await page.getByText('Connected · @fixture',{exact:true}).waitFor();
 for(const width of [375,768,1440]){
  await page.setViewportSize({width,height:1000});
  assert.ok(await page.locator('html').evaluate(el=>el.scrollWidth<=innerWidth+1),'no horizontal overflow at '+width);
 }
 await page.getByLabel('Read tool').selectOption('file');await page.getByLabel('Repository',{exact:true}).fill('owner/repo');await page.getByLabel('File or directory path').fill('README.md');
 await page.getByRole('button',{name:'Run read tool',exact:true}).click();await page.getByText('GitHub result',{exact:true}).waitFor();
 assert.equal(action.action,'file');assert.equal(action.owner,'owner');assert.equal(await page.evaluate(()=>window.untrustedExecuted),undefined);
 await page.getByRole('button',{name:'Check connection',exact:true}).click();await page.getByText('GitHub connection verified.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Run read tool',exact:true}).focus();assert.equal(await page.getByRole('button',{name:'Run read tool',exact:true}).evaluate(el=>el===document.activeElement),true);
 await page.setViewportSize({width:375,height:1000});
 if(process.env.SCREENSHOT_PATH)await page.screenshot({path:process.env.SCREENSHOT_PATH,fullPage:true});
 failed=true;await page.getByRole('button',{name:'Run read tool',exact:true}).click();await page.getByText('Reconnect GitHub to restore access.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Disconnect',exact:true}).click();await page.getByText('Not connected',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Run read tool',exact:true}).count(),0);
 await page.route('https://github.com/login/oauth/authorize**',route=>route.fulfill({contentType:'text/html',body:'<h1>OAuth navigation fixture</h1>'}));
 await page.getByRole('button',{name:'Connect GitHub',exact:true}).click();await page.getByRole('heading',{name:'OAuth navigation fixture'}).waitFor();
 assert.deepEqual(errors,[]);console.log('PASS: actual React component in Chromium; setup state; read form; verify; error/reconnect; disconnect; OAuth navigation; escaped output; keyboard focus; 375/768/1440 widths; no script errors. APIs mocked.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
