# Unbound AI

Next.js chat, Council, website builder and free-provider model library.
This update targets the existing Vercel site: https://unbound-lilac.vercel.app.

## What changed

- Frosted glass login, workspace, sidebar, chat and model tiles.
- Persistent light/dark control; per-account local wallpaper upload, presets and dimming.
- Searchable models grouped into provider folders; eight supported connections.
- Server-enforced free model discovery, zero-price OpenRouter routing, bounded timeouts, explicit partial-stream errors and same-provider fallback before output begins.
- Removed Puter image calls and Cerebras trials. Removed two OpenRouter models that refuse general chat apps.
- Optional Cloudflare FLUX image generation behind a verified Workers Free connection.
- Signup and password-reset links use a configured production origin; refresh cookies survive auth redirects.

## Run on your computer

Use Node.js 22.15+ or 24 LTS. In this folder:

```sh
npm ci
```

Copy `.env.example` to `.env.local` and insert your existing credentials. This archive intentionally contains no private API keys. On Windows, use `npm.cmd` if PowerShell blocks `npm` scripts.

```sh
npm run dev
```

The dev server prints its own address. Email links always use the published HTTPS origin
(`SITE_URL` / `NEXT_PUBLIC_SITE_URL`, defaulting to `https://unbound-lilac.vercel.app`) in
every environment — a localhost value is rejected, since such a link is broken for whoever
receives the email. To exercise a confirmation or reset link locally, open the link from the
email and let it land on the deployed site.

## Publish the update

1. Replace the source in your existing Unbound repository/project with this folder's contents. Preserve your own local `.env.local` privately. Do not upload node_modules or .next.
2. In the existing Vercel project, retain the Supabase and provider environment variables. Add `SITE_URL=https://unbound-lilac.vercel.app` to Production.
3. Add optional provider keys only from accounts you own. Read `FREE-PROVIDERS.md` before changing a confirmation flag to `true`.
4. Deploy this source to the existing Vercel project. A local build or this ZIP does not change the live website.
5. Complete the Supabase settings below, then test a fresh signup and reset email against the published site.

## Supabase signup: required dashboard settings

Open the matching project's Authentication → URL Configuration.

- Site URL: `https://unbound-lilac.vercel.app`
- Add redirect URL: `https://unbound-lilac.vercel.app/auth/confirm`
- Add reset redirect URL: `https://unbound-lilac.vercel.app/auth/confirm?next=/reset-password`
- Preserve other intentionally used origins. Avoid broad production wildcards.

In Authentication → Emails, the token-hash templates below work across browsers and devices. The callback also supports the default PKCE `code` flow; that flow normally needs the browser where signup began.

Signup confirmation link:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Confirm your email</a>
```

Password reset link:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password">Reset your password</a>
```

Public email signup also needs a configured SMTP provider. Supabase's default email sender only delivers to project-team addresses and is not a public production mail service. Keep email verification enabled. Use your own verified sending domain and a free SMTP allowance if required; no SMTP account was created or configured by this update.

Existing database migrations are in `supabase/migrations`. Image creation shares the existing build/creation request budget and refuses requests when that budget check is unavailable. No new database migration is required for the appearance or model changes. Do not blindly rerun migrations already applied to your project.

## Verify

```sh
npm test
npm run build
npm run check:models
```

The first two commands do not generate AI responses. The explicit model audit consumes the connected providers' free allowances; it uses harmless test prompts and no paid routing. Review `reports/model-audit.json`. To recheck only failed/new models:

```sh
npm run check:models -- --retry-failed
```

A successful model test confirms one response at the recorded time, not guaranteed future uptime. Free quotas are shared by all visitors using a provider key. See `reports/validation.md` for the checks and remaining limitations of this delivery.

## Privacy and behavior

- Provider secrets remain server-side. Visitors cannot submit arbitrary paid model IDs.
- Selected-provider prompts go to that provider. Fallback stays with that provider and is announced in the chat.
- Wallpapers remain in this browser's storage, keyed by account; they are not sent to AI providers or synced to other devices.
- New provider accounts, API keys, paid plans and subscriptions are never created automatically.

## Official references

- Supabase redirects: https://supabase.com/docs/guides/auth/redirect-urls
- Supabase SMTP: https://supabase.com/docs/guides/auth/auth-smtp
- Provider pricing and configuration: `FREE-PROVIDERS.md`
