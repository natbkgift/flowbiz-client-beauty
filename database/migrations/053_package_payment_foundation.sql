-- Migration 053: Package Ownership / Payment Foundation
-- Manual/admin-only commerce foundation. No payment gateway, checkout,
-- webhook, QR payment, auto-capture, or package usage deduction is added here.

create table if not exists clinic_service_packages (
  id                   bigserial primary key,
  clinic_id            bigint not null references clinics(id) on delete cascade,
  package_code         varchar(80) not null,
  package_name         varchar(160) not null,
  package_type         varchar(40) not null default 'service_package'
                         check (package_type in ('service_package', 'course', 'membership', 'credit_bundle')),
  description          text,
  total_units          integer
                         check (total_units is null or total_units >= 0),
  unit_label           varchar(40),
  price_amount         numeric(12,2)
                         check (price_amount is null or price_amount >= 0),
  currency             varchar(3) not null default 'THB'
                         check (length(currency) = 3),
  status               varchar(40) not null default 'active'
                         check (status in ('active', 'inactive', 'archived')),
  metadata_json        jsonb not null default '{}'::jsonb
                         check (jsonb_typeof(metadata_json) = 'object'),
  created_by_user_id   bigint references users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint clinic_service_packages_clinic_code_unique unique (clinic_id, package_code)
);

create index if not exists idx_clinic_service_packages_clinic_status
  on clinic_service_packages(clinic_id, status);

create index if not exists idx_clinic_service_packages_clinic_code
  on clinic_service_packages(clinic_id, package_code);

create table if not exists clinic_member_packages (
  id                     bigserial primary key,
  clinic_id              bigint not null references clinics(id) on delete cascade,
  member_id              bigint not null references clinic_members(id) on delete cascade,
  lead_id                bigint references leads(id) on delete set null,
  package_id             bigint references clinic_service_packages(id) on delete set null,
  package_snapshot_json  jsonb not null default '{}'::jsonb
                           check (jsonb_typeof(package_snapshot_json) = 'object'),
  ownership_status       varchar(40) not null default 'active'
                           check (ownership_status in ('pending', 'active', 'paused', 'expired', 'cancelled', 'used_up')),
  total_units            integer
                           check (total_units is null or total_units >= 0),
  remaining_units        integer
                           check (remaining_units is null or remaining_units >= 0),
  activated_at           timestamptz,
  expires_at             timestamptz,
  source                 varchar(80) not null default 'manual_admin',
  created_by_user_id     bigint references users(id) on delete set null,
  metadata_json          jsonb not null default '{}'::jsonb
                           check (jsonb_typeof(metadata_json) = 'object'),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint clinic_member_packages_units_check check (
    total_units is null or remaining_units is null or remaining_units <= total_units
  )
);

create index if not exists idx_clinic_member_packages_clinic_member
  on clinic_member_packages(clinic_id, member_id);

create index if not exists idx_clinic_member_packages_clinic_status
  on clinic_member_packages(clinic_id, ownership_status);

create index if not exists idx_clinic_member_packages_clinic_package
  on clinic_member_packages(clinic_id, package_id);

create index if not exists idx_clinic_member_packages_clinic_created
  on clinic_member_packages(clinic_id, created_at desc);

create table if not exists clinic_payment_records (
  id                  bigserial primary key,
  clinic_id           bigint not null references clinics(id) on delete cascade,
  member_id           bigint references clinic_members(id) on delete set null,
  lead_id             bigint references leads(id) on delete set null,
  member_package_id   bigint references clinic_member_packages(id) on delete set null,
  package_id          bigint references clinic_service_packages(id) on delete set null,
  payment_ref         varchar(120),
  payment_status      varchar(40) not null default 'pending'
                        check (payment_status in ('pending', 'recorded', 'voided', 'refunded')),
  payment_method      varchar(40) not null default 'manual'
                        check (payment_method in ('manual', 'bank_transfer_note', 'cash_note', 'other_note')),
  amount              numeric(12,2) not null
                        check (amount >= 0),
  currency            varchar(3) not null default 'THB'
                        check (length(currency) = 3),
  paid_at             timestamptz,
  recorded_by_user_id bigint references users(id) on delete set null,
  metadata_json       jsonb not null default '{}'::jsonb
                        check (jsonb_typeof(metadata_json) = 'object'),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_clinic_payment_records_clinic_member
  on clinic_payment_records(clinic_id, member_id);

create index if not exists idx_clinic_payment_records_clinic_status
  on clinic_payment_records(clinic_id, payment_status);

create index if not exists idx_clinic_payment_records_clinic_ref
  on clinic_payment_records(clinic_id, payment_ref);

create index if not exists idx_clinic_payment_records_clinic_created
  on clinic_payment_records(clinic_id, created_at desc);
