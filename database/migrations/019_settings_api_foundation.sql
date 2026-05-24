alter table clinics
  add column if not exists locale text not null default 'th-TH',
  add column if not exists branding_json jsonb not null default '{}'::jsonb,
  add column if not exists settings_json jsonb not null default '{}'::jsonb;

alter table organizations
  add column if not exists timezone text not null default 'Asia/Bangkok',
  add column if not exists settings_json jsonb not null default '{}'::jsonb;

alter table workspaces
  add column if not exists timezone text not null default 'Asia/Bangkok',
  add column if not exists settings_json jsonb not null default '{}'::jsonb;

create unique index if not exists idx_organizations_clinic_slug on organizations(clinic_id, slug);
create unique index if not exists idx_workspaces_org_slug on workspaces(organization_id, slug);

insert into permissions (resource, action, description)
values
  ('tenant', 'read', 'Read tenant-level configuration settings.'),
  ('organization', 'read', 'Read organization-level configuration settings.'),
  ('organization', 'manage', 'Manage organization-level configuration settings.'),
  ('workspace', 'read', 'Read workspace-level configuration settings.')
on conflict (resource, action)
do update set
  description = excluded.description;

insert into role_permissions (role_id, permission_id)
select role_map.id, permission_map.id
from (
  values
    ('owner', 'tenant', 'read'),
    ('owner', 'organization', 'read'),
    ('owner', 'organization', 'manage'),
    ('owner', 'workspace', 'read'),
    ('admin', 'tenant', 'read'),
    ('admin', 'tenant', 'manage'),
    ('admin', 'organization', 'read'),
    ('admin', 'organization', 'manage'),
    ('admin', 'workspace', 'read'),
    ('operator', 'workspace', 'read'),
    ('viewer', 'workspace', 'read')
) as seed(role_key, resource, action)
inner join roles role_map on role_map.key = seed.role_key
inner join permissions permission_map on permission_map.resource = seed.resource and permission_map.action = seed.action
on conflict (role_id, permission_id) do nothing;