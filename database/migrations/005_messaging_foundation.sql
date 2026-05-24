create table if not exists channels (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  channel_type text not null check (channel_type in ('line', 'email', 'sms')),
  name text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  is_primary boolean not null default false,
  config_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_channels_single_primary on channels(clinic_id) where is_primary = true;
create index if not exists idx_channels_clinic_type on channels(clinic_id, channel_type);

create table if not exists contact_identities (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  entity_type text not null check (entity_type in ('lead', 'customer')),
  entity_id bigint not null,
  channel_type text not null check (channel_type in ('line', 'email', 'sms')),
  external_id text not null,
  display_name text null,
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_contact_identities_primary_per_channel
  on contact_identities(clinic_id, entity_type, entity_id, channel_type)
  where is_primary = true;
create index if not exists idx_contact_identities_entity on contact_identities(clinic_id, entity_type, entity_id);

create table if not exists message_templates (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  channel_type text not null check (channel_type in ('line', 'email', 'sms')),
  name text not null,
  category text not null check (category in ('followup', 'reminder', 'promotion', 'review_request', 'reactivation')),
  language text not null default 'th',
  content text not null,
  variables_json jsonb not null default '{}'::jsonb,
  approval_status text not null default 'draft' check (approval_status in ('draft', 'approved', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint message_templates_unique_name unique (clinic_id, channel_type, name)
);

create index if not exists idx_message_templates_category on message_templates(clinic_id, category);

create table if not exists outbound_messages (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  channel_id bigint not null references channels(id) on delete cascade,
  entity_type text not null check (entity_type in ('lead', 'customer')),
  entity_id bigint not null,
  campaign_id bigint null,
  template_id bigint null references message_templates(id) on delete set null,
  automation_execution_id bigint null,
  message_type text not null check (message_type in ('manual', 'template', 'automation', 'campaign')),
  recipient_ref text not null,
  content_rendered text not null,
  status text not null check (status in ('pending', 'sent', 'delivered', 'failed', 'cancelled')),
  scheduled_at timestamptz null,
  sent_at timestamptz null,
  delivered_at timestamptz null,
  failed_at timestamptz null,
  failure_reason text null,
  provider_message_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_outbound_messages_status on outbound_messages(clinic_id, status);
create index if not exists idx_outbound_messages_entity on outbound_messages(clinic_id, entity_type, entity_id);
create index if not exists idx_outbound_messages_channel_created on outbound_messages(clinic_id, channel_id, created_at desc);
create index if not exists idx_outbound_messages_template on outbound_messages(clinic_id, template_id);