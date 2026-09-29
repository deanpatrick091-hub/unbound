alter table public.council_opinions add column if not exists model text;
alter table public.council_opinions add column if not exists error_message text;
create table public.image_jobs (
 id uuid primary key,
 user_id uuid not null references public.profiles(id) on delete cascade,
 project_id uuid references public.projects(id) on delete cascade,
 prompt text not null check(length(prompt) between 1 and 2048),
 status text not null default 'pending' check(status in ('pending','complete','failed')),
 asset_id uuid references public.project_assets(id) on delete set null,
 created_at timestamptz not null default now()
);
alter table public.image_jobs enable row level security;
revoke all on public.image_jobs from public,anon,authenticated;
grant select,insert on public.image_jobs to authenticated;
grant update(status,asset_id) on public.image_jobs to authenticated;
create index image_jobs_user_recent on public.image_jobs(user_id,created_at desc);
create policy image_jobs_read on public.image_jobs for select to authenticated using(user_id=(select auth.uid()));
create policy image_jobs_insert on public.image_jobs for insert to authenticated with check(user_id=(select auth.uid()) and (project_id is null or private.project_role(project_id) in ('owner','editor')));
create policy image_jobs_update on public.image_jobs for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
-- A completion may be polled twice; store one image for each provider job.
alter table public.project_assets add column source_job_id uuid unique;

