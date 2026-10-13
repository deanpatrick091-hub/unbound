# GitHub MCP integration — feature branch only

Implementation date: 13 October 2026. Based on `98dbea3` on `feature/free-mcp-integrations`. No production deployment or production database migration is included.

## What this adds

Tools now includes a GitHub connection panel with Connect/Reconnect, Choose repositories, Check connection and Disconnect. Four actions map to GitHub's official MCP tools: repository search (`search_repositories`), file/directory reads (`get_file_contents`), issue lists (`list_issues`) and issue details (`issue_read`, method `get` only). Results render as escaped text, not executable HTML. No GitHub write tools, Copilot agents, paid AI inference, autonomous chat tool selection or automatic scope escalation is enabled.

The existing official SDK and Zod versions are reused; no application dependencies were added or upgraded. Small MCP client fixes distinguish GitHub's HTTP 403 rate limits from authentication failures and cap protocol response bodies at 2 MB.

## Verified official configuration and costs

- Hosted read-only endpoint: `https://api.githubcopilot.com/mcp/readonly`.
- Its live unauthenticated response is HTTP 401 with `resource_metadata="https://api.githubcopilot.com/.well-known/oauth-protected-resource/mcp/readonly"`.
- That metadata identifies issuer `https://github.com/login/oauth`. RFC 8414 discovery is `https://github.com/.well-known/oauth-authorization-server/login/oauth`; the response advertises S256 PKCE, authorization and token endpoints.
- GitHub requires the host to register an app; dynamic client registration is not supported. This implementation discovers and validates the advertised endpoints against pinned GitHub origins.
- **Use a GitHub App with OAuth user authorization, not a traditional OAuth App.** Traditional `repo` and `public_repo` OAuth scopes include writes. GitHub Apps support selected repositories and genuinely read-only Contents/Issues permissions. No GitHub App private key or service-role database key is needed for this user-token flow.
- GitHub's hosted MCP prerequisites do not list a paid subscription for these standard repository tools. The implementation invokes no paid Copilot features and adds no integration platform or fee-bearing API. This does not promise unlimited use or future pricing.
- GitHub documents a typical authenticated REST allowance of **5,000 requests/hour per user**, shared with other tokens/apps. MCP operations may make multiple API requests. Search, GraphQL, secondary abuse limits and organization policies also apply; this is not a guarantee of 5,000 MCP calls. Unbound's existing application rate limiter also applies.

Official sources checked:
- https://github.com/github/github-mcp-server/blob/main/docs/remote-server.md
- https://github.com/github/github-mcp-server/blob/main/docs/host-integration.md
- https://github.com/github/github-mcp-server (tool definitions and prerequisites)
- https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps
- https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-with-a-github-app-on-behalf-of-a-user
- https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens
- https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
- https://docs.github.com/en/rest/apps/oauth-applications#delete-an-app-token

## Exact manual setup (development or a dedicated non-production preview)

1. Choose one stable development URL. For local `npm run dev`, use `http://localhost:3000` (adjust the port if needed). For a preview, use its HTTPS URL. Do not point a preview callback at production.
2. On GitHub, open **Settings → Developer settings → GitHub Apps → New GitHub App**. Choose a unique name, such as `Unbound Read-Only Development`. Set Homepage URL to that development URL.
3. Under user authorization, set **Callback URL** to `<development-origin>/api/integrations/github/callback`. Enable **Expire user authorization tokens**. Leave device flow disabled; no setup URL is required. Turn off webhook Active; no webhook events or webhook secret are needed.
4. Set Repository permissions to **Contents: Read-only**, **Issues: Read-only**, and **Metadata: Read-only** (automatic). Leave all other repository, organization and account permissions at **No access**. Do not grant any write permission. The connection verifier rejects broader installed permissions.
5. For a personal-only test choose installation on your account. To let other Unbound users connect later, select **Any account**. Register the GitHub App. Record its **Client ID** (starts with `Iv`, not its numeric App ID) and generate a **Client secret**. A private key is unnecessary for this integration.
6. Record its app slug from `https://github.com/apps/<slug>`. Select **Install App**, install on your account, and choose only the repositories you want to expose. Organization installations may require an administrator. Each Unbound user must separately authorize the app and have access to the selected repositories.
7. Generate a 32-byte encryption key **on your own device**, without putting it in Git or sending it in chat:
   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
   ```
8. Store these **server-only** environment variables in your local ignored `.env.local`, or in Vercel's **Preview** environment scoped to this branch. Never prefix any of them with `NEXT_PUBLIC_`:

   | Variable | Value to supply |
   | --- | --- |
   | `GITHUB_OAUTH_CLIENT_ID` | GitHub App Client ID |
   | `GITHUB_OAUTH_CLIENT_SECRET` | App's generated client secret |
   | `GITHUB_OAUTH_REDIRECT_URI` | Exact callback URL from step 3 |
   | `GITHUB_APP_SLUG` | App slug from step 6 |
   | `INTEGRATION_ENCRYPTION_KEY` | Base64 key generated in step 7 |

9. In an **isolated development Supabase database**, apply `supabase/migrations/20261013135751_github_mcp_connections.sql` using the SQL Editor, or include it in the local Supabase migration workflow. Keep the existing public Supabase URL/key configuration pointing to that development database. Do not apply this to production as part of this feature-branch task. The migration was tested in a disposable PostgreSQL engine; it was not applied to the connected production project.
10. Start the branch with `npm run dev` (or explicitly deploy a non-production preview when you decide to). Sign in with a real Unbound account, open **Tools → GitHub**, click **Choose repositories on GitHub** if not already installed, then **Connect GitHub**. Approve GitHub's consent screen. The callback verifies the identity, installed permissions and MCP tool list before saving a connected status.
11. Test repository search, a known file and an issue. Use **Check connection** to recheck credentials and server capabilities. Disconnect and confirm reads stop. Test with a second Unbound user and a different GitHub account to confirm the production-like ownership flow after setup.

No credentials have been created or filled in automatically. Do not reuse another app's credentials or paste credentials into chat. Keep the encryption key stable; changing it makes existing ciphertext unreadable and requires reconnection. Back it up securely. Prefer a separate GitHub App and encryption key per environment.

## Storage and authorization

`github_connections` and `github_oauth_states` use owner-based RLS, explicit grants, `auth.users` foreign keys and anonymous-user denial. Both tables store encrypted credential/PKCE payloads. The encryption key is only in the Next.js server environment. AES-256-GCM authenticates the user ID, GitHub App ID and connection/attempt ID as associated data; swapping another user's ciphertext cannot produce usable credentials. Direct authenticated Data API access can see only the owner's ciphertext, not plaintext tokens. Unbound's own HTTP responses never include the ciphertext or tokens.

Handlers cryptographically check the existing Supabase session and also call `auth.getUser()` to reject missing/deleted/anonymous accounts. POST handlers require same-origin requests. OAuth uses random state, a separate HttpOnly/Secure/SameSite=Lax browser cookie, PKCE S256, ten-minute expiry, issuer validation and an atomic one-use claim. Completing authorization uses an RLS-preserving **SECURITY INVOKER** RPC and cannot restore a connection after its pending state has been deleted by Disconnect. A new connection attempt replaces the user's previous pending attempt.

GitHub App access tokens expire after eight hours. Encrypted refresh tokens rotate server-side with a database compare-and-swap lease, preventing concurrent refreshes. A failed refresh/revoked grant requires reconnection; no repeated credential retry occurs. An interrupted token exchange or database failure may require reconnecting.

Disconnect deletes the user's local connection and pending OAuth attempt, attempts GitHub's token-revocation endpoint, and reports if remote revocation was not confirmed. In that case, visit **GitHub Settings → Applications → Authorized GitHub Apps** and revoke the app manually. App installation itself is managed on GitHub and is not automatically removed. Already-dispatched reads may finish upstream; their results are discarded if the connection ID has changed.

MCP content remains untrusted external data. Tool names/methods are selected by a fixed server adapter, not accepted from a model or request body. Authorization is rechecked immediately before a tool call and after it returns. No raw token, provider response, request body or OAuth code is logged by these modules.

## Tests and known verification boundary

Automated route tests execute the actual handlers, encryption, store and installed MCP SDK with controlled session/cookie/provider/database fixtures. They are **not real GitHub OAuth account tests**. Separate database checks execute the migration and RLS in local PGlite/PostgreSQL with two user identities and the `anon`/`authenticated` roles.

Run normal checks:
```sh
npm run lint
npm test
npx next typegen
npx tsc --noEmit
npm run build
```

For the isolated SQL test, install `@electric-sql/pglite` outside the application and run:
```sh
PGLITE_MODULE=/absolute/path/to/test-tools/node_modules/@electric-sql/pglite node scripts/check-github-database.mjs
```

Live checks completed without credentials: the implemented discovery function successfully verified GitHub's MCP 401 challenge, protected-resource metadata and OAuth metadata; a public REST read of `github/github-mcp-server` returned HTTP 200. **No authenticated GitHub MCP tool call, real OAuth consent, real token refresh or real token revocation was possible without the app setup above.** Do not label the integration fully live-verified until those checks pass.

This branch leaves all existing AI providers, authentication, database tables, chat and website-builder code intact. There is no migration or deployment to production, no automatic GitHub write action, and no AI inference charge introduced by these read tools.

## Recorded results and files

- Automated suite: **76 tests passed**, including the existing 58, 11 GitHub adapter/crypto tests, five OAuth route workflows and two extra MCP transport regressions.
- Local PostgreSQL migration test: passed RLS isolation between User A/User B, anonymous denial, ownership-transfer denial, one-use state, callback replay rejection, SECURITY INVOKER permissions, refresh lease and disconnect/finalization ordering.
- Actual React panel in Chromium with API fixtures: passed setup-required state, read-form submission, verification, reconnect errors, disconnect, OAuth navigation, escaped untrusted content, keyboard focus and 375/768/1440-pixel widths. No page script errors. A mobile screenshot was visually inspected. This was an isolated rendering of the real component, not a deployed/authenticated GitHub workflow.
- TypeScript, ESLint and production build: passed.
- Real GitHub checks: unauthenticated official MCP challenge/discovery and public REST repository read passed. Real user authorization, private repository reads, authenticated MCP calls, refresh and revocation remain unverified until manual app setup.

Significantly changed/created files:
- `app/(app)/tools/page.tsx`
- `components/github/github-integration.tsx`
- `app/api/integrations/github/route.ts`
- `app/api/integrations/github/connect/route.ts`
- `app/api/integrations/github/callback/route.ts`
- `app/api/integrations/github/disconnect/route.ts`
- `app/api/integrations/github/run/route.ts`
- `app/api/integrations/github/verify/route.ts`
- `lib/github/security.ts`, `lib/github/provider.ts`, `lib/github/store.ts`, `lib/github/http.ts`, `lib/github/types.ts`
- `lib/mcp/client.ts`, `lib/supabase/database.types.ts`
- `supabase/migrations/20261013135751_github_mcp_connections.sql`
- `tests/github-integration.test.mjs`, `tests/github-routes.test.mjs`, `tests/mcp-client.test.mjs`
- `scripts/check-github-database.mjs`, `scripts/check-github-ui.mjs`
- `docs/github-mcp.md`, `docs/mcp-client.md`

For browser fixture checks, `check-github-ui.mjs` needs a production build's CSS and test-only esbuild, Playwright and Chromium installations. Set `TEST_TOOLS_DIR`, `CHROMIUM_EXECUTABLE` and the runtime's `CODEX_PRIMARY_RUNTIME_NODE_MODULES`; `SCREENSHOT_PATH` is optional. None of these test tools are added to the deployed app's package dependencies.
