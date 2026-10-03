create table public.integration_jobs (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 provider text not null check(provider in ('aihorde','assemblyai')),
 remote_id text not null check(length(remote_id) between 1 and 100),
 input text not null default '' check(length(input)<=4000),
 result jsonb,
 created_at timestamptz not null default now()
);
alter table public.integration_jobs enable row level security;
revoke all on public.integration_jobs from public,anon,authenticated;
grant select,insert on public.integration_jobs to authenticated;
grant update(result) on public.integration_jobs to authenticated;
create index integration_jobs_user_recent on public.integration_jobs(user_id,created_at desc);
create policy integration_jobs_read on public.integration_jobs for select to authenticated using(user_id=(select auth.uid()));
create policy integration_jobs_insert on public.integration_jobs for insert to authenticated with check(user_id=(select auth.uid()));
create policy integration_jobs_update on public.integration_jobs for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
-- Event trigger is internal administration, not a client RPC.
revoke execute on function public.rls_auto_enable() from public,anon,authenticated;

