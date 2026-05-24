-- Drop the existing constraint
ALTER TABLE lead_activity DROP CONSTRAINT IF EXISTS lead_activity_event_type_check;

-- Add the new check constraint supporting 'zonepang.interaction'
ALTER TABLE lead_activity ADD CONSTRAINT lead_activity_event_type_check 
  CHECK (event_type IN ('lead.created', 'lead.stage_changed', 'lead.assigned', 'lead.note_added', 'lead.tag_added', 'zonepang.interaction'));
