with demo_clinic as (
  select id
  from clinics
  where slug = 'demo-clinic'
  limit 1
), daily_metrics as (
  select
    c.id as clinic_id,
    current_date as metric_date,
    (select count(*)::int from leads l where l.clinic_id = c.id and l.created_at::date = current_date) as leads_created,
    (select count(*)::int from customers cu where cu.clinic_id = c.id and cu.created_at::date = current_date) as customers_created,
    (select count(*)::int from outbound_messages om where om.clinic_id = c.id and om.created_at::date = current_date and om.status in ('pending', 'sent', 'delivered')) as messages_sent,
    (select count(*)::int from automation_executions ae where ae.clinic_id = c.id and ae.created_at::date = current_date) as automation_executions,
    (select count(*)::int from ai_recommendations ar where ar.clinic_id = c.id and ar.created_at::date = current_date) as ai_recommendations_generated
  from demo_clinic c
)
insert into analytics_daily_metrics (clinic_id, metric_date, leads_created, customers_created, messages_sent, automation_executions, ai_recommendations_generated)
select clinic_id, metric_date, leads_created, customers_created, messages_sent, automation_executions, ai_recommendations_generated
from daily_metrics
on conflict (clinic_id, metric_date)
do update set
  leads_created = excluded.leads_created,
  customers_created = excluded.customers_created,
  messages_sent = excluded.messages_sent,
  automation_executions = excluded.automation_executions,
  ai_recommendations_generated = excluded.ai_recommendations_generated,
  updated_at = now();

delete from analytics_funnel_metrics
where clinic_id = (
  select id
  from clinics
  where slug = 'demo-clinic'
  limit 1
);

with demo_clinic as (
  select id
  from clinics
  where slug = 'demo-clinic'
  limit 1
)
insert into analytics_funnel_metrics (clinic_id, stage_name, lead_count, conversion_rate, calculated_at)
select c.id,
  stage_summary.stage_name,
  stage_summary.lead_count,
  stage_summary.conversion_rate,
  now()
from demo_clinic c
cross join lateral (
  select stage_name, lead_count, conversion_rate
  from (
    select
      l.stage as stage_name,
      count(*)::int as lead_count,
      round(count(*)::numeric / nullif((select count(*) from leads all_leads where all_leads.clinic_id = c.id), 0), 4) as conversion_rate
    from leads l
    where l.clinic_id = c.id
    group by l.stage

    union all

    select
      'lost' as stage_name,
      count(*)::int as lead_count,
      round(count(*)::numeric / nullif((select count(*) from leads all_leads where all_leads.clinic_id = c.id), 0), 4) as conversion_rate
    from leads l
    where l.clinic_id = c.id and l.status = 'lost'

    union all

    select
      'customer_converted' as stage_name,
      count(*)::int as lead_count,
      round(count(*)::numeric / nullif((select count(*) from leads all_leads where all_leads.clinic_id = c.id), 0), 4) as conversion_rate
    from customers cu
    where cu.clinic_id = c.id and cu.source_lead_id is not null
  ) metrics
) as stage_summary;

with demo_clinic as (
  select id
  from clinics
  where slug = 'demo-clinic'
  limit 1
), ai_metrics as (
  select
    c.id as clinic_id,
    current_date as metric_date,
    (select count(*)::int from ai_lead_scores als where als.clinic_id = c.id and als.generated_at::date = current_date) as leads_scored,
    (select count(*)::int from ai_customer_scores acs where acs.clinic_id = c.id and acs.generated_at::date = current_date) as customers_scored,
    (select count(*)::int from ai_recommendations ar where ar.clinic_id = c.id and ar.created_at::date = current_date) as recommendations_generated,
    0::int as recommendations_accepted
  from demo_clinic c
)
insert into analytics_ai_metrics (clinic_id, metric_date, leads_scored, customers_scored, recommendations_generated, recommendations_accepted)
select clinic_id, metric_date, leads_scored, customers_scored, recommendations_generated, recommendations_accepted
from ai_metrics
on conflict (clinic_id, metric_date)
do update set
  leads_scored = excluded.leads_scored,
  customers_scored = excluded.customers_scored,
  recommendations_generated = excluded.recommendations_generated,
  recommendations_accepted = excluded.recommendations_accepted,
  updated_at = now();

with demo_clinic as (
  select id
  from clinics
  where slug = 'demo-clinic'
  limit 1
)
insert into audit_logs (clinic_id, entity_type, entity_id, action_type, actor_user_id, context_json)
select c.id,
  'lead',
  l.id,
  'lead.create',
  u.id,
  jsonb_build_object('sourceRef', l.source_ref, 'seed', true)
from demo_clinic c
inner join leads l on l.clinic_id = c.id and l.source_ref = 'lead-001'
inner join users u on u.email = 'owner@flowbiz.local'
where not exists (
  select 1
  from audit_logs al
  where al.clinic_id = c.id
    and al.entity_type = 'lead'
    and al.entity_id = l.id
    and al.action_type = 'lead.create'
    and (al.context_json->>'seed') = 'true'
);

with demo_clinic as (
  select id
  from clinics
  where slug = 'demo-clinic'
  limit 1
)
insert into audit_logs (clinic_id, entity_type, entity_id, action_type, actor_user_id, context_json)
select c.id,
  'customer',
  cu.id,
  'customer.convert',
  u.id,
  jsonb_build_object('sourceLeadId', cu.source_lead_id, 'seed', true)
from demo_clinic c
inner join customers cu on cu.clinic_id = c.id
inner join users u on u.email = 'owner@flowbiz.local'
where cu.source_lead_id is not null
  and not exists (
    select 1
    from audit_logs al
    where al.clinic_id = c.id
      and al.entity_type = 'customer'
      and al.entity_id = cu.id
      and al.action_type = 'customer.convert'
      and (al.context_json->>'seed') = 'true'
  );