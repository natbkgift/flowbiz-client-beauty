-- 1. ปลดล็อกและเพิ่มช่องทาง Facebook ในตาราง channels และ contact_identities
ALTER TABLE channels DROP CONSTRAINT IF EXISTS channels_channel_type_check;
ALTER TABLE channels ADD CONSTRAINT channels_channel_type_check 
  CHECK (channel_type IN ('line', 'email', 'sms', 'facebook'));

ALTER TABLE contact_identities DROP CONSTRAINT IF EXISTS contact_identities_channel_type_check;
ALTER TABLE contact_identities ADD CONSTRAINT contact_identities_channel_type_check 
  CHECK (channel_type IN ('line', 'email', 'sms', 'facebook'));

-- 2. สร้างตารางแคมเปญการตลาดสำหรับการบรอดแคสต์ (Broadcast Campaigns)
CREATE TABLE IF NOT EXISTS campaigns (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  workspace_id bigint not null references workspaces(id) on delete cascade,
  name text not null,
  channel_type text not null check (channel_type in ('line', 'email', 'sms', 'facebook')),
  channel_id bigint not null references channels(id) on delete cascade,
  template_id bigint references message_templates(id) on delete set null,
  segment_query_json jsonb not null default '{}'::jsonb, -- เกณฑ์คัดกรองกลุ่มลีด/ลูกค้าเป้าหมาย เช่น อายุ, intentScore, tags
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sending', 'completed', 'failed')),
  scheduled_at timestamptz null,
  started_at timestamptz null,
  finished_at timestamptz null,
  stats_json jsonb not null default '{"targetCount":0,"sentCount":0,"deliveredCount":0,"failedCount":0}'::jsonb,
  created_by bigint references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. สร้างตารางเก็บข้อมูลลีดที่เข้าร่วมและสถานะการจัดส่งบรอดแคสต์รายตัว
CREATE TABLE IF NOT EXISTS campaign_deliveries (
  id bigserial primary key,
  campaign_id bigint not null references campaigns(id) on delete cascade,
  entity_type text not null check (entity_type in ('lead', 'customer')),
  entity_id bigint not null,
  outbound_message_id bigint references outbound_messages(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'delivered', 'failed', 'skipped')),
  error_message text null,
  delivered_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint campaign_deliveries_unique unique (campaign_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_campaigns_clinic_status ON campaigns(clinic_id, status);
CREATE INDEX IF NOT EXISTS idx_campaign_deliveries_status ON campaign_deliveries(campaign_id, status);
