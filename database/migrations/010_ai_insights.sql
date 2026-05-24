create table if not exists ai_lead_scores (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  lead_id bigint not null references leads(id) on delete cascade,
  score integer not null check (score between 0 and 100),
  confidence numeric(5, 2) not null check (confidence >= 0 and confidence <= 1),
  reason_json jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  constraint ai_lead_scores_unique_entity unique (clinic_id, lead_id)
);

create index if not exists idx_ai_lead_scores_entity on ai_lead_scores(clinic_id, lead_id);

create table if not exists ai_customer_scores (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  customer_id bigint not null references customers(id) on delete cascade,
  score integer not null check (score between 0 and 100),
  lifetime_value_estimate integer not null default 0 check (lifetime_value_estimate >= 0),
  engagement_score integer not null default 0 check (engagement_score between 0 and 100),
  generated_at timestamptz not null default now(),
  constraint ai_customer_scores_unique_entity unique (clinic_id, customer_id)
);

create index if not exists idx_ai_customer_scores_entity on ai_customer_scores(clinic_id, customer_id);

create table if not exists ai_recommendations (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  entity_type text not null check (entity_type in ('lead', 'customer')),
  entity_id bigint not null,
  recommendation_type text not null,
  recommendation_text text not null,
  priority text not null check (priority in ('low', 'medium', 'high', 'urgent')),
  confidence numeric(5, 2) not null check (confidence >= 0 and confidence <= 1),
  context_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ai_recommendations_unique_action unique (clinic_id, entity_type, entity_id, recommendation_type)
);

create index if not exists idx_ai_recommendations_entity on ai_recommendations(clinic_id, entity_type, entity_id, created_at desc);

create table if not exists ai_model_metadata (
  id bigserial primary key,
  model_name text not null,
  version text not null,
  parameters_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ai_model_metadata_unique_version unique (model_name, version)
);