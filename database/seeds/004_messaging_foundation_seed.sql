insert into channels (clinic_id, channel_type, name, status, is_primary, config_json)
select c.id, seed.channel_type, seed.name, 'active', seed.is_primary, seed.config_json::jsonb
from clinics c
cross join (
  values
    ('line', 'LINE OA Primary', true, '{"oaId":"demo-line-oa"}'),
    ('email', 'Clinic Email', false, '{"fromEmail":"hello@flowbiz.local"}')
) as seed(channel_type, name, is_primary, config_json)
where c.slug = 'demo-clinic'
on conflict do nothing;

insert into contact_identities (clinic_id, entity_type, entity_id, channel_type, external_id, display_name, is_primary)
select c.id, 'lead', l.id, seed.channel_type, seed.external_id, l.full_name, true
from (
  values
    ('lead-001', 'line', 'line-jane-001'),
    ('lead-001', 'email', 'jane@example.com'),
    ('lead-002', 'email', 'mali@example.com'),
    ('lead-003', 'line', 'line-kwan-003')
) as seed(source_ref, channel_type, external_id)
inner join clinics c on c.slug = 'demo-clinic'
inner join leads l on l.clinic_id = c.id and l.source_ref = seed.source_ref
where not exists (
  select 1
  from contact_identities ci
  where ci.clinic_id = c.id
    and ci.entity_type = 'lead'
    and ci.entity_id = l.id
    and ci.channel_type = seed.channel_type
    and ci.external_id = seed.external_id
);

insert into message_templates (clinic_id, channel_type, name, category, language, content, variables_json, approval_status)
select c.id, seed.channel_type, seed.name, seed.category, 'th', seed.content, seed.variables_json::jsonb, seed.approval_status
from clinics c
cross join (
  values
    ('line', 'Lead Welcome TH', 'followup', 'สวัสดีค่ะ {{lead.fullName}} ขอบคุณที่ติดต่อ {{clinic.name}} ทีมงานจะดูแลคุณต่อทันที', '{"lead.fullName":"string","clinic.name":"string"}', 'approved'),
    ('email', 'Consult Reminder TH', 'reminder', 'เรียน {{lead.fullName}} อย่าลืมนัด consult กับ {{clinic.name}} นะคะ', '{"lead.fullName":"string","clinic.name":"string"}', 'approved')
) as seed(channel_type, name, category, content, variables_json, approval_status)
where c.slug = 'demo-clinic'
on conflict (clinic_id, channel_type, name)
do update set
  category = excluded.category,
  content = excluded.content,
  variables_json = excluded.variables_json,
  approval_status = excluded.approval_status,
  updated_at = now();

insert into outbound_messages (
  clinic_id,
  channel_id,
  entity_type,
  entity_id,
  template_id,
  message_type,
  recipient_ref,
  content_rendered,
  status,
  scheduled_at,
  sent_at,
  delivered_at,
  provider_message_id
)
select c.id, ch.id, 'lead', l.id, mt.id, 'template', ci.external_id, mt.content, 'delivered', now(), now(), now(), concat('seed-', l.id)
from clinics c
inner join leads l on l.clinic_id = c.id and l.source_ref = 'lead-001'
inner join channels ch on ch.clinic_id = c.id and ch.channel_type = 'line'
inner join message_templates mt on mt.clinic_id = c.id and mt.name = 'Lead Welcome TH'
inner join contact_identities ci on ci.clinic_id = c.id and ci.entity_type = 'lead' and ci.entity_id = l.id and ci.channel_type = 'line'
where c.slug = 'demo-clinic'
  and not exists (
    select 1
    from outbound_messages om
    where om.clinic_id = c.id
      and om.entity_type = 'lead'
      and om.entity_id = l.id
      and om.provider_message_id = concat('seed-', l.id)
  );