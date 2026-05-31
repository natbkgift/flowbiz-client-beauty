-- Migration 045: Admin Slot Offer / Appointment Confirmation Draft
-- Lightweight appointment offer drafts only. This is not confirmed scheduling.

create table if not exists clinic_booking_slot_offers (
  id                   bigserial primary key,
  clinic_id            bigint not null references clinics(id) on delete cascade,
  booking_request_id   bigint not null references clinic_booking_requests(id) on delete cascade,
  lead_id              bigint references leads(id) on delete set null,
  member_id            bigint references clinic_members(id) on delete set null,
  offered_date         date not null,
  offered_time_window  varchar(40) not null
                         check (offered_time_window in ('morning', 'afternoon', 'evening', 'anytime', 'specific_time')),
  offered_start_time   varchar(10),
  duration_minutes     integer
                         check (duration_minutes is null or duration_minutes between 5 and 480),
  offer_status         varchar(40) not null default 'draft'
                         check (offer_status in ('draft', 'ready_to_send', 'sent', 'accepted', 'declined', 'cancelled', 'expired')),
  offer_note           text,
  internal_note        text,
  created_by_user_id   bigint references users(id) on delete set null,
  updated_by_user_id   bigint references users(id) on delete set null,
  metadata_json        jsonb not null default '{}'::jsonb
                         check (jsonb_typeof(metadata_json) = 'object'),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_clinic_booking_slot_offers_clinic_id
  on clinic_booking_slot_offers(clinic_id);

create index if not exists idx_clinic_booking_slot_offers_clinic_booking_request
  on clinic_booking_slot_offers(clinic_id, booking_request_id);

create index if not exists idx_clinic_booking_slot_offers_clinic_offer_status
  on clinic_booking_slot_offers(clinic_id, offer_status);

create index if not exists idx_clinic_booking_slot_offers_clinic_offered_date
  on clinic_booking_slot_offers(clinic_id, offered_date);

create index if not exists idx_clinic_booking_slot_offers_clinic_created
  on clinic_booking_slot_offers(clinic_id, created_at desc);

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
      'booking_request.slot_status_changed',
      'booking_request.slot_offer_created',
      'booking_request.slot_offer_status_changed'
    )
  );
