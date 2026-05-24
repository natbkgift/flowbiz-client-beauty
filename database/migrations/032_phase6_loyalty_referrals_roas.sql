-- Migration 032: Phase 6 Loyalty point ledger, Referrals (MGM), and Daily Ad Spend schemas
-- Target: flowbiz-client-beauty database

-- 1. Create loyalty_points_ledger table
create table if not exists loyalty_points_ledger (
    id bigserial primary key,
    clinic_id integer not null references clinics(id) on delete cascade,
    lead_id integer not null references leads(id) on delete cascade,
    points integer not null, -- positive for earning, negative for spending
    transaction_type varchar(50) not null, -- 'earn', 'redeem', 'referral_bonus'
    description text,
    created_at timestamp with time zone default now()
);

create index idx_loyalty_ledger_clinic_lead on loyalty_points_ledger(clinic_id, lead_id);

-- 2. Create beauty_referrals table (MGM)
create table if not exists beauty_referrals (
    id bigserial primary key,
    clinic_id integer not null references clinics(id) on delete cascade,
    referrer_lead_id integer not null references leads(id) on delete cascade,
    referred_lead_id integer not null references leads(id) on delete cascade unique,
    referral_code varchar(50) not null,
    status varchar(30) not null default 'pending', -- 'pending', 'converted', 'expired'
    reward_issued boolean not null default false,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

create index idx_beauty_referrals_code on beauty_referrals(clinic_id, referral_code);

-- 3. Create ad_spend_daily table for CAC and ROAS reports
create table if not exists ad_spend_daily (
    id bigserial primary key,
    clinic_id integer not null references clinics(id) on delete cascade,
    date date not null,
    channel varchar(50) not null, -- 'facebook', 'google'
    campaign_name varchar(255) not null,
    spend_amount numeric(10, 2) not null default 0.00,
    impressions integer not null default 0,
    clicks integer not null default 0,
    created_at timestamp with time zone default now(),
    constraint uq_ad_spend_daily unique(clinic_id, date, channel, campaign_name)
);

create index idx_ad_spend_daily_report on ad_spend_daily(clinic_id, date);
