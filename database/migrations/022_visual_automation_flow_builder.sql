alter table automation_flows
  add column if not exists current_version_id bigint null,
  add column if not exists is_published boolean not null default false;

alter table automation_flow_versions
  add column if not exists version_number integer,
  add column if not exists definition_json jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint null references users(id) on delete set null,
  add column if not exists is_published boolean not null default false;

update automation_flow_versions
set version_number = coalesce(version_number, version),
    definition_json = case
      when coalesce(definition_json, '{}'::jsonb) = '{}'::jsonb then coalesce(config_json, '{}'::jsonb)
      else definition_json
    end,
    created_by = coalesce(
      created_by,
      (
        select af.created_by
        from automation_flows af
        where af.id = automation_flow_versions.flow_id
      )
    )
where version_number is null
   or coalesce(definition_json, '{}'::jsonb) = '{}'::jsonb
   or created_by is null;

alter table automation_flow_versions
  alter column version_number set not null;

create unique index if not exists automation_flow_versions_version_number_unique
  on automation_flow_versions(flow_id, version_number);

create unique index if not exists automation_flow_versions_one_published_per_flow
  on automation_flow_versions(flow_id)
  where is_published = true;

with published_versions as (
  select distinct on (afv.flow_id)
    afv.id,
    afv.flow_id
  from automation_flow_versions afv
  inner join automation_flows af on af.id = afv.flow_id
  where af.status = 'active'
  order by afv.flow_id, afv.version_number desc, afv.id desc
)
update automation_flow_versions afv
set is_published = true
from published_versions pv
where afv.id = pv.id;

update automation_flows af
set current_version_id = coalesce(
      af.current_version_id,
      (
        select afv.id
        from automation_flow_versions afv
        where afv.flow_id = af.id
          and afv.is_published = true
        order by afv.version_number desc, afv.id desc
        limit 1
      )
    ),
    is_published = coalesce(
      af.is_published,
      exists (
        select 1
        from automation_flow_versions afv
        where afv.flow_id = af.id
          and afv.is_published = true
      )
    );

alter table automation_flows
  drop constraint if exists automation_flows_current_version_fk;

alter table automation_flows
  add constraint automation_flows_current_version_fk
  foreign key (current_version_id) references automation_flow_versions(id) on delete set null;
