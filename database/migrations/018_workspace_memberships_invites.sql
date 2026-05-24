create table if not exists workspace_memberships (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  organization_id bigint not null references organizations(id) on delete cascade,
  workspace_id bigint not null references workspaces(id) on delete cascade,
  user_id bigint null references users(id) on delete cascade,
  role_id bigint not null references roles(id) on delete restrict,
  status text not null default 'invited' check (status in ('invited', 'active', 'deactivated')),
  invited_by bigint null references users(id) on delete set null,
  invited_at timestamptz null,
  joined_at timestamptz null,
  deactivated_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_workspace_memberships_workspace_user
  on workspace_memberships(workspace_id, user_id)
  where user_id is not null;
create index if not exists idx_workspace_memberships_user_status on workspace_memberships(user_id, status, clinic_id);
create index if not exists idx_workspace_memberships_workspace_status on workspace_memberships(workspace_id, status);

create table if not exists invite_tokens (
  id bigserial primary key,
  membership_id bigint null references workspace_memberships(id) on delete set null,
  clinic_id bigint not null references clinics(id) on delete cascade,
  organization_id bigint not null references organizations(id) on delete cascade,
  workspace_id bigint not null references workspaces(id) on delete cascade,
  email text not null,
  role_id bigint not null references roles(id) on delete restrict,
  token_hash text not null,
  expires_at timestamptz not null,
  invited_by bigint null references users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_invite_tokens_token_hash on invite_tokens(token_hash);
create unique index if not exists idx_invite_tokens_pending_email
  on invite_tokens(workspace_id, lower(email))
  where status = 'pending';
create index if not exists idx_invite_tokens_workspace_status on invite_tokens(workspace_id, status, expires_at desc);

insert into permissions (resource, action, description)
values
  ('user', 'read', 'Read workspace member directory and membership state.'),
  ('role', 'read', 'Read workspace role assignments.'),
  ('role', 'manage', 'Change workspace role assignments.'),
  ('invite', 'manage', 'Create and manage workspace invites.')
on conflict (resource, action)
do update set
  description = excluded.description;

insert into role_permissions (role_id, permission_id)
select role_map.id, permission_map.id
from (
  values
    ('owner', 'user', 'read'),
    ('owner', 'role', 'read'),
    ('owner', 'role', 'manage'),
    ('owner', 'invite', 'manage'),
    ('admin', 'user', 'read'),
    ('admin', 'role', 'read'),
    ('admin', 'role', 'manage'),
    ('admin', 'invite', 'manage')
) as seed(role_key, resource, action)
inner join roles role_map on role_map.key = seed.role_key
inner join permissions permission_map on permission_map.resource = seed.resource and permission_map.action = seed.action
on conflict (role_id, permission_id) do nothing;

insert into workspace_memberships (
  clinic_id,
  organization_id,
  workspace_id,
  user_id,
  role_id,
  status,
  invited_by,
  invited_at,
  joined_at,
  deactivated_at,
  created_at,
  updated_at
)
select
  cu.clinic_id,
  cu.organization_id,
  cu.workspace_id,
  cu.user_id,
  cu.role_id,
  case when cu.status = 'active' then 'active' else 'deactivated' end,
  null,
  cu.created_at,
  case when cu.status = 'active' then cu.created_at else null end,
  case when cu.status = 'inactive' then cu.updated_at else null end,
  cu.created_at,
  cu.updated_at
from clinic_users cu
where cu.organization_id is not null
  and cu.workspace_id is not null
  and cu.role_id is not null
on conflict do nothing;