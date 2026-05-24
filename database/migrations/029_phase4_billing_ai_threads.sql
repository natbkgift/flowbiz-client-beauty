-- 1. Create billing plans table with trial toggle support
CREATE TABLE IF NOT EXISTS billing_plans (
  id serial primary key,
  name text not null unique,
  base_price_monthly numeric(10, 2) not null default 0.00,
  included_broadcasts_limit integer not null default 1000,
  included_ai_credits integer not null default 100,
  price_per_excess_broadcast numeric(10, 4) not null default 0.0500, -- 0.05 THB per excess broadcast
  price_per_excess_ai_call numeric(10, 4) not null default 0.1000,     -- 0.10 THB per excess AI call
  trial_period_days integer not null default 30,
  is_trial_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2. Create clinic subscriptions table supporting Stripe, Omise, and Free Trials
CREATE TABLE IF NOT EXISTS clinic_subscriptions (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  plan_id integer not null references billing_plans(id),
  stripe_subscription_id text null,
  omise_subscription_id text null,
  status text not null default 'active', -- 'active', 'past_due', 'canceled'
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null default now() + interval '1 month',
  trial_ends_at timestamptz not null default now() + interval '30 days',
  is_trial_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  CONSTRAINT uq_clinic_subscription UNIQUE (clinic_id)
);

-- 3. Create billing usage records for metered calculation
CREATE TABLE IF NOT EXISTS billing_usage_records (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  usage_type text not null, -- 'broadcast_sent', 'ai_message_generated'
  quantity integer not null default 1,
  recorded_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_usage_clinic ON billing_usage_records(clinic_id, usage_type, recorded_at);

-- 4. Create two-way AI chat threads
CREATE TABLE IF NOT EXISTS ai_chat_threads (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  lead_id bigint not null references leads(id) on delete cascade,
  status text not null default 'active', -- 'active', 'paused', 'closed'
  context_summary text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  CONSTRAINT uq_lead_chat_thread UNIQUE (lead_id)
);

-- 5. Create AI chat messages with confidence score and approval status
CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id bigserial primary key,
  thread_id bigint not null references ai_chat_threads(id) on delete cascade,
  sender_type text not null, -- 'lead', 'ai_agent', 'staff_override'
  message_text text not null,
  confidence_score numeric(3, 2) null, -- 0.00 to 1.00
  status text not null default 'sent', -- 'pending_approval', 'approved', 'rejected', 'sent'
  tokens_used integer null,
  created_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_chat_thread_msg ON ai_chat_messages(thread_id, created_at desc);
