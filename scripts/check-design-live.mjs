// Explicit live free-model test. Creates one isolated fixture; never prints credentials or prompts.
// Run with TEST_ORIGIN=https://unbound-lilac.vercel.app NODE_USE_ENV_PROXY=1 node scripts/check-design-live.mjs
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServerClient} from '@supabase/ssr';
process.loadEnvFile('.env.local');
const origin=process.env.TEST_ORIGIN;
if(!origin||new URL(origin).protocol!=='https:')throw Error('Set an explicitly authorised HTTPS TEST_ORIGIN.');
const jar=new Map();
async function request(path,body){
 const r=await fetch(origin+path,{redirect:'manual',signal:AbortSignal.timeout(360000),headers:{Cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),...(body?{Origin:origin,'Content-Type':'application/json'}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})});
 for(const cookie of r.headers.getSetCookie()){const first=cookie.split(';')[0],i=first.indexOf('=');jar.set(first.slice(0,i),first.slice(i+1));}return r;
}
await request('/login');
let r=await request('/api/auth/username',{action:'signup',username:'visual'+Date.now().toString(36),password:crypto.randomUUID()+'Aa1!'});assert.equal(r.status,200,'fixture signup');
const db=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(x=>jar.set(x.name,x.value))}});
const {data:auth,error}=await db.auth.getUser();assert.equal(error,null);
const created=await db.from('projects').insert({owner_id:auth.user.id,updated_by:auth.user.id,name:'Design generation verification 11 October',model:'openrouter:openrouter/free'}).select('id').single();assert.equal(created.error,null);
const id=created.data.id;console.log('Fixture project',id);
const design={version:1,mode:'manual',styles:['clay','mesh'],motion:'balanced',speed:1,density:32,reducedMotion:false};
r=await request('/api/build',{projectId:id,revision:0,files:{},modelMode:'automatic',design,instruction:'Create a complete compact website for a fictional independent bookshop named Paper & Pine. A warm editorial layout, local section links to About and Visit, specific short copy, semantic main and an accessible navigation. Use the selected Clay + Mesh design system and one empty ub-art illustration. No external fonts or images. Keep all three files together under 4500 characters. This is a static informational site; no form or fake purchase.'});
assert.equal(r.status,200,'Build endpoint accepts the fixture');
const reader=r.body.getReader(),decoder=new TextDecoder();let buffer='',done=null,failed=null;
while(true){const chunk=await reader.read();buffer+=decoder.decode(chunk.value||new Uint8Array(),{stream:!chunk.done});const lines=buffer.split('\n');buffer=lines.pop();for(const line of lines){if(!line.trim())continue;const event=JSON.parse(line);if(['meta','model_switched','done','error'].includes(event.type))console.log(JSON.stringify(event));if(event.type==='done')done=event;if(event.type==='error')failed=event;}if(chunk.done)break;}
assert.equal(failed,null,'generation has no failure event');assert.ok(done,'generation reports saved completion');
const [{data:project,error:projectError},{data:rows,error:filesError}]=await Promise.all([db.from('projects').select('revision,settings,model').eq('id',id).single(),db.from('project_files').select('path,content').eq('project_id',id)]);
assert.equal(projectError,null);assert.equal(filesError,null);assert.equal(project.revision,1);assert.deepEqual(project.settings.design.styles,design.styles);
const files=Object.fromEntries(rows.map(row=>[row.path,row.content]));assert.ok(files['index.html'].includes('ub-design-config'));assert.match(files['index.html'],/class=["'][^"']*\bub-art\b/);
r=await request('/api/projects/'+id+'/thumbnail');assert.equal(r.status,200);const preview=await r.text();assert.ok(preview.includes('ub-design-style'));
r=await request('/api/projects/'+id+'/export');assert.equal(r.status,200);assert.ok(Buffer.from(await r.arrayBuffer()).includes(Buffer.from('ub-design-config')));
if(process.env.LIVE_RESULT_DIR){await mkdir(process.env.LIVE_RESULT_DIR,{recursive:true});await writeFile(process.env.LIVE_RESULT_DIR+'/preview.html',preview);await writeFile(process.env.LIVE_RESULT_DIR+'/result.json',JSON.stringify({projectId:id,revision:project.revision,model:project.model,styles:design.styles,fileCount:rows.length,checkedAt:new Date().toISOString()}));}
console.log('PASS live styled generation, persisted design/files, visual preview document and real source export');
await db.auth.signOut();
