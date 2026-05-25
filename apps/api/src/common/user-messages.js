const THAI_ERROR_MESSAGES = {
  AUTH_REQUIRED: 'กรุณาเข้าสู่ระบบก่อนใช้งาน',
  INVALID_AUTH_HEADER: 'รูปแบบ Authorization ไม่ถูกต้อง',
  INVALID_TOKEN: 'เซสชันหมดอายุหรือไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่',
  INVALID_CREDENTIALS: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
  FORBIDDEN: 'คุณไม่มีสิทธิ์ดำเนินการนี้',
  NOT_FOUND: 'ไม่พบหน้าหรือข้อมูลที่ต้องการ',
  PAYLOAD_TOO_LARGE: 'ข้อมูลที่ส่งมามีขนาดใหญ่เกินไป',
  INVALID_JSON: 'รูปแบบ JSON ไม่ถูกต้อง',
  INVALID_PAYLOAD: 'ข้อมูลที่ส่งมาไม่ถูกต้อง',
  INVALID_QUERY: 'พารามิเตอร์คำขอไม่ถูกต้อง',
  BAD_REQUEST: 'ข้อมูลที่ส่งมาไม่ครบถ้วนหรือไม่ถูกต้อง',
  PUBLIC_SIGNUP_DISABLED: 'ยังไม่เปิดให้สมัครใช้งานสาธารณะ กรุณาติดต่อผู้ดูแลระบบ',
  PUBLIC_CLINIC_REQUIRED: 'กรุณาระบุคลินิกสำหรับหน้าเว็บสาธารณะ',
  MEDICAL_SAFETY_REVIEW_REQUIRED: 'เนื้อหานี้เกี่ยวข้องกับความปลอดภัยทางการแพทย์ ต้องให้เจ้าหน้าที่ตรวจสอบก่อนส่ง',
  MESSAGE_NOT_FOUND: 'ไม่พบข้อความ AI ที่ต้องการ',
  INVALID_STATUS: 'สถานะข้อมูลไม่พร้อมสำหรับการดำเนินการนี้',
  CAMPAIGN_NOT_FOUND: 'ไม่พบแคมเปญที่ต้องการ',
  CAMPAIGN_NOT_DRAFT: 'ส่ง broadcast ได้เฉพาะแคมเปญสถานะแบบร่างเท่านั้น',
  POST_NOT_FOUND: 'ไม่พบบทความที่ต้องการ',
  TOPIC_NOT_FOUND: 'ไม่พบหัวข้อถามตอบที่ต้องการ',
  REPLY_NOT_FOUND: 'ไม่พบคำตอบที่ต้องการ',
  SUBSCRIPTION_NOT_FOUND: 'ไม่พบข้อมูลแพ็กเกจหรือ subscription ของคลินิก',
  INTERNAL_SERVER_ERROR: 'ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง'
};

function getThaiErrorMessage(code, fallback) {
  return THAI_ERROR_MESSAGES[code] || fallback || THAI_ERROR_MESSAGES.INTERNAL_SERVER_ERROR;
}

module.exports = {
  getThaiErrorMessage,
  THAI_ERROR_MESSAGES
};
