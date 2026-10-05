create table public.video_jobs (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 project_id uuid references public.projects(id) on delete set null,
 prompt text not null check(length(prompt) between 1 and 4000),
 aspect_ratio text not null check(aspect_ratio in ('16:9','9:16')),
 status text not null default 'queued' check(status in ('queued','running','complete','failed','cancelled')),
 provider text not null default 'huggingface', model text,
 storage_path text, error text,
 created_at timestamptz not null default now(), hidden_at timestamptz
);
create unique index video_jobs_one_active on public.video_jobs(owner_id) where status in ('queued','running');
create index video_jobs_owner_recent on public.video_jobs(owner_id,created_at desc);
create index video_jobs_project on public.video_jobs(project_id) where project_id is not null;
alter table public.video_jobs enable row level security;
revoke all on public.video_jobs from public,anon,authenticated;
grant select,insert on public.video_jobs to authenticated;
grant update(status,storage_path,error,model,project_id,hidden_at) on public.video_jobs to authenticated;
create policy video_read on public.video_jobs for select to authenticated using(owner_id=(select auth.uid()) or private.project_role(project_id) is not null);
create policy video_create on public.video_jobs for insert to authenticated with check(owner_id=(select auth.uid()) and (project_id is null or private.project_role(project_id) in ('owner','editor')) and storage_path is null);
create policy video_update on public.video_jobs for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()) and (project_id is null or private.project_role(project_id) in ('owner','editor')) and (storage_path is null or storage_path=owner_id::text||'/'||id::text||'.mp4'));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('generated-videos','generated-videos',false,25165824,array['video/mp4']);
create policy video_object_read on storage.objects for select to authenticated using(bucket_id='generated-videos' and exists(select 1 from public.video_jobs v where v.storage_path=name));
create policy video_object_create on storage.objects for insert to authenticated with check(bucket_id='generated-videos' and (storage.foldername(name))[1]=(select auth.uid())::text and exists(select 1 from public.video_jobs v where v.owner_id=(select auth.uid()) and name=v.owner_id::text||'/'||v.id::text||'.mp4' and v.status='running'));
