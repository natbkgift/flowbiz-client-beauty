insert into message_templates (clinic_id, channel_type, name, category, language, content, variables_json, approval_status)
select c.id, seed.channel_type, seed.name, seed.category, 'th', seed.content, seed.variables_json::jsonb, 'approved'
from clinics c
cross join (
  values
    ('line', 'lead_welcome', 'followup', 'สวัสดีค่ะ {{lead.fullName}} ขอบคุณที่สนใจ {{clinic.name}} ทีมงานจะติดต่อกลับเร็วที่สุด', '{"lead.fullName":"string","clinic.name":"string"}'),
    ('line', 'missed_response_follow_up', 'followup', 'สวัสดีค่ะ {{lead.fullName}} ทีมงานยังพร้อมช่วยดูแล หากสะดวกสามารถตอบกลับข้อความนี้ได้เลย', '{"lead.fullName":"string"}'),
    ('line', 'viewing_reminder', 'reminder', 'เตือนนัด viewing ของคุณ {{lead.fullName}} อีก 2 ชั่วโมงค่ะ หากต้องการเลื่อนนัดแจ้งทีมงานได้ทันที', '{"lead.fullName":"string","viewingAt":"string"}'),
    ('line', 'post_viewing_follow_up', 'followup', 'ขอบคุณที่เข้าชมค่ะ {{lead.fullName}} หากต้องการข้อมูลเพิ่มเติม ทีมงานพร้อมช่วยต่อทันที', '{"lead.fullName":"string"}'),
    ('line', 'dormant_lead_reactivation', 'reactivation', 'สวัสดีค่ะ {{lead.fullName}} หากยังสนใจอยู่ ทีมงานมีข้อเสนอใหม่พร้อมอัปเดตให้ค่ะ', '{"lead.fullName":"string"}'),
    ('line', 'negotiation_nurture', 'followup', 'ทีมงานเตรียมข้อมูลประกอบการตัดสินใจเพิ่มเติมไว้แล้ว หากต้องการคำแนะนำเพิ่มแจ้งได้เลยค่ะ', '{"lead.fullName":"string"}'),
    ('line', 'lost_lead_recovery', 'reactivation', 'สวัสดีค่ะ {{lead.fullName}} หากพร้อมกลับมาคุยกันอีกครั้ง ทีมงานมีทางเลือกใหม่ให้พิจารณาค่ะ', '{"lead.fullName":"string"}')
) as seed(channel_type, name, category, content, variables_json)
where c.slug = 'demo-clinic'
on conflict (clinic_id, channel_type, name)
do update set
  category = excluded.category,
  content = excluded.content,
  variables_json = excluded.variables_json,
  approval_status = excluded.approval_status,
  updated_at = now();

insert into automation_flows (clinic_id, workspace_id, name, flow_type, trigger_type, status, version, entry_rule_json, created_by)
select c.id, w.id, seed.name, 'lifecycle', 'event', 'active', 1,
  jsonb_build_object(
    'presetKey', seed.preset_key,
    'eventName', seed.event_name,
    'entityType', 'lead',
    'guardConditions', seed.guard_conditions::jsonb,
    'rateLimits', '{"maxExecutionsPerEntity":1,"maxMessagesPerDayPerLead":2}'::jsonb
  ),
  owner_user.id
from clinics c
inner join workspaces w on w.clinic_id = c.id and w.slug = 'main-workspace'
inner join lateral (
  select cu.user_id
  from clinic_users cu
  where cu.clinic_id = c.id and cu.status = 'active'
  order by cu.id asc
  limit 1
) owner_membership on true
inner join users owner_user on owner_user.id = owner_membership.user_id
cross join (
  values
    ('new_lead_welcome', 'Lifecycle - New Lead Welcome', 'lead.created', '{"leadStatusEquals":"new"}'),
    ('missed_response_follow_up', 'Lifecycle - Missed Response Follow-Up', 'lead.created', '{"lastContactedAtIsNull":true}'),
    ('hot_lead_alert', 'Lifecycle - Hot Lead Alert', 'lead.stage.updated', '{"stageEquals":"qualified"}'),
    ('viewing_reminder', 'Lifecycle - Viewing Reminder', 'lead.stage.updated', '{"stageEquals":"viewing"}'),
    ('post_viewing_follow_up', 'Lifecycle - Post Viewing Follow-Up', 'lead.stage.updated', '{"stageEquals":"viewed"}'),
    ('dormant_lead_reactivation', 'Lifecycle - Dormant Lead Reactivation', 'lead.last_contacted_timeout', '{"lastContactedOlderThanDays":14}'),
    ('negotiation_nurture', 'Lifecycle - Negotiation Nurture', 'lead.stage.updated', '{"stageEquals":"negotiation"}'),
    ('lost_lead_recovery', 'Lifecycle - Lost Lead Recovery', 'lead.status.updated', '{"statusEquals":"lost"}')
) as seed(preset_key, name, event_name, guard_conditions)
where c.slug = 'demo-clinic'
  and not exists (
    select 1
    from automation_flows af
    where af.clinic_id = c.id
      and af.entry_rule_json->>'presetKey' = seed.preset_key
  );

delete from automation_steps s
using automation_flows af
where s.flow_id = af.id
  and af.clinic_id = (select id from clinics where slug = 'demo-clinic' limit 1)
  and af.entry_rule_json->>'presetKey' in (
    'new_lead_welcome',
    'missed_response_follow_up',
    'hot_lead_alert',
    'viewing_reminder',
    'post_viewing_follow_up',
    'dormant_lead_reactivation',
    'negotiation_nurture',
    'lost_lead_recovery'
  );

insert into automation_steps (clinic_id, flow_id, step_order, step_type, delay_minutes, config_json)
select
  af.clinic_id,
  af.id,
  seed.step_order,
  seed.step_type,
  seed.delay_minutes,
  jsonb_strip_nulls(
    jsonb_build_object(
      'logicalStepType', seed.logical_step_type,
      'templateId', mt.id,
      'channelId', ch.id,
      'title', seed.title,
      'description', seed.description,
      'taskType', seed.task_type,
      'dueInMinutes', seed.due_in_minutes,
      'dueAtFromContextField', seed.due_at_from_context_field,
      'dueOffsetMinutes', seed.due_offset_minutes,
      'scheduledAfterMinutes', seed.scheduled_after_minutes,
      'scheduledAtFromContextField', seed.scheduled_at_from_context_field,
      'scheduledOffsetMinutes', seed.scheduled_offset_minutes,
      'blocking', seed.blocking,
      'assignedUserField', seed.assigned_user_field,
      'guardConditions', coalesce(seed.guard_conditions::jsonb, '{}'::jsonb)
    )
  )
from automation_flows af
inner join clinics c on c.id = af.clinic_id
cross join (
  values
    ('new_lead_welcome', 1, 'send_message', 'send_message', null, 'lead_welcome', null, null, null, null, null, null, null, null, null, null, null, null),
    ('new_lead_welcome', 2, 'create_task', 'schedule_task', null, null, 'Follow up new lead after 24 hours', 'Lifecycle follow-up for new lead', 'new_lead_followup', 1440, null, null, null, null, null, true, null, null),
    ('missed_response_follow_up', 1, 'wait', 'wait', 360, null, 'Wait 6 hours before follow-up', null, null, null, null, null, null, null, null, false, null, null),
    ('missed_response_follow_up', 2, 'send_message', 'condition_check', null, 'missed_response_follow_up', null, null, null, null, null, null, 360, null, null, true, null, '{"lastContactedAtIsNull":true}'),
    ('hot_lead_alert', 1, 'notify_user', 'internal_notify', null, null, 'Qualified lead requires immediate attention', 'Lifecycle hot lead alert', null, null, null, null, null, null, null, true, 'ownerUserId', null),
    ('viewing_reminder', 1, 'create_task', 'schedule_task', null, null, 'Viewing reminder - 2 hours before appointment', 'Prepare viewing reminder', 'viewing_reminder', null, 'viewingAt', -120, null, null, null, true, null, null),
    ('viewing_reminder', 2, 'send_message', 'send_message', null, 'viewing_reminder', null, null, null, null, null, null, null, 'viewingAt', -120, true, null, null),
    ('post_viewing_follow_up', 1, 'wait', 'wait', 240, null, 'Wait 4 hours after viewing', null, null, null, null, null, null, null, null, false, null, null),
    ('post_viewing_follow_up', 2, 'send_message', 'send_message', null, 'post_viewing_follow_up', null, null, null, null, null, null, 240, null, null, true, null, null),
    ('dormant_lead_reactivation', 1, 'send_message', 'send_message', null, 'dormant_lead_reactivation', null, null, null, null, null, null, null, null, null, true, null, null),
    ('negotiation_nurture', 1, 'create_task', 'schedule_task', null, null, 'Negotiation nurture sequence check-in', 'Track negotiation nurture sequence', 'negotiation_nurture', 720, null, null, null, null, null, true, null, null),
    ('negotiation_nurture', 2, 'send_message', 'send_message', null, 'negotiation_nurture', null, null, null, null, null, null, null, null, null, true, null, null),
    ('lost_lead_recovery', 1, 'wait', 'wait', 43200, null, 'Wait 30 days before recovery outreach', null, null, null, null, null, null, null, null, false, null, null),
    ('lost_lead_recovery', 2, 'send_message', 'send_message', null, 'lost_lead_recovery', null, null, null, null, null, null, 43200, null, null, true, null, null)
) as seed(
  preset_key,
  step_order,
  step_type,
  logical_step_type,
  delay_minutes,
  template_name,
  title,
  description,
  task_type,
  due_in_minutes,
  due_at_from_context_field,
  due_offset_minutes,
  scheduled_after_minutes,
  scheduled_at_from_context_field,
  scheduled_offset_minutes,
  blocking,
  assigned_user_field,
  guard_conditions
)
left join channels ch
  on ch.clinic_id = af.clinic_id
 and ch.channel_type = 'line'
 and ch.is_primary = true
left join message_templates mt
  on mt.clinic_id = af.clinic_id
 and mt.channel_type = 'line'
 and mt.name = seed.template_name
where c.slug = 'demo-clinic'
  and af.entry_rule_json->>'presetKey' = seed.preset_key
;