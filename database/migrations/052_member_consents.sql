-- Migration 052: Member Consent Management
-- Stores member-managed consent settings for the magic-link member portal.
-- This does not add legal advice, document versioning, marketing automation, or provider messaging.

create table if not exists clinic_member_consents (
  id                bigserial primary key,
  clinic_id         bigint not null references clinics(id) on delete cascade,
  member_id         bigint not null references clinic_members(id) on delete cascade,
  consent_key       varchar(80) not null,
  consent_status    varchar(20) not null default 'unknown'
                      check (consent_status in ('unknown', 'granted', 'revoked')),
  consent_source    varchar(80) not null default 'member_portal',
  consent_version   varchar(80),
  granted_at        timestamptz,
  revoked_at        timestamptz,
  last_updated_at   timestamptz not null default now(),
  metadata_json     jsonb not null default '{}'::jsonb
                      check (jsonb_typeof(metadata_json) = 'object'),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (clinic_id, member_id, consent_key)
);

create index if not exists idx_clinic_member_consents_clinic_member
  on clinic_member_consents(clinic_id, member_id);

create index if not exists idx_clinic_member_consents_clinic_key
  on clinic_member_consents(clinic_id, consent_key);

create index if not exists idx_clinic_member_consents_clinic_member_status
  on clinic_member_consents(clinic_id, member_id, consent_status);

alter table clinic_member_events drop constraint if exists clinic_member_events_event_type_check;

alter table clinic_member_events add constraint clinic_member_events_event_type_check
  check (length(trim(event_type)) > 0);
