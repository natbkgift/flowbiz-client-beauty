-- Migration 049: Notification Approval Gate
-- Approval/control records only. This does not send email, LINE, SMS, webhook, or provider traffic.

create table if not exists notification_approval_requests (
  id                    bigserial primary key,
  clinic_id             bigint not null references clinics(id) on delete cascade,
  draft_id              bigint not null references notification_drafts(id) on delete cascade,
  status                varchar(40) not null default 'pending'
                          check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  requested_by_user_id  bigint null references users(id) on delete set null,
  decided_by_user_id    bigint null references users(id) on delete set null,
  requested_note        text null,
  decision_note         text null,
  idempotency_key       text not null,
  requested_at          timestamptz not null default now(),
  decided_at            timestamptz null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index if not exists idx_notification_approval_requests_idempotency_key
  on notification_approval_requests(idempotency_key);

create unique index if not exists idx_notification_approval_requests_pending_draft
  on notification_approval_requests(draft_id)
  where status = 'pending';

create index if not exists idx_notification_approval_requests_clinic_draft
  on notification_approval_requests(clinic_id, draft_id);

create index if not exists idx_notification_approval_requests_clinic_status
  on notification_approval_requests(clinic_id, status);
