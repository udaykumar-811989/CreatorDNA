-- Community photos, a real trending order, and the Instagram-only Top 20.
--
-- Three additions in one pass, none of them removing anything that exists:
--
--   1. `creator_posts.media_url` — a photo attached to a post. A check
--      constraint allows only this project's own storage URL, and there is no
--      UPDATE grant for the column, so an edit can change the words but never
--      swap the picture. `engagement_count` is a generated column so the
--      "Trending" order is computed once in the database instead of by sorting
--      whichever page happened to be loaded (page 2 would restart the ranking).
--   2. The `community-posts` bucket: readable by anyone with the URL, writable
--      only by the signed-in author, only inside a folder named after their
--      own id, and only with an image type and size the app enforces too.
--   3. `community_leaderboard` gains the `instagram` metric: connected
--      accounts only, ordered by the follower count this app read from
--      Instagram itself, so ranks 1..20 are that number from high to low.
--      Every earlier metric, filter and RPC keeps working unchanged.

-- ============================================================== photos ======

alter table public.creator_posts
  add column if not exists media_url text;

alter table public.creator_posts
  drop constraint if exists creator_posts_media_url;

-- A row can only point at a photo this app uploaded: no third-party hosts and
-- no tracking pixels, with a length cap so a crafted value cannot be a
-- paragraph. Local development uses an http origin, so the scheme is not fixed.
alter table public.creator_posts
  add constraint creator_posts_media_url
  check (
    media_url is null
    or (char_length(media_url) <= 600
        and media_url like '%/storage/v1/object/public/community-posts/%')
  );

alter table public.creator_posts
  add column if not exists engagement_count integer
  generated always as (like_count + comment_count) stored;

create index if not exists creator_posts_engagement_idx
  on public.creator_posts (engagement_count desc, created_at desc);

-- Column-scoped, like every other client write here: the counters stay
-- unreachable, and `media_url` becomes writable exactly once, at insert.
grant insert (media_url) on public.creator_posts to authenticated;

-- ============================================================ storage =======

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'community-posts',
  'community-posts',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Public read: the photo is shown to every signed-in reader, and the post row
-- it belongs to is readable by every signed-in reader as well.
drop policy if exists "community photos are publicly readable" on storage.objects;
create policy "community photos are publicly readable"
  on storage.objects for select
  using (bucket_id = 'community-posts');

-- Write: own folder only, authenticated only. The client cannot target another
-- creator's folder because the policy checks the first path segment against
-- the caller's own id.
drop policy if exists "authors upload their own post photos" on storage.objects;
create policy "authors upload their own post photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'community-posts'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

-- Cleanup runs when the post itself is deleted; a leftover object is invisible
-- to readers either way, so a failure here is never surfaced by the app.
drop policy if exists "authors remove their own post photos" on storage.objects;
create policy "authors remove their own post photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'community-posts'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

-- No UPDATE policy at all: replacing an existing photo in place is not an
-- operation the app offers.

-- ===================================================== Instagram ranking ====

create or replace function public.community_leaderboard(
  p_metric text default 'overall',
  p_limit integer default 25,
  p_offset integer default 0,
  p_niche text default null,
  p_period text default '7d',
  p_verified_only boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_metric text := coalesce(p_metric, 'overall');
  v_niche text := nullif(lower(trim(coalesce(p_niche, ''))), '');
  v_period text := coalesce(p_period, '7d');
  v_verified boolean := coalesce(p_verified_only, false);
  -- The Instagram ranking is a lifetime number read from the account itself:
  -- it has no window, and its pool is fixed by whether a reading exists.
  v_connected boolean := v_verified or v_metric = 'instagram';
  v_window interval;
  v_rows jsonb;
begin
  if v_metric not in ('instagram', 'followers', 'views', 'trending', 'overall') then
    raise exception 'invalid_metric' using errcode = '22023';
  end if;
  if v_period not in ('7d', '30d', 'all') then
    raise exception 'invalid_period' using errcode = '22023';
  end if;

  v_window := case v_period
                when '30d' then interval '30 days'
                when 'all' then null
                else interval '7 days'
              end;

  -- `limit` has to be applied BEFORE jsonb_agg, otherwise the aggregate sees
  -- every row and the array comes back untruncated. `position` is assigned
  -- over the whole filtered set first, so a page still shows its true rank
  -- rather than restarting at 1.
  with base as (
    select p.user_id,
           p.handle,
           p.display_name,
           p.avatar_url,
           p.niche,
           p.location,
           p.follower_count,
           p.following_count,
           p.post_count,
           p.view_count,
           p.like_count,
           p.comment_count,
           coalesce((select sum(1) from public.creator_posts op
                     where op.user_id = p.user_id), 0) as published,
           coalesce((select sum(coalesce(l.like_count,0) + coalesce(l.comment_count,0))
                       from public.creator_posts l
                      where l.user_id = p.user_id
                        and (v_window is null or l.created_at > now() - v_window)), 0) as engagement,
           coalesce(s.followers, -1) as ig_followers,
           -- A row here exists only because the `community` function read the
           -- number from Instagram, so its presence *is* the verification.
           (s.user_id is not null) as verified,
           (select max(milestone) from public.creator_achievements ax
             where ax.user_id = p.user_id) as top_milestone
      from public.creator_profiles p
      left join public.creator_follower_stats s on s.user_id = p.user_id
     where p.is_listed = true
       and (v_niche is null or lower(p.niche) = v_niche)
       -- The Top-20 pool. A `creator_follower_stats` row can only exist when
       -- this app connected to Instagram and read the count itself, so its
       -- presence is both "Instagram is connected" and "a real person is using
       -- CreatorDNA" — no self-declared handle can buy its way in. The
       -- Instagram metric and `p_verified_only` request the same pool.
       and (not v_connected or s.user_id is not null)
  ),
  scored as (
    select b.*,
      ((b.follower_count * 3)
        + (b.view_count / 10)
        + (b.published * 5)
        + (b.engagement * 2))::bigint as overall_score
      from base b
  ),
  ranked as (
    select s.*,
           case
             when v_metric = 'instagram' then s.ig_followers
             when v_metric = 'followers' then s.follower_count
             when v_metric = 'views'     then s.view_count
             when v_metric = 'trending'  then s.engagement
             else s.overall_score
           end::bigint as rank_value
      from scored s
  ),
  positioned as (
    select r.*,
           row_number() over (
             order by (case
                         when v_metric = 'instagram' then r.ig_followers
                         when v_metric = 'followers' then r.follower_count
                         when v_metric = 'views'     then r.view_count
                         when v_metric = 'trending'  then r.engagement
                         else r.overall_score
                       end)::bigint desc,
                     r.user_id
           ) as position
      from ranked r
  )
  select jsonb_agg(
           jsonb_build_object(
             'userId', user_id,
             'handle', handle,
             'displayName', display_name,
             'avatarUrl', avatar_url,
             'niche', niche,
             'location', location,
             'followerCount', follower_count,
             'followingCount', following_count,
             'postCount', post_count,
             'viewCount', view_count,
             'likeCount', like_count,
             'commentCount', comment_count,
             'engagement', engagement,
             'engagement7d', engagement,
             'verified', verified,
             'instagramFollowers', greatest(ig_followers, -1),
             'topMilestone', coalesce(top_milestone, 0),
             'score', overall_score,
             'value', rank_value,
             'rank', position
           )
           order by position
         ) into v_rows
    from (
      select * from positioned order by position
       limit v_limit offset v_offset
    ) q;

  return coalesce(v_rows, '[]'::jsonb);
end;
$$;

revoke all on function public.community_leaderboard(text, integer, integer, text, text, boolean) from public;
revoke all on function public.community_leaderboard(text, integer, integer, text, text, boolean) from anon;
grant execute on function public.community_leaderboard(text, integer, integer, text, text, boolean) to authenticated;
