-- Posting in Community is limited to creators who have actually connected
-- Instagram to CreatorDNA. The app can only write creator_follower_stats
-- during the Instagram sync, so a row for auth.uid() is the server-side
-- proof of a connection — the UI hides the composer, this policy enforces it.
--
-- Existing posters keep their rows (nothing is revoked), so the change is
-- backward-compatible: only new inserts from unconnected accounts are
-- rejected, with SQLSTATE 42501, which the client maps to a connect prompt.
--
-- The EXISTS subquery runs under the caller's RLS: creator_follower_stats is
-- readable only for user_id = auth.uid(), so a user can confirm their own
-- connection and never anyone else's.

drop policy if exists creator_posts_insert_own on public.creator_posts;
create policy creator_posts_insert_own
  on public.creator_posts for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.creator_follower_stats s
      where s.user_id = (select auth.uid())
    )
  );
