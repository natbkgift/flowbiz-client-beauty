-- Phase 10.0 stabilization gate: additive permissions for sensitive surfaces.

insert into permissions (resource, action, description)
values
  ('broadcast', 'manage', 'Create, preview, and send broadcast campaigns.'),
  ('loyalty', 'read', 'Read loyalty balance, referrals, and ROAS reports.'),
  ('loyalty', 'manage', 'Record purchases, referrals, and ad spend syncs.'),
  ('blog', 'manage', 'Create, update, publish, and delete blog posts.'),
  ('forum', 'moderate', 'Moderate forum topics and replies.'),
  ('forum', 'medical_answer', 'Post or verify official medical forum answers.')
on conflict (resource, action)
do update set description = excluded.description;

insert into role_permissions (role_id, permission_id)
select role_map.id, permission_map.id
from (
  values
    ('owner', 'broadcast', 'manage'),
    ('owner', 'loyalty', 'read'),
    ('owner', 'loyalty', 'manage'),
    ('owner', 'blog', 'manage'),
    ('owner', 'forum', 'moderate'),
    ('owner', 'forum', 'medical_answer'),
    ('admin', 'broadcast', 'manage'),
    ('admin', 'loyalty', 'read'),
    ('admin', 'loyalty', 'manage'),
    ('admin', 'blog', 'manage'),
    ('admin', 'forum', 'moderate'),
    ('admin', 'forum', 'medical_answer'),
    ('operator', 'loyalty', 'read'),
    ('operator', 'loyalty', 'manage'),
    ('viewer', 'loyalty', 'read')
) as seed(role_key, resource, action)
inner join roles role_map on role_map.key = seed.role_key
inner join permissions permission_map on permission_map.resource = seed.resource and permission_map.action = seed.action
on conflict (role_id, permission_id) do nothing;
