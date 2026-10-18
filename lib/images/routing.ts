import 'server-only';

/** Instance-local backoff; expires automatically and never disables a model permanently. */
export function createImageRouter(now = Date.now) {
  const cooldowns = new Map<string, {until: number; reason: 'quota'|'rate_limit'|'credentials'|'unavailable'}>();
  return async function route<T>(
    providers: string[], selected: string, signal: AbortSignal,
    attempt: (provider: string) => Promise<{status: number; retryAfter?: string | null; value?: T}>,
  ): Promise<{provider: string; value: T} | {error: 'quota' | 'rate_limit' | 'credentials' | 'unavailable'; retryAfter: number}> {
    const ordered = [...new Set(providers)].sort((a, b) => Number(b === selected) - Number(a === selected));
    const failures: ('quota'|'rate_limit'|'credentials'|'unavailable')[] = [];
    const waits: number[] = [];
    for (const provider of ordered) {
      signal.throwIfAborted();
      const cooldown = cooldowns.get(provider);
      if (cooldown && cooldown.until > now()) {
        failures.push(cooldown.reason);
        waits.push(Math.ceil((cooldown.until - now()) / 1000));
        continue;
      }
      cooldowns.delete(provider);
      try {
        const result = await attempt(provider);
        signal.throwIfAborted();
        if (result.status >= 200 && result.status < 300 && result.value !== undefined) {
          return {provider, value: result.value};
        }
        const reason = result.status === 402 ? 'quota' : result.status === 429 ? 'rate_limit' : [401,403].includes(result.status) ? 'credentials' : 'unavailable';
        failures.push(reason);
        // Respect bounded Retry-After; it can be seconds or an HTTP date.
        const raw = result.retryAfter?.trim();
        const parsed = raw ? (/^\d+$/.test(raw) ? Number(raw) : (Date.parse(raw) - now()) / 1000) : NaN;
        const seconds = Number.isFinite(parsed) && parsed > 0 ? Math.min(900, Math.max(1, Math.ceil(parsed))) : reason === 'quota' || reason === 'credentials' ? 900 : reason === 'rate_limit' ? 60 : 15;
        cooldowns.set(provider, {until: now() + seconds * 1000, reason});
        waits.push(seconds);
      } catch {
        signal.throwIfAborted();
        failures.push('unavailable');
        cooldowns.set(provider, {until: now() + 15000, reason: 'unavailable'});
        waits.push(15);
      }
    }
    const reason = failures[0];
    return {error: reason && failures.every(f=>f===reason) ? reason : 'unavailable', retryAfter: Math.max(1, Math.min(...waits, 900))};
  };
}

export const routeImage = createImageRouter();
