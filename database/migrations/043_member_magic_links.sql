-- Migration 043: Magic link member access foundation
-- Stores only token hashes for lightweight public member access.

create table if not exists clinic_member_access_tokens (
  id                bigserial primary key,
  clinic_id         bigint not null references clinics(id) on delete cascade,
  member_id         bigint not null references clinic_members(id) on delete cascade,
  token_hash        varchar(128) not null,
  purpose           varchar(40) not null default 'member_access'
                      check (purpose in ('member_access')),
  delivery_channel  varchar(40)
                      check (delivery_channel is null or delivery_channel in ('email', 'phone', 'line', 'unknown')),
  contact_hint      varchar(160),
  expires_at        timestamptz not null,
  used_at           timestamptz,
  revoked_at        timestamptz,
  request_ip_hash   varchar(128),
  user_agent_hash   varchar(128),
  metadata_json     jsonb not null default '{}'::jsonb
                      check (jsonb_typeof(metadata_json) = 'object'),
  created_at        timestamptz not null default now()
);

create index if not exists idx_clinic_member_access_tokens_clinic_id
  on clinic_member_access_tokens(clinic_id);

create index if not exists idx_clinic_member_access_tokens_clinic_member
  on clinic_member_access_tokens(clinic_id, member_id);

create unique index if not exists idx_clinic_member_access_tokens_hash_unique
  on clinic_member_access_tokens(token_hash);

create index if not exists idx_clinic_member_access_tokens_clinic_expires
  on clinic_member_access_tokens(clinic_id, expires_at);

alter table clinic_member_events drop constraint if exists clinic_member_events_event_type_check;

alter table clinic_member_events add constraint clinic_member_events_event_type_check
  check (
    event_type in (
      'member.created',
      'member.linked_to_lead',
      'member.linked_to_booking_request',
      'member.profile.updated',
      'member_access.requested',
      'member_access.verified'
    )
  );
