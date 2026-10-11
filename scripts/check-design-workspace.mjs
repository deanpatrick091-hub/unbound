// Real local/production workspace UI against an isolated username account and Supabase fixture.
// No provider inference or private keys. Credentials stay in memory and are never logged.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
process.loadEnvFile('.env.local');
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const {createServerClient}=await import('@supabase/ssr');
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3012';
const server=process.env.TEST_ORIGIN?null:spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3012'],{stdio:['ignore','pipe','pipe']});
let ready=false;server?.stdout.on('data',d=>{if(String(d).includes('Ready'))ready=true;});server?.stderr.on('data',()=>{});
const jar=new Map();
const db=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(x=>jar.set(x.name,x.value))}});
let browser,projectId;
try{
 if(server)for(let i=0;i<100&&!ready;i++)await new Promise(r=>setTimeout(r,100));
 const request=async(path,body)=>{const response=await fetch(origin+path,{headers:{Cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),...(body?{Origin:origin,'Content-Type':'application/json'}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})});for(const cookie of response.headers.getSetCookie()){const first=cookie.split(';')[0],i=first.indexOf('=');jar.set(first.slice(0,i),first.slice(i+1));}return response;};
 await request('/login');
 const signup=await request('/api/auth/username',{action:'signup',username:'design'+Date.now().toString(36),password:crypto.randomUUID()+'Aa1!'});assert.equal(signup.status,200);
 const {data:auth,error:authError}=await db.auth.getUser();assert.equal(authError,null);
 const created=await db.from('projects').insert({owner_id:auth.user.id,updated_by:auth.user.id,name:'Design Studio browser verification',model:'openrouter:openrouter/free'}).select('id').single();assert.equal(created.error,null);projectId=created.data.id;
 const saved=await db.rpc('save_project',{p_id:projectId,p_revision:0,p_files:{'index.html':'<!doctype html><html lang="en"><head><title>Fixture</title></head><body><main><h1>Preserve this site</h1><div class="ub-art" aria-hidden="true"></div></main></body></html>'},p_conversation:[],p_model:'openrouter:openrouter/free',p_settings:{},p_preview:{}});assert.equal(saved.error,null);
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--single-process','--no-zygote','--in-process-gpu','--use-gl=angle','--use-angle=swiftshader']}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.addCookies([...jar].map(([name,value])=>({name,value,url:origin,httpOnly:true,sameSite:'Lax'})));
 const page=await context.newPage();page.setDefaultTimeout(60000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/build/'+projectId);
 assert.equal(new URL(page.url()).pathname,'/build/'+projectId,'fixture reaches authenticated builder');
 await page.getByRole('button',{name:'Design Studio',exact:true}).click();
 await page.getByRole('button',{name:'Clay 3D',exact:true}).click();
 await page.getByLabel('Complementary style').selectOption('mesh');
 await page.getByLabel('Motion intensity').selectOption('expressive');
 await page.getByLabel('Always reduce motion').check();
 await page.getByLabel('Preview width').selectOption('375');
 assert.equal(await page.frameLocator('iframe[title="Rendered style sample"]').locator('body').evaluate(()=>innerWidth),375);
 const output=process.env.SCREENSHOT_DIR||'/tmp/unbound-design-checks';await mkdir(output,{recursive:true});
 await page.screenshot({path:output+'/workspace-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Save design',exact:true}).click();
 await page.getByRole('dialog').waitFor({state:'hidden'});
 const row=await db.from('projects').select('settings,revision').eq('id',projectId).single();assert.deepEqual(row.data.settings.design.styles,['clay','mesh']);assert.equal(row.data.settings.design.reducedMotion,true);assert.equal(row.data.revision,2);
 await page.reload();await page.getByRole('button',{name:'Design Studio',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Clay 3D',exact:true}).getAttribute('aria-pressed'),'true');assert.equal(await page.getByLabel('Motion intensity').inputValue(),'expressive');
 await page.setViewportSize({width:375,height:850});await page.screenshot({path:output+'/workspace-mobile.png',fullPage:true});
 assert.ok(await page.getByRole('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'dialog does not overflow horizontally');
 await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
 assert.deepEqual(errors,[]);
 console.log('PASS actual Design Studio selection, rendered mobile viewport, save, reload, mobile dialog, keyboard dismissal and no script errors');
}finally{
 await browser?.close();server?.kill();
 if(projectId)await db.from('projects').update({deleted_at:new Date().toISOString()}).eq('id',projectId);
 await db.auth.signOut();
}
