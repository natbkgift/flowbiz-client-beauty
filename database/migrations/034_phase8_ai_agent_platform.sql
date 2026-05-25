-- Migration 034: Phase 8 AI Agent Platform and HITL Queue
-- Target: flowbiz-client-beauty database

-- 1. Create ai_agent_conversations table
create table if not exists ai_agent_conversations (
    id bigserial primary key,
    clinic_id integer not null references clinics(id) on delete cascade,
    lead_id integer not null references leads(id) on delete cascade unique,
    current_agent varchar(50) not null default 'qualification', -- 'qualification', 'consult', 'retention'
    memory_context jsonb not null default '{}'::jsonb,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

create index if not exists idx_ai_agent_conv_clinic_lead on ai_agent_conversations(clinic_id, lead_id);

-- 2. Create ai_hitl_approval_queue table
create table if not exists ai_hitl_approval_queue (
    id bigserial primary key,
    clinic_id integer not null references clinics(id) on delete cascade,
    lead_id integer not null references leads(id) on delete cascade,
    message_text text not null,
    ai_response_text text not null,
    confidence_score numeric(5, 2) not null, -- confidence score e.g. 0.85
    status varchar(30) not null default 'pending', -- 'pending', 'approved', 'rejected', 'modified'
    agent_type varchar(50) not null, -- 'qualification', 'consult', 'retention'
    reviewed_by bigint null references users(id) on delete set null,
    reviewed_at timestamp with time zone null,
    created_at timestamp with time zone default now()
);

create index if not exists idx_ai_hitl_queue_status on ai_hitl_approval_queue(clinic_id, status, created_at desc);

-- 3. Create ai_agent_rules table
create table if not exists ai_agent_rules (
    id bigserial primary key,
    clinic_id integer not null references clinics(id) on delete cascade,
    agent_type varchar(50) not null, -- 'qualification', 'consult', 'retention', 'orchestrator'
    system_prompt text not null,
    temperature numeric(3, 2) not null default 0.70,
    rules_config jsonb not null default '{}'::jsonb,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    constraint ai_agent_rules_clinic_agent_unique unique (clinic_id, agent_type)
);

create index if not exists idx_ai_agent_rules_clinic on ai_agent_rules(clinic_id);
