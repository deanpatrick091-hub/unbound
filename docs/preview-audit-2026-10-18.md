# Preview audit, 18 October 2026

Scope: `feature/free-mcp-integrations`, starting at `35f947c`. No production changes, database writes, purchased services, or credential changes.

## Evidence

- The development database contains one failed video job with the application's credit-limit message. That message is produced for provider HTTP 402. The existing quota guard blocks repeat submissions until an operator acknowledges a real reset. It has not been cleared.
- No image assets are saved in the development database. No recent runtime logs were available to identify the image request's exact upstream response. Do not describe the image failure as conclusively diagnosed.
- Hugging Face's official pricing page now lists no monthly inference credit for free accounts: https://huggingface.co/docs/inference-providers/pricing . Existing free-allowance wording was inaccurate. No billing was enabled.
- Live public model mappings still list `Wan-AI/Wan2.1-T2V-1.3B` through fal-ai and `black-forest-labs/FLUX.1-schnell` through nscale as live. Model removal is not supported by this evidence.
- Vercel configuration inspection found HF_TOKEN configured for Preview, but no Cloudflare token/account pair. Secret values were not read. There is no configured Cloudflare image fallback.
- The Preview's stable website origin is `https://unbound-git-feature-free-mcp-integrations-fressence.vercel.app`. Its `/api/integrations/github/callback` path is an authorization endpoint, not a replacement homepage.

## Changes

- Unified `/plugins` and `/tools` into a searchable Apps gallery, with category filters, working detail panels, GitHub OAuth controls, and existing research/public tools. OAuth callback feedback opens the GitHub panel.
- Unconfigured research adapters display their required setting and official setup link rather than pretending to be connected. Account integrations outside GitHub are explicitly identified as unimplemented.
- Image routing distinguishes 402 credit exhaustion, 429 rate limiting, 401/403 credential/permission rejection, and other failures. Existing compatible fallback remains intact. Credit and credential failures receive longer backoff.
- Image generation now verifies same origin before consuming account resources. Provider credit notices are visible in the image UI.
- Video history refreshes on page entry, including detection of stale jobs through the existing endpoint. Removed inaccurate claims of a free Hugging Face allowance.

## Live tool requests

Passed real public adapter requests: Crossref, Wikimedia, arXiv, OpenAlex, Jina Reader, GitHub public repository, Vercel domain lookup. Semantic Scholar returned HTTP 429; no successful result is claimed. These were server-adapter requests from the development environment, not authenticated end-to-end Preview requests.

## Verification boundary and remaining work

- Automated suite: 78 passing tests, including media failure classification, existing Build, auth, MCP, routing and plugin checks. TypeScript, lint and local production build passed.
- Chromium fixture workflow passed Apps search, categories, GitHub connect-enabled state, a research request, back navigation and 375/768/1440 viewport overflow checks with no script errors. A desktop screenshot was visually inspected. This uses mocked account/API responses.
- Real image/video generation remains unverified and video credit exhaustion is unresolved. Provider credits cannot be restored through a code patch.
- A legitimate Cloudflare Workers AI configuration requires `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, and owner confirmation of the account's free-tier billing configuration before `CLOUDFLARE_FREE_TIER_CONFIRMED=true`. Keep these branch-scoped and server-side. No key was created or fabricated.
- A free self-hosted video worker requires separately configured hardware, a secure reachable endpoint and a compatible adapter. None is configured in this branch.
- GitHub real OAuth consent and signed-in Preview workflows still require an authenticated browser session. Vercel deployment protection has not been weakened or bypassed. Do not call this a full live website audit.
- Slack, Google apps, Discord and other account connectors require actual adapters plus provider OAuth registrations and user consent. Connecting apps in ChatGPT or Vercel does not grant Unbound per-user access.

Browser fixture verification can be run with `scripts/check-apps-ui.mjs` using externally installed test-only esbuild, Playwright and Chromium. It is explicitly not a real OAuth or provider-generation test.
