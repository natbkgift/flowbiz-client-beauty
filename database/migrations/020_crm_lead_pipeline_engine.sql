alter table leads
  add column if not exists organization_id bigint references organizations(id) on delete restrict,
  add column if not exists workspace_id bigint references workspaces(id) on delete restrict;

insert into organizations (clinic_id, name, slug, status)
select c.id, c.name || ' Organization', c.slug || '-organization-' || c.id::text, 'active'
from clinics c
where exists (
    select 1
    from leads l
    where l.clinic_id = c.id
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
    from leads l
    where l.clinic_id = c.id
  )
  and not exists (
    select 1
    from workspaces w
    where w.clinic_id = c.id
  )
on conflict (clinic_id, slug)
do nothing;

with resolved_lead_scope as (
  select
    l.id as lead_id,
    o.id as organization_id,
    coalesce(
      (
        select w.id
        from workspaces w
        where w.clinic_id = l.clinic_id
          and w.organization_id = o.id
        order by w.id asc
        limit 1
      ),
      (
        select w.id
        from workspaces w
        where w.clinic_id = l.clinic_id
        order by w.id asc
        limit 1
      )
    ) as workspace_id
  from leads l
  inner join organizations o on o.clinic_id = l.clinic_id
)
update leads l
set organization_id = coalesce(l.organization_id, resolved_lead_scope.organization_id),
    workspace_id = coalesce(l.workspace_id, resolved_lead_scope.workspace_id),
    updated_at = now()
from resolved_lead_scope
where resolved_lead_scope.lead_id = l.id
  and (l.organization_id is null or l.workspace_id is null);

alter table leads
  alter column organization_id set not null,
  alter column workspace_id set not null;

alter table leads drop constraint if exists leads_status_check;
alter table leads add constraint leads_status_check check (status in ('new', 'active', 'converted', 'lost', 'won', 'archived'));

alter table leads drop constraint if exists leads_stage_check;
alter table leads add constraint leads_stage_check check (stage in ('inquiry', 'qualified', 'consult_booked', 'consult_done', 'booked', 'converted', 'lost', 'no_show'));

create table if not exists lead_notes (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  lead_id bigint not null references leads(id) on delete cascade,
  author_user_id bigint null references users(id) on delete set null,
  content text not null,
  note_type text not null default 'general',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists lead_tags (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  name text not null,
  color text not null default '#C8B27D',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_tags_clinic_name_unique unique (clinic_id, name)
);

create table if not exists lead_tag_links (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  lead_id bigint not null references leads(id) on delete cascade,
  tag_id bigint not null references lead_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint lead_tag_links_unique unique (clinic_id, lead_id, tag_id)
);

create table if not exists lead_activity (
  id bigserial primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  lead_id bigint not null references leads(id) on delete cascade,
  event_type text not null check (event_type in ('lead.created', 'lead.stage_changed', 'lead.assigned', 'lead.note_added', 'lead.tag_added')),
  event_data_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into lead_tags (clinic_id, name, color, created_at, updated_at)
select t.clinic_id, t.name, t.color, t.created_at, t.updated_at
from tags t
on conflict (clinic_id, name)
do update set
  color = excluded.color,
  updated_at = now();

insert into lead_tag_links (clinic_id, lead_id, tag_id, created_at)
select et.clinic_id, et.entity_id, lt.id, et.created_at
from entity_tags et
inner join tags t on t.id = et.tag_id
inner join lead_tags lt on lt.clinic_id = t.clinic_id and lt.name = t.name
where et.entity_type = 'lead'
on conflict (clinic_id, lead_id, tag_id)
do nothing;

insert into lead_notes (clinic_id, lead_id, author_user_id, content, note_type, created_at, updated_at)
select n.clinic_id, n.entity_id, n.author_user_id, n.content, n.note_type, n.created_at, n.updated_at
from notes n
where n.entity_type = 'lead'
on conflict do nothing;

create index if not exists idx_leads_clinic_workspace_stage on leads(clinic_id, workspace_id, stage);
create index if not exists idx_leads_clinic_workspace_owner on leads(clinic_id, workspace_id, owner_user_id);
create index if not exists idx_leads_clinic_workspace_created on leads(clinic_id, workspace_id, created_at desc);
create index if not exists idx_lead_notes_lead on lead_notes(lead_id, created_at desc);
create index if not exists idx_lead_activity_lead on lead_activity(lead_id, created_at desc);
create index if not exists idx_lead_tag_links_lead on lead_tag_links(lead_id);