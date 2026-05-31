-- Migration 046: Customer Slot Offer Response via Magic Link
-- Adds public customer accept/decline state to slot offers only.
-- This is not confirmed appointment scheduling or calendar sync.

alter table clinic_booking_slot_offers
  add column if not exists customer_response varchar(40),
  add column if not exists customer_response_note text,
  add column if not exists customer_responded_at timestamptz;

alter table clinic_booking_slot_offers
  drop constraint if exists clinic_booking_slot_offers_customer_response_check;

alter table clinic_booking_slot_offers
  add constraint clinic_booking_slot_offers_customer_response_check
    check (customer_response is null or customer_response in ('accepted', 'declined'));

create index if not exists idx_slot_offers_clinic_customer_response
  on clinic_booking_slot_offers(clinic_id, customer_response);

create index if not exists idx_slot_offers_clinic_customer_responded
  on clinic_booking_slot_offers(clinic_id, customer_responded_at desc);

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
      'booking_request.slot_offer_customer_declined'
    )
  );
