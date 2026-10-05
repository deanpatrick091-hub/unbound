-- No passwords, emails, tokens, or username mappings are stored here.
-- Only hashed rate-limit buckets; callable exclusively by the auth backend.
create table private.username_auth_attempts (
 bucket text primary key check(bucket ~ '^[a-f0-9]{64}$'),
 attempts integer not null check(attempts > 0),
 started_at timestamptz not null default now()
);
create index username_auth_attempts_expiry on private.username_auth_attempts(started_at);
alter table private.username_auth_attempts enable row level security;
revoke all on private.username_auth_attempts from public, anon, authenticated;
grant usage on schema private to service_role;
grant select,insert,update,delete on private.username_auth_attempts to service_role;
create function public.consume_auth_attempt(p_key text,p_limit integer,p_seconds integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare used integer;
begin
 if p_key !~ '^[a-f0-9]{64}$' or p_limit not between 1 and 100 or p_seconds not between 60 and 3600 then
  raise exception 'Invalid authentication limit.' using errcode='22023';
 end if;
 insert into private.username_auth_attempts as a(bucket,attempts,started_at)
 values(p_key,1,now()) on conflict(bucket) do update set
 attempts=case when a.started_at < now()-make_interval(secs=>p_seconds) then 1 else least(a.attempts+1,101) end,
 started_at=case when a.started_at < now()-make_interval(secs=>p_seconds) then now() else a.started_at end
 returning attempts into used;
 delete from private.username_auth_attempts where bucket in
 (select bucket from private.username_auth_attempts where started_at < now()-interval '1 day' limit 500);
 return used<=p_limit;
end $$;
revoke all on function public.consume_auth_attempt(text,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_auth_attempt(text,integer,integer) to service_role;
