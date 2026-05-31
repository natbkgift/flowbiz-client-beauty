-- Migration 041: Admin booking request queue events
-- Adds summary-only lead activity event types for staff follow-up actions.

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
      'booking_request.note_added'
    )
  );
