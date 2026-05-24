create table if not exists ai_feature_vectors (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  entity_type text not null,
  entity_id bigint not null,
  feature_json jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  constraint ai_feature_vectors_unique unique (clinic_id, entity_type, entity_id)
);

create index if not exists idx_ai_feature_vectors_entity on ai_feature_vectors(clinic_id, entity_type, entity_id);

create table if not exists ai_predictions (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  entity_type text not null,
  entity_id bigint not null,
  prediction_type text not null,
  score numeric(6,4) not null,
  next_best_action text null,
  detail_json jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  constraint ai_predictions_unique unique (clinic_id, entity_type, entity_id, prediction_type)
);

create index if not exists idx_ai_predictions_entity on ai_predictions(clinic_id, entity_type, entity_id, prediction_type);