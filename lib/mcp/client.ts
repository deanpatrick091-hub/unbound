import 'server-only';

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { isIP } from 'node:net';
import { z } from 'zod';

const serverSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,64}$/),
  endpoint: z.url().refine((value) => {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && !url.username && !url.password &&
      !url.search && !url.hash && (!url.port || url.port === '443') &&
      host.includes('.') && !host.endsWith('.') && !host.startsWith('[') &&
      !isIP(host) && !/(^|\.)(localhost|local|internal|test|invalid)$/.test(host);
  }),
  // Human-reviewed read tools only. Server-provided annotations are not authorization.
  readTools: z.array(z.string().min(1).max(128)).max(100),
}).strict();

export type McpServerConfig = z.infer<typeof serverSchema>;
const argumentsSchema = z.record(z.string(), z.json());
type ToolArguments = z.infer<typeof argumentsSchema>;
export type McpAccess = {
  /** Supplied only by authenticated server code; never from a request body. */
  bearerToken?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Recheck the signed-in user's connection/scope and exact arguments on every call. */
  authorize: (tool: string, args: ToolArguments) => boolean | Promise<boolean>;
};

const messages = {
  CONFIGURATION_REQUIRED: 'This MCP connection needs valid server configuration.',
  NOT_AUTHORIZED: 'This MCP tool is not authorized for this request.',
  AUTHENTICATION_REQUIRED: 'Reconnect this integration before using its tools.',
  RATE_LIMITED: 'This integration is rate limited. Please wait before trying again.',
  UNAVAILABLE: 'This integration could not complete the request.',
  TIMEOUT: 'This integration took too long to respond.',
  CANCELLED: 'The integration request was cancelled.',
  INVALID_ARGUMENTS: 'The tool arguments are invalid or too large.',
  TOOL_FAILED: 'The external tool reported a failure. No success was confirmed.',
  LIMIT_EXCEEDED: 'This integration returned more tools than can safely be loaded.',
} as const;

export class McpClientError extends Error {
  constructor(public readonly code: keyof typeof messages, public readonly retryAfterSeconds?: number) {
    super(messages[code]);
    this.name = 'McpClientError';
  }
}

export type McpSession = {
  listTools: () => Promise<Awaited<ReturnType<Client['listTools']>>['tools']>;
  callTool: (name: string, args: ToolArguments) => Promise<{
    serverId: string;
    trust: 'untrusted_external_data';
    result: Awaited<ReturnType<Client['callTool']>>;
  }>;
};

/**
 * One connection per authenticated request. Only pass developer-vetted server
 * configuration, never a user/model-selected URL. This is not a public URL proxy.
 * Use from Node.js App Router handlers; no stdio, shell execution or shared tokens.
 */
export async function withMcpClient<T>(
  server: McpServerConfig,
  access: McpAccess,
  work: (session: McpSession) => Promise<T>,
): Promise<T> {
  const parsed = serverSchema.safeParse(server);
  const timeoutMs = access.timeoutMs ?? 30_000;
  if (!parsed.success || !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60_000 ||
    (access.bearerToken !== undefined && !/^[\x21-\x7e]{1,8192}$/.test(access.bearerToken))) {
    throw new McpClientError('CONFIGURATION_REQUIRED');
  }
  if (typeof access.authorize !== 'function') throw new McpClientError('NOT_AUTHORIZED');
  const config = parsed.data;
  const endpoint = new URL(config.endpoint);
  const allowed = new Set(config.readTools);
  const lifetime = new AbortController();
  const timer = setTimeout(() => lifetime.abort(new DOMException('Timeout', 'TimeoutError')), timeoutMs);
  const signal = AbortSignal.any([lifetime.signal, ...(access.signal ? [access.signal] : [])]);
  let closing = false;
  let connected = false;
  let removeAbortListener = () => {};
  const client = new Client({ name: 'unbound-ai', version: '0.1.0' });
  const transport = new StreamableHTTPClientTransport(endpoint, {
    requestInit: { redirect: 'error', cache: 'no-store' },
    onInsufficientScope: 'throw',
    reconnectionOptions: { maxRetries: 0, initialReconnectionDelay: 1000, maxReconnectionDelay: 1000, reconnectionDelayGrowFactor: 1 },
    fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.href !== endpoint.href) throw new McpClientError('NOT_AUTHORIZED');
      const headers = new Headers(init?.headers);
      // Never forward browser cookies or arbitrary incoming request headers.
      if (access.bearerToken) headers.set('Authorization', `Bearer ${access.bearerToken}`);
      const response = await fetch(url, {
        ...init, headers, redirect: 'error', cache: 'no-store', credentials: 'omit',
        signal: AbortSignal.any([
          closing ? AbortSignal.timeout(2000) : signal,
          ...(init?.signal ? [init.signal] : []),
        ]),
      });
      if (response.status === 401 || response.status === 403 || response.status === 429 || response.status >= 500) {
        const raw = response.headers.get('retry-after');
        const retryAfter = raw && /^\d{1,6}$/.test(raw) ? Number(raw) : undefined;
        await response.body?.cancel();
        throw new McpClientError(response.status === 429 ? 'RATE_LIMITED' : response.status < 500 ? 'AUTHENTICATION_REQUIRED' : 'UNAVAILABLE', retryAfter);
      }
      return response;
    },
  });
  const requestOptions = { signal, timeout: timeoutMs, maxTotalTimeout: timeoutMs };
  const guard = () => {
    if (signal.aborted) throw new McpClientError(access.signal?.aborted ? 'CANCELLED' : 'TIMEOUT');
    if (closing) throw new McpClientError('UNAVAILABLE');
  };
  const session: McpSession = {
    async listTools() {
      guard();
      const tools: Awaited<ReturnType<Client['listTools']>>['tools'] = [];
      const cursors = new Set<string>();
      let cursor: string | undefined;
      for (let page = 0; page < 10; page++) {
        // v2 listTools() without a cursor auto-aggregates; request one page so
        // our bounded pagination policy also applies to the first page.
        const result = await client.request({ method: 'tools/list', params: cursor ? { cursor } : {} }, requestOptions);
        if (tools.length + result.tools.length > 500) throw new McpClientError('LIMIT_EXCEEDED');
        tools.push(...result.tools);
        if (!result.nextCursor) return tools.filter((tool) => allowed.has(tool.name));
        if (cursors.has(result.nextCursor)) throw new McpClientError('LIMIT_EXCEEDED');
        cursors.add(result.nextCursor);
        cursor = result.nextCursor;
      }
      throw new McpClientError('LIMIT_EXCEEDED');
    },
    async callTool(name, args) {
      guard();
      if (!allowed.has(name)) throw new McpClientError('NOT_AUTHORIZED');
      const parsedArgs = argumentsSchema.safeParse(args);
      if (!parsedArgs.success || Buffer.byteLength(JSON.stringify(parsedArgs.data)) > 64_000) throw new McpClientError('INVALID_ARGUMENTS');
      if (await access.authorize(name, structuredClone(parsedArgs.data)) !== true) throw new McpClientError('NOT_AUTHORIZED');
      guard();
      const result = await client.callTool({ name, arguments: parsedArgs.data }, requestOptions);
      if (result.isError) throw new McpClientError('TOOL_FAILED');
      return { serverId: config.id, trust: 'untrusted_external_data', result };
    },
  };
  try {
    guard();
    await client.connect(transport, requestOptions);
    connected = true;
    guard();
    const aborted = new Promise<never>((_, reject) => {
      const onAbort = () => reject(new McpClientError(access.signal?.aborted ? 'CANCELLED' : 'TIMEOUT'));
      signal.addEventListener('abort', onAbort, { once: true });
      removeAbortListener = () => signal.removeEventListener('abort', onAbort);
    });
    return await Promise.race([work(session), aborted]);
  } catch (error) {
    if (error instanceof McpClientError) throw error;
    if (signal.aborted) throw new McpClientError(access.signal?.aborted ? 'CANCELLED' : 'TIMEOUT');
    // Do not expose provider bodies, credentials, URLs or SDK stack traces.
    throw new McpClientError('UNAVAILABLE');
  } finally {
    closing = true;
    removeAbortListener();
    clearTimeout(timer);
    try {
      if (connected) await transport.terminateSession();
    } catch { /* A provider may not support DELETE. Always close local resources. */ }
    await client.close().catch(() => undefined);
  }
}
