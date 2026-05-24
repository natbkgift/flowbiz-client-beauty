create table if not exists automation_flow_versions (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  flow_id bigint not null references automation_flows(id) on delete cascade,
  version integer not null,
  config_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint automation_flow_versions_unique unique (flow_id, version)
);

create index if not exists idx_automation_flow_versions_clinic on automation_flow_versions(clinic_id, flow_id, version desc);

insert into automation_flow_versions (clinic_id, flow_id, version, config_json)
select
  af.clinic_id,
  af.id,
  af.version,
  jsonb_build_object(
    'name', af.name,
    'flowType', af.flow_type,
    'triggerType', af.trigger_type,
    'status', af.status,
    'trigger', jsonb_build_object(
      'eventName', af.entry_rule_json->>'eventName',
      'entityType', af.entry_rule_json->>'entityType'
    ),
    'conditions', coalesce(af.entry_rule_json->'guardConditions', '{}'::jsonb),
    'delays', coalesce(af.entry_rule_json->'delays', '[]'::jsonb),
    'steps', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'stepOrder', s.step_order,
            'stepType', s.step_type,
            'delayMinutes', s.delay_minutes,
            'configJson', s.config_json
          ) order by s.step_order asc
        )
        from automation_steps s
        where s.flow_id = af.id
      ),
      '[]'::jsonb
    )
  )
from automation_flows af
where not exists (
  select 1
  from automation_flow_versions afv
  where afv.flow_id = af.id
    and afv.version = af.version
);