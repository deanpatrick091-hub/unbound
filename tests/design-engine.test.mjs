import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_DESIGN,DESIGN_STYLES,STYLE_PAIRS,parseDesign,resolveDesign} from '../lib/design/registry.ts';
import {applyDesign,stripDesign,designDemo,designInstructions,designCss} from '../lib/design/render.ts';
import {assembleDocument} from '../lib/build/assemble.ts';
import {inspectSite} from '../lib/build/quality.ts';

test('design schema rejects hostile inputs, unsafe motion and incompatible combinations',()=>{
 for(const patch of [{styles:['</style><script>alert(1)</script>']},{styles:['glass','ascii']},{styles:['glass','glass']},{speed:Infinity},{density:10000},{reducedMotion:'false'},{version:2},{mode:'manual',styles:[]}])assert.equal(parseDesign({...DEFAULT_DESIGN,...patch}),null);
 for(const styles of STYLE_PAIRS)assert.ok(parseDesign({...DEFAULT_DESIGN,mode:'manual',styles}));
});
test('automatic design resolves once, honours named style and keeps established edits stable',()=>{
 const first=resolveDesign(DEFAULT_DESIGN,'Create a playful learning site for children');assert.deepEqual(first.styles,['clay']);
 assert.deepEqual(resolveDesign(first,'Add pricing for a developer tool'),first);
 assert.equal(resolveDesign(DEFAULT_DESIGN,'Make a Wireframe 3D project').styles[0],'wireframe');
 assert.deepEqual(resolveDesign({...first,mode:'manual'},'Make it neon'),{...first,mode:'manual'});
});
test('all 15 design systems produce valid static documents, with reproducible export and no duplicated runtime',()=>{
 assert.equal(DESIGN_STYLES.length,15);
 for(const style of DESIGN_STYLES){
  const config={...DEFAULT_DESIGN,mode:'manual',styles:[style.id]};
  const files=designDemo(config);
  assert.equal(inspectSite(files).filter(i=>i.severity==='error').length,0,style.id);
  assert.deepEqual(applyDesign(files,config),files);
  assert.equal((files['index.html'].match(/id="ub-design-config"/g)||[]).length,1);
  const clean=stripDesign(files);assert.ok(!clean['index.html'].includes('UNBOUND_DESIGN_'));assert.equal(clean['styles.css'],files['styles.css']);
  assert.ok(assembleDocument(files).includes("connect-src 'none'"));
  assert.ok(designInstructions(config).includes(style.name));
 }
});
test('motion controls change exported rendering while preserving content and custom scripts',()=>{
 const config={...DEFAULT_DESIGN,mode:'manual',styles:['particle']};
 const source={'index.html':'<!doctype html><html><head><title>My site</title></head><body><main>Keep my content</main></body></html>','script.js':'document.title="Preserved";'};
 const slow=applyDesign(source,config),fast=applyDesign(source,{...config,speed:2,motion:'maximum',density:64,reducedMotion:true});
 assert.notEqual(slow['index.html'],fast['index.html']);assert.equal(fast['script.js'],source['script.js']);assert.deepEqual(stripDesign(fast),source);
 assert.ok(designCss({...config,reducedMotion:true}).includes('animation:none!important'));
 assert.throws(()=>applyDesign({'index.html':'<html><body>legacy</body></html>'},config),/complete head/);
});
