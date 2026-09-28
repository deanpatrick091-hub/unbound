# Workspace configuration

UNBOUND creates a private anonymous Supabase session for each new browser.
The middleware must create that session before the workspace can render.

## Production requirements

- `NEXT_PUBLIC_SUPABASE_URL`: the project's HTTPS origin, without `/auth/v1` or other paths.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: an enabled public publishable key from that same project. Never use a secret key, service-role key, or user access token.
- Enable anonymous sign-ins in that project's Auth settings.
- Apply the SQL files in `supabase/migrations` in order. New users receive profile and preference rows through the signup trigger. Keep ownership RLS policies enabled.
- Set the Auth Site URL to `https://unbound-lilac.vercel.app`, rather than localhost. Any future email/OAuth flow also needs an explicitly allowed production callback URL and a matching application route.
- Rebuild the production deployment after changing `NEXT_PUBLIC_` variables; Next.js embeds these values during the build.

## Diagnosing a failure

An HTTP 200 response alone is not a passing health check: the layout can render
"Workspace unavailable" with that status. Open the workspace in a fresh browser,
confirm that the app loads, reload it to confirm the session persists, and check
Vercel middleware logs alongside Supabase Auth logs.

`Invalid API key` means the API gateway rejected the configured credential.
`Anonymous sign-ins are disabled` means the key reached Auth but anonymous
session creation is turned off. Missing database tables are a separate problem
that breaks workspace storage after authentication is restored.

Use only public configuration when diagnosing these errors. Do not log keys,
cookies, session tokens, or authorization headers.

The migration timestamps in this repository match Veerock's migration history.
No AI-provider changes are required for this workspace repair.
