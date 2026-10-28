-- Community discovery pass: the Top-20 ranking pool, leaderboard filters,
-- reporting, and spam control.
--
-- Everything here is additive. Nothing existing is dropped except the
-- two-argument `community_leaderboard` overload, which is replaced by a
-- five-argument version whose two new parameters have defaults — every call
-- already in the app (`{p_metric, p_limit}`) keeps resolving unchanged.

-- ============================================================ reporting ====
--
-- A report is a note to a human moderator, nothing more: it never hides,
-- edits or deletes content by itself, so a malicious report cannot silence
-- anyone. `reporter_id` is only ever their own, so no reporter's identity is
-- exposed to the reported creator.
create table if not exists public.creator_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  target_type text not null check (target_type in ('post', 'comment', 'profile')),
  target_id uuid not null,
  reason text not null check (
    reason in ('spam', 'harassment', 'misinformation', 'impersonation', 'other')
  ),
  details text not null default '' check (char_length(details) <= 500),
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now(),
  -- Duplicate protection: one open opinion per reporter per target, forever.
  constraint creator_reports_once_unique unique (reporter_id, target_type, target_id)
);

create index if not exists creator_reports_status_idx
  on public.creator_reports (status, created_at desc);

create index if not exists creator_reports_target_idx
  on public.creator_reports (target_type, target_id);

alter table public.creator_reports enable row level security;

-- Moderators are service-role only: authenticated users can file a report and
-- read back their own, and can neither see others' reports nor change status.
drop policy if exists creator_reports_insert_own on public.creator_reports;
create policy creator_reports_insert_own
  on public.creator_reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));

drop policy if exists creator_reports_select_own on public.creator_reports;
create policy creator_reports_select_own
  on public.creator_reports for select to authenticated
  using (reporter_id = (select auth.uid()));

revoke all on table public.creator_reports from anon;
grant insert, select on table public.creator_reports to authenticated;

-- The only public way to file one. It validates the target actually exists,
-- refuses self-reports, and throttles per reporter per day — all server-side,
-- because a client-side check is a suggestion, not a rule.
create or replace function public.community_report(
  p_target_type text,
  p_target_id uuid,
  p_reason text,
  p_details text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_type text := coalesce(p_target_type, '');
  v_reason text := coalesce(p_reason, '');
  v_details text := left(trim(coalesce(p_details, '')), 500);
  v_exists boolean := false;
  v_today integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '22023';
  end if;
  if p_target_id is null then
    raise exception 'invalid_target' using errcode = '22023';
  end if;
  if v_reason not in ('spam', 'harassment', 'misinformation', 'impersonation', 'other') then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;

  if v_type = 'post' then
    select exists (
      select 1 from public.creator_posts p where p.id = p_target_id
    ) into v_exists;
  elsif v_type = 'comment' then
    select exists (
      select 1 from public.creator_post_comments c where c.id = p_target_id
    ) into v_exists;
  elsif v_type = 'profile' then
    select exists (
      select 1 from public.creator_profiles f where f.user_id = p_target_id
    ) into v_exists;
  else
    raise exception 'invalid_target' using errcode = '22023';
  end if;

  if not v_exists then
    raise exception 'post_not_found' using errcode = '22023';
  end if;

  -- Reporting yourself is always a mistake or a troll; either way, refuse.
  if exists (
    select 1 from public.creator_posts p
     where v_type = 'post' and p.id = p_target_id and p.user_id = v_uid
  ) or exists (
    select 1 from public.creator_post_comments c
     where v_type = 'comment' and c.id = p_target_id and c.user_id = v_uid
  ) or (v_type = 'profile' and p_target_id = v_uid) then
    raise exception 'not_allowed' using errcode = '22023';
  end if;

  -- Ten reports a day is far more than a genuine user files and far too few
  -- for a flood to be useful.
  select count(*) into v_today
    from public.creator_reports r
   where r.reporter_id = v_uid
     and r.created_at > now() - interval '24 hours';
  if v_today >= 10 then
    raise exception 'rate_limited' using errcode = '22023';
  end if;

  insert into public.creator_reports (reporter_id, target_type, target_id, reason, details)
  values (v_uid, v_type, p_target_id, v_reason, v_details)
  on conflict (reporter_id, target_type, target_id) do nothing;

  return jsonb_build_object('reported', true, 'targetType', v_type);
end;
$$;

revoke all on function public.community_report(text, uuid, text, text) from public;
revoke all on function public.community_report(text, uuid, text, text) from anon;
grant execute on function public.community_report(text, uuid, text, text) to authenticated;

-- ==================================================== leaderboard filters ===
--
-- `p_niche` and `p_period` are optional and default to the previous
-- behaviour, so the existing client call keeps working untouched.
--
-- `p_period` only ever affects the engagement window behind the Trending and
-- Overall columns. Follower and view totals have no history to window, so the
-- UI says so rather than implying a period applied to them.
-- Two overloads must not coexist: the old two-argument version and any earlier
-- draft of this one are both dropped, so a call can only ever resolve to the
-- definition below. Otherwise `{p_metric, p_limit}` becomes ambiguous.
drop function if exists public.community_leaderboard(text, integer);
drop function if exists public.community_leaderboard(text, integer, integer, text, text);

create or replace function public.community_leaderboard(
  p_metric text default 'overall',
  p_limit integer default 25,
  p_offset integer default 0,
  p_niche text default null,
  p_period text default '7d',
  -- The "Top 20" pool: only creators whose Instagram the app has actually read.
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
  v_window interval;
  v_rows jsonb;
begin
  if v_metric not in ('followers', 'views', 'trending', 'overall') then
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
       -- CreatorDNA" — no self-declared handle can buy its way in.
       and (not v_verified or s.user_id is not null)
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

-- ========================================================== rate limiting ===
--
-- A trigger rather than a check inside one call path: posts arrive as a
-- plain PostgREST insert and comments arrive through an RPC, and a rule
-- written twice is a rule that drifts.
create or replace function public.community_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_recent integer := 0;
  v_window interval;
  v_max integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '22023';
  end if;
  if new.user_id is distinct from v_uid then
    raise exception 'not_allowed' using errcode = '22023';
  end if;

  if tg_table_name = 'creator_posts' then
    v_window := interval '10 minutes';
    v_max := 5;
    select count(*) into v_recent
      from public.creator_posts
     where user_id = v_uid and created_at > now() - v_window;
  else
    v_window := interval '5 minutes';
    v_max := 10;
    select count(*) into v_recent
      from public.creator_post_comments
     where user_id = v_uid and created_at > now() - v_window;
  end if;

  if v_recent >= v_max then
    raise exception 'rate_limited' using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists creator_posts_rate_trg on public.creator_posts;
create trigger creator_posts_rate_trg
  before insert on public.creator_posts
  for each row execute function public.community_rate_limit();

drop trigger if exists creator_comments_rate_trg on public.creator_post_comments;
create trigger creator_comments_rate_trg
  before insert on public.creator_post_comments
  for each row execute function public.community_rate_limit();

-- ============================================================== discovery ===
-- Niche is free text, so the filter matches it case-insensitively; this makes
-- that lookup an index scan instead of a full directory scan on every
-- leaderboard page.
create index if not exists creator_profiles_niche_idx
  on public.creator_profiles (lower(niche)) where is_listed;

-- "Suggested" and a creator's own profile page both read their posts newest
-- first, by author.
create index if not exists creator_posts_user_created_desc_idx
  on public.creator_posts (user_id, created_at desc);

-- Following pages read the graph in both directions.
create index if not exists creator_follows_pair_idx
  on public.creator_follows (follower_id, followed_id, created_at desc);

-- ======================================================= creator summary ===
--
-- One creator's public numbers, read back for a profile page. The follower
-- stats table is private by design (a creator's Instagram reading is their
-- own), but the leaderboard already publishes *whether* a count was verified
-- and how many followers it showed. This returns the same two facts through
-- the same door, so a profile page and the leaderboard can never disagree.
create or replace function public.community_creator_summary(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row jsonb;
begin
  if p_user_id is null then
    raise exception 'invalid_target' using errcode = '22023';
  end if;

  select jsonb_build_object(
           'userId', p.user_id,
           'handle', p.handle,
           'displayName', p.display_name,
           'bio', p.bio,
           'niche', p.niche,
           'goals', p.goals,
           'avatarUrl', p.avatar_url,
           'website', p.website,
           'location', p.location,
           'isListed', p.is_listed,
           'postCount', p.post_count,
           'followerCount', p.follower_count,
           'followingCount', p.following_count,
           'viewCount', p.view_count,
           'likeCount', p.like_count,
           'commentCount', p.comment_count,
           'instagramFollowers', greatest(coalesce(s.followers, -1), -1),
           'verified', (s.user_id is not null),
           'measuredAt', s.measured_at,
           'topMilestone', coalesce(
             (select max(a.milestone) from public.creator_achievements a
               where a.user_id = p.user_id), 0)
         )
    into v_row
    from public.creator_profiles p
    left join public.creator_follower_stats s on s.user_id = p.user_id
   where p.user_id = p_user_id
     and p.is_listed = true;

  if v_row is null then
    raise exception 'profile_not_found' using errcode = '22023';
  end if;

  return v_row;
end;
$$;

revoke all on function public.community_creator_summary(uuid) from public;
revoke all on function public.community_creator_summary(uuid) from anon;
grant execute on function public.community_creator_summary(uuid) to authenticated;
