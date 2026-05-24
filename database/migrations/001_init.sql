create table if not exists schema_migrations (
  id serial primary key,
  name text not null unique,
  applied_at timestamptz not null default now()
);

create table if not exists app_runtime (
  id serial primary key,
  environment_name text not null unique,
  is_bootstrap_ready boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
