create table if not exists public.instagram_connection_sessions (
  session_hash text primary key,
  instagram_user_id text not null
    references public.instagram_connections (instagram_user_id)
    on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists instagram_connection_sessions_expiry_idx
  on public.instagram_connection_sessions (expires_at);

alter table public.instagram_connection_sessions enable row level security;

revoke all on table public.instagram_connection_sessions
  from anon, authenticated;
grant all on table public.instagram_connection_sessions to service_role;

drop function if exists public.consume_instagram_connection_receipt(text);

create or replace function public.consume_instagram_connection_receipt(
  p_receipt_hash text,
  p_session_hash text
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  with consumed as materialized (
    delete from public.instagram_connection_receipts
    where receipt_hash = p_receipt_hash
      and expires_at > now()
    returning instagram_user_id
  ),
  connection as materialized (
    select c.*
    from consumed as r
    join public.instagram_connections as c
      on c.instagram_user_id = r.instagram_user_id
    where c.token_expires_at > now()
  ),
  created_session as (
    insert into public.instagram_connection_sessions (
      session_hash, instagram_user_id, expires_at
    )
    select
      p_session_hash,
      c.instagram_user_id,
      least(c.token_expires_at, now() + interval '30 days')
    from connection as c
    returning instagram_user_id
  )
  select jsonb_build_object(
    'username', c.username,
    'accountType', c.account_type,
    'profilePictureUrl', c.profile_picture_url
  )
  from connection as c
  join created_session as s
    on s.instagram_user_id = c.instagram_user_id;
$$;

create or replace function public.get_instagram_dashboard_connection(
  p_session_hash text
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'instagramUserId', c.instagram_user_id,
    'username', c.username,
    'accountType', c.account_type,
    'profilePictureUrl', c.profile_picture_url,
    'encryptedAccessToken', c.encrypted_access_token,
    'tokenIv', c.token_iv,
    'tokenAuthTag', c.token_auth_tag,
    'tokenExpiresAt', c.token_expires_at
  )
  from public.instagram_connection_sessions as s
  join public.instagram_connections as c
    on c.instagram_user_id = s.instagram_user_id
  where s.session_hash = p_session_hash
    and s.expires_at > now()
    and c.token_expires_at > now();
$$;

revoke all on function public.consume_instagram_connection_receipt(text, text)
  from public, anon, authenticated;
revoke all on function public.get_instagram_dashboard_connection(text)
  from public, anon, authenticated;

grant execute on function public.consume_instagram_connection_receipt(text, text)
  to service_role;
grant execute on function public.get_instagram_dashboard_connection(text)
  to service_role;
