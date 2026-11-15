-- CreatorDNA saved ideas (Discover 2.0's Idea Studio)
--
-- One row per idea a creator saved out of the Idea Studio, for exactly one
-- creator. The row keeps the idea itself (title, platform, script, caption)
-- and the exact story it was built from (source URL and headline), so a saved
-- idea can always be traced back to the Discover card it came from — never to
-- a different story.
--
-- `user_id` defaults to `auth.uid()` so a client insert never has to know its
-- own user id (and therefore can never claim someone else's). Row level
-- security ties every select, insert, update and delete to the JWT's `sub`,
-- so one creator can never read or touch another creator's saved ideas — no
-- matter which endpoint they hit.
--
-- `status` mirrors the plan's statuses so a saved idea can move into the
-- Content tab's schedule without a conversion. The client talks to this table
-- directly over PostgREST with the publishable anon key plus the user's own
-- session token; no service-role key ever leaves the backend.

create table if not exists public.saved_ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default (auth.uid())
    references auth.users (id) on delete cascade,

  -- The idea exactly as the studio produced it.
  title text not null check (char_length(title) between 1 and 300),
  platform text not null check (char_length(platform) between 1 and 60),
  angle text check (angle is null or char_length(angle) <= 400),
  hook text check (hook is null or char_length(hook) <= 400),
  outline text[] not null default '{}'
    check (array_length(outline, 1) is null or array_length(outline, 1) <= 12),
  script text not null default '' check (char_length(script) <= 8000),
  caption text not null default '' check (char_length(caption) <= 1000),
  hashtags text[] not null default '{}'
    check (array_length(hashtags, 1) is null or array_length(hashtags, 1) <= 15),
  thumbnail_concept text
    check (thumbnail_concept is null or char_length(thumbnail_concept) <= 1200),

  -- The exact story this idea came from. The URL and headline are required:
  -- a saved idea that cannot cite its source is not worth saving.
  source_url text not null check (char_length(source_url) between 1 and 2000),
  source_title text not null check (char_length(source_title) between 1 and 400),
  source_publisher text
    check (source_publisher is null or char_length(source_publisher) <= 200),
  source_category text
    check (source_category is null or char_length(source_category) <= 120),
  source_image_url text
    check (source_image_url is null or char_length(source_image_url) <= 2000),

  -- Plan alignment: the same four statuses the Content tab already uses.
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'published', 'skipped')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Newest first per creator: the Saved list opens on what was just saved.
create index if not exists saved_ideas_user_created_idx
  on public.saved_ideas (user_id, created_at desc);

alter table public.saved_ideas enable row level security;

drop policy if exists saved_ideas_select_own on public.saved_ideas;
create policy saved_ideas_select_own
  on public.saved_ideas for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists saved_ideas_insert_own on public.saved_ideas;
create policy saved_ideas_insert_own
  on public.saved_ideas for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists saved_ideas_update_own on public.saved_ideas;
create policy saved_ideas_update_own
  on public.saved_ideas for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists saved_ideas_delete_own on public.saved_ideas;
create policy saved_ideas_delete_own
  on public.saved_ideas for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- Explicit grants: new tables pick up Supabase's default privileges, which
-- would otherwise hand `anon` a full grant. Only the signed-in creator and
-- the service role get a seat at this table.
revoke all on table public.saved_ideas from anon;
grant select, insert, update, delete on table public.saved_ideas to authenticated;
grant usage on schema public to authenticated;
grant all on table public.saved_ideas to service_role;
