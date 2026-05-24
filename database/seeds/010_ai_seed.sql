insert into ai_model_metadata (model_name, version, parameters_json)
values (
  'flowbiz_deterministic_ai',
  'v1',
  '{"leadScoreWeights":{"stage":0.4,"status":0.2,"activity":0.2,"source":0.1,"engagement":0.1},"customerScoreWeights":{"status":0.35,"engagement":0.35,"activity":0.15,"lifetimeValue":0.15}}'::jsonb
)
on conflict (model_name, version)
do update set
  parameters_json = excluded.parameters_json;

insert into ai_lead_scores (clinic_id, lead_id, score, confidence, reason_json, generated_at)
select c.id,
  l.id,
  seed.score,
  seed.confidence,
  seed.reason_json::jsonb,
  now()
from (
  values
    ('lead-001', 82, 0.84, '{"dealProbability":0.78,"signals":["qualified stage","high intent seed"]}'),
    ('lead-002', 58, 0.67, '{"dealProbability":0.44,"signals":["new inquiry","website follow-up needed"]}')
) as seed(source_ref, score, confidence, reason_json)
inner join clinics c on c.slug = 'demo-clinic'
inner join leads l on l.clinic_id = c.id and l.source_ref = seed.source_ref
on conflict (clinic_id, lead_id)
do update set
  score = excluded.score,
  confidence = excluded.confidence,
  reason_json = excluded.reason_json,
  generated_at = excluded.generated_at;

insert into ai_customer_scores (clinic_id, customer_id, score, lifetime_value_estimate, engagement_score, generated_at)
select c.id,
  cu.id,
  seed.score,
  seed.lifetime_value_estimate,
  seed.engagement_score,
  now()
from (
  values
    ('lead-001', 86, 125000, 82),
    ('lead-004', 48, 22000, 35)
) as seed(source_ref, score, lifetime_value_estimate, engagement_score)
inner join clinics c on c.slug = 'demo-clinic'
inner join customers cu on cu.clinic_id = c.id
inner join leads l on l.id = cu.source_lead_id and l.source_ref = seed.source_ref
on conflict (clinic_id, customer_id)
do update set
  score = excluded.score,
  lifetime_value_estimate = excluded.lifetime_value_estimate,
  engagement_score = excluded.engagement_score,
  generated_at = excluded.generated_at;

delete from ai_recommendations
where clinic_id = (select id from clinics where slug = 'demo-clinic' limit 1)
  and (
    (entity_type = 'lead' and entity_id in (
      select l.id from leads l inner join clinics c on c.id = l.clinic_id where c.slug = 'demo-clinic' and l.source_ref in ('lead-001')
    ))
    or
    (entity_type = 'customer' and entity_id in (
      select cu.id from customers cu inner join clinics c on c.id = cu.clinic_id inner join leads l on l.id = cu.source_lead_id where c.slug = 'demo-clinic' and l.source_ref in ('lead-001')
    ))
  );

insert into ai_recommendations (clinic_id, entity_type, entity_id, recommendation_type, recommendation_text, priority, confidence, context_json)
select c.id,
  'lead',
  l.id,
  seed.recommendation_type,
  seed.recommendation_text,
  seed.priority,
  seed.confidence,
  seed.context_json::jsonb
from (
  values
    ('lead-001', 'schedule_followup', 'นัด follow-up ภายใน 24 ชั่วโมงเพื่อปิดการตัดสินใจของ lead รายนี้', 'high', 0.82, '{"actionType":"schedule_followup"}'),
    ('lead-001', 'send_followup_message', 'ส่งข้อความยืนยันรายละเอียด treatment และราคาประเมินให้ลูกค้า', 'medium', 0.74, '{"actionType":"send_followup_message"}')
) as seed(source_ref, recommendation_type, recommendation_text, priority, confidence, context_json)
inner join clinics c on c.slug = 'demo-clinic'
inner join leads l on l.clinic_id = c.id and l.source_ref = seed.source_ref;

insert into ai_recommendations (clinic_id, entity_type, entity_id, recommendation_type, recommendation_text, priority, confidence, context_json)
select c.id,
  'customer',
  cu.id,
  seed.recommendation_type,
  seed.recommendation_text,
  seed.priority,
  seed.confidence,
  seed.context_json::jsonb
from (
  values
    ('lead-001', 'send_treatment_recommendation', 'แนะนำ treatment รอบถัดไปพร้อมข้อเสนอสำหรับลูกค้า VIP', 'high', 0.88, '{"actionType":"send_treatment_recommendation"}'),
    ('lead-001', 'call_customer', 'โทรติดตามหลังบริการเพื่อกระตุ้น repeat booking', 'medium', 0.69, '{"actionType":"call_customer"}')
) as seed(source_ref, recommendation_type, recommendation_text, priority, confidence, context_json)
inner join clinics c on c.slug = 'demo-clinic'
inner join customers cu on cu.clinic_id = c.id
inner join leads l on l.id = cu.source_lead_id and l.source_ref = seed.source_ref;

insert into customer_events (clinic_id, customer_id, event_type, event_source, event_payload_json)
select c.id,
  cu.id,
  'ai.recommendation_generated',
  'seed',
  jsonb_build_object('recommendationCount', 2, 'modelName', 'flowbiz_deterministic_ai', 'version', 'v1')
from clinics c
inner join customers cu on cu.clinic_id = c.id
inner join leads l on l.id = cu.source_lead_id and l.source_ref = 'lead-001'
where c.slug = 'demo-clinic'
  and not exists (
    select 1
    from customer_events ce
    where ce.clinic_id = c.id
      and ce.customer_id = cu.id
      and ce.event_type = 'ai.recommendation_generated'
      and ce.event_source = 'seed'
  );

insert into notes (clinic_id, entity_type, entity_id, author_user_id, note_type, content)
select c.id,
  'lead',
  l.id,
  u.id,
  'ai.recommendation_generated',
  'AI suggestion v1 generated 2 recommendations for this lead.'
from clinics c
inner join leads l on l.clinic_id = c.id and l.source_ref = 'lead-001'
inner join users u on u.email = 'owner@flowbiz.local'
where c.slug = 'demo-clinic'
  and not exists (
    select 1
    from notes n
    where n.clinic_id = c.id
      and n.entity_type = 'lead'
      and n.entity_id = l.id
      and n.note_type = 'ai.recommendation_generated'
  );