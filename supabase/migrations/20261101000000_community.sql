-- CreatorDNA community, discovery and rewards
--
-- Additive only: no existing table, policy, function or column is altered.
-- Two access patterns are used on purpose:
--
--   * Read-mostly social tables  -> SELECT for authenticated, writes go through
--     `community_*` RPCs so counters can never drift and so one creator cannot
--     forge another's rows.
--   * Count columns               -> not directly updatable. `creator_posts`
--     allows column-scoped INSERT/UPDATE (body/title/kind/...) so the client can
--     publish a post over plain PostgREST, but `like_count`/`comment_count`/
--     `view_count` are simply not in the grant list, so they cannot be written
--     from the client at all.
--
-- Reward integrity: `creator_follower_stats` and `creator_achievements` have no
-- client-side write path whatsoever. They are written only by
-- `community_sync_followers`, which is service-role only and reads the follower
-- count from Instagram itself. A client cannot claim a milestone by editing a
-- number it controls.

-- ============================================================ profiles ----

create table if not exists public.creator_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique
    references auth.users (id) on delete cascade,

  handle text not null,
  display_name text not null,
  bio text not null default '',
  niche text not null default '',
  goals text[] not null default '{}',
  avatar_url text,
  website text,
  location text,
  is_listed boolean not null default true,

  -- In-app community counters (never written by the client).
  post_count integer not null default 0,
  follower_count integer not null default 0,
  following_count integer not null default 0,
  view_count integer not null default 0,
  like_count integer not null default 0,
  comment_count integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint creator_profiles_handle_format
    check (handle ~ '^[a-z0-9_]{3,30}$'),
  constraint creator_profiles_name_len
    check (char_length(display_name) between 1 and 60),
  constraint creator_profiles_bio_len
    check (char_length(bio) <= 400),
  constraint creator_profiles_niche_len
    check (char_length(niche) <= 60),
  constraint creator_profiles_website_len
    check (website is null or char_length(website) <= 200),
  constraint creator_profiles_goals_len
    check (cardinality(goals) <= 6),
  constraint creator_profiles_counters_nonneg
    check (post_count >= 0 and follower_count >= 0 and following_count >= 0
           and view_count >= 0 and like_count >= 0 and comment_count >= 0)
);

-- Handles are compared case-insensitively so @Ada and @ada are one identity.
create unique index if not exists creator_profiles_handle_idx
  on public.creator_profiles (lower(handle));
create index if not exists creator_profiles_followers_idx
  on public.creator_profiles (follower_count desc);
create index if not exists creator_profiles_views_idx
  on public.creator_profiles (view_count desc);
create index if not exists creator_profiles_name_idx
  on public.creator_profiles (lower(display_name) text_pattern_ops);
create index if not exists creator_profiles_listed_idx
  on public.creator_profiles (is_listed, follower_count desc)
  where is_listed = true;

-- ============================================================ follows ------

create table if not exists public.creator_follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  followed_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (followed_id, follower_id),
  constraint creator_follows_no_self check (follower_id <> followed_id)
);

create index if not exists creator_follows_follower_idx
  on public.creator_follows (follower_id, created_at desc);
create index if not exists creator_follows_followed_idx
  on public.creator_follows (followed_id, created_at desc);

-- ============================================================ posts --------

create table if not exists public.creator_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    references auth.users (id) on delete cascade,

  kind text not null default 'update'
    check (kind in ('update', 'collab', 'question', 'showcase')),
  title text,
  body text not null,
  tags text[] not null default '{}',
  link text,

  like_count integer not null default 0,
  comment_count integer not null default 0,
  view_count integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint creator_posts_body_len
    check (char_length(body) between 1 and 2000),
  constraint creator_posts_title_len
    check (title is null or char_length(title) between 1 and 120),
  constraint creator_posts_tags_len
    check (cardinality(tags) <= 6),
  constraint creator_posts_link_len
    check (link is null or char_length(link) <= 400),
  constraint creator_posts_counters_nonneg
    check (like_count >= 0 and comment_count >= 0 and view_count >= 0)
);

create index if not exists creator_posts_created_idx
  on public.creator_posts (created_at desc);
create index if not exists creator_posts_user_created_idx
  on public.creator_posts (user_id, created_at desc);
create index if not exists creator_posts_kind_created_idx
  on public.creator_posts (kind, created_at desc);
create index if not exists creator_posts_tags_idx
  on public.creator_posts using gin (tags);

-- Post counts on the profile follow the posts table automatically. The trigger
-- function is SECURITY DEFINER so it can update the profile row even though the
-- profile table is not client-updatable.
create or replace function public.bump_creator_post_count()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    update public.creator_profiles
       set post_count = post_count + 1, updated_at = now()
     where user_id = new.user_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.creator_profiles
       set post_count = greatest(post_count - 1, 0), updated_at = now()
     where user_id = old.user_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists creator_posts_count_tr on public.creator_posts;
create trigger creator_posts_count_tr
  after insert or delete on public.creator_posts
  for each row execute function public.bump_creator_post_count();

-- ================================================ likes / views / comments --

create table if not exists public.creator_post_likes (
  post_id uuid not null references public.creator_posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists creator_post_likes_user_idx
  on public.creator_post_likes (user_id, created_at desc);

create table if not exists public.creator_post_views (
  post_id uuid not null references public.creator_posts (id) on delete cascade,
  viewer_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, viewer_id)
);

create index if not exists creator_post_views_post_idx
  on public.creator_post_views (post_id, created_at desc);

create table if not exists public.creator_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.creator_posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creator_post_comments_body_len
    check (char_length(body) between 1 and 1000)
);

create index if not exists creator_post_comments_post_idx
  on public.creator_post_comments (post_id, created_at);
create index if not exists creator_post_comments_user_idx
  on public.creator_post_comments (user_id, created_at desc);

-- ============================================================ rewards ------

-- The six milestones, in followers.
create table if not exists public.creator_achievements (
  user_id uuid not null references auth.users (id) on delete cascade,
  milestone integer not null
    check (milestone in (1000, 10000, 50000, 100000, 500000, 1000000)),
  earned_at timestamptz not null default now(),
  source text not null default 'instagram',
  primary key (user_id, milestone)
);

create index if not exists creator_achievements_milestone_idx
  on public.creator_achievements (milestone, earned_at desc);

-- Verified Instagram follower readings. Written only by the server after it has
-- read the number from Instagram itself.
create table if not exists public.creator_follower_stats (
  user_id uuid primary key references auth.users (id) on delete cascade,
  instagram_user_id text,
  followers integer not null check (followers >= 0),
  source text not null default 'instagram',
  measured_at timestamptz not null default now()
);

-- ================================================================== RLS -----

alter table public.creator_profiles       enable row level security;
alter table public.creator_follows        enable row level security;
alter table public.creator_posts          enable row level security;
alter table public.creator_post_likes     enable row level security;
alter table public.creator_post_views     enable row level security;
alter table public.creator_post_comments  enable row level security;
alter table public.creator_achievements   enable row level security;
alter table public.creator_follower_stats enable row level security;

-- profiles: everyone signed in may read the directory; writes are RPC-only.
drop policy if exists creator_profiles_select on public.creator_profiles;
create policy creator_profiles_select
  on public.creator_profiles for select to authenticated
  using (is_listed = true or user_id = (select auth.uid()));

-- posts: readable by anyone signed in; authors may edit and delete their own.
-- The column-scoped grants below are what stop counts being overwritten.
drop policy if exists creator_posts_select on public.creator_posts;
create policy creator_posts_select
  on public.creator_posts for select to authenticated
  using (true);

drop policy if exists creator_posts_insert_own on public.creator_posts;
create policy creator_posts_insert_own
  on public.creator_posts for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists creator_posts_update_own on public.creator_posts;
create policy creator_posts_update_own
  on public.creator_posts for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists creator_posts_delete_own on public.creator_posts;
create policy creator_posts_delete_own
  on public.creator_posts for delete to authenticated
  using (user_id = (select auth.uid()));

-- likes / views / follows / comments: read yes, write only through RPCs so the
-- matching counters stay correct and duplicates are impossible.
drop policy if exists creator_post_likes_select on public.creator_post_likes;
create policy creator_post_likes_select
  on public.creator_post_likes for select to authenticated
  using (true);

drop policy if exists creator_post_views_select on public.creator_post_views;
create policy creator_post_views_select
  on public.creator_post_views for select to authenticated
  using (true);

drop policy if exists creator_follows_select on public.creator_follows;
create policy creator_follows_select
  on public.creator_follows for select to authenticated
  using (true);

drop policy if exists creator_post_comments_select on public.creator_post_comments;
create policy creator_post_comments_select
  on public.creator_post_comments for select to authenticated
  using (true);

-- Rewards: public to read (badges are shown on profiles), never client-written.
drop policy if exists creator_achievements_select on public.creator_achievements;
create policy creator_achievements_select
  on public.creator_achievements for select to authenticated
  using (true);

drop policy if exists creator_follower_stats_select on public.creator_follower_stats;
create policy creator_follower_stats_select
  on public.creator_follower_stats for select to authenticated
  using (user_id = (select auth.uid()));

-- =============================================================== grants -----
-- Supabase's default privileges would otherwise hand `anon` a full grant.

revoke all on table public.creator_profiles       from anon;
revoke all on table public.creator_follows        from anon;
revoke all on table public.creator_posts          from anon;
revoke all on table public.creator_post_likes     from anon;
revoke all on table public.creator_post_views     from anon;
revoke all on table public.creator_post_comments  from anon;
revoke all on table public.creator_achievements   from anon;
revoke all on table public.creator_follower_stats from anon;

revoke all on table public.creator_profiles       from authenticated;
revoke all on table public.creator_follows        from authenticated;
revoke all on table public.creator_posts          from authenticated;
revoke all on table public.creator_post_likes     from authenticated;
revoke all on table public.creator_post_views     from authenticated;
revoke all on table public.creator_post_comments  from authenticated;
revoke all on table public.creator_achievements   from authenticated;
revoke all on table public.creator_follower_stats from authenticated;

grant select on table public.creator_profiles       to authenticated;
grant select on table public.creator_follows        to authenticated;
grant select on table public.creator_post_likes     to authenticated;
grant select on table public.creator_post_views     to authenticated;
grant select on table public.creator_post_comments  to authenticated;
grant select on table public.creator_achievements   to authenticated;
grant select on table public.creator_follower_stats to authenticated;

-- Post creation/editing works over plain PostgREST, but the count columns are
-- deliberately absent from these lists: the client cannot write them.
grant insert (user_id, kind, title, body, tags, link) on public.creator_posts to authenticated;
grant update (kind, title, body, tags, link, updated_at) on public.creator_posts to authenticated;
grant delete on public.creator_posts to authenticated;

grant usage on schema public to authenticated;
grant usage on schema public to anon;

grant all on table public.creator_profiles       to service_role;
grant all on table public.creator_follows        to service_role;
grant all on table public.creator_posts          to service_role;
grant all on table public.creator_post_likes     to service_role;
grant all on table public.creator_post_views     to service_role;
grant all on table public.creator_post_comments  to service_role;
grant all on table public.creator_achievements   to service_role;
grant all on table public.creator_follower_stats to service_role;

-- ================================================================ RPCs =====
--
-- Every one is SECURITY DEFINER with a pinned search_path, so it runs as the
-- function owner and can keep counters consistent. Each one re-reads
-- `auth.uid()` itself and never trusts an id from the request body.

-- ---------------------------------------------------------- profile save ---
create or replace function public.community_save_profile(
  p_handle text,
  p_display_name text,
  p_bio text default '',
  p_niche text default '',
  p_goals text[] default '{}',
  p_avatar_url text default null,
  p_website text default null,
  p_location text default null,
  p_is_listed boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_handle text := lower(regexp_replace(coalesce(p_handle, ''), '\s+', '_', 'g'));
  v_name text := trim(coalesce(p_display_name, ''));
  v_row jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if v_handle !~ '^[a-z0-9_]{3,30}$' then
    raise exception 'invalid_handle' using errcode = '22023';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 60 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if exists (select 1 from public.creator_profiles
              where lower(handle) = v_handle and user_id <> v_uid) then
    raise exception 'handle_taken' using errcode = '23505';
  end if;

  insert into public.creator_profiles
    (user_id, handle, display_name, bio, niche, goals,
     avatar_url, website, location, is_listed, updated_at)
  values
    (v_uid, v_handle, v_name,
     left(trim(coalesce(p_bio, '')), 400),
     left(trim(coalesce(p_niche, '')), 60),
     coalesce((select array_agg(distinct g) from unnest(coalesce(p_goals, '{}')) g
        where char_length(trim(g)) between 1 and 40), '{}'),
     nullif(trim(coalesce(p_avatar_url, '')), ''),
     nullif(trim(coalesce(p_website, '')), ''),
     nullif(trim(coalesce(p_location, '')), ''),
     coalesce(p_is_listed, true), now())
  on conflict (user_id) do update
    set handle = excluded.handle,
        display_name = excluded.display_name,
        bio = excluded.bio,
        niche = excluded.niche,
        goals = excluded.goals,
        avatar_url = excluded.avatar_url,
        website = excluded.website,
        location = excluded.location,
        is_listed = excluded.is_listed,
        updated_at = now();

  select jsonb_build_object(
           'userId', user_id, 'handle', handle, 'displayName', display_name,
           'bio', bio, 'niche', niche, 'goals', goals,
           'avatarUrl', avatar_url, 'website', website, 'location', location,
           'isListed', is_listed, 'postCount', post_count,
           'followerCount', follower_count, 'followingCount', following_count,
           'viewCount', view_count, 'likeCount', like_count,
           'commentCount', comment_count)
    into v_row
    from public.creator_profiles where user_id = v_uid;
  return v_row;
end;
$$;

-- --------------------------------------------------------------- follow ----
create or replace function public.community_follow(p_followed uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_added integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_followed is null or p_followed = v_uid then
    raise exception 'invalid_target' using errcode = '22023';
  end if;
  if not exists (select 1 from public.creator_profiles where user_id = p_followed) then
    -- P0001 maps to HTTP 400 in PostgREST; P0002 ("no data found") is unmapped
    -- and surfaces as an opaque 500 with no body.
    raise exception 'profile_not_found' using errcode = 'P0001';
  end if;

  insert into public.creator_follows (follower_id, followed_id)
  values (v_uid, p_followed)
  on conflict (followed_id, follower_id) do nothing;
  get diagnostics v_added = row_count;

  if v_added = 1 then
    update public.creator_profiles
       set follower_count = follower_count + 1, updated_at = now()
     where user_id = p_followed;
    update public.creator_profiles
       set following_count = following_count + 1, updated_at = now()
     where user_id = v_uid;
  end if;

  return (select jsonb_build_object('following', true,
                   'followerCount', follower_count)
            from public.creator_profiles where user_id = p_followed);
end;
$$;

create or replace function public.community_unfollow(p_followed uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_removed integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  delete from public.creator_follows
   where follower_id = v_uid and followed_id = p_followed;
  get diagnostics v_removed = row_count;

  if v_removed = 1 then
    update public.creator_profiles
       set follower_count = greatest(follower_count - 1, 0), updated_at = now()
     where user_id = p_followed;
    update public.creator_profiles
       set following_count = greatest(following_count - 1, 0), updated_at = now()
     where user_id = v_uid;
  end if;

  return (select jsonb_build_object('following', false,
                   'followerCount', follower_count)
            from public.creator_profiles where user_id = p_followed);
end;
$$;

-- ---------------------------------------------------------------- like -----
create or replace function public.community_like(p_post uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_owner uuid;
  v_added integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select user_id into v_owner from public.creator_posts where id = p_post;
  if v_owner is null then
    raise exception 'post_not_found' using errcode = 'P0001';
  end if;

  insert into public.creator_post_likes (post_id, user_id)
  values (p_post, v_uid)
  on conflict (post_id, user_id) do nothing;
  get diagnostics v_added = row_count;

  if v_added = 1 then
    update public.creator_posts
       set like_count = like_count + 1 where id = p_post;
    update public.creator_profiles
       set like_count = like_count + 1, updated_at = now()
     where user_id = v_owner;
  end if;

  return (select jsonb_build_object('liked', true, 'likeCount', like_count)
            from public.creator_posts where id = p_post);
end;
$$;

create or replace function public.community_unlike(p_post uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_owner uuid;
  v_removed integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select user_id into v_owner from public.creator_posts where id = p_post;
  if v_owner is null then
    raise exception 'post_not_found' using errcode = 'P0001';
  end if;

  delete from public.creator_post_likes
   where post_id = p_post and user_id = v_uid;
  get diagnostics v_removed = row_count;

  if v_removed = 1 then
    update public.creator_posts
       set like_count = greatest(like_count - 1, 0) where id = p_post;
    update public.creator_profiles
       set like_count = greatest(like_count - 1, 0), updated_at = now()
     where user_id = v_owner;
  end if;

  return (select jsonb_build_object('liked', false, 'likeCount', like_count)
            from public.creator_posts where id = p_post);
end;
$$;

-- ------------------------------------------------------------- comment -----
create or replace function public.community_comment(p_post uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_owner uuid;
  v_text text := trim(coalesce(p_body, ''));
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if char_length(v_text) < 1 or char_length(v_text) > 1000 then
    raise exception 'invalid_comment' using errcode = '22023';
  end if;

  select user_id into v_owner from public.creator_posts where id = p_post;
  if v_owner is null then
    raise exception 'post_not_found' using errcode = 'P0001';
  end if;

  insert into public.creator_post_comments (post_id, user_id, body)
  values (p_post, v_uid, v_text)
  returning id into v_id;

  update public.creator_posts
     set comment_count = comment_count + 1 where id = p_post;
  update public.creator_profiles
     set comment_count = comment_count + 1, updated_at = now()
   where user_id = v_owner;

  return (select jsonb_build_object(
                   'id', id, 'postId', post_id, 'userId', user_id,
                   'body', body, 'createdAt', created_at)
            from public.creator_post_comments where id = v_id);
end;
$$;

create or replace function public.community_delete_comment(p_comment uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_post uuid;
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select post_id into v_post from public.creator_post_comments where id = p_comment;
  if v_post is null then
    return false;
  end if;
  select user_id into v_owner from public.creator_posts where id = v_post;

  -- The commenter, or the author of the post it sits on, may remove it.
  if not exists (
       select 1 from public.creator_post_comments
        where id = p_comment
          and (user_id = v_uid or (v_owner is not null and v_owner = v_uid))
     ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  delete from public.creator_post_comments where id = p_comment;
  update public.creator_posts
     set comment_count = greatest(comment_count - 1, 0) where id = v_post;
  update public.creator_profiles
     set comment_count = greatest(comment_count - 1, 0), updated_at = now()
   where user_id = v_owner;
  return true;
end;
$$;

-- ---------------------------------------------------------------- view -----
-- One counted view per viewer per post, so refreshing cannot inflate a number.
create or replace function public.community_view(p_post uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_owner uuid;
  v_added integer;
begin
  if v_uid is null then
    return;
  end if;

  select user_id into v_owner from public.creator_posts where id = p_post;
  if v_owner is null or v_owner = v_uid then
    return; -- authors do not inflate their own reach
  end if;

  insert into public.creator_post_views (post_id, viewer_id)
  values (p_post, v_uid)
  on conflict (post_id, viewer_id) do nothing;
  get diagnostics v_added = row_count;

  if v_added = 1 then
    update public.creator_posts
       set view_count = view_count + 1 where id = p_post;
    update public.creator_profiles
       set view_count = view_count + 1, updated_at = now()
     where user_id = v_owner;
  end if;
end;
$$;

-- ---------------------------------------------------------- leaderboard ----
--
-- p_metric: 'followers' | 'views' | 'trending' | 'overall'
--
-- Ranking rules, in one place so the UI can print them verbatim:
--   followers : in-app followers (people who follow you inside CreatorDNA)
--   views     : distinct people who opened your posts
--   trending  : likes + comments your posts received in the last 7 days
--   overall   : followers*3 + views*0.1 + posts*5 + trending*2
--
-- Every input is server-recorded from an authenticated action, so none of these
-- can be raised by editing a value the client controls.
create or replace function public.community_leaderboard(
  p_metric text default 'overall',
  p_limit integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_metric text := coalesce(p_metric, 'overall');
  v_rows jsonb;
begin
  if v_metric not in ('followers', 'views', 'trending', 'overall') then
    raise exception 'invalid_metric' using errcode = '22023';
  end if;

  -- `limit` has to be applied BEFORE jsonb_agg, otherwise the aggregate sees
  -- every row and the array comes back untruncated.
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
                        and l.created_at > now() - interval '7 days'), 0) as engagement_7d,
           coalesce(s.followers, -1) as ig_followers,
           (select max(milestone) from public.creator_achievements ax
             where ax.user_id = p.user_id) as top_milestone
      from public.creator_profiles p
      left join public.creator_follower_stats s on s.user_id = p.user_id
     where p.is_listed = true
  ),
  scored as (
    select b.*,
      ((b.follower_count * 3)
        + (b.view_count / 10)
        + (b.published * 5)
        + (b.engagement_7d * 2))::bigint as overall_score
      from base b
  ),
  ranked as (
    select s.*,
           case
             when v_metric = 'followers' then s.follower_count
             when v_metric = 'views'     then s.view_count
             when v_metric = 'trending'  then s.engagement_7d
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
                         when v_metric = 'trending'  then r.engagement_7d
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
             'engagement7d', engagement_7d,
             'instagramFollowers', greatest(ig_followers, -1),
             'topMilestone', coalesce(top_milestone, 0),
             'score', overall_score,
             'value', rank_value,
             'rank', position
           )
           order by position
         ) into v_rows
    from (select * from positioned order by position limit v_limit) q;

  return coalesce(v_rows, '[]'::jsonb);
end;
$$;

-- ------------------------------------------------- verified follower sync ---
--
-- SERVICE ROLE ONLY. The follower count is read from Instagram by the community
-- edge function and passed in here; no client of this app can call this
-- function, so no client can award itself a milestone.
create or replace function public.community_sync_followers(
  p_user_id uuid,
  p_followers integer,
  p_instagram_user_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target integer := greatest(coalesce(p_followers, 0), 0);
  v_earned integer[] := '{}';
  v_milestone integer;
begin
  if p_user_id is null then
    raise exception 'user_required' using errcode = '22023';
  end if;

  insert into public.creator_follower_stats
    (user_id, instagram_user_id, followers, source, measured_at)
  values
    (p_user_id, p_instagram_user_id, v_target, 'instagram', now())
  on conflict (user_id) do update
    set instagram_user_id = excluded.instagram_user_id,
        followers = excluded.followers,
        source = 'instagram',
        measured_at = now();

  update public.creator_profiles
     set updated_at = now()
   where user_id = p_user_id;

  -- Award every milestone this creator has reached, including ones passed
  -- before they ever joined — each at most once, forever.
  for v_milestone in
    select m from unnest(array[1000,10000,50000,100000,500000,1000000]) m
     where m <= v_target
       and not exists (select 1 from public.creator_achievements a
                        where a.user_id = p_user_id and a.milestone = m)
   loop
    insert into public.creator_achievements (user_id, milestone, source)
    values (p_user_id, v_milestone, 'instagram')
    on conflict (user_id, milestone) do nothing;
    v_earned := v_earned || v_milestone;
  end loop;

  return jsonb_build_object(
    'followers', v_target,
    'earned', to_jsonb(v_earned),
    'next', (select coalesce(min(m), 0) from unnest(array[1000,10000,50000,100000,500000,1000000]) m
              where m > v_target),
    'measuredAt', now()
  );
end;
$$;

-- ============================================================= execute =====
-- Client-facing RPCs: authenticated sessions only (including anonymous ones,
-- which Supabase issues as ordinary authenticated JWTs).

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'community_save_profile(text,text,text,text,text[],text,text,text,boolean)',
    'community_follow(uuid)',
    'community_unfollow(uuid)',
    'community_like(uuid)',
    'community_unlike(uuid)',
    'community_comment(uuid,text)',
    'community_delete_comment(uuid)',
    'community_view(uuid)',
    'community_leaderboard(text,integer)'
  ]
  loop
    execute format('revoke all on function public.%s from public, anon;', fn);
    execute format('grant execute on function public.%s to authenticated;', fn);
  end loop;

  -- Server-only: writes verified follower readings and awards rewards.
  foreach fn in array array['community_sync_followers(uuid,integer,text)']
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated;', fn);
    execute format('grant execute on function public.%s to service_role;', fn);
  end loop;
end;
$$;
