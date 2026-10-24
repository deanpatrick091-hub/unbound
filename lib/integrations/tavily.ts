import 'server-only';
import {boundedText, integrationConfig, IntegrationError, markIntegration} from '@/lib/integrations/server';
import type {ResearchResult, ToolResult} from '@/lib/integrations/research';

export const TAVILY_TIMEOUT_MS = 15_000;
// Best-effort cooldown per server instance; the provider remains the global quota authority.
let limitedUntil = 0;
export function retrySeconds(value: string | null, now = Date.now()): number {
  const seconds = value && /^\d+(\.\d+)?$/.test(value) ? Number(value) : value ? (Date.parse(value) - now) / 1000 : NaN;
  return Number.isFinite(seconds) ? Math.max(1, Math.min(3600, Math.ceil(seconds))) : 60;
}
export function escapeSourceText(text: string): string {
  return text.replace(/[\\`*_{}\[\]()<>#!|~]/g, '\\$&');
}
export function sourceLinks(sources: ResearchResult[]): string {
  return sources.map((s, i) => `${i + 1}. [${escapeSourceText(s.title || new URL(s.url).hostname)}](<${s.url.replace(/[<>\\]/g, c => encodeURIComponent(c))}>)`).join('\n');
}
function clean(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.replace(/<[^>]*>/g, ' ').replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit) : '';
}
function safeUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 3000) return '';
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname.includes('.') || /localhost|\.local$|\.internal$|[\[\]:]/i.test(url.hostname) || /^[\d.]+$/.test(url.hostname)) return '';
    return url.href;
  } catch { return ''; }
}
export async function searchTavily(input: string, signal?: AbortSignal): Promise<ToolResult> {
  if (!input.trim() || input.length > 4000) throw new IntegrationError(400, 'Use a web-search query between 1 and 4,000 characters.');
  const {key} = integrationConfig('tavily');
  if (!key) throw new IntegrationError(503, 'Web search is not configured. The site owner must add TAVILY_API_KEY to the server environment and redeploy.');
  if (signal?.aborted) throw new IntegrationError(499, 'Web search was cancelled.');
  if (Date.now() < limitedUntil) throw new IntegrationError(429, `Tavily is rate limited. Try again in ${Math.ceil((limitedUntil-Date.now())/1000)} seconds.`, Math.ceil((limitedUntil-Date.now())/1000));
  const timeout = AbortSignal.timeout(TAVILY_TIMEOUT_MS);
  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST', redirect: 'error', cache: 'no-store',
      headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + key},
      body: JSON.stringify({query: input.trim(), search_depth: 'basic', auto_parameters: false, max_results: 5, topic: 'general', include_answer: false, include_raw_content: false, include_images: false}),
      signal: AbortSignal.any([timeout, ...(signal ? [signal] : [])]),
    });
    if (!response.ok) {
      await response.body?.cancel(); // Never expose or log the provider's response body.
      if ([401,403].includes(response.status)) {
        markIntegration('tavily','CONFIGURATION REQUIRED');
        throw new IntegrationError(503, 'Tavily rejected its credentials or permissions. The site owner must check the server API key.');
      }
      if ([402,432,433].includes(response.status)) {
        markIntegration('tavily','FAILED');
        throw new IntegrationError(402, 'Tavily has reached its credit or account usage limit. The site owner must check the allowance or wait for its reset. Retrying immediately will not restore credits.');
      }
      if (response.status === 429) {
        const retry = retrySeconds(response.headers.get('retry-after')); limitedUntil = Date.now() + retry * 1000;
        markIntegration('tavily','RATE LIMITED');
        throw new IntegrationError(429, `Tavily is rate limited. Try again in ${retry} seconds.`, retry);
      }
      markIntegration('tavily','TEMPORARILY UNAVAILABLE');
      throw new IntegrationError(response.status===400||response.status===422?400:503, response.status===400||response.status===422?'Tavily could not accept that search. Try a shorter, more specific query.':'Tavily web search is temporarily unavailable. Please try again later.');
    }
    const data: unknown = JSON.parse(await boundedText(response, 200_000));
    if (!data || typeof data !== 'object' || !('results' in data) || !Array.isArray(data.results)) throw Error('Invalid response');
    const sources: ResearchResult[] = []; const seen = new Set<string>();
    for (const row of data.results.slice(0,20)) {
      if (!row || typeof row !== 'object') continue;
      const url = safeUrl(row.url); if (!url || seen.has(url)) continue;
      seen.add(url); sources.push({url, title: clean(row.title,250), excerpt: clean(row.content,1500)});
      if (sources.length === 5) break;
    }
    if (data.results.length && !sources.length) throw Error('Invalid sources');
    markIntegration('tavily','AVAILABLE');
    return {sources,content:sources.length?sourceLinks(sources):'Tavily found no matching sources. Try a more specific search.'};
  } catch (error) {
    if (error instanceof IntegrationError) throw error;
    markIntegration('tavily','TEMPORARILY UNAVAILABLE');
    if (signal?.aborted) throw new IntegrationError(499, 'Web search was cancelled.');
    if (timeout.aborted) throw new IntegrationError(504, 'Tavily web search timed out. Please try again later.');
    throw new IntegrationError(502, 'Tavily web search could not return valid results. Please try again later.');
  }
}
