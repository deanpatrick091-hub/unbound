# Platform foundations — 11 October 2026

Later design-engine progress is documented in [Design Studio](design-studio-oct11.md). The scope below describes this earlier checkpoint.

This is an incremental release, not completion of the full plugin, deployment, or 15-style design-engine request.

## Architecture and delivered changes

Unbound remains the existing Next.js 16.3.5 App Router application. Supabase stores projects, files, versions, memberships and video jobs behind existing RLS. Build still generates three static files (`index.html`, `styles.css`, `script.js`) in an isolated preview. The existing free-model discovery/fallback layer remains authoritative.

- Build has Automatic/Manual model routing. Automatic selection uses available configured free models, approximate context fit, output capacity, existing coding-name hints and current health. It is a heuristic, not a benchmark-backed claim that one model produces the best design. Selection mode is saved with a successful build.
- The builder instructions now explicitly plan content/navigation, preserve edits, avoid random placeholder imagery, and prohibit simulated backend success.
- A static quality gate rejects unfinished file blocks, empty updates, incomplete HTML documents and missing local dependencies/pages before saving. Non-blocking title, viewport, landmark, image-alt and form findings appear in the workspace. Existing saved previews survive a failed build.
- Deploy & Domains exports the actual saved source as a ZIP, includes static Vercel configuration, provides a real domain lookup, and guides users through GitHub/Vercel import and existing-domain DNS setup. There is no claimed account connection, automatic deployment history, or domain purchase.
- The public plugin registry exposes two fixed read adapters: Vercel domain search and GitHub public repository metadata. Routes authenticate the user, reject cross-origin writes to the tool endpoint, enforce usage checks, validate bounded inputs, use fixed provider URLs, deny redirects, bound response sizes, and render remote data as text. No private account tokens are stored.
- The Integrations page has search, direct lookups and an AI tool selector. The AI proposes only one allowlisted public read with a target present in the user's question. The server validates it before execution. Returned app content is untrusted data and is not used as instructions. Account plugins and write actions fail closed.

## Actual video diagnosis

Vercel production logs retrieved on 10 October showed three `/api/videos` failures with HTTP **402**, including 14:28:24, 14:37:08 and 14:38:04 UTC. The configured provider is Hugging Face Inference Providers → Fal → `Wan-AI/Wan2.1-T2V-1.3B`. This is a provider credit/payment-limit rejection. The old website combined 402 and 429 into “exhausted or busy”; that wording came from Unbound.

The release distinguishes credit limit (402), rate limit (429), credentials (401), permissions (403), missing model (404), bad input (400/422), server outage (5xx), timeout and storage failure. Logs contain only classification/status, never provider bodies, requests, tokens or prompts. Usage-check outages now return 503 instead of a misleading quota 429. Duplicate active-job races return 409.

A newly recorded 402 prevents that user's further submissions until the operator acknowledges genuine renewed credit using `VIDEO_QUOTA_RESET_AT` (a past ISO timestamp later than the failed job). This guard uses persisted jobs and is scoped per user; it is not a global provider billing ledger. Do not set a fictitious reset timestamp to bypass limits. Old ambiguous failure records are not reclassified without evidence. No automatic retries are performed against 402, invalid credentials or potentially accepted long-running jobs.

**Video generation is still credit-blocked. No successful new video or playback test is claimed.** Existing asynchronous job/storage and cancellation behavior is preserved. The 300-second hosting limit remains. No alternative provider is enabled; free website trials are not assumed to be free APIs, and open-source video models still require compute.

## Configuration and OAuth prerequisites

No new API key, dependency, paid service or database migration is needed for this release. Existing production environment variables are preserved.

| Variable | Status |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Existing public connection configuration |
| Existing AI-provider credentials and free-tier confirmation flags | Existing server-only inference connections; no secrets changed |
| `HF_TOKEN`, `HUGGINGFACE_FREE_TIER_CONFIRMED` | Existing video provider configuration; requires actual available free credit |
| `VIDEO_QUOTA_RESET_AT` | Optional operator acknowledgment after a real credit reset; no secret value |

Gmail, Drive, Calendar, Sheets, GitHub account operations, Slack, Discord, Notion, Trello, Todoist and direct Vercel deployment are **not implemented or connected in this release**. The previous uncommitted 15-style prototype was interrupted and is not included. No Connect button pretends that these are working.

For the next OAuth stage:
1. Create an owner-controlled Google Cloud project and enable only the Workspace APIs to be integrated.
2. Configure OAuth branding, privacy policy, authorised domain and test users. Start in testing mode.
3. Register a Web application OAuth client. The callback route must be implemented and fixed before adding its exact HTTPS URI; no callback URI is claimed available in this release.
4. Store the future client ID/secret only in Vercel server environment variables once the implementation specifies their names. Never paste secrets into chat or browser code.
5. Gmail read/draft scopes are restricted. Public server-side use can require verification and a security assessment. A personal test setup does not establish approval for all users.
6. Register a GitHub App with selected-repository permissions and a Vercel integration separately. A ChatGPT connector connection does not authorize end-users of Unbound.

The next implementation must include server-only encrypted token storage, per-user ownership checks, one-time state/PKCE, token refresh/revocation, scope checks, and immutable single-use confirmation records for consequential actions. This release intentionally exposes no write executor until those controls exist.

## Costs and limits

- Public GitHub metadata and Vercel domain discovery need no API key; their quotas and provider policies still apply.
- AI-assisted selection consumes the existing configured model's allowance. A free coding assistant does not provide free deployed inference.
- Hugging Face free inference credit is limited. This account's observed 402 cannot be repaired by frontend code. Billing was not enabled.
- Vercel Hobby is for eligible personal non-commercial use, not a promise of free commercial hosting.
- Domains have registration/renewal charges. Search shows returned prices only; missing prices remain unknown. Purchases go through the provider, with explicit checkout approval.
- No claim is made that all OAuth services, verification costs, plan-specific features or future production traffic will be free.

Official references consulted:
- https://huggingface.co/docs/inference-providers/pricing
- https://huggingface.co/docs/inference-providers/tasks/text-to-video
- https://developers.google.com/workspace/gmail/api/auth/scopes
- https://developers.google.com/workspace/gmail/api/reference/quota
- https://vercel.com/docs/domains/registrar-api
- https://vercel.com/docs/plans/hobby
- https://docs.github.com/en/rest/repos/repos

## Adding another plugin

Add reviewed metadata and input schema to `lib/plugins/registry.ts`, implement a fixed-origin bounded adapter in `lib/plugins/server.ts`, add validation/failure tests, then run a real API request. Do not extend the public read registry with authenticated or consequential actions: first implement the private OAuth vault and confirmation executor described above. Never accept model-supplied fetch URLs or executable code.

## Verification and release procedure

Run `npm ci`, `npm run lint`, `npm test`, and `npm run build`. `scripts/check-platform-http.mjs` starts a local production server against Supabase and creates isolated test accounts/fixtures. It tests username sessions, project persistence, export and outsider isolation, media lifecycle permissions, and rejection of unconnected/cross-origin plugin actions. It is not a live AI generation test.

Publish only reviewed files to `deanpatrick091-hub/unbound` main. Vercel's build command gates deployment on lint, automated tests and production build. Verify the new deployment is READY, test the live endpoints, and inspect logs. Do not publish `.env.local`, test cookies, credentials or generated build files.

## Still outstanding

Full OAuth app integrations and confirmations; account-based one-click Vercel deployment/history; automatic domain connection; true multi-page/full-stack generation; safe isolated execution/build/repair of generated apps; all 15 complete design systems and visual/device tests; style combinations and persistent no-code animation controls; successful video generation after legitimate credit becomes available. “Lovable quality” is not claimed from prompt changes or static checks.

## Files in this checkpoint

- `app/(app)/build/[id]/deploy/page.tsx`
- `app/(app)/plugins/page.tsx`
- `app/api/plugins/ask/route.ts`
- `app/api/plugins/run/route.ts`
- `app/api/projects/[id]/export/route.ts`
- `components/plugins/plugin-marketplace.tsx`
- `components/plugins/plugin-tool.tsx`
- `docs/platform-foundations-oct11.md`
- `lib/build/quality.ts`
- `lib/build/selection.ts`
- `lib/deploy/export.ts`
- `lib/plugins/planner.ts`
- `lib/plugins/registry.ts`
- `lib/plugins/server.ts`
- `lib/videos/errors.ts`
- `tests/build-quality.test.mjs`
- `tests/video-errors.test.mjs`
- `app/api/build/route.ts`
- `app/api/videos/route.ts`
- `components/build/builder-screen.tsx`
- `components/shell/sidebar.tsx`
- `hooks/use-builder.ts`
- `lib/build/parser.ts`
- `lib/build/prompt.ts`
- `lib/build/types.ts`
- `scripts/check-platform-http.mjs`
