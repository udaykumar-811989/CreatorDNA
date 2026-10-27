-- Follow-up to 20261101000000_community.sql
--
-- 1. `creator_posts` was created with column-scoped INSERT/UPDATE and DELETE but
--    the blanket SELECT grant was left out of the first pass, so PostgREST hid
--    the table entirely from `authenticated` (HTTP 404/403) even though the
--    policies were correct. Read access is required for the feed to work.
--
-- 2. A creator may remove their own profile row (leaving the directory) — the
--    same right the other tables already grant for their own rows. Without it
--    there is no way to leave the community, and no way to clean up a profile.

grant select on table public.creator_posts to authenticated;

drop policy if exists creator_profiles_delete_own on public.creator_profiles;
create policy creator_profiles_delete_own
  on public.creator_profiles for delete to authenticated
  using (user_id = (select auth.uid()));

grant delete on table public.creator_profiles to authenticated;
