-- Migration 042: Lightweight member profile foundation
-- Clinic-scoped member identity linking public leads and booking requests.

create table if not exists clinic_members (
  id             bigserial primary key,
  clinic_id      bigint not null references clinics(id) on delete cascade,
  customer_id    bigint references customers(id) on delete set null,
  lead_id        bigint references leads(id) on delete set null,
  display_name   varchar(160),
  phone          varchar(40),
  email          varchar(160),
  line_id        varchar(80),
  status         varchar(40) not null default 'active'
                   check (status in ('active', 'inactive', 'blocked', 'merged')),
  source         varchar(80) not null default 'public_intake'
                   check (source in ('public_lead_capture', 'public_booking_request', 'admin_import', 'manual', 'public_intake')),
  profile_json   jsonb not null default '{}'::jsonb
                   check (jsonb_typeof(profile_json) = 'object'),
  consent_json   jsonb not null default '{}'::jsonb
                   check (jsonb_typeof(consent_json) = 'object'),
  last_seen_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_clinic_members_clinic_id
  on clinic_members(clinic_id);

create index if not exists idx_clinic_members_clinic_status
  on clinic_members(clinic_id, status);

create index if not exists idx_clinic_members_clinic_phone
  on clinic_members(clinic_id, phone);

create index if not exists idx_clinic_members_clinic_email_lower
  on clinic_members(clinic_id, lower(email));

create index if not exists idx_clinic_members_clinic_line_id
  on clinic_members(clinic_id, line_id);

create index if not exists idx_clinic_members_clinic_lead
  on clinic_members(clinic_id, lead_id);

create unique index if not exists idx_clinic_members_unique_email
  on clinic_members(clinic_id, lower(email))
  where email is not null;

create unique index if not exists idx_clinic_members_unique_phone
  on clinic_members(clinic_id, phone)
  where phone is not null;

create unique index if not exists idx_clinic_members_unique_line_id
  on clinic_members(clinic_id, line_id)
  where line_id is not null;

create table if not exists clinic_member_events (
  id                  bigserial primary key,
  clinic_id           bigint not null references clinics(id) on delete cascade,
  member_id           bigint not null references clinic_members(id) on delete cascade,
  lead_id             bigint,
  booking_request_id  bigint,
  event_type          varchar(80) not null
                        check (event_type in (
                          'member.created',
                          'member.linked_to_lead',
                          'member.linked_to_booking_request',
                          'member.profile.updated'
                        )),
  event_summary_json  jsonb not null default '{}'::jsonb
                        check (jsonb_typeof(event_summary_json) = 'object'),
  created_at          timestamptz not null default now()
);

create index if not exists idx_clinic_member_events_clinic_id
  on clinic_member_events(clinic_id);

create index if not exists idx_clinic_member_events_clinic_member
  on clinic_member_events(clinic_id, member_id);

create index if not exists idx_clinic_member_events_clinic_lead
  on clinic_member_events(clinic_id, lead_id);

create index if not exists idx_clinic_member_events_clinic_booking
  on clinic_member_events(clinic_id, booking_request_id);

create index if not exists idx_clinic_member_events_clinic_created
  on clinic_member_events(clinic_id, created_at desc);

alter table clinic_booking_requests
  add column if not exists member_id bigint references clinic_members(id) on delete set null;

create index if not exists idx_clinic_booking_requests_clinic_member
  on clinic_booking_requests(clinic_id, member_id);
