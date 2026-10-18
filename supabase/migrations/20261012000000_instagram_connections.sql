create table if not exists public.instagram_oauth_states (
  state_hash text primary key,
  return_uri text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists instagram_oauth_states_expiry_idx
  on public.instagram_oauth_states (expires_at);

create table if not exists public.instagram_oauth_attempts (
  client_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists instagram_oauth_attempts_created_at_idx
  on public.instagram_oauth_attempts (created_at);

create table if not exists public.instagram_connections (
  instagram_user_id text primary key,
  username text not null,
  account_type text not null
    check (account_type in ('Business', 'Media_Creator')),
  profile_picture_url text,
  encrypted_access_token text not null,
  token_iv text not null,
  token_auth_tag text not null,
  token_expires_at timestamptz not null,
  granted_permissions text[] not null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.instagram_connection_receipts (
  receipt_hash text primary key,
  instagram_user_id text not null
    references public.instagram_connections (instagram_user_id)
    on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists instagram_connection_receipts_expiry_idx
  on public.instagram_connection_receipts (expires_at);

alter table public.instagram_oauth_states enable row level security;
alter table public.instagram_oauth_attempts enable row level security;
alter table public.instagram_connections enable row level security;
alter table public.instagram_connection_receipts enable row level security;

revoke all on table
  public.instagram_oauth_states,
  public.instagram_oauth_attempts,
  public.instagram_connections,
  public.instagram_connection_receipts
from anon, authenticated;

grant all on table
  public.instagram_oauth_states,
  public.instagram_oauth_attempts,
  public.instagram_connections,
  public.instagram_connection_receipts
to service_role;

create or replace function public.begin_instagram_oauth(
  p_state_hash text,
  p_return_uri text,
  p_client_hash text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  recent_attempts integer;
begin
  delete from public.instagram_oauth_states
  where expires_at <= now();

  delete from public.instagram_oauth_attempts
  where created_at <= now() - interval '1 hour';

  delete from public.instagram_connection_receipts
  where expires_at <= now();

  select count(*)::integer into recent_attempts
  from public.instagram_oauth_attempts
  where client_hash = p_client_hash
    and created_at > now() - interval '1 minute';

  if recent_attempts >= 10 then
    return false;
  end if;

  insert into public.instagram_oauth_attempts (client_hash)
  values (p_client_hash);

  insert into public.instagram_oauth_states (
    state_hash, return_uri, expires_at
  )
  values (
    p_state_hash, p_return_uri, now() + interval '15 minutes'
  );

  return true;
end;
$$;

create or replace function public.consume_instagram_oauth_state(
  p_state_hash text
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  with consumed as (
    delete from public.instagram_oauth_states
    where state_hash = p_state_hash
      and expires_at > now()
    returning return_uri
  )
  select jsonb_build_object('return_uri', return_uri)
  from consumed;
$$;

create or replace function public.save_instagram_connection(
  p_instagram_user_id text,
  p_username text,
  p_account_type text,
  p_profile_picture_url text,
  p_encrypted_access_token text,
  p_token_iv text,
  p_token_auth_tag text,
  p_token_expires_at timestamptz,
  p_granted_permissions text[],
  p_receipt_hash text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.instagram_connections (
    instagram_user_id,
    username,
    account_type,
    profile_picture_url,
    encrypted_access_token,
    token_iv,
    token_auth_tag,
    token_expires_at,
    granted_permissions,
    connected_at,
    updated_at
  )
  values (
    p_instagram_user_id,
    p_username,
    p_account_type,
    p_profile_picture_url,
    p_encrypted_access_token,
    p_token_iv,
    p_token_auth_tag,
    p_token_expires_at,
    p_granted_permissions,
    now(),
    now()
  )
  on conflict (instagram_user_id) do update set
    username = excluded.username,
    account_type = excluded.account_type,
    profile_picture_url = excluded.profile_picture_url,
    encrypted_access_token = excluded.encrypted_access_token,
    token_iv = excluded.token_iv,
    token_auth_tag = excluded.token_auth_tag,
    token_expires_at = excluded.token_expires_at,
    granted_permissions = excluded.granted_permissions,
    updated_at = now();

  delete from public.instagram_connection_receipts
  where instagram_user_id = p_instagram_user_id;

  insert into public.instagram_connection_receipts (
    receipt_hash, instagram_user_id, expires_at
  )
  values (
    p_receipt_hash, p_instagram_user_id, now() + interval '5 minutes'
  );
end;
$$;

create or replace function public.consume_instagram_connection_receipt(
  p_receipt_hash text
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  with consumed as (
    delete from public.instagram_connection_receipts
    where receipt_hash = p_receipt_hash
      and expires_at > now()
    returning instagram_user_id
  )
  select jsonb_build_object(
    'username', c.username,
    'accountType', c.account_type,
    'profilePictureUrl', c.profile_picture_url
  )
  from consumed as r
  join public.instagram_connections as c
    on c.instagram_user_id = r.instagram_user_id;
$$;

revoke all on function public.begin_instagram_oauth(text, text, text)
  from public, anon, authenticated;
revoke all on function public.consume_instagram_oauth_state(text)
  from public, anon, authenticated;
revoke all on function public.save_instagram_connection(
  text, text, text, text, text, text, text, timestamptz, text[], text
) from public, anon, authenticated;
revoke all on function public.consume_instagram_connection_receipt(text)
  from public, anon, authenticated;

grant execute on function public.begin_instagram_oauth(text, text, text)
  to service_role;
grant execute on function public.consume_instagram_oauth_state(text)
  to service_role;
grant execute on function public.save_instagram_connection(
  text, text, text, text, text, text, text, timestamptz, text[], text
) to service_role;
grant execute on function public.consume_instagram_connection_receipt(text)
  to service_role;
