-- Migration 031: Phase 5 Social Inbound and Omnichannel Inbox Schema

-- 1. Extend check constraints on channels and contact_identities to include 'instagram' and 'tiktok'
ALTER TABLE channels DROP CONSTRAINT IF EXISTS channels_channel_type_check;
ALTER TABLE channels ADD CONSTRAINT channels_channel_type_check 
  CHECK (channel_type IN ('line', 'email', 'sms', 'facebook', 'instagram', 'tiktok'));

ALTER TABLE contact_identities DROP CONSTRAINT IF EXISTS contact_identities_channel_type_check;
ALTER TABLE contact_identities ADD CONSTRAINT contact_identities_channel_type_check 
  CHECK (channel_type IN ('line', 'email', 'sms', 'facebook', 'instagram', 'tiktok'));

-- 2. Extend check constraints on leads to include 'tiktok' and 'instagram'
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_source_check;
ALTER TABLE leads ADD CONSTRAINT leads_source_check
  CHECK (source IN ('manual', 'website', 'line', 'facebook', 'instagram', 'tiktok', 'referral', 'import'));

-- 3. Create inbound_leads_raw table for buffering social lead webhooks
CREATE TABLE IF NOT EXISTS inbound_leads_raw (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  source text not null check (source in ('tiktok', 'facebook', 'instagram', 'line')),
  raw_payload jsonb not null,
  processed boolean not null default false,
  processed_lead_id bigint null references leads(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. Create unified_chat_channels table for social integrations
CREATE TABLE IF NOT EXISTS unified_chat_channels (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  channel_type text not null check (channel_type in ('line', 'facebook', 'instagram', 'tiktok')),
  channel_name text not null,
  auth_token text not null,
  settings_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unified_chat_channels_unique_clinic_channel unique (clinic_id, channel_type)
);

-- 5. Create ai_copilot_suggestions table for AI Sales Co-Pilot
CREATE TABLE IF NOT EXISTS ai_copilot_suggestions (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  lead_id bigint not null references leads(id) on delete cascade,
  message_text text not null,
  suggested_response text not null,
  confidence_score numeric(5,2) not null,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

-- 6. Indexes for Phase 5 query performance
CREATE INDEX IF NOT EXISTS idx_inbound_leads_raw_clinic_processed ON inbound_leads_raw(clinic_id, processed);
CREATE INDEX IF NOT EXISTS idx_ai_copilot_suggestions_lead ON ai_copilot_suggestions(lead_id);
