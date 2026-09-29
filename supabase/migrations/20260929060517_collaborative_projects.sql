-- Additive platform upgrade. Existing profiles/chats and their RLS remain intact.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- Public identity is deliberately separate from the private profile/email row.
create table public.user_handles (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 username text not null unique check (username ~ '^[a-z][a-z0-9_]{2,29}$'),
 display_name text not null check (char_length(display_name) between 1 and 80),
 avatar_url text,
 changed_at timestamptz not null default now()
);
alter table public.user_handles enable row level security;
create policy handles_read on public.user_handles for select to authenticated using (auth.uid() is not null);
create policy handles_create on public.user_handles for insert to authenticated with check (user_id=(select auth.uid()));
create policy handles_update on public.user_handles for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
grant select,insert on public.user_handles to authenticated;
grant update(username,display_name,avatar_url) on public.user_handles to authenticated;
create function private.guard_handle() returns trigger language plpgsql set search_path='' as $$
begin
 if new.username in ('admin','administrator','support','unbound','system','moderator') then raise exception 'This username is reserved.' using errcode='22023'; end if;
 if tg_op='INSERT' then new.changed_at=now(); end if;
 if tg_op='UPDATE' and new.username<>old.username then
  if old.changed_at>now()-interval '7 days' then raise exception 'You can change your username once every seven days.' using errcode='22023'; end if;
  new.changed_at=now();
 end if;
 return new;
end $$;
create trigger handles_guard before insert or update on public.user_handles for each row execute function private.guard_handle();

create table public.projects (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 name text not null default 'Untitled website' check (char_length(name) between 1 and 120),
 model text not null, conversation jsonb not null default '[]' check(jsonb_typeof(conversation)='array'),
 settings jsonb not null default '{}', preview_state jsonb not null default '{}',
 revision integer not null default 0 check(revision>=0),
 updated_by uuid references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted_at timestamptz
);
create index projects_owner_recent on public.projects(owner_id,updated_at desc);
create table public.project_members (
 project_id uuid not null references public.projects(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check(role in ('editor','viewer')), created_at timestamptz not null default now(),
 primary key(project_id,user_id)
);
create index members_user on public.project_members(user_id,project_id);
create table public.project_invites (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 inviter_id uuid not null references auth.users(id), invitee_id uuid not null references auth.users(id),
 role text not null check(role in ('editor','viewer')),
 status text not null default 'pending' check(status in ('pending','accepted','declined','revoked')),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '7 days',
 check(inviter_id<>invitee_id)
);
create unique index invites_pending_unique on public.project_invites(project_id,invitee_id) where status='pending';
create index invites_recipient on public.project_invites(invitee_id,status);
create index invites_sender on public.project_invites(inviter_id);

-- Narrow, non-exposed lookup avoids recursive project/member policies.
create function private.project_role(p_id uuid) returns text language sql stable security definer set search_path='' as $$
 select case when p.owner_id=auth.uid() then 'owner' else m.role end
 from public.projects p left join public.project_members m on m.project_id=p.id and m.user_id=auth.uid()
 where p.id=p_id and auth.uid() is not null;
$$;
revoke all on function private.project_role(uuid) from public,anon;
grant execute on function private.project_role(uuid) to authenticated;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_invites enable row level security;
create policy projects_read on public.projects for select to authenticated using(private.project_role(id) is not null);
create policy projects_create on public.projects for insert to authenticated with check(owner_id=(select auth.uid()) and (updated_by is null or updated_by=(select auth.uid())));
create policy projects_edit on public.projects for update to authenticated using(private.project_role(id) in ('owner','editor')) with check(private.project_role(id) in ('owner','editor') and updated_by=(select auth.uid()));
grant select,insert on public.projects to authenticated;
grant update(name,model,conversation,settings,preview_state,revision,updated_by,updated_at,deleted_at) on public.projects to authenticated;
create function private.guard_project() returns trigger language plpgsql set search_path='' as $$
begin
 if new.owner_id<>old.owner_id then raise exception 'Ownership cannot be reassigned.' using errcode='42501'; end if;
 if new.deleted_at is distinct from old.deleted_at and old.owner_id<>auth.uid() then raise exception 'Only the owner can delete or restore a project.' using errcode='42501'; end if;
 new.updated_at=now(); return new;
end $$;
create trigger projects_guard before update on public.projects for each row execute function private.guard_project();
create policy members_read on public.project_members for select to authenticated using(private.project_role(project_id) is not null);
create policy members_owner_insert on public.project_members for insert to authenticated with check(private.project_role(project_id)='owner' or (user_id=(select auth.uid()) and exists(select 1 from public.project_invites i where i.project_id=project_members.project_id and i.invitee_id=auth.uid() and i.role=project_members.role and i.status='pending' and i.expires_at>now())));
create policy members_owner_edit on public.project_members for update to authenticated using(private.project_role(project_id)='owner') with check(private.project_role(project_id)='owner');
create policy members_remove on public.project_members for delete to authenticated using(private.project_role(project_id)='owner' or user_id=(select auth.uid()));
grant select,insert,delete on public.project_members to authenticated;
grant update(role) on public.project_members to authenticated;
create policy invites_read on public.project_invites for select to authenticated using(invitee_id=(select auth.uid()) or private.project_role(project_id)='owner');
create policy invites_create on public.project_invites for insert to authenticated with check(private.project_role(project_id)='owner' and inviter_id=(select auth.uid()) and status='pending');
create policy invites_respond on public.project_invites for update to authenticated using(invitee_id=(select auth.uid()) or private.project_role(project_id)='owner') with check(invitee_id=(select auth.uid()) or private.project_role(project_id)='owner');
grant select,insert on public.project_invites to authenticated;
grant update(status) on public.project_invites to authenticated;

create table public.project_files (
 project_id uuid not null references public.projects(id) on delete cascade,
 path text not null check(path in ('index.html','styles.css','script.js')),
 content text not null check(octet_length(content)<=400000),
 updated_by uuid not null references auth.users(id), updated_at timestamptz not null default now(),
 primary key(project_id,path)
);
create table public.project_versions (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 revision integer not null, files jsonb not null, conversation jsonb not null,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 unique(project_id,revision)
);
create index versions_author on public.project_versions(created_by);
create table public.project_assets (
 id uuid primary key default gen_random_uuid(), project_id uuid references public.projects(id) on delete cascade,
 owner_id uuid not null references auth.users(id), prompt text not null, provider text not null,
 mime_type text not null check(mime_type in ('image/png','image/jpeg','image/webp')),
 data_url text not null check(octet_length(data_url)<=6000000), created_at timestamptz not null default now()
);
create index assets_project on public.project_assets(project_id,created_at desc);
create index assets_owner on public.project_assets(owner_id,created_at desc);
create table public.pins (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('chat','project','website')),
 conversation_id uuid references public.conversations(id) on delete cascade,
 project_id uuid references public.projects(id) on delete cascade,
 created_at timestamptz not null default now(),
 check((kind='chat' and conversation_id is not null and project_id is null) or (kind in ('project','website') and project_id is not null and conversation_id is null))
);
create unique index pins_chat on public.pins(user_id,conversation_id) where kind='chat';
create unique index pins_project on public.pins(user_id,project_id,kind) where project_id is not null;
create index pins_user_recent on public.pins(user_id,created_at desc);

alter table public.project_files enable row level security;
alter table public.project_versions enable row level security;
alter table public.project_assets enable row level security;
alter table public.pins enable row level security;
create policy files_read on public.project_files for select to authenticated using(private.project_role(project_id) is not null);
create policy files_create on public.project_files for insert to authenticated with check(private.project_role(project_id) in ('owner','editor') and updated_by=(select auth.uid()));
create policy files_edit on public.project_files for update to authenticated using(private.project_role(project_id) in ('owner','editor')) with check(private.project_role(project_id) in ('owner','editor') and updated_by=(select auth.uid()));
create policy files_delete on public.project_files for delete to authenticated using(private.project_role(project_id) in ('owner','editor'));
create policy versions_read on public.project_versions for select to authenticated using(private.project_role(project_id) is not null);
create policy versions_create on public.project_versions for insert to authenticated with check(private.project_role(project_id) in ('owner','editor') and created_by=(select auth.uid()));
create policy assets_read on public.project_assets for select to authenticated using((project_id is null and owner_id=(select auth.uid())) or private.project_role(project_id) is not null);
create policy assets_create on public.project_assets for insert to authenticated with check(owner_id=(select auth.uid()) and (project_id is null or private.project_role(project_id) in ('owner','editor')));
create policy pins_read on public.pins for select to authenticated using(user_id=(select auth.uid()) and ((kind='chat' and exists(select 1 from public.conversations c where c.id=conversation_id)) or private.project_role(project_id) is not null));
create policy pins_create on public.pins for insert to authenticated with check(user_id=(select auth.uid()) and ((kind='chat' and exists(select 1 from public.conversations c where c.id=conversation_id and c.user_id=auth.uid())) or private.project_role(project_id) is not null));
create policy pins_remove on public.pins for delete to authenticated using(user_id=(select auth.uid()));
grant select,insert,update,delete on public.project_files to authenticated;
grant select,insert on public.project_versions,public.project_assets to authenticated;
grant select,insert,delete on public.pins to authenticated;

-- One transaction + optimistic revision locking prevents lost concurrent edits.
create function public.save_project(p_id uuid,p_revision integer,p_files jsonb,p_conversation jsonb,p_model text,p_settings jsonb default '{}',p_preview jsonb default '{}') returns integer language plpgsql security invoker set search_path='' as $$
declare v_revision integer; item record;
begin
 if auth.uid() is null or private.project_role(p_id) not in ('owner','editor') then raise exception 'Project is read-only.' using errcode='42501'; end if;
 if jsonb_typeof(p_files)<>'object' or octet_length(p_files::text)>400000 or jsonb_typeof(p_conversation)<>'array' or octet_length(p_conversation::text)>1000000 then raise exception 'Project data is too large or invalid.' using errcode='22023'; end if;
 update public.projects set revision=revision+1,conversation=p_conversation,model=p_model,settings=p_settings,preview_state=p_preview,updated_by=auth.uid() where id=p_id and revision=p_revision and deleted_at is null returning revision into v_revision;
 if v_revision is null then raise exception 'Project changed elsewhere. Reopen it before saving.' using errcode='40001'; end if;
 for item in select key,value from jsonb_each_text(p_files) loop
  insert into public.project_files(project_id,path,content,updated_by) values(p_id,item.key,item.value,auth.uid()) on conflict(project_id,path) do update set content=excluded.content,updated_by=excluded.updated_by,updated_at=now();
 end loop;
 delete from public.project_files where project_id=p_id and not (p_files ? path);
 insert into public.project_versions(project_id,revision,files,conversation,created_by) values(p_id,v_revision,p_files,p_conversation,auth.uid());
 return v_revision;
end $$;
create function public.accept_project_invite(p_id uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare i public.project_invites;
begin
 select * into i from public.project_invites where id=p_id and invitee_id=auth.uid() and status='pending' and expires_at>now() for update;
 if i.id is null then raise exception 'Invitation is unavailable or expired.' using errcode='42501'; end if;
 insert into public.project_members(project_id,user_id,role) values(i.project_id,auth.uid(),i.role) on conflict(project_id,user_id) do nothing;
 update public.project_invites set status='accepted' where id=i.id;
 return i.project_id;
end $$;
revoke all on function public.save_project(uuid,integer,jsonb,jsonb,text,jsonb,jsonb),public.accept_project_invite(uuid) from public,anon;
grant execute on function public.save_project(uuid,integer,jsonb,jsonb,text,jsonb,jsonb),public.accept_project_invite(uuid) to authenticated;
revoke all on function private.guard_handle(),private.guard_project() from public,anon,authenticated;

