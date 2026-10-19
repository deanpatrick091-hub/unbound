# Image generation recovery — 2026-10-19

## Cause and provider status

The reported inference-credit error is the image route's HTTP 402 mapping. Hugging Face/nscale FLUX.1 Schnell was the configured hosted image provider; Cloudflare was not configured. Hugging Face's current pricing documentation lists no included inference credit for free accounts. Changing an error label or retrying cannot replenish credit. Existing providers and credentials are preserved.

| Provider | Implementation | Live evidence / requirement |
| --- | --- | --- |
| AI Horde, Realistic Vision / Deliberate | New asynchronous adapter, available anonymously | A real Deliberate image of a red teapot was generated, retrieved as inline WebP and visually inspected on October 19. Realistic Vision has not been individually tested. Community availability varies. |
| Hugging Face, FLUX.1 Schnell | Existing adapter preserved; manual selection only | Signed-in reproduction and Vercel runtime log confirmed HTTP 402 from huggingface on October 19; no successful HF generation. No billing changes made. |
| Cloudflare, FLUX.1 Schnell | Existing adapter preserved | Not live-tested: account ID/token and free-plan confirmation not configured. Official allowance is 10,000 neurons/day; a Free account stops at its cap. |
| Self-hosted LocalAI | New opt-in OpenAI-compatible adapter | Not live-tested: no user-hosted image server configured. Hardware/electricity/hosting still cost money. |

Sources verified against official documentation:
- https://huggingface.co/docs/inference-providers/pricing
- https://developers.cloudflare.com/workers-ai/platform/pricing/
- https://github.com/Haidra-Org/AI-Horde/blob/main/README_integration.md
- https://aihorde.net/api/swagger.json
- https://localai.io/docs/features/image-generation/

## Workflow and privacy

Image Studio prioritizes configured self-hosted/Cloudflare options, then AI Horde. Hugging Face remains selectable but is never an automatic paid fallback. AI Horde is attempted only after the user checks the community-processing opt-in. Anonymous generations are shared for dataset research according to the official API schema; volunteer workers receive prompts. Do not send confidential material.

AI Horde requests use its officially documented anonymous API identity (not a private credential), inline image responses and trusted, validated workers. An optional personal `AI_HORDE_API_KEY` can be stored server-side. Anonymous access has low queue priority; no latency or availability guarantee is made.

Queued jobs are stored in existing `integration_jobs` rows and polled through authenticated same-origin routes. Refreshing/reopening Images resumes a pending request for up to 30 minutes. Returning a queue ID is not represented as a completed image. Only validated image bytes are saved to `project_assets`; repeated polls reuse the asset ID. Worker-supplied URLs are never fetched. Cancel stops tracking and attempts upstream cancellation; already-saved images are preserved.

Completed images appear in Recent Images and support the existing Download and Save to project controls. Queued generation saves initially to Recent Images; assign it to a project after completion. Leaving the page pauses polling; reopen it before the provider result expires. This is not an always-running background worker. A simultaneous request from another browser can still create a duplicate upstream job; budget checks and single-browser controls mitigate this, but distributed idempotency is not claimed.

## Optional configuration

No new secret is required for anonymous AI Horde. Never paste secrets in source or client code.

- `AI_HORDE_API_KEY`: optional legitimate personal Horde key.
- `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`: existing server-side Workers AI credentials.
- `CLOUDFLARE_FREE_TIER_CONFIRMED=true`: set only after verifying the account's free allowance and billing safeguards.
- `SELF_HOSTED_IMAGE_ENABLED=true`
- `SELF_HOSTED_IMAGE_URL`: exact HTTPS `/v1/images/generations` endpoint on your authenticated LocalAI server. Production cannot reach your personal computer's localhost.
- `SELF_HOSTED_IMAGE_API_KEY`: strong server-only authentication key, at least 16 characters.
- `SELF_HOSTED_IMAGE_MODEL`: installed image model name.

LocalAI must return `data[0].b64_json`; redirect responses and URL-only images are rejected. No new dependencies, paid resources, secret replacements or database migrations are required.

## Verification

Automated coverage includes 402-to-queue fallback, queued/finished states, censored results, untrusted URL rejection, Retry-After, configuration validation, idempotent asset saving, cross-user isolation and same-origin enforcement. Network and session/database boundaries are fixtures in these tests, not live end-to-end tests.

Verified on production commit `145dfd4` on October 19, 2026: signed in, selected Hugging Face, opted into community fallback, and submitted a non-sensitive teapot prompt. HF failed with HTTP 402; AI Horde Deliberate completed the request. The job recorded its saved asset. After closing/reopening the browser tab, the image was present in Recent Images, reopened successfully, and decoded at 512×512. Download completed. Save to project returned “Saved to project assets”; the database contained both the history image and a separate project copy. No application console errors were observed (browser-extension metadata errors were unrelated). Pending-queue refresh was not individually observed; completed-image persistence was verified.\n\nValidation: 85 automated tests passed, TypeScript and lint passed, local production build passed, and Vercel Preview and Production builds completed successfully. Production deployment `dpl_BiY6AFzUdh8hrYGkMkFLdcXmSYPV` is Ready and serves `unbound-lilac.vercel.app`. No secrets or database schema were changed.

Manual acceptance: sign into Unbound, open Images, choose AI Horde, read/check community consent, submit a non-sensitive prompt, wait for completion, download, save to a project, then refresh and reopen from Recent Images. During a queue, refresh once to verify resume. Existing images should remain visible if the new request fails.
