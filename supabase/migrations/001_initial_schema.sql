begin;

-- Initial Supabase Schema for App-Relay v1
create extension if not exists pgcrypto;

-- 1. Apps
create table if not exists public.apps (
  package_id text primary key,
  play_url text not null,

  title text,
  developer text,
  version_name text,
  version_code bigint,
  rating numeric(3, 2),
  installs_text text,
  description text,
  listing_metadata jsonb not null default '{}'::jsonb,

  screenshot_count integer not null default 0,
  split_count integer not null default 0,
  base_apk_size_bytes bigint,
  artifact_size_bytes bigint,

  last_successful_job_id text,
  first_seen_at timestamptz not null default now(),
  last_pulled_at timestamptz,
  updated_at timestamptz not null default now()
);

-- 2. Workers
create table if not exists public.workers (
  id text primary key,
  name text,

  status text not null default 'online'
    check (status in ('online', 'busy', 'draining')),

  current_job_id text,
  version text,
  capabilities jsonb not null default '{}'::jsonb,
  host_info jsonb not null default '{}'::jsonb,
  stats jsonb not null default '{}'::jsonb,

  last_heartbeat_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Jobs
create table if not exists public.jobs (
  id text primary key,
  batch_id uuid,

  package_id text not null,
  play_url text not null,

  include_listing boolean not null default true,
  include_screenshots boolean not null default true,
  options jsonb not null default '{}'::jsonb,

  status text not null default 'queued'
    check (
      status in (
        'queued',
        'running',
        'cancelling',
        'completed',
        'failed',
        'cancelled'
      )
    ),

  current_step text,
  progress smallint not null default 0
    check (progress between 0 and 100),

  priority smallint not null default 0,
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,

  worker_id text
    references public.workers(id)
    on delete set null,

  lease_expires_at timestamptz,
  last_heartbeat_at timestamptz,

  cancel_requested_at timestamptz,
  cancel_reason text,

  error_code text,
  error_message text,
  error_retryable boolean,

  result_summary jsonb not null default '{}'::jsonb,
  idempotency_key text unique,

  queued_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. Job events
create table if not exists public.job_events (
  id bigint generated always as identity primary key,

  job_id text not null
    references public.jobs(id)
    on delete cascade,

  event_type text not null,

  level text not null default 'info'
    check (level in ('debug', 'info', 'warning', 'error')),

  message text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 5. Artifact metadata
create table if not exists public.artifacts (
  id uuid primary key default gen_random_uuid(),

  job_id text not null unique
    references public.jobs(id)
    on delete cascade,

  kind text not null default 'bundle_zip',

  state text not null default 'preparing'
    check (
      state in (
        'preparing',
        'available',
        'expired',
        'deleted'
      )
    ),

  file_name text not null,
  content_type text not null default 'application/zip',
  size_bytes bigint,
  sha256 text,

  storage_backend text not null default 'api_disk',
  locator text,
  expires_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index if not exists jobs_queue_idx
  on public.jobs(priority desc, created_at asc)
  where status = 'queued';

create index if not exists jobs_status_created_idx
  on public.jobs(status, created_at desc);

create index if not exists jobs_worker_idx
  on public.jobs(worker_id, status);

create index if not exists jobs_batch_idx
  on public.jobs(batch_id)
  where batch_id is not null;

create index if not exists job_events_timeline_idx
  on public.job_events(job_id, created_at asc);

create index if not exists workers_heartbeat_idx
  on public.workers(last_heartbeat_at desc);

-- Automatically update updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists apps_set_updated_at
  on public.apps;

create trigger apps_set_updated_at
before update on public.apps
for each row
execute function public.set_updated_at();

drop trigger if exists workers_set_updated_at
  on public.workers;

create trigger workers_set_updated_at
before update on public.workers
for each row
execute function public.set_updated_at();

drop trigger if exists jobs_set_updated_at
  on public.jobs;

create trigger jobs_set_updated_at
before update on public.jobs
for each row
execute function public.set_updated_at();

drop trigger if exists artifacts_set_updated_at
  on public.artifacts;

create trigger artifacts_set_updated_at
before update on public.artifacts
for each row
execute function public.set_updated_at();

-- Atomically claim one queued or expired job
create or replace function public.claim_job(
  p_worker_id text,
  p_lease_seconds integer default 120
)
returns setof public.jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.jobs%rowtype;
begin
  insert into public.workers (
    id,
    status,
    last_heartbeat_at
  )
  values (
    p_worker_id,
    'online',
    now()
  )
  on conflict (id) do update
  set
    last_heartbeat_at = now(),
    updated_at = now();

  with candidate as (
    select id
    from public.jobs
    where (
      status = 'queued'
      or (
        status = 'running'
        and lease_expires_at < now()
      )
    )
      and cancel_requested_at is null
      and attempt_count < max_attempts
    order by
      priority desc,
      created_at asc
    for update skip locked
    limit 1
  )
  update public.jobs as j
  set
    status = 'running',
    worker_id = p_worker_id,
    attempt_count = j.attempt_count + 1,
    started_at = coalesce(j.started_at, now()),
    lease_expires_at =
      now() + make_interval(secs => p_lease_seconds),
    last_heartbeat_at = now(),
    updated_at = now()
  from candidate as c
  where j.id = c.id
  returning j.* into v_job;

  if not found then
    update public.workers
    set
      status = 'online',
      current_job_id = null,
      updated_at = now()
    where id = p_worker_id;

    return;
  end if;

  update public.workers
  set
    status = 'busy',
    current_job_id = v_job.id,
    last_heartbeat_at = now(),
    updated_at = now()
  where id = p_worker_id;

  insert into public.job_events (
    job_id,
    event_type,
    message,
    data
  )
  values (
    v_job.id,
    'job.claimed',
    'Job claimed by worker',
    jsonb_build_object(
      'workerId', p_worker_id,
      'attempt', v_job.attempt_count
    )
  );

  return next v_job;
end;
$$;

-- Block direct anonymous access.
-- The API server using sb_secret/service_role can still access these tables.
alter table public.apps enable row level security;
alter table public.workers enable row level security;
alter table public.jobs enable row level security;
alter table public.job_events enable row level security;
alter table public.artifacts enable row level security;

revoke all on public.apps from anon, authenticated;
revoke all on public.workers from anon, authenticated;
revoke all on public.jobs from anon, authenticated;
revoke all on public.job_events from anon, authenticated;
revoke all on public.artifacts from anon, authenticated;

revoke execute
on function public.claim_job(text, integer)
from public, anon, authenticated;

grant execute
on function public.claim_job(text, integer)
to service_role;

commit;