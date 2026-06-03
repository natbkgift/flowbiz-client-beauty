-- Migration 048: Notification Delivery Attempts
-- Dry-run attempt records only. This does not send email, LINE, SMS, webhook, or provider traffic.

create table if not exists notification_delivery_attempts (
  id                bigserial primary key,
  clinic_id         bigint not null references clinics(id) on delete cascade,
  draft_id          bigint not null references notification_drafts(id) on delete cascade,
  channel           varchar(40) not null check (channel in ('line', 'email', 'sms')),
  provider          varchar(80) not null,
  mode              varchar(40) not null default 'dry_run' check (mode = 'dry_run'),
  status            varchar(40) not null default 'dry_run' check (status in ('dry_run', 'blocked')),
  recipient_type    varchar(80) not null,
  recipient_id      bigint null,
  recipient_ref     text not null,
  payload_json      jsonb not null default '{}'::jsonb check (jsonb_typeof(payload_json) = 'object'),
  result_json       jsonb not null default '{}'::jsonb check (jsonb_typeof(result_json) = 'object'),
  idempotency_key   text not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists idx_notification_delivery_attempts_idempotency_key
  on notification_delivery_attempts(idempotency_key);

create unique index if not exists idx_notification_delivery_attempts_draft_mode_channel_provider
  on notification_delivery_attempts(draft_id, mode, channel, provider);

create index if not exists idx_notification_delivery_attempts_clinic_draft_created
  on notification_delivery_attempts(clinic_id, draft_id, created_at desc);
