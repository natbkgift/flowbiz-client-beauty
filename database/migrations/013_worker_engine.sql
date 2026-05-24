create table if not exists worker_jobs (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  job_type text not null,
  payload_json jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed', 'cancelled')),
  run_at timestamptz not null default now(),
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_worker_jobs_pending on worker_jobs(status, run_at, clinic_id);
create index if not exists idx_worker_jobs_clinic_type on worker_jobs(clinic_id, job_type, status);