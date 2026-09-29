alter policy projects_read on public.projects using (owner_id=(select auth.uid()) or private.project_role(id) is not null);
alter policy members_read on public.project_members using (user_id=(select auth.uid()) or private.project_role(project_id) is not null);

