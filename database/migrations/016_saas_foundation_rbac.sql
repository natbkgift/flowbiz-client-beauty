create table if not exists organizations (
  id bigserial primary key,
  clinic_id bigint not null unique references clinics(id) on delete cascade,
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workspaces (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  organization_id bigint not null references organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspaces_unique_slug_per_clinic unique (clinic_id, slug)
);

create index if not exists idx_workspaces_org on workspaces(organization_id, status);
create index if not exists idx_workspaces_clinic on workspaces(clinic_id, status);

create table if not exists roles (
  id bigserial primary key,
  key text not null unique check (key in ('owner', 'admin', 'operator', 'viewer')),
  name text not null,
  description text not null,
  is_system boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists permissions (
  id bigserial primary key,
  resource text not null,
  action text not null,
  description text not null,
  created_at timestamptz not null default now(),
  constraint permissions_unique_resource_action unique (resource, action)
);

create table if not exists role_permissions (
  role_id bigint not null references roles(id) on delete cascade,
  permission_id bigint not null references permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

alter table clinic_users
  add column if not exists organization_id bigint references organizations(id) on delete cascade,
  add column if not exists workspace_id bigint references workspaces(id) on delete cascade,
  add column if not exists role_id bigint references roles(id) on delete set null;

create index if not exists idx_clinic_users_workspace_id on clinic_users(workspace_id);
create index if not exists idx_clinic_users_role_id on clinic_users(role_id);

insert into roles (key, name, description)
values
  ('owner', 'Owner', 'Full tenant administration and billing access.'),
  ('admin', 'Admin', 'CRM, automation, analytics and user administration access.'),
  ('operator', 'Operator', 'Operational CRM access for leads, contacts and messaging.'),
  ('viewer', 'Viewer', 'Read-only access for CRM and analytics surfaces.')
on conflict (key)
do update set
  name = excluded.name,
  description = excluded.description,
  updated_at = now();

insert into permissions (resource, action, description)
values
  ('tenant', 'manage', 'Manage tenant-level settings and lifecycle.'),
  ('billing', 'manage', 'Manage subscriptions, plans and billing readiness.'),
  ('user', 'manage', 'Manage users, invitations and role assignments.'),
  ('workspace', 'manage', 'Manage workspace configuration and operational settings.'),
  ('lead', 'read', 'Read lead data.'),
  ('lead', 'write', 'Create and update lead data.'),
  ('contact', 'read', 'Read customer and contact data.'),
  ('contact', 'write', 'Create and update customer and contact data.'),
  ('message', 'read', 'Read outbound and inbound messaging history.'),
  ('message', 'write', 'Send and manage messages.'),
  ('template', 'read', 'Read message templates.'),
  ('template', 'manage', 'Create and update message templates.'),
  ('automation', 'read', 'Read automation runtime and flow information.'),
  ('automation', 'manage', 'Create and update automation flows and executions.'),
  ('analytics', 'read', 'Read analytics dashboards and reports.'),
  ('audit', 'read', 'Read audit logs.'),
  ('worker', 'manage', 'Operate worker queues and operational controls.'),
  ('ai', 'read', 'Read AI predictions and recommendations.'),
  ('ai', 'manage', 'Trigger AI recomputation and operational actions.')
on conflict (resource, action)
do update set
  description = excluded.description;

insert into role_permissions (role_id, permission_id)
select role_map.id, permission_map.id
from (
  values
    ('owner', 'tenant', 'manage'),
    ('owner', 'billing', 'manage'),
    ('owner', 'user', 'manage'),
    ('owner', 'workspace', 'manage'),
    ('owner', 'lead', 'read'),
    ('owner', 'lead', 'write'),
    ('owner', 'contact', 'read'),
    ('owner', 'contact', 'write'),
    ('owner', 'message', 'read'),
    ('owner', 'message', 'write'),
    ('owner', 'template', 'read'),
    ('owner', 'template', 'manage'),
    ('owner', 'automation', 'read'),
    ('owner', 'automation', 'manage'),
    ('owner', 'analytics', 'read'),
    ('owner', 'audit', 'read'),
    ('owner', 'worker', 'manage'),
    ('owner', 'ai', 'read'),
    ('owner', 'ai', 'manage'),
    ('admin', 'user', 'manage'),
    ('admin', 'workspace', 'manage'),
    ('admin', 'lead', 'read'),
    ('admin', 'lead', 'write'),
    ('admin', 'contact', 'read'),
    ('admin', 'contact', 'write'),
    ('admin', 'message', 'read'),
    ('admin', 'message', 'write'),
    ('admin', 'template', 'read'),
    ('admin', 'template', 'manage'),
    ('admin', 'automation', 'read'),
    ('admin', 'automation', 'manage'),
    ('admin', 'analytics', 'read'),
    ('admin', 'audit', 'read'),
    ('admin', 'worker', 'manage'),
    ('admin', 'ai', 'read'),
    ('admin', 'ai', 'manage'),
    ('operator', 'lead', 'read'),
    ('operator', 'lead', 'write'),
    ('operator', 'contact', 'read'),
    ('operator', 'contact', 'write'),
    ('operator', 'message', 'read'),
    ('operator', 'message', 'write'),
    ('operator', 'template', 'read'),
    ('operator', 'automation', 'read'),
    ('operator', 'analytics', 'read'),
    ('operator', 'ai', 'read'),
    ('viewer', 'lead', 'read'),
    ('viewer', 'contact', 'read'),
    ('viewer', 'message', 'read'),
    ('viewer', 'template', 'read'),
    ('viewer', 'analytics', 'read'),
    ('viewer', 'ai', 'read')
) as seed(role_key, resource, action)
inner join roles role_map on role_map.key = seed.role_key
inner join permissions permission_map on permission_map.resource = seed.resource and permission_map.action = seed.action
on conflict (role_id, permission_id) do nothing;

insert into organizations (clinic_id, name, slug, status)
select c.id, c.name || ' Organization', c.slug || '-org', 'active'
from clinics c
on conflict (clinic_id)
do update set
  name = excluded.name,
  slug = excluded.slug,
  status = excluded.status,
  updated_at = now();

insert into workspaces (clinic_id, organization_id, name, slug, status)
select c.id, o.id, 'Main Workspace', 'main-workspace', 'active'
from clinics c
inner join organizations o on o.clinic_id = c.id
on conflict (clinic_id, slug)
do update set
  organization_id = excluded.organization_id,
  name = excluded.name,
  status = excluded.status,
  updated_at = now();

update clinic_users cu
set
  organization_id = o.id,
  workspace_id = w.id,
  role_id = r.id
from organizations o
inner join workspaces w on w.organization_id = o.id and w.clinic_id = o.clinic_id and w.slug = 'main-workspace'
inner join roles r on true
where cu.clinic_id = o.clinic_id
  and r.key = case cu.role
    when 'owner' then 'owner'
    when 'manager' then 'admin'
    when 'marketing' then 'admin'
    when 'sales' then 'operator'
    when 'staff' then 'operator'
    else 'viewer'
  end
  and (cu.organization_id is null or cu.workspace_id is null or cu.role_id is null);