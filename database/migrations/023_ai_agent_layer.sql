create table if not exists ai_insights (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  workspace_id bigint not null references workspaces(id) on delete cascade,
  entity_type text not null check (entity_type in ('lead', 'automation_flow')),
  entity_id bigint not null,
  insight_type text not null,
  insight_data_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_insights_scope_entity
  on ai_insights(clinic_id, workspace_id, entity_type, entity_id, created_at desc);
