# Validation and deployment status

Checked on 26 September 2026. This file describes the updated source, not a deployed release.

## Automated checks

- Next.js production build: passed.
- TypeScript: passed as part of the build.
- 13 regression tests: passed. Cover zero-price policy, paid/unsupported model rejection, safe auth origins and next paths, SSE completion/format handling, structured text, truncation and exhausted free allowances, cancellation and no retry after partial output.
- 11 HTTP checks: passed. Login/signup/reset pages render; private routes redirect; chat, Council, builder, model and image APIs reject anonymous requests; an invalid confirmation link cannot redirect to an external origin.
- No user accounts or API-provider accounts created. No database records/schema changed during these checks.

## Real provider responses

See `model-audit.json` for exact models, outcomes and prior attempts. The audit tested models individually, without automatic fallback, using the actual app adapters.

- 20 model choices tested across OpenRouter and Google's free-only Gemma routes.
- 13 returned a completed, nonempty response.
- 3 remained temporarily rate-limited by OpenRouter after a recheck.
- 1 repeatedly timed out waiting for the provider.
- 1 Gemini route returned upstream server errors.
- 2 Inkling routes returned access-policy 403 errors and were removed from selection.

The five transiently failing routes remain eligible free models, with runtime health indicators and a bounded same-provider fallback. Their provider capacity cannot be repaired by changing this app. OpenRouter's default free router returned a valid reply. A model that passed once may still hit future free-tier limits.

Groq and Google catalog authentication succeeded in read-only checks. Gemini Flash and Groq inference were not called because their account billing tiers have not been verified. Cloudflare, Mistral, Hugging Face and Z.ai have no configured/verified credentials here. Their integrations are implemented but no claim of live inference success is made. Hugging Face's public model discovery endpoint returned HTTP 200 and advertised 138 live text-output models before this app's filtering.

## UI checks and limits

Glass layouts, responsive classes, keyboard labels, reduced-motion/transparency styles, light/dark persistence, and local wallpaper handling were reviewed in source. Public auth pages render successfully in the HTTP check. Interactive visual and mobile browser QA could not run: the available preview launcher passes Vite-specific arguments that the existing Next.js app does not accept. The app was not migrated to another framework to work around that environment limitation. Wallpaper upload and theme interaction still need a browser check after deployment.

## Still required for the live site

1. Publish these files to the existing Vercel project. No deployment was performed in this session.
2. Set Production `SITE_URL=https://unbound-lilac.vercel.app` and verify Supabase Site URL and exact confirmation/reset redirects. The Supabase dashboard requires an authenticated session; its live settings were not changed.
3. Verify/configure production SMTP. Without custom SMTP, Supabase restricts its default sender to project-team email addresses. Do not claim arbitrary public signup works until a fresh non-team signup and password-reset email are tested.
4. Verify existing provider account plans before enabling their free-tier confirmation flags. Connect optional keys from accounts owned by you, following `FREE-PROVIDERS.md`.
5. In the published app, verify desktop/mobile layouts, light/dark persistence, wallpaper upload/removal, chat streaming/stop, Council and builder preview with an authenticated account.

The archive excludes private environment files and generated dependencies/build caches. Existing credentials must remain in your Vercel environment or your own private .env.local.
