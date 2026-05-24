do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'automation_executions'
      and column_name = 'event_id'
  ) then
    alter table automation_executions add column event_id text null;
  end if;
end $$;

update automation_executions
set event_id = concat('legacy-', id)
where event_id is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'automation_executions_event_unique'
  ) then
    alter table automation_executions
      add constraint automation_executions_event_unique unique (flow_id, entity_type, entity_id, event_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'automation_tasks'
      and column_name = 'attempt_count'
  ) then
    alter table automation_tasks add column attempt_count integer not null default 0;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'automation_tasks'
      and column_name = 'max_attempts'
  ) then
    alter table automation_tasks add column max_attempts integer not null default 3;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'automation_tasks'
      and column_name = 'next_retry_at'
  ) then
    alter table automation_tasks add column next_retry_at timestamptz null;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'automation_tasks'
      and column_name = 'last_error'
  ) then
    alter table automation_tasks add column last_error text null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'automation_execution_logs'
      and column_name = 'clinic_id'
  ) then
    alter table automation_execution_logs add column clinic_id bigint null references clinics(id) on delete cascade;
  end if;
end $$;

update automation_execution_logs logs
set clinic_id = executions.clinic_id
from automation_executions executions
where executions.id = logs.execution_id
  and logs.clinic_id is null;

alter table automation_execution_logs
  alter column clinic_id set not null;

create index if not exists idx_automation_execution_logs_clinic on automation_execution_logs(clinic_id);