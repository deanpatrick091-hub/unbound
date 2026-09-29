-- Override inherited default table grants; grant only required operations/columns.
revoke all on public.user_handles,public.projects,public.project_members,public.project_invites,public.project_files,public.project_versions,public.project_assets,public.pins from public,anon,authenticated;
grant select,insert on public.user_handles to authenticated;
grant update(username,display_name,avatar_url) on public.user_handles to authenticated;
grant select,insert on public.projects to authenticated;
grant update(name,model,conversation,settings,preview_state,revision,updated_by,updated_at,deleted_at) on public.projects to authenticated;
grant select,insert,delete on public.project_members to authenticated;
grant update(role) on public.project_members to authenticated;
grant select,insert on public.project_invites to authenticated;
grant update(status) on public.project_invites to authenticated;
grant select,insert,update,delete on public.project_files to authenticated;
grant select,insert on public.project_versions,public.project_assets to authenticated;
grant select,insert,delete on public.pins to authenticated;

