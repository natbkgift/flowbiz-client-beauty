create table if not exists event_store (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  event_type text not null,
  entity_type text not null,
  entity_id bigint not null,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_event_store_clinic_type on event_store(clinic_id, event_type, created_at desc);
create index if not exists idx_event_store_entity on event_store(clinic_id, entity_type, entity_id, created_at desc);