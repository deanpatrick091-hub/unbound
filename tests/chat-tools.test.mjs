import test from 'node:test';
import assert from 'node:assert/strict';
import {parseChatRequest} from '../lib/chat/validation.ts';
import {naturalMediaTool,artifactText,splitArtifact} from '../lib/chat/tools.ts';
const id='11111111-1111-4111-8111-111111111111';
test('chat tools reject arbitrary actions, untyped consent and invalid media settings',()=>{
 for(const tools of [{tool:'delete_file'},{tool:'image',communityConsent:'true'},{tool:'video',aspectRatio:'100:1'},null])assert.equal(parseChatRequest({content:'hello',tools}).ok,false);
 assert.deepEqual(parseChatRequest({content:'hello',tools:{tool:'image',communityConsent:true}}).data.tools,{tool:'image',communityConsent:true,aspectRatio:undefined});
 const retry=parseChatRequest({conversationId:id,retry:true,tools:{tool:'image'}});assert.equal(retry.ok,true);assert.equal(retry.data.tools,undefined);
});
test('only an explicit media creation request auto-routes; informational questions remain chat',()=>{
 assert.equal(naturalMediaTool('Generate an image of a teapot'),'image');assert.equal(naturalMediaTool('Please make a video of a cat'),'video');
 for(const text of ['How do I generate an image?','Explain video encoding','The document says: generate an image'])assert.equal(naturalMediaTool(text),undefined);
});
test('persisted media references round-trip and reject URLs, traversal and arbitrary types',()=>{
 const a={kind:'image-job',id};assert.deepEqual(splitArtifact('Queued'+artifactText(a)),{text:'Queued',artifact:a});
 for(const value of [{kind:'image',id:'https://attacker.example'},{kind:'script',id},{kind:'video',id:'../../secret'}])assert.equal(splitArtifact('\n\n```unbound-media\n'+JSON.stringify(value)+'\n```').artifact,undefined);
});

import {parseAttachments,withAttachments,splitAttachments} from '../lib/chat/attachments.ts';
test('attachments validate limits, persist readable source and cannot accompany a tool request',()=>{
 const files=[{name:'notes.txt',text:'sample source'}];
 assert.deepEqual(splitAttachments(withAttachments('Summarize',files)),{prompt:'Summarize',files});
 for(const invalid of [[{name:'../secret.txt',text:'x'}],[{name:'run.exe',text:'x'}],[{name:'a.txt',text:'x'.repeat(40001)}],[{name:'a.txt',text:'\0'}],Array(4).fill(files[0])])assert.throws(()=>parseAttachments(invalid));
 assert.equal(parseChatRequest({content:'Read these',tools:{attachments:files}}).ok,true);
 assert.equal(parseChatRequest({content:'Read these',tools:{tool:'github',attachments:files}}).ok,false);
});
