-- CreatorDNA notifications
--
-- One row per notification, for exactly one creator. Every read, write and
-- delete goes through row level security that ties the row to the JWT's `sub`
-- (`auth.uid()`), so one creator can never select, insert, update or delete
-- another creator's notifications — no matter which endpoint they hit.
--
-- `user_id` defaults to `auth.uid()` so a client insert never has to know its
-- own user id (and therefore can never claim someone else's). A service-role
-- caller (an edge function generating notifications server side) passes
-- `user_id` explicitly, since `auth.uid()` is null for the service role.
--
-- The client talks to this table directly over PostgREST with the publishable
-- anon key plus the user's own session token. No service-role key ever leaves
-- the backend.

create table if not exists public.creator_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default (auth.uid())
    references auth.users (id) on delete cascade,

  type text not null
    check (type in (
      'dna',
      'growth_followers',
      'growth_engagement',
      'content_outperform',
      'ai_opportunity',
      'ideas_ready',
      'plan_today',
      'weekly_report',
      'account_reconnect',
      'account_sync_failed',
      'account_sync_ok'
    )),
  category text not null
    check (category in ('insights', 'content', 'plan', 'growth', 'account')),
  topic text not null
    check (topic in (
      'content_performance', 'dna', 'growth', 'ai', 'plan', 'weekly', 'account'
    )),

  title text not null check (char_length(title) between 1 and 160),
  message text not null default '' check (char_length(message) <= 600),

  is_read boolean not null default false,

  action_type text not null default 'none'
    check (action_type in ('none', 'screen', 'external')),
  action_target text,
  action_label text check (action_label is null or char_length(action_label) <= 40),

  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),

  -- Deduplication: the same real-world event can only ever exist once per
  -- creator (a week's report, a day's plan reminder, a specific post's
  -- outperformance). Clients send `on_conflict=user_id,dedupe_key` with
  -- `resolution=ignore-duplicates`, so a re-run is a no-op, not a spam burst.
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 200),

  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (user_id, dedupe_key)
);

create index if not exists creator_notifications_user_created_idx
  on public.creator_notifications (user_id, created_at desc);

create index if not exists creator_notifications_user_unread_idx
  on public.creator_notifications (user_id, created_at desc)
  where is_read = false;

alter table public.creator_notifications enable row level security;

drop policy if exists creator_notifications_select_own on public.creator_notifications;
create policy creator_notifications_select_own
  on public.creator_notifications for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists creator_notifications_insert_own on public.creator_notifications;
create policy creator_notifications_insert_own
  on public.creator_notifications for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists creator_notifications_update_own on public.creator_notifications;
create policy creator_notifications_update_own
  on public.creator_notifications for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists creator_notifications_delete_own on public.creator_notifications;
create policy creator_notifications_delete_own
  on public.creator_notifications for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- Explicit grants: new tables pick up Supabase's default privileges, which
-- would hand the `anon` role access too. Anonymous visitors have no `auth.uid()`
-- and must not reach this table at all.
revoke all on table public.creator_notifications from anon;
revoke all on table public.creator_notifications from authenticated;
grant select, insert, update, delete on table public.creator_notifications to authenticated;
grant usage on schema public to authenticated;
grant all on table public.creator_notifications to service_role;
