create table if not exists analytics_daily_metrics (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  metric_date date not null,
  leads_created integer not null default 0,
  customers_created integer not null default 0,
  messages_sent integer not null default 0,
  automation_executions integer not null default 0,
  ai_recommendations_generated integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint analytics_daily_metrics_unique_day unique (clinic_id, metric_date)
);

create index if not exists idx_analytics_daily_metrics_clinic_date on analytics_daily_metrics(clinic_id, metric_date desc);

create table if not exists analytics_funnel_metrics (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  stage_name text not null,
  lead_count integer not null default 0,
  conversion_rate numeric(7, 4) not null default 0,
  calculated_at timestamptz not null default now(),
  constraint analytics_funnel_metrics_unique_stage unique (clinic_id, stage_name)
);

create index if not exists idx_analytics_funnel_metrics_clinic on analytics_funnel_metrics(clinic_id, stage_name);

create table if not exists analytics_ai_metrics (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  metric_date date not null,
  leads_scored integer not null default 0,
  customers_scored integer not null default 0,
  recommendations_generated integer not null default 0,
  recommendations_accepted integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint analytics_ai_metrics_unique_day unique (clinic_id, metric_date)
);

create index if not exists idx_analytics_ai_metrics_clinic_date on analytics_ai_metrics(clinic_id, metric_date desc);

create table if not exists audit_logs (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  entity_type text not null,
  entity_id bigint not null,
  action_type text not null,
  actor_user_id bigint null references users(id) on delete set null,
  context_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_entity on audit_logs(clinic_id, entity_type, entity_id, created_at desc);
create index if not exists idx_audit_logs_action on audit_logs(clinic_id, action_type, created_at desc);