-- 1. สร้างตาราง dead_letter_jobs สำหรับบันทึกงานที่ล้มเหลวขั้นเด็ดขาด (DLQ)
CREATE TABLE IF NOT EXISTS dead_letter_jobs (
  id bigserial primary key,
  job_id bigint not null,
  clinic_id bigint not null references clinics(id) on delete cascade,
  job_type text not null,
  payload_json jsonb not null default '{}'::jsonb,
  last_error text not null,
  failed_at timestamptz not null default now(),
  resolved_at timestamptz null,
  resolved_by bigint references users(id) on delete set null,
  resolution_notes text null
);

CREATE INDEX IF NOT EXISTS idx_dlq_clinic ON dead_letter_jobs(clinic_id);
CREATE INDEX IF NOT EXISTS idx_dlq_job_type ON dead_letter_jobs(job_type);

-- 2. เพิ่มคอลัมน์เก็บระดับสิทธิ์ของผู้ดูแลระดับ Franchise
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_franchise_admin boolean not null default false;
