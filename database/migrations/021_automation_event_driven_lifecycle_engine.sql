alter table automation_flows
  add column if not exists workspace_id bigint references workspaces(id) on delete restrict,
  add column if not exists trigger_event text,
  add column if not exists definition_json jsonb not null default '{}'::jsonb;

insert into organizations (clinic_id, name, slug, status)
select c.id, c.name || ' Organization', c.slug || '-organization-' || c.id::text, 'active'
from clinics c
where exists (
    select 1
    from automation_flows af
    where af.clinic_id = c.id
  )
  and not exists (
    select 1
    from organizations o
    where o.clinic_id = c.id
  )
on conflict (clinic_id)
do nothing;

insert into workspaces (clinic_id, organization_id, name, slug, status)
select c.id, o.id, 'Main Workspace', 'main-workspace', 'active'
from clinics c
inner join organizations o on o.clinic_id = c.id
where exists (
    select 1
    from automation_flows af
    where af.clinic_id = c.id
  )
  and not exists (
    select 1
    from workspaces w
    where w.clinic_id = c.id
  )
on conflict (clinic_id, slug)
do nothing;

with resolved_flow_scope as (
  select
    af.id as flow_id,
    coalesce(
      (
        select w.id
        from workspaces w
        where w.clinic_id = af.clinic_id
        order by w.id asc
        limit 1
      ),
      null
    ) as workspace_id
  from automation_flows af
)
update automation_flows af
set workspace_id = coalesce(af.workspace_id, resolved_flow_scope.workspace_id),
    trigger_event = coalesce(af.trigger_event, af.entry_rule_json->>'eventName'),
    definition_json = case
      when coalesce(af.definition_json, '{}'::jsonb) <> '{}'::jsonb then af.definition_json
      else jsonb_build_object(
        'trigger', coalesce(af.entry_rule_json->>'eventName', null),
        'entityType', coalesce(af.entry_rule_json->>'entityType', 'lead'),
        'conditions', coalesce(af.entry_rule_json->'guardConditions', '{}'::jsonb),
        'rateLimits', coalesce(af.entry_rule_json->'rateLimits', '{}'::jsonb),
        'steps', coalesce(
          (
            select jsonb_agg(
              case
                when s.step_type = 'wait' then jsonb_build_object(
                  'type', 'delay',
                  'minutes', coalesce(s.delay_minutes, nullif((s.config_json->>'delayMinutes')::int, null), 1),
                  'blocking', coalesce((s.config_json->>'blocking')::boolean, true)
                )
                when s.step_type in ('send_message', 'create_task', 'assign_user', 'add_tag', 'remove_tag') then jsonb_build_object(
                  'type', 'action',
                  'action', s.step_type
                ) || coalesce(s.config_json, '{}'::jsonb)
                else jsonb_build_object(
                  'type', 'action',
                  'action', s.step_type
                ) || coalesce(s.config_json, '{}'::jsonb)
              end
              order by s.step_order asc
            )
            from automation_steps s
            where s.flow_id = af.id
          ),
          '[]'::jsonb
        )
      )
    end,
    updated_at = now()
from resolved_flow_scope
where resolved_flow_scope.flow_id = af.id;

alter table automation_flows
  alter column workspace_id set not null;

alter table automation_flows drop constraint if exists automation_flows_status_check;
alter table automation_flows add constraint automation_flows_status_check
  check (status in ('draft', 'active', 'paused', 'disabled', 'archived'));

create index if not exists idx_automation_flows_clinic_workspace on automation_flows(clinic_id, workspace_id);
create index if not exists idx_automation_flows_trigger_event on automation_flows(trigger_event);

alter table automation_steps drop constraint if exists automation_steps_step_type_check;
alter table automation_steps add constraint automation_steps_step_type_check
  check (step_type in ('condition', 'action', 'delay', 'wait', 'send_message', 'create_task', 'assign_user', 'add_tag', 'remove_tag', 'change_stage', 'create_reminder', 'notify_user'));

alter table automation_executions
  add column if not exists workspace_id bigint references workspaces(id) on delete restrict,
  add column if not exists lead_id bigint references leads(id) on delete set null,
  add column if not exists completed_at timestamptz null,
  add column if not exists error_message text null,
  add column if not exists retry_count integer not null default 0;

update automation_executions ae
set workspace_id = coalesce(ae.workspace_id, af.workspace_id),
    lead_id = case when ae.entity_type = 'lead' then coalesce(ae.lead_id, ae.entity_id) else ae.lead_id end,
    completed_at = coalesce(ae.completed_at, ae.finished_at),
    error_message = coalesce(ae.error_message, null),
    updated_at = now()
from automation_flows af
where af.id = ae.flow_id;

alter table automation_executions drop constraint if exists automation_executions_status_check;
alter table automation_executions add constraint automation_executions_status_check
  check (status in ('pending', 'running', 'waiting', 'retrying', 'completed', 'failed', 'cancelled'));

create index if not exists idx_automation_executions_flow_status on automation_executions(flow_id, status);

create table if not exists automation_step_executions (
  id bigserial primary key,
  execution_id bigint not null references automation_executions(id) on delete cascade,
  step_id bigint not null references automation_steps(id) on delete cascade,
  status text not null check (status in ('pending', 'running', 'completed', 'failed', 'skipped', 'waiting', 'retrying', 'scheduled', 'retry_scheduled')),
  result_json jsonb not null default '{}'::jsonb,
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists idx_automation_step_executions_execution on automation_step_executions(execution_id);