-- Migration 044: Calendar Slot Request V1
-- Adds lightweight appointment preference fields to booking requests.
-- This is not confirmed appointment scheduling or doctor availability.

alter table clinic_booking_requests
  add column if not exists alternative_preferred_date date,
  add column if not exists alternative_time_window varchar(40),
  add column if not exists visit_type varchar(40) not null default 'consultation',
  add column if not exists urgency varchar(40) not null default 'normal',
  add column if not exists slot_status varchar(40) not null default 'requested',
  add column if not exists slot_request_json jsonb not null default '{}'::jsonb;

alter table clinic_booking_requests
  drop constraint if exists clinic_booking_requests_alternative_time_window_check,
  drop constraint if exists clinic_booking_requests_visit_type_check,
  drop constraint if exists clinic_booking_requests_urgency_check,
  drop constraint if exists clinic_booking_requests_slot_status_check,
  drop constraint if exists clinic_booking_requests_slot_request_json_check;

alter table clinic_booking_requests
  add constraint clinic_booking_requests_alternative_time_window_check
    check (alternative_time_window is null or alternative_time_window in ('morning', 'afternoon', 'evening', 'anytime')),
  add constraint clinic_booking_requests_visit_type_check
    check (visit_type in ('consultation', 'treatment', 'follow_up', 'other')),
  add constraint clinic_booking_requests_urgency_check
    check (urgency in ('normal', 'soon', 'urgent')),
  add constraint clinic_booking_requests_slot_status_check
    check (slot_status in ('requested', 'reviewing', 'offered', 'accepted', 'rejected', 'expired')),
  add constraint clinic_booking_requests_slot_request_json_check
    check (jsonb_typeof(slot_request_json) = 'object');

create index if not exists idx_clinic_booking_requests_clinic_slot_status
  on clinic_booking_requests(clinic_id, slot_status);

create index if not exists idx_clinic_booking_requests_clinic_preferred_slot
  on clinic_booking_requests(clinic_id, preferred_date, preferred_time_window);

create index if not exists idx_clinic_booking_requests_clinic_alternative_slot
  on clinic_booking_requests(clinic_id, alternative_preferred_date, alternative_time_window);

alter table lead_activity drop constraint if exists lead_activity_event_type_check;

alter table lead_activity add constraint lead_activity_event_type_check
  check (
    event_type in (
      'lead.created',
      'lead.stage_changed',
      'lead.assigned',
      'lead.note_added',
      'lead.tag_added',
      'zonepang.interaction',
      'booking_request.created',
      'booking_request.status_changed',
      'booking_request.note_added',
      'booking_request.slot_status_changed'
    )
  );
