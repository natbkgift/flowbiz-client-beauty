-- Migration 050: Safety-gated email delivery attempt statuses
-- Opens notification_delivery_attempts for manual real email attempts only.
-- This does not add LINE/SMS real delivery, auto-send, retry queues, or provider traffic.

alter table notification_delivery_attempts
  drop constraint if exists notification_delivery_attempts_mode_check;

alter table notification_delivery_attempts
  add constraint notification_delivery_attempts_mode_check
    check (mode in ('dry_run', 'real'));

alter table notification_delivery_attempts
  drop constraint if exists notification_delivery_attempts_status_check;

alter table notification_delivery_attempts
  add constraint notification_delivery_attempts_status_check
    check (status in ('dry_run', 'blocked', 'sending', 'sent', 'failed'));
