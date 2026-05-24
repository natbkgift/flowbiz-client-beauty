-- เพิ่มดัชนี Composite สำหรับตารางกิจกรรมลีดเพื่อให้สามารถเรียกดูไทม์ไลน์และกิจกรรมของคลินิกได้รวดเร็ว
CREATE INDEX IF NOT EXISTS idx_lead_activity_clinic_created 
  ON lead_activity(clinic_id, created_at DESC);

-- เพิ่มดัชนี Composite สำหรับตารางบันทึกการส่งข้อความขาออกสำหรับใช้ตรวจสอบไทม์ไลน์
CREATE INDEX IF NOT EXISTS idx_outbound_messages_clinic_created 
  ON outbound_messages(clinic_id, created_at DESC);

-- เพิ่มดัชนี Composite สำหรับการแสดงผลประวัติตรวจสอบรวมของแต่ละคลินิกบน Dashboard
CREATE INDEX IF NOT EXISTS idx_audit_logs_clinic_created 
  ON audit_logs(clinic_id, created_at DESC);
