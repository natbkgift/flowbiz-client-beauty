create table if not exists clinics (
  id bigserial primary key,
  name text not null,
  slug text not null unique,
  plan text not null default 'starter',
  status text not null default 'active' check (status in ('active', 'inactive')),
  timezone text not null default 'Asia/Bangkok',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists users (
  id bigserial primary key,
  email text not null unique,
  name text not null,
  password_hash text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  last_login_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists clinic_users (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'sales', 'marketing', 'staff')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinic_users_clinic_user_unique unique (clinic_id, user_id)
);

create index if not exists idx_clinic_users_user_id on clinic_users(user_id);
create index if not exists idx_clinic_users_clinic_id on clinic_users(clinic_id);
create index if not exists idx_users_status on users(status);
create index if not exists idx_clinics_status on clinics(status);