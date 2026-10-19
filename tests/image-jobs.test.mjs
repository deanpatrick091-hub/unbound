import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){
 const source=specifier==='@/lib/auth/session'?'export async function getSession(){return globalThis.imageFixture.session()}':specifier==='@/lib/projects/server'?'export const isUuid=s=>typeof s==="string"&&/^[0-9a-f-]{36}$/i.test(s);':null;
 return source?{url:'data:text/javascript,'+encodeURIComponent(source),shortCircuit:true}:next(specifier,context);
}});
const {POST,DELETE}=await import('../app/api/images/jobs/[id]/route.ts');
const id='11111111-1111-4111-8111-111111111111';
const origin='https://unbound.example';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
function setup(t){
 let uid='owner',network=0;const tables={integration_jobs:[{id,user_id:uid,provider:'aihorde',remote_id:id,input:'A teapot',created_at:new Date().toISOString(),result:null}],project_assets:[]};
 const supabase={from(table){const filters=[];let mode='select',change;const q={select(){return q;},eq(k,v){filters.push(row=>row[k]===v);return q;},maybeSingle(){return q;},single(){return q;},insert(value){mode='insert';change=value;return q;},update(value){mode='update';change=value;return q;},then(resolve,reject){return Promise.resolve().then(()=>{if(mode==='insert'){tables[table].push(change);return {data:change,error:null};}const row=tables[table].find(row=>filters.every(f=>f(row)));if(row&&mode==='update')Object.assign(row,change);return {data:row??null,error:null};}).then(resolve,reject);}};return q;}};
 globalThis.imageFixture={session:async()=>({supabase,user:uid?{id:uid}:null})};
 t.mock.method(globalThis,'fetch',async(url,init)=>{network++;if(init.method==='DELETE')return Response.json({});return String(url).includes('/check/')?Response.json({done:true}):Response.json({generations:[{img:png,model:'Deliberate'}]});});
 const request=(method='POST',from=origin)=>new Request(origin+'/api/images/jobs/'+id,{method,headers:{origin:from,host:'unbound.example'}});
 return {tables,request,params:{params:Promise.resolve({id})},who:v=>{uid=v;},network:()=>network};
}
test('image job saves once, survives repeated polling, and serves only its owner',async t=>{
 const f=setup(t);const first=await POST(f.request(),f.params);assert.equal(first.status,200);assert.equal((await first.json()).src,'/api/images/'+id);
 assert.equal(f.tables.project_assets.length,1);assert.equal(f.tables.project_assets[0].owner_id,'owner');assert.match(f.tables.project_assets[0].data_url,/^data:image\/png/);
 assert.equal((await POST(f.request(),f.params)).status,200);assert.equal(f.tables.project_assets.length,1);assert.equal(f.network(),2);
 f.who('another-user');assert.equal((await POST(f.request(),f.params)).status,404);assert.equal(f.network(),2);
 f.who(null);assert.equal((await POST(f.request(),f.params)).status,401);
});
test('cross-origin polling is refused and cancelling preserves existing assets',async t=>{
 const f=setup(t);assert.equal((await POST(f.request('POST','https://attacker.example'),f.params)).status,403);assert.equal(f.network(),0);
 assert.equal((await DELETE(f.request('DELETE'),f.params)).status,200);assert.equal(f.tables.integration_jobs[0].result.state,'cancelled');
 assert.equal((await POST(f.request(),f.params)).status,409);assert.equal(f.tables.project_assets.length,0);
});
