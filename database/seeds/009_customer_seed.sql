with demo_clinic as (
  select id
  from clinics
  where slug = 'demo-clinic'
  limit 1
), upserted_customers as (
  insert into customers (clinic_id, source_lead_id, full_name, phone, email, status)
  select c.id,
    l.id,
    l.full_name,
    l.phone,
    l.email,
    case
      when l.source_ref = 'lead-001' then 'vip'
      when l.source_ref = 'lead-004' then 'inactive'
      else 'active'
    end
  from (
    values
      ('lead-001'),
      ('lead-003'),
      ('lead-004'),
      ('lead-005')
  ) as seed(source_ref)
  inner join demo_clinic c on true
  inner join leads l on l.clinic_id = c.id and l.source_ref = seed.source_ref
  on conflict (clinic_id, source_lead_id)
  do update set
    full_name = excluded.full_name,
    phone = excluded.phone,
    email = excluded.email,
    status = excluded.status,
    updated_at = now()
  returning id, clinic_id, source_lead_id
)
insert into customer_profiles (clinic_id, customer_id, preferred_channel, tags, meta_json)
select uc.clinic_id,
  uc.id,
  case
    when l.line_user_id is not null then 'line'
    when l.email is not null then 'email'
    else 'sms'
  end,
  case
    when l.source_ref = 'lead-001' then array['vip', 'repeat_candidate']
    when l.source_ref = 'lead-004' then array['reactivation']
    else array['converted']
  end,
  jsonb_build_object('seedSourceRef', l.source_ref)
from upserted_customers uc
inner join leads l on l.id = uc.source_lead_id
on conflict (customer_id)
do nothing;

insert into customer_events (clinic_id, customer_id, event_type, event_source, event_payload_json)
select c.id,
  cu.id,
  'customer.converted_from_lead',
  'seed',
  jsonb_build_object('sourceLeadId', l.id, 'leadSourceRef', l.source_ref)
from clinics c
inner join customers cu on cu.clinic_id = c.id
inner join leads l on l.id = cu.source_lead_id
where c.slug = 'demo-clinic'
  and l.source_ref in ('lead-001', 'lead-003', 'lead-004', 'lead-005')
  and not exists (
    select 1
    from customer_events ce
    where ce.clinic_id = c.id
      and ce.customer_id = cu.id
      and ce.event_type = 'customer.converted_from_lead'
      and ce.event_source = 'seed'
  );

insert into customer_notes (clinic_id, customer_id, note_text, created_by_user_id)
select c.id,
  cu.id,
  seed.note_text,
  u.id
from (
  values
    ('lead-001', 'owner@flowbiz.local', 'ลูกค้า VIP จากการ convert lead เดิม พร้อมสำหรับ repeat revenue flow'),
    ('lead-004', 'staff@flowbiz.local', 'ลูกค้าต้องการ reactivation campaign หลังหายไปช่วงหนึ่ง')
) as seed(source_ref, user_email, note_text)
inner join clinics c on c.slug = 'demo-clinic'
inner join customers cu on cu.clinic_id = c.id
inner join leads l on l.id = cu.source_lead_id and l.source_ref = seed.source_ref
inner join users u on u.email = seed.user_email
where not exists (
  select 1
  from customer_notes cn
  where cn.clinic_id = c.id
    and cn.customer_id = cu.id
    and cn.note_text = seed.note_text
);

insert into contact_identities (clinic_id, entity_type, entity_id, channel_type, external_id, display_name, is_primary)
select c.id,
  'customer',
  cu.id,
  seed.channel_type,
  seed.external_id,
  cu.full_name,
  true
from (
  values
    ('lead-001', 'line', 'customer-line-jane-001'),
    ('lead-003', 'line', 'customer-line-kwan-003'),
    ('lead-004', 'email', 'mint@example.com')
) as seed(source_ref, channel_type, external_id)
inner join clinics c on c.slug = 'demo-clinic'
inner join customers cu on cu.clinic_id = c.id
inner join leads l on l.id = cu.source_lead_id and l.source_ref = seed.source_ref
where not exists (
  select 1
  from contact_identities ci
  where ci.clinic_id = c.id
    and ci.entity_type = 'customer'
    and ci.entity_id = cu.id
    and ci.channel_type = seed.channel_type
    and ci.external_id = seed.external_id
);