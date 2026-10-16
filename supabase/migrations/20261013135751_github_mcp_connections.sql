-- Branch-only migration. Credential plaintext is never stored in Postgres.
create table public.github_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  connection_id uuid not null unique,
  credential_ciphertext text not null check (length(credential_ciphertext) between 50 and 24000),
  verified_at timestamptz not null default now(),
  refresh_lock_until timestamptz not null default '1970-01-01',
  refresh_lock_id uuid,
  created_at timestamptz not null default now()
);
create table public.github_oauth_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state_hash text not null check (state_hash ~ '^[a-f0-9]{64}$'),
  state_ciphertext text not null check (length(state_ciphertext) between 50 and 4000),
  claimed boolean not null default false,
  expires_at timestamptz not null
);
alter table public.github_connections enable row level security;
alter table public.github_oauth_states enable row level security;
revoke all on public.github_connections, public.github_oauth_states from public, anon;
grant select, insert, update, delete on public.github_connections, public.github_oauth_states to authenticated;
create policy github_connections_owner on public.github_connections for all to authenticated
  using ((select auth.uid()) = user_id and not coalesce((select auth.jwt()->>'is_anonymous')::boolean, true))
  with check ((select auth.uid()) = user_id and not coalesce((select auth.jwt()->>'is_anonymous')::boolean, true));
create policy github_oauth_states_owner on public.github_oauth_states for all to authenticated
  using ((select auth.uid()) = user_id and not coalesce((select auth.jwt()->>'is_anonymous')::boolean, true))
  with check ((select auth.uid()) = user_id and not coalesce((select auth.jwt()->>'is_anonymous')::boolean, true));

-- Invoker/RLS, not SECURITY DEFINER. Finalization cannot recreate a connection
-- after disconnect deletes the pending state. A replaced attempt cannot win.
create function public.complete_github_oauth(p_state_hash text, p_connection_id uuid, p_ciphertext text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.github_oauth_states
    where user_id = auth.uid() and state_hash = p_state_hash and claimed and expires_at > now()
    for update;
  if not found then raise exception 'OAuth attempt expired'; end if;
  insert into public.github_connections(user_id, connection_id, credential_ciphertext)
    values (auth.uid(), p_connection_id, p_ciphertext)
    on conflict(user_id) do update set connection_id = excluded.connection_id,
      credential_ciphertext = excluded.credential_ciphertext, verified_at = now(),
      refresh_lock_until = '1970-01-01', refresh_lock_id = null;
  delete from public.github_oauth_states where user_id = auth.uid() and state_hash = p_state_hash;
end;
$$;
revoke all on function public.complete_github_oauth(text, uuid, text) from public, anon;
grant execute on function public.complete_github_oauth(text, uuid, text) to authenticated;
