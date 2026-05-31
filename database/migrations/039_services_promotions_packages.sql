-- Migration 039: Services / Promotions / Packages Schema
-- Tenant-scoped catalog tables for clinic offerings.
-- All tables include clinic_id for row-level tenant isolation.

-- =========================================================================
-- 1. clinic_services
-- =========================================================================

create table if not exists clinic_services (
  id              bigserial primary key,
  clinic_id       bigint not null references clinics(id) on delete cascade,
  service_key     varchar(120) not null,
  name            varchar(200) not null,
  slug            varchar(160) not null,
  category        varchar(120) null,
  short_description text null,
  description     text null,
  duration_minutes integer null check (duration_minutes is null or duration_minutes >= 0),
  price_min       numeric(12,2) null check (price_min is null or price_min >= 0),
  price_max       numeric(12,2) null check (price_max is null or price_max >= 0),
  currency        varchar(10) not null default 'THB',
  status          varchar(30) not null default 'draft'
                    check (status in ('draft', 'active', 'inactive', 'archived')),
  is_featured     boolean not null default false,
  sort_order      integer not null default 0,
  image_url       text null,
  metadata_json   jsonb not null default '{}'::jsonb
                    check (jsonb_typeof(metadata_json) = 'object'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint clinic_services_clinic_key_unique unique (clinic_id, service_key),
  constraint clinic_services_clinic_slug_unique unique (clinic_id, slug),
  constraint clinic_services_price_range_check check (
    price_min is null or price_max is null or price_max >= price_min
  )
);

create index if not exists idx_clinic_services_clinic_id
  on clinic_services(clinic_id);

create index if not exists idx_clinic_services_clinic_status
  on clinic_services(clinic_id, status);

create index if not exists idx_clinic_services_clinic_featured
  on clinic_services(clinic_id, is_featured);

create index if not exists idx_clinic_services_clinic_sort
  on clinic_services(clinic_id, sort_order);

-- =========================================================================
-- 2. clinic_promotions
-- =========================================================================

create table if not exists clinic_promotions (
  id              bigserial primary key,
  clinic_id       bigint not null references clinics(id) on delete cascade,
  promotion_key   varchar(120) not null,
  title           varchar(200) not null,
  slug            varchar(160) not null,
  subtitle        varchar(250) null,
  description     text null,
  badge_label     varchar(80) null,
  starts_at       timestamptz null,
  ends_at         timestamptz null,
  status          varchar(30) not null default 'draft'
                    check (status in ('draft', 'active', 'inactive', 'archived')),
  is_featured     boolean not null default false,
  sort_order      integer not null default 0,
  image_url       text null,
  cta_label       varchar(120) null,
  cta_url         text null,
  metadata_json   jsonb not null default '{}'::jsonb
                    check (jsonb_typeof(metadata_json) = 'object'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint clinic_promotions_clinic_key_unique unique (clinic_id, promotion_key),
  constraint clinic_promotions_clinic_slug_unique unique (clinic_id, slug),
  constraint clinic_promotions_date_range_check check (
    starts_at is null or ends_at is null or ends_at >= starts_at
  )
);

create index if not exists idx_clinic_promotions_clinic_id
  on clinic_promotions(clinic_id);

create index if not exists idx_clinic_promotions_clinic_status
  on clinic_promotions(clinic_id, status);

create index if not exists idx_clinic_promotions_clinic_featured
  on clinic_promotions(clinic_id, is_featured);

create index if not exists idx_clinic_promotions_clinic_sort
  on clinic_promotions(clinic_id, sort_order);

-- =========================================================================
-- 3. clinic_packages
-- =========================================================================

create table if not exists clinic_packages (
  id              bigserial primary key,
  clinic_id       bigint not null references clinics(id) on delete cascade,
  package_key     varchar(120) not null,
  name            varchar(200) not null,
  slug            varchar(160) not null,
  summary         text null,
  description     text null,
  price           numeric(12,2) null check (price is null or price >= 0),
  currency        varchar(10) not null default 'THB',
  status          varchar(30) not null default 'draft'
                    check (status in ('draft', 'active', 'inactive', 'archived')),
  is_featured     boolean not null default false,
  sort_order      integer not null default 0,
  image_url       text null,
  metadata_json   jsonb not null default '{}'::jsonb
                    check (jsonb_typeof(metadata_json) = 'object'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint clinic_packages_clinic_key_unique unique (clinic_id, package_key),
  constraint clinic_packages_clinic_slug_unique unique (clinic_id, slug)
);

create index if not exists idx_clinic_packages_clinic_id
  on clinic_packages(clinic_id);

create index if not exists idx_clinic_packages_clinic_status
  on clinic_packages(clinic_id, status);

create index if not exists idx_clinic_packages_clinic_featured
  on clinic_packages(clinic_id, is_featured);

create index if not exists idx_clinic_packages_clinic_sort
  on clinic_packages(clinic_id, sort_order);

-- =========================================================================
-- 4. clinic_package_services  (junction table: package ↔ service)
-- =========================================================================

create table if not exists clinic_package_services (
  id          bigserial primary key,
  clinic_id   bigint not null references clinics(id) on delete cascade,
  package_id  bigint not null references clinic_packages(id) on delete cascade,
  service_id  bigint not null references clinic_services(id) on delete restrict,
  quantity    integer not null default 1 check (quantity > 0),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  constraint clinic_package_services_unique unique (clinic_id, package_id, service_id)
);

create index if not exists idx_clinic_package_services_package_id
  on clinic_package_services(package_id);

create index if not exists idx_clinic_package_services_service_id
  on clinic_package_services(service_id);

create index if not exists idx_clinic_package_services_clinic_id
  on clinic_package_services(clinic_id);
