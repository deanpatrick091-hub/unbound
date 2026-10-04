import test from 'node:test';
import assert from 'node:assert/strict';
import {parseChatRequest} from '../lib/chat/validation.ts';
import {parseSavedConversation} from '../lib/projects/validation.ts';
import {rankFallbacks} from '../lib/ai/routing.ts';
import {imageMime} from '../lib/images/validate.ts';
test('large chat and saved Build prompts preserve the final character',()=>{
 const content='specification '.repeat(10000)+'END_MARKER';
 const parsed=parseChatRequest({content});assert.equal(parsed.ok,true);assert.equal(parsed.data.content,content);
 assert.equal(parseSavedConversation([{id:'test',role:'user',content}])[0].content,content);
});
test('Build prefers coding models and rejects undersized context fallbacks',()=>{
 const models=[{id:'a',model:'general',provider:'groq',contextLength:100000},{id:'b',model:'qwen-coder',provider:'kilo',contextLength:100000},{id:'c',model:'coder',provider:'groq',contextLength:100}];
 assert.deepEqual(rankFallbacks(models,'build',9000,1000).map(m=>m.id),['b','a']);
});
test('image MIME detection rejects text and recognizes supported file signatures',()=>{
 assert.equal(imageMime(Buffer.from('<html>error</html>').toString('base64')),null);
 assert.equal(imageMime('iVBORw0KGgoAAA'),'image/png');assert.equal(imageMime('/9j/4AAQ'),'image/jpeg');
});
