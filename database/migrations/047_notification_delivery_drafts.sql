-- Migration 047: Notification Delivery Drafts
-- Draft records only. This does not send email, LINE, SMS, webhook, or provider traffic.

create table if not exists notification_drafts (
  id               bigserial primary key,
  clinic_id        bigint not null references clinics(id) on delete cascade,
  event_type       varchar(120) not null
                     check (event_type in (
                       'slot_offer.sent',
                       'slot_offer.accepted',
                       'slot_offer.declined',
                       'booking_request.status_changed'
                     )),
  recipient_type   varchar(80) not null,
  recipient_id     bigint null,
  recipient_ref    text not null,
  channel          varchar(40) not null check (channel in ('line', 'email', 'sms')),
  title            text not null,
  subject          text not null,
  message          text not null,
  status           varchar(40) not null default 'draft' check (status = 'draft'),
  source_type      varchar(80) not null,
  source_id        text not null,
  idempotency_key  text not null,
  metadata_json    jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata_json) = 'object'),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists idx_notification_drafts_idempotency_key
  on notification_drafts(idempotency_key);

create index if not exists idx_notification_drafts_clinic_created
  on notification_drafts(clinic_id, created_at desc);

create index if not exists idx_notification_drafts_source
  on notification_drafts(clinic_id, source_type, source_id);

create index if not exists idx_notification_drafts_event_status
  on notification_drafts(clinic_id, event_type, status);
