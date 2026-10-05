-- Recents visibility is separate from asset lifetime. Existing generated code
-- can embed asset URLs or data URLs, so removing history never destroys an asset.
alter table public.project_assets add column history_deleted_at timestamptz;
create index assets_recent_visible on public.project_assets(owner_id,created_at desc) where history_deleted_at is null;
grant update(history_deleted_at) on public.project_assets to authenticated;
create policy assets_hide_history on public.project_assets for update to authenticated
using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
