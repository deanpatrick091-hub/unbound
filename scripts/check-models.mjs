// Run only explicitly: npm run check:models. Uses your configured free allowance.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
try { process.loadEnvFile('.env.local'); } catch {}
const { getAvailableModels } = await import('../lib/ai/discovery.ts');
const { streamGeneration } = await import('../lib/ai/generate.ts');
let models = await getAvailableModels();
let results = [];
const only = process.argv.find(arg => arg.startsWith('--model='))?.slice(8);
if (process.argv.includes('--retry-failed') || only) {
  try { results = JSON.parse(await readFile('reports/model-audit.json', 'utf8')).results; } catch {}
  models = models.filter(model => !results.some(result => result.model === model.id && result.status === 'passed'));
}
if (only) models = models.filter(model => model.id === only);
for (const model of models) {
  let output = '', terminal;
  const start = Date.now();
  const signal = AbortSignal.timeout(30000);
  for await (const event of streamGeneration({ model: model.id, systemInstruction: 'Answer briefly.', turns: [{ role: 'user', content: 'Reply with the word READY.' }], maxTokens: 2048, signal })) {
    if (event.type === 'text') output += event.text;
    if (event.type === 'error' || event.type === 'done') terminal = event;
  }
  const result = { model: model.id, status: terminal?.type === 'done' && output.trim() ? 'passed' : terminal?.type === 'error' ? terminal.code === 'aborted' && signal.aborted ? 'timeout' : terminal.code : 'empty_response', durationMs: Date.now() - start, ...(terminal?.type === 'error' ? { reason: terminal.code === "aborted" && signal.aborted ? "Timed out while waiting for the provider." : terminal.message } : {}) };
  const prior = results.find(r => r.model === model.id);
  if (prior) result.previousAttempt = { status: prior.status, reason: prior.reason };
  results = results.filter(r => r.model !== model.id);
  results.push(result); console.log(JSON.stringify(result));
  await new Promise(resolve => setTimeout(resolve, 3100));
}
await mkdir('reports', { recursive: true });
await writeFile('reports/model-audit.json', JSON.stringify({ checkedAt: new Date().toISOString(), policy: 'Only configured providers passing the free policy; OpenRouter requests have a zero-price ceiling. No fallback during tests.', results }, null, 2));
console.log('Passed: ' + results.filter(r => r.status === 'passed').length + '/' + results.length);
