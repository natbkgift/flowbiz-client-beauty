-- Migration 038: Clinic Website Schema Extension

create table if not exists clinic_website_settings (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  website_status text not null default 'draft' check (website_status in ('draft', 'active', 'inactive', 'suspended')),
  public_display_name text null,
  tagline text null,
  short_description text null,
  default_locale text not null default 'th-TH',
  published_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinic_website_settings_clinic_unique unique (clinic_id)
);

create table if not exists clinic_branding_settings (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  logo_url text null,
  favicon_url text null,
  hero_image_url text null,
  primary_color text null,
  secondary_color text null,
  accent_color text null,
  font_family text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinic_branding_settings_clinic_unique unique (clinic_id)
);

create table if not exists clinic_contact_settings (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  phone text null,
  email text null,
  line_url text null,
  line_oa_id text null,
  facebook_url text null,
  instagram_url text null,
  tiktok_url text null,
  website_url text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinic_contact_settings_clinic_unique unique (clinic_id)
);

create table if not exists clinic_location_settings (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  address_line1 text null,
  address_line2 text null,
  district text null,
  province text null,
  postal_code text null,
  country text not null default 'Thailand',
  google_map_url text null,
  google_map_embed_url text null,
  latitude numeric(10, 7) null,
  longitude numeric(10, 7) null,
  business_hours_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinic_location_settings_clinic_unique unique (clinic_id)
);

create table if not exists clinic_homepage_sections (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  section_key text not null,
  section_type text not null,
  title text null,
  subtitle text null,
  content_json jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  status text not null default 'draft' check (status in ('draft', 'published', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinic_homepage_sections_clinic_key_unique unique (clinic_id, section_key)
);

-- Core Indexes for performance and lookup
create index if not exists idx_clinic_website_settings_clinic_id on clinic_website_settings(clinic_id);
create index if not exists idx_clinic_branding_settings_clinic_id on clinic_branding_settings(clinic_id);
create index if not exists idx_clinic_contact_settings_clinic_id on clinic_contact_settings(clinic_id);
create index if not exists idx_clinic_location_settings_clinic_id on clinic_location_settings(clinic_id);
create index if not exists idx_clinic_homepage_sections_clinic_id on clinic_homepage_sections(clinic_id);
create index if not exists idx_clinic_homepage_sections_status on clinic_homepage_sections(status);
create index if not exists idx_clinic_homepage_sections_clinic_status_sort on clinic_homepage_sections(clinic_id, status, sort_order);
