import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectSite} from '../lib/build/quality.ts';
import {BuildOutputParser} from '../lib/build/parser.ts';
import {selectBuildModel} from '../lib/build/selection.ts';
test('unfinished file blocks and missing local dependencies are detected without executing code',()=>{
 const parser=new BuildOutputParser();parser.push('<<<FILE index.html>>>\n<html>');parser.finish();assert.equal(parser.incomplete,true);
 assert.ok(inspectSite({'index.html':'<html><body>unfinished'}).some(i=>i.severity==='error'));
 const html='<!doctype html><html lang="en"><head><title>Test</title></head><body><a href="about.html">About</a><script src="script.js"></script></body></html>';
 assert.deepEqual(inspectSite({'index.html':html}).filter(i=>i.severity==='error').map(i=>i.code),['missing-page','missing-file']);
});
test('automatic build selection rejects unhealthy models and known small context',()=>{
 const models=[{id:'small',model:'coder',contextLength:100,provider:'groq'},{id:'limited',model:'coder',contextLength:200000,provider:'groq',health:{state:'rate_limited'}},{id:'ready',model:'coder',contextLength:200000,provider:'groq',health:{state:'available'}}];
 assert.equal(selectBuildModel(models,'Build an application',30000).model,'ready');assert.equal(selectBuildModel([],'Build',1).model,undefined);
});

test('source ZIP uses fixed paths and does not export unrelated data',async()=>{
 const {sourceArchive}=await import('../lib/deploy/export.ts');const archive=Buffer.from(sourceArchive({'index.html':'<!doctype html>','styles.css':'body{}','../../secret':'never included'}));
 assert.equal(archive.readUInt32LE(0),0x04034b50);assert.ok(archive.includes(Buffer.from('vercel.json')));assert.ok(!archive.includes(Buffer.from('never included')));assert.equal(archive.readUInt32LE(archive.length-22),0x06054b50);
});
test('public plugin executor refuses account actions and arbitrary URLs',async()=>{
 const {validatePluginInput,runPlugin}=await import('../lib/plugins/server.ts');
 for(const input of ['http://localhost','example.com/path','127.0.0.1','x..com'])assert.throws(()=>validatePluginInput('vercel-domains',input));
 assert.equal(validatePluginInput('vercel-domains','Example.com'),'example.com');assert.throws(()=>validatePluginInput('github-public','owner/../secret'));
 await assert.rejects(runPlugin('gmail','send',new AbortController().signal),/not connected or implemented/);
});

test('AI planner denies unconnected tools and invented targets',async()=>{
 const {parseToolProposal}=await import('../lib/plugins/planner.ts');
 assert.equal(parseToolProposal('{"plugin":"gmail","input":"send"}','send'),null);
 assert.equal(parseToolProposal('{"plugin":"vercel-domains","input":"invented.com"}','check example.com'),null);
 assert.deepEqual(parseToolProposal('{"plugin":"vercel-domains","input":"example.com"}','check example.com'),{plugin:'vercel-domains',input:'example.com'});
});
