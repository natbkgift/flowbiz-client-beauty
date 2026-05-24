-- Migration 033: Add google to leads_source_check check constraint
-- Target: flowbiz-client-beauty database

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_source_check;
ALTER TABLE leads ADD CONSTRAINT leads_source_check
  CHECK (source IN ('manual', 'website', 'line', 'facebook', 'instagram', 'tiktok', 'referral', 'import', 'google'));
