create table if not exists ai_outcomes (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  workspace_id bigint not null references workspaces(id) on delete cascade,
  entity_type text not null check (entity_type in ('lead', 'message', 'flow')),
  entity_id bigint not null,
  action_type text not null,
  outcome_type text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  source_event_id bigint null references event_store(id) on delete set null,
  idempotency_key text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_ai_outcomes_scope_idempotency
  on ai_outcomes(clinic_id, workspace_id, idempotency_key);

create unique index if not exists idx_ai_outcomes_source_event
  on ai_outcomes(source_event_id)
  where source_event_id is not null;

create index if not exists idx_ai_outcomes_scope_entity_created
  on ai_outcomes(clinic_id, workspace_id, entity_type, entity_id, created_at desc);

create index if not exists idx_ai_outcomes_action_outcome_created
  on ai_outcomes(clinic_id, workspace_id, action_type, outcome_type, created_at desc);

create table if not exists ai_action_executions (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  workspace_id bigint not null references workspaces(id) on delete cascade,
  entity_type text not null check (entity_type in ('lead', 'message', 'flow')),
  entity_id bigint not null,
  action_key text not null,
  status text not null default 'pending' check (status in ('pending', 'executed', 'skipped', 'rate_limited', 'failed')),
  metadata_json jsonb not null default '{}'::jsonb,
  source_event_id bigint null references event_store(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_ai_action_executions_source_action
  on ai_action_executions(clinic_id, workspace_id, entity_type, entity_id, action_key, source_event_id);

create index if not exists idx_ai_action_executions_scope_entity_created
  on ai_action_executions(clinic_id, workspace_id, entity_type, entity_id, created_at desc);

create index if not exists idx_ai_action_executions_action_status
  on ai_action_executions(clinic_id, workspace_id, action_key, status, created_at desc);