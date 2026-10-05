import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3011';
const server=process.env.TEST_ORIGIN?null:spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3011'],{stdio:['ignore','pipe','pipe']});
let logs=''; server?.stdout.on('data',d=>logs+=d); server?.stderr.on('data',d=>logs+=d);
const cookies=new Map();
async function req(path,body,customOrigin=origin){const r=await fetch(origin+path,{redirect:'manual',headers:{Cookie:[...cookies].map(([k,v])=>k+'='+v).join('; '),...(body?{'Content-Type':'application/json',Origin:customOrigin}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})});for(const cookie of r.headers.getSetCookie()){const first=cookie.split(';')[0],i=first.indexOf('=');cookies.set(first.slice(0,i),first.slice(i+1));}return r;}
try{
 if(server)for(let i=0;i<100&&!logs.includes('Ready');i++)await new Promise(r=>setTimeout(r,100));
 let r=await req('/');assert.equal(r.status,307);assert.equal(r.headers.get('location'),'/login');
 r=await req('/login');assert.equal(r.status,200);assert.match(await r.text(),/Username/);
 const username='verify'+Date.now().toString(36),password=crypto.randomUUID()+'Ab1!';
 r=await req('/api/auth/username',{action:'signup',username,password},'https://wrong.invalid');assert.equal(r.status,403);
 r=await req('/api/auth/username',{action:'signup',username,password});assert.equal(r.status,200,await r.text());
 r=await req('/');assert.equal(r.status,200);assert.match(await r.text(),/New chat/);console.log('PASS signup, SSR cookies, private workspace, cross-origin rejection');
 
 process.loadEnvFile('.env.local');
 const {createServerClient}=await import(process.cwd()+'/node_modules/@supabase/ssr/dist/main/index.js');
 const db=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:values=>values.forEach(x=>cookies.set(x.name,x.value))}});
 const {data:auth}=await db.auth.getUser();const userId=auth.user.id;
 let created=await db.from('projects').insert({owner_id:userId,updated_by:userId,name:'Verification website',model:'test'}).select('id').single();assert.equal(created.error,null);const projectId=created.data.id;
 let saved=await db.rpc('save_project',{p_id:projectId,p_revision:0,p_files:{'index.html':'<html><body><h1>Verified preview</h1></body></html>'},p_conversation:[],p_model:'test',p_settings:{},p_preview:{}});assert.equal(saved.error,null);
 r=await req('/api/projects/'+projectId+'/thumbnail');assert.equal(r.status,200);assert.equal(r.headers.get('content-security-policy'),'sandbox allow-scripts');assert.match(await r.text(),/Verified preview/);
 const pin=await db.from('pins').insert({user_id:userId,kind:'project',project_id:projectId}).select('id').single();assert.equal(pin.error,null);assert.equal((await db.from('pins').delete().eq('id',pin.data.id)).error,null);
 const asset=await db.from('project_assets').insert({owner_id:userId,project_id:projectId,prompt:'Automated verification fixture',provider:'test-fixture',mime_type:'image/png',data_url:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP7kAAAAASUVORK5CYII='}).select('id').single();assert.equal(asset.error,null);
 r=await req('/api/images');assert.equal(r.status,200);assert.ok((await r.json()).images.some(x=>x.id===asset.data.id));
 r=await fetch(origin+'/api/images/'+asset.data.id,{method:'DELETE',headers:{Origin:origin,Cookie:[...cookies].map(([k,v])=>k+'='+v).join('; ')}});assert.equal(r.status,200);
 r=await req('/api/images');assert.ok(!(await r.json()).images.some(x=>x.id===asset.data.id));r=await req('/api/images/'+asset.data.id);assert.equal(r.status,200);
 const forbidden=await db.from('project_assets').update({owner_id:crypto.randomUUID()}).eq('id',asset.data.id);assert.ok(forbidden.error);
 
 const video=await db.from('video_jobs').insert({owner_id:userId,prompt:'Automated video permissions fixture',aspect_ratio:'16:9'}).select('id').single();assert.equal(video.error,null);
 const concurrent=await db.from('video_jobs').insert({owner_id:userId,prompt:'Duplicate active job fixture',aspect_ratio:'16:9'});assert.ok(concurrent.error);
 r=await req('/api/videos/'+video.data.id,{action:'unused'});assert.equal(r.status,405);
 const mutateVideo=async body=>fetch(origin+'/api/videos/'+video.data.id,{method:'PATCH',headers:{Origin:origin,'Content-Type':'application/json',Cookie:[...cookies].map(([k,v])=>k+'='+v).join('; ')},body:JSON.stringify(body)});
 r=await mutateVideo({action:'cancel'});assert.equal(r.status,200);
 r=await req('/api/videos');assert.equal(r.status,200);assert.equal((await r.json()).videos.find(v=>v.id===video.data.id).status,'cancelled');
 r=await mutateVideo({action:'hide'});assert.equal(r.status,200);
 const corrupt=await db.from('video_jobs').update({storage_path:'another-user/private.mp4'}).eq('id',video.data.id);assert.ok(corrupt.error);
 console.log('PASS video job persistence, concurrency limit, cancellation, history removal, storage-path isolation');
 console.log('PASS saved project preview, pin/unpin, persistent image-history removal, preserved project asset, forbidden ownership change');
 r=await req('/api/auth/username',{action:'logout'});assert.equal(r.status,200);
 r=await req('/');assert.equal(r.status,307);
 r=await req('/login');assert.equal(r.status,200);
 r=await req('/api/projects/'+projectId+'/thumbnail');assert.equal(r.status,404);r=await req('/api/images/'+asset.data.id);assert.equal(r.status,404);console.log('PASS outsider project and asset isolation');
 r=await req('/api/auth/username',{action:'signup',username,password});assert.equal(r.status,409);console.log('PASS logout and duplicate usernames');
 r=await req('/api/auth/username',{action:'login',username,password:'incorrect-password'});assert.equal(r.status,401);
 r=await req('/api/auth/username',{action:'login',username,password});assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true});
 r=await req('/');assert.equal(r.status,200);console.log('PASS incorrect-password rejection and fresh-session username login');
}finally{server?.kill();}
