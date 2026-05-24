insert into automation_flows (
  clinic_id,
  workspace_id,
  name,
  flow_type,
  trigger_type,
  status,
  trigger_event,
  version,
  entry_rule_json,
  definition_json,
  created_by
)
select
  c.id,
  ws.id,
  'New Lead Welcome Automation',
  'lead_nurture',
  'event',
  'active',
  'lead.created',
  1,
  '{"eventName":"lead.created","entityType":"lead"}'::jsonb,
  '{"trigger":"lead.created","entityType":"lead","steps":[{"type":"action","action":"send_message","channelId":1,"templateId":1},{"type":"action","action":"create_task","assignedUserId":1,"taskType":"follow_up","title":"Call new lead within 15 minutes","description":"Auto-created by lead.created flow","dueInMinutes":15},{"type":"delay","minutes":60}]}'::jsonb,
  u.id
from clinics c
inner join lateral (
  select w.id
  from workspaces w
  where w.clinic_id = c.id
  order by w.id asc
  limit 1
) ws on true
inner join users u on u.email = 'owner@flowbiz.local'
where c.slug = 'demo-clinic'
  and not exists (
    select 1 from automation_flows af where af.clinic_id = c.id and af.name = 'New Lead Welcome Automation'
  );

insert into automation_steps (clinic_id, flow_id, step_order, step_type, delay_minutes, config_json)
select af.clinic_id, af.id, seed.step_order, seed.step_type, seed.delay_minutes, seed.config_json::jsonb
from automation_flows af
inner join clinics c on c.id = af.clinic_id
cross join (
  values
    (1, 'send_message', null, '{"channelId":1,"templateId":1}'),
    (2, 'create_task', null, '{"assignedUserId":1,"taskType":"follow_up","title":"Call new lead within 15 minutes","description":"Auto-created by lead.created flow","dueInMinutes":15}'),
    (3, 'wait', 60, '{"title":"Wait 60 minutes before next automation step"}')
) as seed(step_order, step_type, delay_minutes, config_json)
where c.slug = 'demo-clinic'
  and af.name = 'New Lead Welcome Automation'
  and not exists (
    select 1 from automation_steps s where s.flow_id = af.id and s.step_order = seed.step_order
  );