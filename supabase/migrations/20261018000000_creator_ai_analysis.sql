create table if not exists public.creator_content_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  idempotency_key text not null,
  source text not null default 'manual'
    check (source in ('manual', 'instagram')),
  title text not null,
  transcript text,
  caption text,
  topic text,
  format text,
  duration_seconds integer
    check (duration_seconds is null or duration_seconds between 1 and 3600),
  published_at timestamptz,
  metrics jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metrics) = 'object'),
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  unique (id, user_id)
);

create table if not exists public.ai_analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  content_item_id uuid not null,
  job_type text not null default 'content_analysis'
    check (job_type = 'content_analysis'),
  status text not null default 'uploaded'
    check (status in ('uploaded', 'processing', 'analyzing', 'completed', 'failed')),
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (content_item_id, job_type),
  unique (id, user_id),
  foreign key (content_item_id, user_id)
    references public.creator_content_items (id, user_id) on delete cascade
);

create index if not exists ai_analysis_jobs_user_created_idx
  on public.ai_analysis_jobs (user_id, created_at desc);

create table if not exists public.content_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  content_item_id uuid not null,
  job_id uuid not null unique,
  analysis jsonb not null
    check (jsonb_typeof(analysis) = 'object'),
  model text not null,
  generated_at timestamptz not null default now(),
  unique (user_id, content_item_id),
  foreign key (content_item_id, user_id)
    references public.creator_content_items (id, user_id) on delete cascade,
  foreign key (job_id, user_id)
    references public.ai_analysis_jobs (id, user_id) on delete cascade
);

alter table public.creator_content_items enable row level security;
alter table public.ai_analysis_jobs enable row level security;
alter table public.content_analyses enable row level security;

create policy creator_content_items_owner_select
  on public.creator_content_items for select to authenticated
  using (user_id = auth.uid());

create policy ai_analysis_jobs_owner_select
  on public.ai_analysis_jobs for select to authenticated
  using (user_id = auth.uid());
create policy content_analyses_owner_select
  on public.content_analyses for select to authenticated
  using (user_id = auth.uid());

revoke all on table
  public.creator_content_items,
  public.ai_analysis_jobs,
  public.content_analyses
from anon, authenticated;
grant select on table
  public.creator_content_items,
  public.ai_analysis_jobs,
  public.content_analyses
to authenticated;
grant all on table
  public.creator_content_items,
  public.ai_analysis_jobs,
  public.content_analyses
to service_role;

create or replace function public.create_content_analysis_job(
  p_user_id uuid,
  p_idempotency_key text,
  p_content jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  content_id uuid;
  analysis_job_id uuid;
  result_status text;
  result_error_code text;
  content_record jsonb;
  analysis_record jsonb;
begin
  insert into public.creator_content_items (
    user_id,
    idempotency_key,
    source,
    title,
    transcript,
    caption,
    topic,
    format,
    duration_seconds,
    published_at,
    metrics
  )
  values (
    p_user_id,
    p_idempotency_key,
    coalesce(p_content->>'source', 'manual'),
    p_content->>'title',
    nullif(p_content->>'transcript', ''),
    nullif(p_content->>'caption', ''),
    nullif(p_content->>'topic', ''),
    nullif(p_content->>'format', ''),
    nullif(p_content->>'durationSeconds', '')::integer,
    nullif(p_content->>'publishedAt', '')::timestamptz,
    coalesce(p_content->'metrics', '{}'::jsonb)
  )
  on conflict (user_id, idempotency_key) do update
    set idempotency_key = excluded.idempotency_key
  returning id into content_id;

  insert into public.ai_analysis_jobs (user_id, content_item_id)
  values (p_user_id, content_id)
  on conflict (content_item_id, job_type) do nothing;

  select j.id, j.status, j.error_code
    into analysis_job_id, result_status, result_error_code
  from public.ai_analysis_jobs as j
  where j.user_id = p_user_id
    and j.content_item_id = content_id
    and j.job_type = 'content_analysis';

  select to_jsonb(c) into content_record
  from public.creator_content_items as c
  where c.id = content_id and c.user_id = p_user_id;

  select a.analysis into analysis_record
  from public.content_analyses as a
  where a.user_id = p_user_id and a.content_item_id = content_id;

  return jsonb_build_object(
    'jobId', analysis_job_id,
    'contentId', content_id,
    'status', result_status,
    'errorCode', result_error_code,
    'content', content_record,
    'analysis', analysis_record
  );
end;
$$;

create or replace function public.claim_content_analysis_job(
  p_user_id uuid,
  p_job_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result_status text;
  was_claimed boolean;
begin
  update public.ai_analysis_jobs
  set status = 'processing',
      error_code = null,
      updated_at = now()
  where id = p_job_id
    and user_id = p_user_id
    and (
      status in ('uploaded', 'failed')
      or (
        status in ('processing', 'analyzing')
        and updated_at < now() - interval '2 minutes'
      )
    )
  returning status into result_status;
  was_claimed := found;

  if result_status is null then
    select status into result_status
    from public.ai_analysis_jobs
    where id = p_job_id and user_id = p_user_id;
  end if;

  if result_status is null then
    return null;
  end if;
  return jsonb_build_object(
    'status', result_status,
    'claimed', coalesce(was_claimed, false)
  );
end;
$$;

create or replace function public.set_content_analysis_job_status(
  p_user_id uuid,
  p_job_id uuid,
  p_status text,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_status is null or p_status not in ('analyzing', 'failed') then
    raise exception 'Invalid content analysis job status.';
  end if;

  update public.ai_analysis_jobs
  set status = p_status,
      error_code = case when p_status = 'failed' then p_error_code else null end,
      updated_at = now()
  where id = p_job_id
    and user_id = p_user_id
    and status in ('processing', 'analyzing');
  return found;
end;
$$;

create or replace function public.save_content_analysis(
  p_user_id uuid,
  p_job_id uuid,
  p_analysis jsonb,
  p_model text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  content_id uuid;
begin
  select content_item_id into content_id
  from public.ai_analysis_jobs
  where id = p_job_id
    and user_id = p_user_id
    and status in ('processing', 'analyzing');
  if content_id is null then
    return false;
  end if;

  insert into public.content_analyses (
    user_id, content_item_id, job_id, analysis, model
  )
  values (p_user_id, content_id, p_job_id, p_analysis, p_model)
  on conflict (user_id, content_item_id) do update
    set job_id = excluded.job_id,
        analysis = excluded.analysis,
        model = excluded.model,
        generated_at = now();

  update public.ai_analysis_jobs
  set status = 'completed',
      error_code = null,
      updated_at = now()
  where id = p_job_id and user_id = p_user_id;
  return true;
end;
$$;

create or replace function public.get_content_analysis_job(
  p_user_id uuid,
  p_job_id uuid
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'jobId', j.id,
    'contentId', j.content_item_id,
    'status', j.status,
    'errorCode', j.error_code,
    'analysis', a.analysis,
    'generatedAt', a.generated_at
  )
  from public.ai_analysis_jobs as j
  left join public.content_analyses as a
    on a.job_id = j.id and a.user_id = j.user_id
  where j.id = p_job_id and j.user_id = p_user_id;
$$;

revoke all on function public.create_content_analysis_job(uuid, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.claim_content_analysis_job(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.set_content_analysis_job_status(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.save_content_analysis(uuid, uuid, jsonb, text)
  from public, anon, authenticated;
revoke all on function public.get_content_analysis_job(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.create_content_analysis_job(uuid, text, jsonb)
  to service_role;
grant execute on function public.claim_content_analysis_job(uuid, uuid)
  to service_role;
grant execute on function public.set_content_analysis_job_status(uuid, uuid, text, text)
  to service_role;
grant execute on function public.save_content_analysis(uuid, uuid, jsonb, text)
  to service_role;
grant execute on function public.get_content_analysis_job(uuid, uuid)
  to service_role;
