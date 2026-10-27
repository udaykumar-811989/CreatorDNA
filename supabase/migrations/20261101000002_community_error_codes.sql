-- Follow-up to 20261101000000_community.sql
--
-- These four functions raised with SQLSTATE P0002 ("no data found"). PostgREST
-- has no HTTP mapping for P0002, so following a creator without a profile or
-- acting on a post that had just been deleted answered HTTP 500 with an empty
-- body — a server error for what is an ordinary client-side race.
--
-- P0001 ("raise exception") maps to HTTP 400 and keeps the descriptive message
-- (post_not_found / profile_not_found) in the payload, so the client can tell
-- "gone" apart from "invalid input". The bodies are otherwise unchanged.

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
