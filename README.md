# UNBOUND

An AI workspace built on Next.js (App Router), Supabase, and the Google Gemini API.

- **Chat** — streaming conversations with persistent history, per-conversation model choice.
- **Council** — one question, four independent perspectives (Analyst, Skeptic, Optimist,
  Contrarian) run in parallel, then a Final Judge synthesises a verdict.
- **Builder** — describe a website, see it render live in a sandboxed preview, and refine it
  in conversation ("make the hero darker", "add an about section").
- **Accounts** — email/password auth, password reset, profile, preferences, usage view.

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · Lucide ·
`@google/genai` (server-only) · Supabase (`@supabase/ssr`, Postgres + RLS) · react-markdown.

## Getting started

1. Install dependencies

   ```bash
   npm install
   ```

2. Create `.env.local` from `.env.example` and fill in the values (see table below).

3. Apply the database schema (see **Database** below).

4. Run the dev server

   ```bash
   npm run dev
   ```

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `GEMINI_API_KEY` | Yes | Google Gemini. **Server-only**; never exposed to the browser. |
| `GEMINI_MODEL` | No | Default model as `provider:model` (default `gemini:gemini-3.6-flash`). |
| `GROQ_API_KEY` | No | Enables Groq. Models discovered live from `/models`. |
| `OPENROUTER_API_KEY` | No | Enables OpenRouter (curated `:free` models in `lib/ai/models.ts`). |
| `OPENROUTER_SITE_URL`, `OPENROUTER_APP_NAME` | No | Optional OpenRouter attribution headers. |
| `HF_TOKEN` | No | Enables Hugging Face Inference Providers (router). |
| `OLLAMA_BASE_URL` | No | Enables Ollama, e.g. `http://localhost:11434`; models discovered from `/api/tags`. |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL (public). |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | Supabase publishable key (public by design; RLS protects data). |

All provider keys are read only in `lib/ai/providers.ts` (`server-only`). The browser receives
model ids and labels, never keys. The Supabase **service-role** key is never used.

## AI providers

`lib/ai/` is the provider layer. Model ids are `provider:model` (bare ids are treated as
Gemini for backward compatibility). Gemini uses its native SDK; Groq, OpenRouter, Hugging
Face and Ollama share one OpenAI-compatible streaming client. The chat composer and Settings
show only providers whose keys are configured.

Model lists for **Groq, OpenRouter and Ollama are discovered live** from each provider's
model API (filtered to active, text-in/text-out chat models; OpenRouter to free-priced
models plus the `openrouter/free` router) and cached for five minutes, so no ids are
hard-coded for them. Gemini and Hugging Face use the curated `MODEL_CATALOG` in
`lib/ai/models.ts`. Provider errors (400/401/402/404/429/5xx) are surfaced to the user with
the provider's own reason attached.

## Database

Schema lives in `supabase/migrations/`. To apply it:

**Option A — SQL Editor (quickest):** Supabase Dashboard → SQL Editor → New query →
paste the contents of `supabase/migrations/20260914120000_initial_schema.sql` → Run.

**Option B — Supabase CLI (free):**

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Every table has Row Level Security enabled with policies scoped to `auth.uid()`.
Usage limits are enforced by the `consume_request()` Postgres function; the numbers
live in `lib/limits/config.ts`.

### Auth configuration (Supabase Dashboard → Authentication)

- **URL Configuration → Redirect URLs:** add `http://localhost:3000/**` (and your
  production origin later).
- **Email Templates** (recommended): point links at `/auth/confirm` with a token hash so
  they work from any device:
  - Confirm signup: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`
  - Reset password: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`

  The default `{{ .ConfirmationURL }}` templates also work, but only when the link is
  opened in the same browser that started the flow (PKCE).

## Project structure

```
app/
  (auth)/               login, signup, forgot-password, reset-password + Server Actions
  (app)/                authenticated shell: chat (/, /c/[id]), /council, /settings
  api/chat              streaming chat turn (NDJSON)
  api/council           Council orchestration (NDJSON)
  api/conversations     list / rename / delete
  auth/confirm          lands email links (confirmation + password reset)
components/
  shell/                sidebar, mobile drawer, shell context
  chat/, council/       screens and message rendering
  auth/, settings/      forms
hooks/                  use-chat, use-council (stream consumers)
lib/
  gemini/               server-only client, streaming adapter, model allowlist
  council/              server-only prompts, shared types/state
  data/                 RLS-scoped data access
  limits/               usage limits config + consume_request() wrapper
  supabase/             browser/server/proxy clients, DB types
proxy.ts                session refresh + auth boundary (Next 16 "proxy")
supabase/migrations/    schema
```

## Website builder sandbox

Generated sites (`lib/build/`) never run inside UNBOUND itself. The preview is an
`<iframe sandbox="allow-scripts allow-popups allow-forms allow-modals allow-popups-to-escape-sandbox">`
**without** `allow-same-origin`, so the page has an opaque origin (no cookies, no storage,
no credentialed requests), and every generated document carries a CSP with
`connect-src 'none'`, `frame-src 'none'`, `base-uri 'none'` and `form-action 'none'`
(scripts/styles only inline or from cdnjs, unpkg, jsDelivr, Tailwind CDN and Google Fonts).
"Open in new tab" posts the files to `/api/build/preview`, which serves them with a
`Content-Security-Policy: sandbox …` header — never a `blob:` URL, which would be same-origin.
The server only parses and forwards text; it never evaluates generated code. Work autosaves
to the browser's localStorage per user.

## Streaming protocol

Both `/api/chat` and `/api/council` respond with `application/x-ndjson` — one JSON
event per line. Errors after the 200 header (rate limits, safety blocks) arrive
in-band as `error` events. See `lib/chat/types.ts` and `lib/council/types.ts`.

## Scripts

- `npm run dev` — development server
- `npm run build` — production build (includes type-checking)
- `npm run lint` — ESLint
