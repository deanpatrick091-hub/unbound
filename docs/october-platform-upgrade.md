# October platform refinement

## Implemented

- Username/password login and signup, with backend-only Supabase identity resolution. Existing IDs and guest work are retained when upgrading. Existing email identities are still accepted by the backend for compatibility; public forms display only Username and Password.
- Fixed valid auth requests rejected when Next uses an internal hostname. Origin is compared against the HTTP Host authority. Cross-origin requests remain rejected.
- Projects use live, lazy-loaded sandboxed website thumbnails, keyed by revision. Essential actions remain in a compact menu; the existing dashboard queries and persistence are preserved.
- Compact Pinned section above Recents. Chat rows have keyboard/touch-accessible pin controls; pin changes refresh the sidebar and other controls.
- Images, Tools, and Council use simplified composers and rows instead of nested cards. Images support cancellation, retry, history removal, and saving a copy to a project.
- Recent-image deletion changes persistent history visibility, preserving the original saved asset. Existing generated websites may embed asset IDs or data URLs; safe physical garbage collection is intentionally not implemented.
- Video creation uses the official pinned Hugging Face inference client and Wan 2.1 through its Fal routing. It reuses the server-only Hugging Face key and existing free-tier confirmation. No paid Higgsfield calls or invented keys.
- Video jobs persist independently of the page. Private MP4 storage, history, cancellation, playback, download and project assignment are implemented. One active job per user is enforced by a database index. Interrupted jobs are detected on history refresh.
- Build has a project Assets page for saved images and videos.

## Migrations

- `20261005021306_username_auth_throttle.sql`: private authentication throttle, backend-only function access (earlier checkpoint).
- `20261005172925_image_history_visibility.sql`: history timestamp, partial index, column-scoped update grant and owner RLS.
- `20261005173525_video_workspace.sql`: persistent video jobs, one-active-job constraint, owner/project membership RLS, private storage bucket and object policies.

## Configuration and limits

No new key is required when the existing `HF_TOKEN` and `HUGGINGFACE_FREE_TIER_CONFIRMED=true` are configured. `USERNAME_AUTH_ENABLED=true` enables the new auth UI. Supabase Edge Function secrets remain inside Supabase.

Hugging Face's official documentation lists $0.10 monthly credit for free accounts, subject to change. This is limited credit, not unlimited free video. The deployment owner's free-tier confirmation must mean paid billing/custom provider billing is disabled. Credit exhaustion is an error, never a fake completed video.

Sources checked 2026-10-05:
- https://huggingface.co/docs/inference-providers/pricing
- https://huggingface.co/docs/inference-providers/tasks/text-to-video
- https://huggingface.co/api/models/Wan-AI/Wan2.1-T2V-1.3B?expand=inferenceProviderMapping (Fal mapping live)
- https://higgsfield.ai/creator-hub/help-center/integrations/what-is-the-higgsfield-api

## Remaining limitations

- Username-only password recovery is not yet implemented; signup states this explicitly.
- Video provider controls are limited to the supported short-clip preset and landscape/portrait ratios. Image-to-video upload is not yet implemented.
- Video work uses Next `after()` within a 300-second host limit, not an unlimited durable worker. Cancellation prevents saving the result but may not stop a remote provider job already submitted. These limits are communicated honestly.
- Removing recent media preserves saved assets; automatic cleanup of unreferenced binaries is not implemented.
- Project Assets permits viewing/downloading saved media; automatic insertion of video into generated website code is not implemented.
- Full device-matrix browser testing and all original provider additions are not claimed complete.

## Verification

Local lint, automated tests and production build are run for this checkpoint. `scripts/check-platform-http.mjs` runs the actual local production server against Supabase, creates isolated generated test credentials (never printed), and verifies signup, session cookies, duplicate usernames, wrong passwords, fresh login, project persistence/preview isolation, pinning, image-history removal and preservation, video lifecycle permissions, and outsider access denial. It leaves clearly labeled fixtures in its isolated test account.

Provider generation must be reported separately from fixture/lifecycle tests. A successful build or database fixture is not proof of a successfully generated video.

## 2026-10-10 continuation: image fallback reliability

Significant files changed in this checkpoint:
- `lib/images/routing.ts`: server-only compatible image routing with expiring instance-local backoff, bounded numeric/date Retry-After support, cancellation, and distinct quota versus mixed failure results.
- `app/api/images/route.ts`: uses the router, prevents credential-bearing redirects, closes failed responses, validates image bytes before accepting a provider result, and saves only the successful result. Database-save failures do not trigger another generation.
- `tests/image-routing.test.mjs`: tests provider switching, cooldown expiry, mixed errors, bounded backoff, invalid-output fallback, cancellation, and configured-provider isolation.
- This report.

Observed live production tests before this checkpoint:
- Production deployment `dpl_ARNUKCr9izGM7xg1HZq5tQwtRZhD` was READY at commit `dffd48dfb2a0d78c640ce285b1b12f8dec8249ce`.
- Image generation returned HTTP 429 from the connected free allowance. No image was generated by this test.
- Video submission returned HTTP 202 and persisted a job; subsequent polling reported `failed`, free allowance exhausted/busy, and no stored video. This is not a successful video generation test.
- Only Hugging Face is currently connected for image generation. Cloudflare remains implemented but unconfigured. Automatic switching cannot create additional provider credit.
- AI Horde's official API performance endpoint responded HTTP 200, with 830 queued image requests at the observation time. This was a connectivity check, NOT an image generation test. Its public-sharing/volunteer processing requires an explicitly disclosed opt-in flow and persistent asynchronous queue handling; it has not been added as an automatic private-prompt fallback.

No keys, billing settings, provider removals, or database migrations were changed. Image cooldowns are instance-local (best effort across serverless requests), not a distributed quota ledger. They expire automatically; they do not claim to know the account's monthly reset time. No successful new-provider image/video generation is claimed.

Checkpoint verification: all 32 automated tests passed, ESLint passed, TypeScript passed within the optimized Next production build, and production build succeeded locally after restoring dependencies from the committed lockfile. Five new routing tests simulate provider responses; they are regression tests, not claims of newly available live credit.
