insert into leads (
  clinic_id,
  organization_id,
  workspace_id,
  source,
  source_ref,
  full_name,
  nickname,
  phone,
  email,
  status,
  stage,
  owner_user_id,
  next_followup_at,
  intent_score,
  budget_range,
  preferred_branch,
  notes_summary
)
select
  c.id,
  o.id,
  w.id,
  seed.source,
  seed.source_ref,
  seed.full_name,
  seed.nickname,
  seed.phone,
  seed.email,
  seed.status,
  seed.stage,
  u.id,
  seed.next_followup_at::timestamptz,
  seed.intent_score,
  seed.budget_range,
  seed.preferred_branch,
  seed.notes_summary
from (
  values
    ('manual', 'lead-001', 'Jane Woranan', 'Jane', '0811111111', 'jane@example.com', 'active', 'qualified', 'owner@flowbiz.local', '2026-03-18T10:00:00Z', 85, '80k-120k', 'สุขุมวิท', 'Interested in rhinoplasty consult'),
    ('website', 'lead-002', 'Mali Siri', 'Mali', '0822222222', 'mali@example.com', 'new', 'inquiry', 'staff@flowbiz.local', '2026-03-19T09:30:00Z', 60, '20k-40k', 'ลาดพร้าว', 'Asked about filler promotion'),
    ('line', 'lead-003', 'Kwan Thita', 'Kwan', '0833333333', 'kwan@example.com', 'active', 'consult_booked', 'owner@flowbiz.local', '2026-03-20T08:00:00Z', 90, '120k+', 'สุขุมวิท', 'Booked consult already'),
    ('facebook', 'lead-004', 'Mint Anong', 'Mint', '0844444444', 'mint@example.com', 'lost', 'qualified', 'staff@flowbiz.local', null, 40, '10k-20k', 'บางนา', 'Price sensitivity detected'),
    ('referral', 'lead-005', 'Pimchanok Dee', 'Pim', '0855555555', 'pim@example.com', 'won', 'converted', 'owner@flowbiz.local', null, 95, '150k+', 'สุขุมวิท', 'Converted from referral channel')
) as seed(
  source,
  source_ref,
  full_name,
  nickname,
  phone,
  email,
  status,
  stage,
  owner_email,
  next_followup_at,
  intent_score,
  budget_range,
  preferred_branch,
  notes_summary
)
inner join clinics c on c.slug = 'demo-clinic'
inner join organizations o on o.clinic_id = c.id and o.status = 'active'
inner join workspaces w on w.clinic_id = c.id and w.organization_id = o.id and w.slug = 'main-workspace'
inner join users u on u.email = seed.owner_email
on conflict (clinic_id, source_ref)
do update set
  organization_id = excluded.organization_id,
  workspace_id = excluded.workspace_id,
  full_name = excluded.full_name,
  nickname = excluded.nickname,
  phone = excluded.phone,
  email = excluded.email,
  status = excluded.status,
  stage = excluded.stage,
  owner_user_id = excluded.owner_user_id,
  next_followup_at = excluded.next_followup_at,
  intent_score = excluded.intent_score,
  budget_range = excluded.budget_range,
  preferred_branch = excluded.preferred_branch,
  notes_summary = excluded.notes_summary,
  updated_at = now();

insert into tags (clinic_id, name, color)
select c.id, seed.name, seed.color
from clinics c
cross join (
  values
    ('high_intent', '#D97706'),
    ('consult_ready', '#2563EB'),
    ('reactivation', '#059669')
) as seed(name, color)
where c.slug = 'demo-clinic'
on conflict (clinic_id, name)
do update set
  color = excluded.color,
  updated_at = now();

insert into lead_tags (clinic_id, name, color)
select c.id, seed.name, seed.color
from clinics c
cross join (
  values
    ('high_intent', '#D97706'),
    ('consult_ready', '#2563EB'),
    ('reactivation', '#059669')
) as seed(name, color)
where c.slug = 'demo-clinic'
on conflict (clinic_id, name)
do update set
  color = excluded.color,
  updated_at = now();

insert into entity_tags (clinic_id, tag_id, entity_type, entity_id)
select c.id, t.id, 'lead', l.id
from (
  values
    ('lead-001', 'high_intent'),
    ('lead-003', 'consult_ready'),
    ('lead-004', 'reactivation')
) as seed(source_ref, tag_name)
inner join clinics c on c.slug = 'demo-clinic'
inner join leads l on l.clinic_id = c.id and l.source_ref = seed.source_ref
inner join tags t on t.clinic_id = c.id and t.name = seed.tag_name
on conflict (clinic_id, tag_id, entity_type, entity_id)
do nothing;

insert into lead_tag_links (clinic_id, lead_id, tag_id)
select c.id, l.id, lt.id
from (
  values
    ('lead-001', 'high_intent'),
    ('lead-003', 'consult_ready'),
    ('lead-004', 'reactivation')
) as seed(source_ref, tag_name)
inner join clinics c on c.slug = 'demo-clinic'
inner join leads l on l.clinic_id = c.id and l.source_ref = seed.source_ref
inner join lead_tags lt on lt.clinic_id = c.id and lt.name = seed.tag_name
on conflict (clinic_id, lead_id, tag_id)
do nothing;

insert into lead_interests (clinic_id, lead_id, interest_type, interest_name, priority, budget_min, budget_max, urgency)
select c.id, l.id, seed.interest_type, seed.interest_name, seed.priority, seed.budget_min, seed.budget_max, seed.urgency
from (
  values
    ('lead-001', 'treatment', 'Rhinoplasty', 1, 80000, 120000, 'high'),
    ('lead-002', 'treatment', 'Filler', 2, 20000, 40000, 'medium'),
    ('lead-003', 'treatment', 'Blepharoplasty', 1, 120000, 180000, 'high')
) as seed(source_ref, interest_type, interest_name, priority, budget_min, budget_max, urgency)
inner join clinics c on c.slug = 'demo-clinic'
inner join leads l on l.clinic_id = c.id and l.source_ref = seed.source_ref
where not exists (
  select 1
  from lead_interests li
  where li.clinic_id = c.id
    and li.lead_id = l.id
    and li.interest_name = seed.interest_name
);

insert into notes (clinic_id, entity_type, entity_id, author_user_id, note_type, content)
select c.id, 'lead', l.id, u.id, seed.note_type, seed.content
from (
  values
    ('lead-001', 'owner@flowbiz.local', 'general', 'Follow up after consult availability confirmed.'),
    ('lead-002', 'staff@flowbiz.local', 'general', 'Lead asked for filler pricing comparison.'),
    ('lead-003', 'owner@flowbiz.local', 'general', 'Consult booked for next week.')
) as seed(source_ref, author_email, note_type, content)
inner join clinics c on c.slug = 'demo-clinic'
inner join leads l on l.clinic_id = c.id and l.source_ref = seed.source_ref
inner join users u on u.email = seed.author_email
where not exists (
  select 1
  from notes n
  where n.clinic_id = c.id
    and n.entity_type = 'lead'
    and n.entity_id = l.id
    and n.content = seed.content
);

insert into lead_notes (clinic_id, lead_id, author_user_id, note_type, content)
select c.id, l.id, u.id, seed.note_type, seed.content
from (
  values
    ('lead-001', 'owner@flowbiz.local', 'general', 'Follow up after consult availability confirmed.'),
    ('lead-002', 'staff@flowbiz.local', 'general', 'Lead asked for filler pricing comparison.'),
    ('lead-003', 'owner@flowbiz.local', 'general', 'Consult booked for next week.')
) as seed(source_ref, author_email, note_type, content)
inner join clinics c on c.slug = 'demo-clinic'
inner join leads l on l.clinic_id = c.id and l.source_ref = seed.source_ref
inner join users u on u.email = seed.author_email
where not exists (
  select 1
  from lead_notes n
  where n.clinic_id = c.id
    and n.lead_id = l.id
    and n.content = seed.content
);

insert into lead_activity (clinic_id, lead_id, event_type, event_data_json, created_at)
select c.id, l.id, seed.event_type, seed.event_data_json::jsonb, now()
from (
  values
    ('lead-001', 'lead.created', '{"source":"manual","stage":"qualified"}'),
    ('lead-002', 'lead.created', '{"source":"website","stage":"inquiry"}'),
    ('lead-003', 'lead.created', '{"source":"line","stage":"consult_booked"}'),
    ('lead-004', 'lead.created', '{"source":"facebook","stage":"qualified"}'),
    ('lead-005', 'lead.created', '{"source":"referral","stage":"converted"}')
) as seed(source_ref, event_type, event_data_json)
inner join clinics c on c.slug = 'demo-clinic'
inner join leads l on l.clinic_id = c.id and l.source_ref = seed.source_ref
where not exists (
  select 1
  from lead_activity la
  where la.clinic_id = c.id
    and la.lead_id = l.id
    and la.event_type = seed.event_type
);