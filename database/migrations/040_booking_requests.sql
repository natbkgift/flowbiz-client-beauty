-- Migration 040: Public clinic booking request workflow
-- Lightweight request intake linked to CRM leads. This is not appointment scheduling.

create table if not exists clinic_booking_requests (
  id                       bigserial primary key,
  clinic_id                bigint not null references clinics(id) on delete cascade,
  lead_id                  bigint references leads(id) on delete set null,
  source                   varchar(80) not null default 'public_clinic_website',
  request_type             varchar(40) not null default 'consultation'
                             check (request_type in ('consultation', 'booking_request', 'follow_up')),
  interest_type            varchar(40) not null default 'general'
                             check (interest_type in ('service', 'promotion', 'package', 'general')),
  interest_id              bigint null,
  preferred_date           date null,
  preferred_time_window    varchar(40) null
                             check (preferred_time_window is null or preferred_time_window in ('morning', 'afternoon', 'evening', 'anytime')),
  preferred_contact_method varchar(40) null
                             check (preferred_contact_method is null or preferred_contact_method in ('phone', 'line', 'email', 'any')),
  customer_name            varchar(120) null,
  phone                    varchar(40) null,
  email                    varchar(160) null,
  line_id                  varchar(80) null,
  message                  text null,
  status                   varchar(40) not null default 'new'
                             check (status in ('new', 'contacted', 'confirmed', 'cancelled', 'closed')),
  metadata_json            jsonb not null default '{}'::jsonb
                             check (jsonb_typeof(metadata_json) = 'object'),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists idx_clinic_booking_requests_clinic_id
  on clinic_booking_requests(clinic_id);

create index if not exists idx_clinic_booking_requests_clinic_status
  on clinic_booking_requests(clinic_id, status);

create index if not exists idx_clinic_booking_requests_clinic_created
  on clinic_booking_requests(clinic_id, created_at desc);

create index if not exists idx_clinic_booking_requests_clinic_lead
  on clinic_booking_requests(clinic_id, lead_id);

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
      'booking_request.created'
    )
  );
