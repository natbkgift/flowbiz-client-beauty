-- Add custom_message_text column to campaigns table to support template-free direct broadcasting
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS custom_message_text text null;
