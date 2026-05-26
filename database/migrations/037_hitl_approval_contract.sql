-- Migration 037: HITL approval contract metadata

alter table ai_hitl_approval_queue
  add column if not exists workspace_id bigint null references workspaces(id) on delete set null,
  add column if not exists ai_message_id bigint null references ai_chat_messages(id) on delete set null,
  add column if not exists original_text text null,
  add column if not exists modified_text text null,
  add column if not exists risk_label text null,
  add column if not exists rejection_reason text null,
  add column if not exists outbound_message_id bigint null references outbound_messages(id) on delete set null;

update ai_hitl_approval_queue q
set workspace_id = l.workspace_id
from leads l
where q.workspace_id is null
  and q.clinic_id = l.clinic_id
  and q.lead_id = l.id;

update ai_hitl_approval_queue
set original_text = ai_response_text
where original_text is null;

create index if not exists idx_ai_hitl_queue_message
  on ai_hitl_approval_queue(clinic_id, ai_message_id);

create index if not exists idx_ai_hitl_queue_workspace_status
  on ai_hitl_approval_queue(clinic_id, workspace_id, status, created_at desc);
