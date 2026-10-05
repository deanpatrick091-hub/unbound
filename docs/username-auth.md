# Username authentication

The website uses `USERNAME_AUTH_ENABLED=true` after the `username-auth` Supabase Edge Function and the auth-throttle migration are deployed. No Supabase privileged key is needed in Vercel. The function reads Supabase's built-in secret environment variables, verifies each caller through `auth.getUser`, and never returns privileged keys.

- New visitors choose a unique normalized username and a password of 10–128 characters.
- A guest is upgraded in place with an opaque random Auth email identity. Its user ID, projects and chats remain intact.
- Existing email accounts retain their identities and can sign in with email until they choose a username. Username lookup and Auth email resolution happen only in the backend.
- `user_handles.username` has the existing unique constraint, format constraint, reserved-name trigger, RLS, and seven-day rename safeguard. No duplicate username registry is introduced.
- Auth handles password hashing. The application does not store passwords.
- The website route accepts same-origin POSTs, verifies the current session, delegates to the function, and writes returned user sessions into Supabase SSR cookies. Its JSON response contains no session tokens.
- `verify_jwt=false` allows modern Supabase signing keys. It does not disable caller authentication: the function explicitly verifies every bearer token against Auth before any identity lookup or mutation.
- The new `private.username_auth_attempts` table stores hashed throttle buckets only. Its RPC is `SECURITY INVOKER`, executable exclusively by `service_role`. Public and authenticated clients cannot change counters.
- Existing application data continues to use user-scoped clients and RLS. Privileged access is confined to the authentication function.

## Verification

Live API tests passed for guest upgrade preserving user ID, existing project access, duplicate username rejection, wrong-password rejection, fresh-session username login, outsider project isolation, and client inability to modify authentication throttles. The SQL throttle denied a second attempt with a one-attempt allowance in a rolled-back transaction. Automated validation tests cover username normalization, reserved/invalid names and password bounds.

## Known limitation

Username-only accounts have no email inbox and currently have no password recovery. The signup screen explicitly communicates this. Adding recovery codes or a verified optional recovery email requires a separate tested flow; do not silently mark opaque internal identities as usable recovery addresses.
