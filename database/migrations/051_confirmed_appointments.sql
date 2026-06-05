-- Migration 051: Confirmed Appointment Foundation
-- Confirmed appointments created by manual admin action from accepted slot offers.
-- This does not add conflict guards, provider availability, capacity rules, calendar sync, or auto-send.

create table if not exists clinic_confirmed_appointments (
  id                    bigserial primary key,
  clinic_id             bigint not null references clinics(id) on delete cascade,
  booking_request_id    bigint references clinic_booking_requests(id) on delete set null,
  slot_offer_id         bigint references clinic_booking_slot_offers(id) on delete set null,
  lead_id               bigint references leads(id) on delete set null,
  member_id             bigint references clinic_members(id) on delete set null,
  appointment_date      date not null,
  start_time            varchar(10) not null,
  end_time              varchar(10),
  duration_minutes      integer not null check (duration_minutes between 5 and 480),
  timezone              varchar(80) not null default 'Asia/Bangkok',
  visit_type            varchar(40),
  status                varchar(40) not null default 'scheduled'
                          check (status in ('scheduled', 'cancelled', 'completed', 'no_show')),
  source                varchar(80) not null default 'slot_offer',
  confirmed_by_user_id  bigint references users(id) on delete set null,
  cancelled_by_user_id  bigint references users(id) on delete set null,
  cancelled_at          timestamptz,
  cancellation_reason   text,
  metadata_json         jsonb not null default '{}'::jsonb
                          check (jsonb_typeof(metadata_json) = 'object'),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_confirmed_appointments_clinic_id
  on clinic_confirmed_appointments(clinic_id);

create index if not exists idx_confirmed_appointments_clinic_date
  on clinic_confirmed_appointments(clinic_id, appointment_date);

create index if not exists idx_confirmed_appointments_clinic_status
  on clinic_confirmed_appointments(clinic_id, status);

create index if not exists idx_confirmed_appointments_clinic_member
  on clinic_confirmed_appointments(clinic_id, member_id);

create index if not exists idx_confirmed_appointments_clinic_lead
  on clinic_confirmed_appointments(clinic_id, lead_id);

create index if not exists idx_confirmed_appointments_clinic_booking_request
  on clinic_confirmed_appointments(clinic_id, booking_request_id);

create index if not exists idx_confirmed_appointments_clinic_slot_offer
  on clinic_confirmed_appointments(clinic_id, slot_offer_id);

create index if not exists idx_confirmed_appointments_clinic_created
  on clinic_confirmed_appointments(clinic_id, created_at desc);

create unique index if not exists idx_confirmed_appointments_unique_slot_offer
  on clinic_confirmed_appointments(clinic_id, slot_offer_id)
  where slot_offer_id is not null;

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
      'booking_request.slot_offer_status_changed',
      'booking_request.slot_offer_customer_accepted',
      'booking_request.slot_offer_customer_declined',
      'booking_request.appointment_confirmed',
      'booking_request.appointment_status_changed',
      'booking_request.appointment_cancelled'
    )
  );
