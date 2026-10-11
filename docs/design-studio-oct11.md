# Design Studio — 11 October 2026

Incremental upgrade of the existing Unbound Build workspace. This does not complete the separate OAuth app integrations or one-click account deployment requests.

## Implemented

- A lazy-loaded Design Studio dialog inside each existing Build project, with real rendered samples and desktop/tablet/mobile preview widths.
- Fifteen versioned design systems: Particle, Liquid Morph, Holographic, Neon, Wireframe 3D, Glassmorphism, Kinetic Typography, Isometric, Clay 3D, ASCII, Gradient Mesh, Comic Book, Split-Flap, Retro VHS and Halftone.
- Shared type, surface, accent, border and radius tokens; reusable display, card, button, grid and decorative-art components. No production dependencies added.
- Real CSS effects, bounded Canvas particles, CSS 3D wireframes, one-time split-flap reveals, accessible text, and backdrop/3D fallbacks. These are lightweight implementations, not photorealistic 3D or a general WebGL engine.
- Six compatible pairs: Glass + Mesh, Neon + Wireframe, Clay + Mesh, Comic + Halftone, Kinetic + Particle, Holographic + Glass. Arbitrary conflicting combinations are rejected.
- Subtle/Balanced/Expressive/Maximum presets, speed, particle/halftone density and explicit reduced motion. A visitor can pause decoration. Device reduced motion overrides the project setting.
- Animation pauses while hidden. Particle count is capped at 64 desktop / 24 mobile, DPR at 1.5, and frames at approximately 30fps. A one-second visible-page state check handles deferred browser media-query notifications; it is stopped on page hide. Canvas observes size changes and disconnects on page hide.
- Manual style is authoritative. Automatic selection is transparent keyword matching, not an AI design critic: it resolves from a new prompt once and is retained for subsequent edits. Selecting Automatic again resets that choice for the next generation. Existing websites are not restyled unless the user opts in.
- Build instructions carry the complete selected visual direction and tokens. Managed rendering code is stripped before sending existing files to the model, then restored after generation. It does not consume repeated prompt context or grow with each edit.
- Design settings and actual rendered HTML save atomically through the existing `save_project` revision/RLS path. Exports include the same self-contained CSS and runtime. No new database migration, API key or paid service.
- Owner/editor access, viewer rejection, same-origin validation, bounded configuration and optimistic concurrency. Duplicate clicks cannot race design saves against generation in the same workspace.

## Validation

- Lint, TypeScript (through production build), production build and 44 automated tests passed.
- Actual Chromium rendering passed for all 15 samples at 375, 768 and 1440px: no horizontal overflow, keyboard focus, reduced motion and pause controls.
- All six compatible combinations rendered. Canvas output changed while running and remained unchanged after pause. No page script errors or network requests from the samples.
- Desktop/mobile screenshots were inspected for representative particle, clay, wireframe and holographic samples.
- Local production HTTP against the real Supabase backend passed: save/reopen design, logout/login persistence, exported design code, stale revision rejection, invalid combination rejection, cross-origin rejection, outsider isolation, viewer rejection and editor save. Existing auth/project/pin/media workflow tests also passed.
- Earlier live Automatic Build fixture was recovered from Supabase: revision 1, three saved files, actual final model `kilo:poolside/laguna-s-2.1:free`. This proves the earlier Build completed; it is not a live-generation test of this new design code.
- Actual workspace Chromium test passed: choose Clay + Mesh, adjust controls, render a 375px sample, save, reload, retain settings, open the mobile dialog, dismiss with Escape, and observe no page script errors. Desktop/mobile workspace screenshots were inspected. Production-generation verification is recorded below.

## How to use

Open a Build project → Design Studio → select a style and optional compatible second style → adjust motion → Save design. Existing managed components and tokens update immediately. Ask Build for the desired layout/content to incorporate the full style direction. An older site with its own hard-coded styling may need a Build request to adopt the reusable components. The gallery is a representative sample, not a substitute for the generated customer website.

To add a style, add a reviewed registry entry and bounded CSS/runtime support, explicit compatible pairs, schema tests and real rendering tests. Never accept arbitrary scripts, CSS or fetch URLs through the design configuration.

## Reproduction

```
npm ci --ignore-scripts --no-audit --no-fund
npm run lint
npm test
npm run build
NODE_USE_ENV_PROXY=1 node scripts/check-platform-http.mjs
node --import ./scripts/test-loader.mjs scripts/check-design-rendering.mjs
NODE_USE_ENV_PROXY=1 node scripts/check-design-workspace.mjs
```

The browser scripts use an existing Playwright installation (`PLAYWRIGHT_MODULE`, or the Work runtime path). Optional `CHROMIUM_EXECUTABLE` selects an installed headless browser. `SCREENSHOT_DIR` selects a temporary output directory. Test binaries are not application dependencies. Workspace tests use an isolated Supabase fixture and public configuration only; they never print session cookies. `TEST_ORIGIN` can target an authorised deployed environment.

## Limits / remaining work

The generation architecture remains three static files. There is no full-stack compiler, multi-page filesystem, automated visual repair agent, benchmark-backed best-model selection or guarantee of agency-level output from every free model. The style library provides reusable design foundations, not every advanced variation listed in the original request: particle pointer interaction, a general scroll/page-transition engine, font/palette editors and arbitrary 3D scenes remain future work. Representative render tests do not certify every generated site or every browser/device for accessibility or performance.

Gmail and other account OAuth plugins, secure per-user token vault, consequential-action confirmations, direct user-account Vercel deployments/history and automatic DNS management remain separate unfinished work. Video remains blocked by the previously observed provider HTTP 402; no new video provider, key, credit purchase or successful playback is claimed.

## Significant files

- `lib/design/registry.ts`, `lib/design/render.ts`, `lib/design/runtime.ts`
- `components/build/design-studio.tsx`, `components/build/builder-screen.tsx`
- `app/api/projects/[id]/design/route.ts`, `app/api/build/route.ts`
- `hooks/use-builder.ts`, `lib/build/types.ts`
- `tests/design-engine.test.mjs`
- `scripts/check-design-rendering.mjs`, `scripts/check-design-workspace.mjs`, `scripts/check-platform-http.mjs`
- `docs/design-studio-oct11.md`, `docs/platform-foundations-oct11.md`


## Production verification and routing correction

The design release reached READY on the existing production alias `unbound-lilac.vercel.app` (application commit `3bffd1a`, deployment `dpl_HRZwXswSM4jeSzzCXbR7XtzbsDud`). A real live request completed at 18:28 UTC on 11 October, using `kilo:poolside/laguna-s-2.1:free`: three files, saved revision 1, persisted Clay + Mesh configuration, rendered preview response and ZIP containing the real design runtime. No new API key was needed. No service-role key was retrieved or used by these tests.

The resulting website was then rendered in Chromium using Unbound's actual iframe sandbox/CSP at 375, 768 and 1440px. It passed horizontal-overflow, internal navigation, keyboard-focus and reduced-motion checks with no page script errors. Its desktop/mobile screenshots were inspected. This checks a real generated result, not only the style gallery.

The live request exposed two consecutive output-limit failures from the same underlying model through different gateways. The follow-up correction tags model output-cap failures and skips that same model across gateways for the remainder of the request. It selects a different compatible free model without removing any model from the registry or changing manual availability. Account rate-limit/quota fallback still prefers another provider. Existing protection against retrying after partial text remains. An additional regression test covers the exact failure sequence.

Production browser navigation from the test runner was blocked by its proxy certificate trust (`ERR_CERT_AUTHORITY_INVALID`). HTTPS API checks succeeded; the complete UI save/reopen/mobile workflow was browser-tested against the local production build and real Supabase. Certificate verification was not disabled and Vercel TLS settings were not changed. Do not describe the production browser UI workflow as passed.

A production error/fatal log scan after generation returned no matching entries in the inspected 15-minute window. This is a point-in-time check, not continuous monitoring.

Additional files: `lib/ai/types.ts`, `lib/ai/openai-compatible.ts`, `lib/ai/generate.ts`, `tests/free-policy.test.mjs`, `scripts/check-design-live.mjs`, `scripts/check-generated-preview.mjs`. The live test script requires an explicit HTTPS `TEST_ORIGIN`; optional `LIVE_RESULT_DIR` saves only the generated test site and non-secret result metadata. The generated-preview script consumes that directory. Fixture credentials remain in memory.
