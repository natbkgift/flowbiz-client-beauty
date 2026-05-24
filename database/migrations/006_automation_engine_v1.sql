create table if not exists automation_flows (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  name text not null,
  flow_type text not null,
  trigger_type text not null check (trigger_type in ('event', 'scheduled')),
  status text not null default 'draft' check (status in ('draft', 'active', 'disabled', 'archived')),
  version integer not null default 1,
  entry_rule_json jsonb not null default '{}'::jsonb,
  created_by bigint null references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_automation_flows_status on automation_flows(clinic_id, status);
create index if not exists idx_automation_flows_trigger on automation_flows(clinic_id, trigger_type);
create index if not exists idx_automation_flows_created on automation_flows(clinic_id, created_at);

create table if not exists automation_steps (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  flow_id bigint not null references automation_flows(id) on delete cascade,
  step_order integer not null,
  step_type text not null check (step_type in ('wait', 'send_message', 'create_task', 'add_tag', 'remove_tag', 'change_stage', 'create_reminder', 'notify_user')),
  delay_minutes integer null,
  config_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automation_steps_unique_order unique (flow_id, step_order)
);

create table if not exists automation_executions (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  flow_id bigint not null references automation_flows(id) on delete cascade,
  entity_type text not null,
  entity_id bigint not null,
  trigger_event text not null,
  status text not null check (status in ('pending', 'running', 'waiting', 'completed', 'failed', 'cancelled')),
  started_at timestamptz null,
  finished_at timestamptz null,
  last_step_order integer null,
  context_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_automation_executions_flow_status on automation_executions(clinic_id, flow_id, status);
create index if not exists idx_automation_executions_entity on automation_executions(clinic_id, entity_type, entity_id);
create index if not exists idx_automation_executions_created on automation_executions(clinic_id, created_at);

create table if not exists automation_execution_logs (
  id bigserial primary key,
  execution_id bigint not null references automation_executions(id) on delete cascade,
  step_order integer not null,
  step_type text not null,
  status text not null,
  detail_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists automation_tasks (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  execution_id bigint not null references automation_executions(id) on delete cascade,
  assigned_user_id bigint null references users(id) on delete set null,
  task_type text not null,
  title text not null,
  description text null,
  due_at timestamptz null,
  status text not null default 'open' check (status in ('open', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists reminders (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  entity_type text not null,
  entity_id bigint not null,
  execution_id bigint null references automation_executions(id) on delete set null,
  reminder_type text not null,
  title text not null,
  due_at timestamptz null,
  status text not null default 'pending' check (status in ('pending', 'due', 'completed', 'cancelled')),
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);