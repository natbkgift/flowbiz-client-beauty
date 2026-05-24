create table if not exists auth_sessions (
  id text primary key,
  user_id bigint not null references users(id) on delete cascade,
  clinic_id bigint not null references clinics(id) on delete cascade,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz null
);

create index if not exists idx_auth_sessions_user_id on auth_sessions(user_id);
create index if not exists idx_auth_sessions_clinic_id on auth_sessions(clinic_id);
create index if not exists idx_auth_sessions_revoked_at on auth_sessions(revoked_at);