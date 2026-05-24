insert into clinics (name, slug, plan, status, timezone)
values ('FlowBiz Beauty Demo Clinic', 'demo-clinic', 'starter', 'active', 'Asia/Bangkok')
on conflict (slug)
do update set
  name = excluded.name,
  plan = excluded.plan,
  status = excluded.status,
  timezone = excluded.timezone,
  updated_at = now();

insert into users (email, name, password_hash, status)
values
  (
    'owner@flowbiz.local',
    'FlowBiz Owner',
    'scrypt$flowbiz-owner-salt$b34596e36cbdb3839313ee5ab2be770a3dee8fb46afdc5d2a89cb2f39600060e8010fe215fb6618ff09e20b03a992a1bb86a4577de316a041fc313ebf2e82141',
    'active'
  ),
  (
    'staff@flowbiz.local',
    'FlowBiz Staff',
    'scrypt$flowbiz-staff-salt$6edd1b86e757f36519bdae7912d9ea044d2b9cc9830517048967d94926695d74dde2fc3d7ac9b762494213cc65a1a6638ce7bd28d1f9457aec3b2dbf30f178cf',
    'active'
  )
on conflict (email)
do update set
  name = excluded.name,
  password_hash = excluded.password_hash,
  status = excluded.status,
  updated_at = now();

insert into organizations (clinic_id, name, slug, status)
select c.id, c.name || ' Organization', c.slug || '-org', 'active'
from clinics c
where c.slug = 'demo-clinic'
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
where c.slug = 'demo-clinic'
on conflict (clinic_id, slug)
do update set
  organization_id = excluded.organization_id,
  name = excluded.name,
  status = excluded.status,
  updated_at = now();

insert into clinic_users (clinic_id, user_id, organization_id, workspace_id, role, role_id, status)
select c.id, u.id, o.id, w.id, memberships.role, r.id, 'active'
from (
  values
    ('demo-clinic', 'owner@flowbiz.local', 'owner'),
    ('demo-clinic', 'staff@flowbiz.local', 'staff')
) as memberships(clinic_slug, user_email, role)
inner join clinics c on c.slug = memberships.clinic_slug
inner join users u on u.email = memberships.user_email
inner join organizations o on o.clinic_id = c.id
inner join workspaces w on w.clinic_id = c.id and w.slug = 'main-workspace'
inner join roles r on r.key = case memberships.role
  when 'owner' then 'owner'
  when 'manager' then 'admin'
  when 'marketing' then 'admin'
  when 'sales' then 'operator'
  when 'staff' then 'operator'
  else 'viewer'
end
on conflict (clinic_id, user_id)
do update set
  organization_id = excluded.organization_id,
  workspace_id = excluded.workspace_id,
  role = excluded.role,
  role_id = excluded.role_id,
  status = excluded.status,
  updated_at = now();

insert into workspace_memberships (
  clinic_id,
  organization_id,
  workspace_id,
  user_id,
  role_id,
  status,
  invited_by,
  invited_at,
  joined_at
)
select c.id, o.id, w.id, u.id, r.id, 'active', u.id, now(), now()
from (
  values
    ('demo-clinic', 'owner@flowbiz.local', 'owner'),
    ('demo-clinic', 'staff@flowbiz.local', 'staff')
) as memberships(clinic_slug, user_email, role)
inner join clinics c on c.slug = memberships.clinic_slug
inner join users u on u.email = memberships.user_email
inner join organizations o on o.clinic_id = c.id
inner join workspaces w on w.clinic_id = c.id and w.slug = 'main-workspace'
inner join roles r on r.key = case memberships.role
  when 'owner' then 'owner'
  when 'manager' then 'admin'
  when 'marketing' then 'admin'
  when 'sales' then 'operator'
  when 'staff' then 'operator'
  else 'viewer'
end
on conflict do nothing;