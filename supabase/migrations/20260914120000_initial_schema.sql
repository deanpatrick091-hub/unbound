-- ============================================================================
-- UNBOUND — initial schema
--
-- Tables:   profiles, user_preferences, conversations, messages,
--           council_sessions, council_opinions, usage, request_log
-- Security: RLS enabled on every table. Every policy is scoped to
--           (select auth.uid()) so a user can only ever touch their own rows.
--           Nothing here grants cross-user access.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles  (1:1 with auth.users)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text,
  display_name  text check (display_name is null or char_length(display_name) between 1 and 80),
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy "profiles: select own"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "profiles: insert own"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);

create policy "profiles: update own"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- No delete policy: profiles are removed via the auth.users cascade only.

-- ---------------------------------------------------------------------------
-- user_preferences  (1:1 with auth.users)
-- ---------------------------------------------------------------------------

create table public.user_preferences (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  default_model  text not null default 'gemini-3.6-flash',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger user_preferences_set_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

alter table public.user_preferences enable row level security;

create policy "user_preferences: select own"
  on public.user_preferences for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "user_preferences: insert own"
  on public.user_preferences for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "user_preferences: update own"
  on public.user_preferences for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Auto-provision profile + preferences when a user signs up
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- conversations
-- ---------------------------------------------------------------------------

create table public.conversations (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  title            text not null default 'New chat' check (char_length(title) between 1 and 120),
  model            text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  last_message_at  timestamptz
);

create index conversations_user_recent_idx
  on public.conversations (user_id, updated_at desc);

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

alter table public.conversations enable row level security;

create policy "conversations: select own"
  on public.conversations for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "conversations: insert own"
  on public.conversations for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "conversations: update own"
  on public.conversations for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "conversations: delete own"
  on public.conversations for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------

create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  role             text not null check (role in ('user', 'assistant')),
  content          text not null,
  model            text,
  status           text not null default 'complete' check (status in ('complete', 'error', 'cancelled')),
  created_at       timestamptz not null default now()
);

create index messages_conversation_order_idx
  on public.messages (conversation_id, created_at);

create index messages_user_idx
  on public.messages (user_id);

alter table public.messages enable row level security;

create policy "messages: select own"
  on public.messages for select to authenticated
  using ((select auth.uid()) = user_id);

-- Insert requires BOTH: the row is stamped with my id AND the parent
-- conversation is mine. This blocks writing into someone else's thread even
-- if they somehow learn its UUID.
create policy "messages: insert own into own conversation"
  on public.messages for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())
    )
  );

create policy "messages: update own"
  on public.messages for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "messages: delete own"
  on public.messages for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Keep the parent conversation's recency in sync (runs as the invoking user,
-- so RLS on conversations still applies).
create or replace function public.touch_conversation_on_message()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.conversations
     set last_message_at = new.created_at,
         updated_at      = now()
   where id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation_on_message();

-- ---------------------------------------------------------------------------
-- council_sessions / council_opinions  (AI Council history)
-- ---------------------------------------------------------------------------

create table public.council_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 120),
  question      text not null check (char_length(question) between 1 and 8000),
  model         text not null,
  status        text not null default 'running' check (status in ('running', 'complete', 'error', 'cancelled')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  completed_at  timestamptz
);

create index council_sessions_user_recent_idx
  on public.council_sessions (user_id, created_at desc);

create trigger council_sessions_set_updated_at
  before update on public.council_sessions
  for each row execute function public.set_updated_at();

alter table public.council_sessions enable row level security;

create policy "council_sessions: select own"
  on public.council_sessions for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "council_sessions: insert own"
  on public.council_sessions for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "council_sessions: update own"
  on public.council_sessions for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "council_sessions: delete own"
  on public.council_sessions for delete to authenticated
  using ((select auth.uid()) = user_id);

create table public.council_opinions (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.council_sessions (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null check (role in ('analyst', 'skeptic', 'optimist', 'contrarian', 'judge')),
  content     text not null default '',
  status      text not null default 'complete' check (status in ('complete', 'error', 'cancelled')),
  created_at  timestamptz not null default now(),
  unique (session_id, role)
);

create index council_opinions_session_idx
  on public.council_opinions (session_id);

alter table public.council_opinions enable row level security;

create policy "council_opinions: select own"
  on public.council_opinions for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "council_opinions: insert own into own session"
  on public.council_opinions for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.council_sessions s
      where s.id = session_id and s.user_id = (select auth.uid())
    )
  );

create policy "council_opinions: update own"
  on public.council_opinions for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "council_opinions: delete own"
  on public.council_opinions for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- usage  (append-only ledger: one row per model call)
-- ---------------------------------------------------------------------------

create table public.usage (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  feature             text not null check (feature in ('chat', 'council', 'build')),
  conversation_id     uuid references public.conversations (id) on delete set null,
  council_session_id  uuid references public.council_sessions (id) on delete set null,
  model               text not null,
  prompt_tokens       integer not null default 0 check (prompt_tokens >= 0),
  completion_tokens   integer not null default 0 check (completion_tokens >= 0),
  total_tokens        integer not null default 0 check (total_tokens >= 0),
  created_at          timestamptz not null default now()
);

create index usage_user_time_idx
  on public.usage (user_id, created_at desc);

alter table public.usage enable row level security;

create policy "usage: select own"
  on public.usage for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "usage: insert own"
  on public.usage for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- No update/delete policies: the ledger is immutable from the app.

-- ---------------------------------------------------------------------------
-- request_log + consume_request()  (server-side usage protection)
--
-- The app never inserts into request_log directly. It calls consume_request(),
-- which atomically checks the caller's per-minute / daily / monthly budgets
-- (request units AND tokens) and records the request only if allowed.
-- The limits are parameters so they live in application config, not SQL.
-- ---------------------------------------------------------------------------

create table public.request_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  feature     text not null,
  units       integer not null default 1 check (units > 0),
  created_at  timestamptz not null default now()
);

create index request_log_user_time_idx
  on public.request_log (user_id, created_at desc);

alter table public.request_log enable row level security;

create policy "request_log: select own"
  on public.request_log for select to authenticated
  using ((select auth.uid()) = user_id);

-- No insert/update/delete policies: writes happen only inside consume_request().

create or replace function public.consume_request(
  p_feature           text,
  p_units             integer,
  p_per_minute        integer,
  p_per_day           integer,
  p_per_month         integer,
  p_tokens_per_day    bigint,
  p_tokens_per_month  bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user            uuid := auth.uid();
  v_day_start       timestamptz := date_trunc('day',   now());
  v_month_start     timestamptz := date_trunc('month', now());
  v_minute_units    bigint;
  v_day_units       bigint;
  v_month_units     bigint;
  v_day_tokens      bigint;
  v_month_tokens    bigint;
  v_oldest_in_min   timestamptz;
begin
  if v_user is null then
    raise exception 'consume_request: not authenticated' using errcode = '42501';
  end if;

  if p_units is null or p_units < 1 then
    raise exception 'consume_request: units must be >= 1' using errcode = '22023';
  end if;

  -- Serialise concurrent requests from the same user so parallel calls
  -- cannot slip past the limits together.
  perform pg_advisory_xact_lock(hashtext(v_user::text));

  select coalesce(sum(units), 0), min(created_at)
    into v_minute_units, v_oldest_in_min
    from public.request_log
   where user_id = v_user and created_at > now() - interval '1 minute';

  select coalesce(sum(units), 0) into v_day_units
    from public.request_log
   where user_id = v_user and created_at >= v_day_start;

  select coalesce(sum(units), 0) into v_month_units
    from public.request_log
   where user_id = v_user and created_at >= v_month_start;

  select coalesce(sum(total_tokens), 0) into v_day_tokens
    from public.usage
   where user_id = v_user and created_at >= v_day_start;

  select coalesce(sum(total_tokens), 0) into v_month_tokens
    from public.usage
   where user_id = v_user and created_at >= v_month_start;

  if v_minute_units + p_units > p_per_minute then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'rate_limited',
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_oldest_in_min + interval '1 minute' - now())))::int)
    );
  end if;

  if v_day_units + p_units > p_per_day then
    return jsonb_build_object('allowed', false, 'reason', 'daily_limit',
      'resets_at', v_day_start + interval '1 day');
  end if;

  if v_month_units + p_units > p_per_month then
    return jsonb_build_object('allowed', false, 'reason', 'monthly_limit',
      'resets_at', v_month_start + interval '1 month');
  end if;

  if v_day_tokens >= p_tokens_per_day then
    return jsonb_build_object('allowed', false, 'reason', 'daily_token_limit',
      'resets_at', v_day_start + interval '1 day');
  end if;

  if v_month_tokens >= p_tokens_per_month then
    return jsonb_build_object('allowed', false, 'reason', 'monthly_token_limit',
      'resets_at', v_month_start + interval '1 month');
  end if;

  insert into public.request_log (user_id, feature, units)
  values (v_user, p_feature, p_units);

  return jsonb_build_object(
    'allowed', true,
    'day_units',    v_day_units + p_units,
    'month_units',  v_month_units + p_units,
    'day_tokens',   v_day_tokens,
    'month_tokens', v_month_tokens
  );
end;
$$;

revoke all on function public.consume_request(text, integer, integer, integer, integer, bigint, bigint) from public;
revoke all on function public.consume_request(text, integer, integer, integer, integer, bigint, bigint) from anon;
grant execute on function public.consume_request(text, integer, integer, integer, integer, bigint, bigint) to authenticated;

-- Read-only usage summary for the settings page (same windows as above).
create or replace function public.usage_summary()
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'day_units',    (select coalesce(sum(units), 0) from public.request_log
                      where user_id = auth.uid() and created_at >= date_trunc('day', now())),
    'month_units',  (select coalesce(sum(units), 0) from public.request_log
                      where user_id = auth.uid() and created_at >= date_trunc('month', now())),
    'day_tokens',   (select coalesce(sum(total_tokens), 0) from public.usage
                      where user_id = auth.uid() and created_at >= date_trunc('day', now())),
    'month_tokens', (select coalesce(sum(total_tokens), 0) from public.usage
                      where user_id = auth.uid() and created_at >= date_trunc('month', now()))
  );
$$;

revoke all on function public.usage_summary() from public;
revoke all on function public.usage_summary() from anon;
grant execute on function public.usage_summary() to authenticated;
