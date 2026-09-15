# UNBOUND

An AI workspace built on Next.js (App Router), Supabase, and the Google Gemini API.

- **Chat** — streaming conversations with persistent history, per-conversation model choice.
- **Council** — one question, four independent perspectives (Analyst, Skeptic, Optimist,
  Contrarian) run in parallel, then a Final Judge synthesises a verdict.
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
| `GEMINI_API_KEY` | Yes | Gemini API key. **Server-only**; never exposed to the browser. |
| `GEMINI_MODEL` | No | Overrides the default model (must be on the allowlist in `lib/gemini/models.ts`). |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL (public). |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | Supabase publishable key (public by design; RLS protects data). |

The Supabase **service-role** key is never used anywhere in this project.

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

## Streaming protocol

Both `/api/chat` and `/api/council` respond with `application/x-ndjson` — one JSON
event per line. Errors after the 200 header (rate limits, safety blocks) arrive
in-band as `error` events. See `lib/chat/types.ts` and `lib/council/types.ts`.

## Scripts

- `npm run dev` — development server
- `npm run build` — production build (includes type-checking)
- `npm run lint` — ESLint
