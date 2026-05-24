create table if not exists leads (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  source text not null default 'manual' check (source in ('manual', 'website', 'line', 'facebook', 'referral', 'import')),
  source_ref text null,
  full_name text not null,
  nickname text null,
  phone text null,
  line_user_id text null,
  email text null,
  gender text null,
  birth_date timestamptz null,
  status text not null default 'new' check (status in ('new', 'active', 'won', 'lost', 'archived')),
  stage text not null default 'inquiry' check (stage in ('inquiry', 'qualified', 'consult_booked', 'consult_done', 'booked', 'no_show', 'converted')),
  owner_user_id bigint null references users(id) on delete set null,
  last_contacted_at timestamptz null,
  next_followup_at timestamptz null,
  intent_score integer null check (intent_score between 0 and 100),
  budget_range text null,
  preferred_branch text null,
  notes_summary text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_source_ref_unique unique (clinic_id, source_ref)
);

create table if not exists lead_interests (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  lead_id bigint not null references leads(id) on delete cascade,
  interest_type text not null default 'treatment',
  interest_name text not null,
  priority integer null,
  budget_min integer null,
  budget_max integer null,
  urgency text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists notes (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  entity_type text not null check (entity_type in ('lead')),
  entity_id bigint not null,
  author_user_id bigint null references users(id) on delete set null,
  note_type text not null default 'general',
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tags (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  name text not null,
  color text not null default '#C8B27D',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tags_clinic_name_unique unique (clinic_id, name)
);

create table if not exists entity_tags (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  tag_id bigint not null references tags(id) on delete cascade,
  entity_type text not null check (entity_type in ('lead')),
  entity_id bigint not null,
  created_at timestamptz not null default now(),
  constraint entity_tags_unique unique (clinic_id, tag_id, entity_type, entity_id)
);

create index if not exists idx_leads_clinic_status on leads(clinic_id, status);
create index if not exists idx_leads_clinic_stage on leads(clinic_id, stage);
create index if not exists idx_leads_clinic_owner on leads(clinic_id, owner_user_id);
create index if not exists idx_leads_clinic_followup on leads(clinic_id, next_followup_at);
create index if not exists idx_leads_clinic_created on leads(clinic_id, created_at desc);
create index if not exists idx_lead_interests_clinic_lead on lead_interests(clinic_id, lead_id);
create index if not exists idx_notes_clinic_entity on notes(clinic_id, entity_type, entity_id);
create index if not exists idx_entity_tags_clinic_entity on entity_tags(clinic_id, entity_type, entity_id);