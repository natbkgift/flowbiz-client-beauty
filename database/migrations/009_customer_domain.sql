create table if not exists customers (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  source_lead_id bigint null references leads(id) on delete set null,
  full_name text not null,
  phone text null,
  email text null,
  status text not null default 'active' check (status in ('active', 'inactive', 'vip', 'churn_risk')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_clinic_phone_unique unique nulls not distinct (clinic_id, phone),
  constraint customers_clinic_email_unique unique nulls not distinct (clinic_id, email)
);

create unique index if not exists idx_customers_source_lead_unique
  on customers(clinic_id, source_lead_id);
create index if not exists idx_customers_clinic on customers(clinic_id);
create index if not exists idx_customers_clinic_status on customers(clinic_id, status);
create index if not exists idx_customers_clinic_created on customers(clinic_id, created_at desc);

create table if not exists customer_profiles (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  customer_id bigint not null references customers(id) on delete cascade,
  preferred_channel text null check (preferred_channel in ('line', 'email', 'sms')),
  tags text[] not null default '{}'::text[],
  meta_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_customer_profiles_customer_unique on customer_profiles(customer_id);
create index if not exists idx_customer_profiles_clinic_customer on customer_profiles(clinic_id, customer_id);

create table if not exists customer_events (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  customer_id bigint not null references customers(id) on delete cascade,
  event_type text not null,
  event_source text not null,
  event_payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_customer_events_clinic on customer_events(clinic_id);
create index if not exists idx_customer_events_customer on customer_events(clinic_id, customer_id, created_at desc);

create table if not exists customer_notes (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  customer_id bigint not null references customers(id) on delete cascade,
  note_text text not null,
  created_by_user_id bigint null references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_customer_notes_customer on customer_notes(clinic_id, customer_id, created_at desc);