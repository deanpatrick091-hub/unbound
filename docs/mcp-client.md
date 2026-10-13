# MCP client foundation

Branch: `feature/free-mcp-integrations`. This step does not merge or deploy production.

## Packages and compatibility

Checked the official MCP documentation and npm stable releases on 12 October 2026:

- `@modelcontextprotocol/client` **2.3.1** (Apache-2.0), the official stable v2 client. Its required `@modelcontextprotocol/core` **2.3.1** is installed transitively.
- `zod` **4.6.7** (MIT), a direct dependency for configuration and tool-argument validation.
- Existing `server-only` is reused. No server SDK, paid service, gateway, subprocess runner or extra hosting infrastructure is needed.

The SDK requires Node.js 20+. Use a Node.js version supported by the existing Next.js 16.3.5 application (verification used Node 24.19.0). npm and the existing lockfile are retained. Existing dependency versions, AI adapters, Supabase authentication, schema and Build features are unchanged.

Official references:

- https://github.com/modelcontextprotocol/typescript-sdk
- https://ts.sdk.modelcontextprotocol.io/v2/clients/connect.html
- https://ts.sdk.modelcontextprotocol.io/v2/get-started/first-client.html
- https://www.npmjs.com/package/@modelcontextprotocol/client
- https://www.npmjs.com/package/zod

## Implemented interface

`lib/mcp/client.ts` exports `withMcpClient`, `McpClientError`, `McpServerConfig`, `McpAccess` and `McpSession`.

`withMcpClient(server, access, async session => ...)` connects the official Streamable HTTP transport, runs the callback, terminates the remote session where supported, then closes local resources even on failure. There is no global client, token cache or reusable cross-user session. Session methods cannot be used after the callback closes.

- `session.listTools()` loads bounded pages (10 pages / 500 tools) and returns only developer-approved `readTools`.
- `session.callTool(name, arguments)` checks the approved tool name, JSON arguments (64 KB maximum) and mandatory server-side `authorize` callback before dispatching. It returns `{ serverId, trust: 'untrusted_external_data', result }` with native MCP content. A remote `isError` is a failure, never a success.
- Default lifetime is 30 seconds, configurable from 100 ms to 60 seconds. Cancellation propagates; cleanup requests have a separate two-second bound. Slow authorization cannot keep the connection open indefinitely.
- HTTP authentication, rate limits, cancellation, timeouts and tool errors have safe typed messages. Integer Retry-After seconds are preserved. No automatic retry of tool calls, quota failures or authorization failures.
- Only exact, vetted HTTPS endpoints on port 443 are accepted. Credentials in URLs, query strings, IP literals and obvious local hostnames are rejected. Requests use `no-store`, omit browser cookies and reject redirects.
- There is no stdio transport or arbitrary shell/code execution.

## How to connect the first real application next

This is a reusable foundation, not an installed catalogue of connected accounts. No live external MCP server or OAuth account has been configured or tested in this step. No new environment variable or API key is required to install, build or run the tests.

1. Choose an official remote MCP server and verify its free allowance, actual HTTPS endpoint, terms and supported tools. MCP itself is free; a connected service can still charge or impose quotas.
2. Put its `McpServerConfig` in a **server-only, developer-controlled registry**. Map an integration ID to this configuration. Never pass a request-body URL or a model-supplied URL directly to this module. Only allow read tools that a human has reviewed; do not trust remote `readOnlyHint` annotations.
3. Add an authenticated Node.js App Router handler (`export const runtime = 'nodejs'`). Reuse the existing `getSession`, `isSameOrigin` and `consumeRequest` patterns in `app/api/plugins/run/route.ts`. Check connection ownership and scopes before connecting or listing tools. Forward the request's abort signal.
4. For a credential-free public server omit `bearerToken`. For a private server obtain the signed-in user's token from an encrypted, access-controlled backend store after completing that service's OAuth consent flow. Pass the token only from trusted server code. Never use a `NEXT_PUBLIC_*` variable for credentials, forward incoming cookies/headers, or serialize the access configuration to the browser.
5. Implement `authorize(tool, args)` to recheck that user's connection, scopes and resource access. It must return `true` explicitly. It receives a copy of the exact arguments. Never accept a model/browser boolean as authorization.
6. Keep returned descriptions, tool content and server instructions as **untrusted data**. Do not elevate them into system instructions, execute embedded code, or render returned HTML unsanitized. This foundation intentionally does not feed remote instructions into the existing AI planner.
7. Add and live-test the app-specific handler and UI. Account connection, disconnect/revoke, encrypted token storage, OAuth refresh, ownership policies and write confirmations are follow-up work. Consequential/write tools must remain disabled until those controls exist.

The endpoint checks are defense in depth for a vetted registry, not a complete SSRF firewall for arbitrary URLs. Before adding any user-configurable endpoints, implement DNS/IP validation with connection pinning or a controlled egress proxy, response-size quotas and service-specific authorization. Do not weaken TLS validation. Legacy SSE-only servers and local process servers are outside this first step.

For future handlers, return only the `McpClientError` code/message and safe result fields; do not return arbitrary caught exceptions or log tokens, message contents, SDK responses or account credentials. External tools may return sensitive content even on success; apply the integration's privacy policy before sending it to an AI provider.

## Verification

Run from the repository root:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npx next typegen
npx tsc --noEmit
npm run lint
npm test
npm run build
```

`tests/mcp-client.test.mjs` uses the real installed SDK and Streamable HTTP transport with controlled fetch responses. It checks handshake, tool listing and pagination, authorization denial, safe errors, credential isolation, no retries, timeouts, cancellation, cleanup and escaped-session rejection. It requires no provider account or API key and is not a claim of a live third-party integration.

Results on 12 October 2026: **58/58 tests passed**, including 14 MCP tests; ESLint passed; Next.js production build passed; standalone TypeScript check passed after generating Next.js route types. A clean checkout needs `next typegen` before checking Next's generated `PageProps`, `LayoutProps` and `RouteContext` types.

No database migration, production configuration change, account permission change, paid API call or production deployment is part of this branch.

## GitHub follow-up (13 October 2026)

The first GitHub App OAuth adapter, encrypted per-user storage migration and Tools panel now live on this same feature branch. See [github-mcp.md](./github-mcp.md) for setup, permissions, testing and the live-verification boundary. The SDK/package versions are unchanged. Its HTTP wrapper now also recognizes GitHub 403 quota responses and bounds each protocol response at 2 MB. GitHub credentials and the development database migration still require manual setup; no production changes were made.
