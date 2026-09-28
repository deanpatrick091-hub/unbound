import assert from 'node:assert/strict';
import test from 'node:test';
import { BuildOutputParser } from '../lib/build/parser.ts';
import { assembleDocument, PREVIEW_SANDBOX } from '../lib/build/assemble.ts';

function parse(source, size) {
  const parser = new BuildOutputParser();
  const pieces = [];
  for (let i = 0; i < source.length; i += size) pieces.push(...parser.push(source.slice(i, i + size)));
  return [...pieces, ...parser.finish()];
}

test('custom file markers survive every stream chunk boundary and indentation', () => {
  const source = 'Here is your site.\n  <<<FILE index.html>>>\r\n<h1>Hello</h1>\r\n <<<END>>>\n';
  for (let size = 1; size <= source.length; size++) {
    const pieces = parse(source, size);
    assert.deepEqual(pieces.filter(p => p.kind === 'file'), [{ kind:'file', name:'index.html', content:'<h1>Hello</h1>' }]);
    assert.equal(pieces.filter(p => p.kind === 'text').map(p => p.text).join(''), 'Here is your site.\n');
  }
});

test('ordinary Markdown website files render instead of leaking code into the reply', () => {
  const source = 'Built it.\n```html\n<h1>Hello</h1>\n```\n```css\nh1 { color: red; }\n```\n```javascript\nconsole.log("ready");\n```';
  for (const size of [1, 3, 7, 80, source.length]) {
    const pieces = parse(source, size);
    const files = Object.fromEntries(pieces.filter(p => p.kind === 'file').map(p => [p.name, p.content]));
    assert.equal(files['index.html'], '<h1>Hello</h1>');
    assert.equal(files['styles.css'], 'h1 { color: red; }');
    assert.equal(files['script.js'], 'console.log("ready");');
    assert.equal(pieces.filter(p => p.kind === 'text').map(p => p.text).join(''), 'Built it.\n');
  }
});

test('wrapped custom protocol and unfinished file blocks retain the page', () => {
  for (const source of ['```html\n<<<FILE index.html>>>\n<h1>Hello</h1>\n<<<END>>>\n```', '<<<FILE index.html>>>\n<h1>Hello</h1>']) {
    assert.deepEqual(parse(source, 1).filter(p => p.kind === 'file'), [{ kind:'file', name:'index.html', content:'<h1>Hello</h1>' }]);
  }
  assert.equal(parse('<<<FILE secret.txt>>>\nhello\n<<<END>>>', 1).some(p => p.kind === 'file'), false);
});

test('assembly preserves JSX script types and literal replacement tokens without weakening isolation', () => {
  const js = 'const amount = "$&"; const App = () => <h1>Hello</h1>;';
  const doc = assembleDocument({ 'index.html':'<html><head><link href="styles.css" rel="stylesheet"></head><body><div id="root"></div><script type="text/babel" src="script.js"></script></body></html>', 'script.js':js, 'styles.css':'h1::after { content: "$&"; }' });
  assert.ok(doc.includes(`<script type="text/babel">\n${js}\n</script>`));
  assert.ok(doc.includes('h1::after { content: "$&"; }'));
  assert.ok(doc.includes("connect-src 'none'"));
  assert.ok(!PREVIEW_SANDBOX.includes('allow-same-origin'));
});
