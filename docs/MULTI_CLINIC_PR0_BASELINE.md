# Multi-Clinic SaaS PR0 Baseline - FlowBiz Beauty

## Current Stack
* **Runtime**: Node.js v22+
* **Backend**: Node HTTP (Vanilla Router ใน `apps/api/src/server.js`), `pg` Pool เชื่อมต่อฐานข้อมูล PostgreSQL v16
* **Frontend**: React v19, servirce serving ผ่าน `apps/web/src/server.js` พร้อมคอมไพล์บันเดิลด้วย `esbuild`
* **Styling**: Vanilla CSS (`styles.css` สำหรับหลังบ้าน, `public.css` สำหรับหน้าบ้าน)
* **Testing**: Node.js built-in test runner, รันด้วยสคริปต์ `npm test` และตัวตรวจสอบความถูกต้องของโครงสร้าง `npm run validate`

---

## Existing Tenant Foundation
ฐานข้อมูลปัจจุบันมีตารางและอินเด็กซ์ที่รองรับสิทธิ์ผู้เช่าเบื้องต้นแล้ว (อ้างอิงจาก `002_multi_tenant_base.sql`):
1. **ตาราง `clinics`**: เก็บข้อมูลผู้เช่ารายหลัก มีฟิลด์ `id`, `name`, `slug` (unique), `plan` และ `status`
2. **ตาราง `users`**: ข้อมูลสมาชิกระดับพนักงานและผู้ดูแล
3. **ตาราง `clinic_users`**: ตารางเชื่อมโยงผู้ใช้กับคลินิกพร้อมบทบาท (`role` ได้แก่ 'owner', 'manager', 'sales', 'marketing', 'staff')
4. **อินเด็กซ์เพื่อความปลอดภัยข้ามผู้เช่า**: อินเด็กซ์บน `clinic_users(user_id)` และ `clinic_users(clinic_id)` เพื่อความเร็วในการจับคู่ตรวจสอบสิทธิ์

---

## Existing Admin Routes / Menus
หน้าจอ Admin ในไฟล์หน้าบ้านหลัก `apps/web/src/app.jsx` ให้บริการเมนูควบคุม CRM และ AI Automation ดังนี้:
* **แดชบอร์ด (`dashboard`)**: ภาพรวมข้อมูลลีดและงานระบบอัตโนมัติประจำวัน
* **กล่องแชทรวม (`unified-inbox`)**: แชทและ AI co-pilot ช่วยร่างข้อความ
* **ROAS และสะสมแต้ม (`roas-analytics`)**: ประสิทธิภาพโฆษณา ระบบแนะนำเพื่อน และประวัติแต้มสะสม
* **คอนโซล AI Agent (`ai-agent-console`)**: จัดการกฎของบอตและคิว HITL (`ai_hitl_approval_queue`)
* **จัดการบทความ (`blog-manager`)** และ **ดูแลเว็บบอร์ด (`forum-moderator`)**: เมนูสำหรับแอดมินใช้เพิ่มบล็อกบทความความรู้และคัดกรองเนื้อหาเว็บบอร์ด
* **ผู้ใช้งาน (`users`)** และ **เวิร์กสเปซ (`workspaces`)**: บริหารทีมงานและขอบเขตพื้นที่ทำงานย่อย
* **ตั้งค่า (`settings`)**: ตั้งค่าองค์กร คลินิก และโมเดล AI
* **ระบบอัตโนมัติ (`automation`)**: สร้าง แก้ไข และมอนิเตอร์ Workflow (ใช้ Visual builder หรือ Execution Debugger)
* **บันทึกตรวจสอบ (`audit`)**: บันทึกเหตุการณ์และกิจกรรมสำคัญ (`audit_logs`)
* **สุขภาพระบบ (`system-health`)**: คิวงานของ Worker และประสิทธิภาพ event bus

---

## Existing Public Web Behavior
หน้าเว็บสำหรับบุคคลทั่วไป (`apps/web/src/public-app.jsx`) มีรูปแบบการทำงานในปัจจุบันดังนี้:
* หน้าจอถูกพัฒนาเป็น Single Page Application (SPA) บนสแต็ก React และเชื่อมต่อผ่าน API ของ Backend
* ดึงข้อมูลบทความถามตอบผ่าน API เส้นทางสาธารณะ เช่น `/blog/posts` และ `/forum/topics`
* **ข้อจำกัดสำคัญ**: หน้าบ้านปัจจุบันใช้การผูกขาดรหัสคลินิกผ่านตัวแปรสภาพแวดล้อม `PUBLIC_CLINIC_ID` (ผ่านคอนฟิก `window.__FLOWBIZ_WEB_CONFIG__.publicClinicId`) ทำให้ระบบรันได้เฉพาะหน้าเว็บของคลินิกเดี่ยวตามที่ Config ตอนจัดเตรียมสภาพแวดล้อมเท่านั้น ไม่สนับสนุนการสลับคลินิกตามเส้นทาง URL

---

## Existing API Modules
โมดูล API ปัจจุบันอยู่ใน `apps/api/src/modules/` แบ่งย่อยดังนี้:
* `auth` และ `tenancy`: จัดการสิทธิ์การเข้าใช้งานและบริบทผู้ใช้งานตาม Clinic/Workspace
* `leads`, `customers`, `campaigns`, `messaging`: จัดการข้อมูลสมาชิกลูกค้า CRM คอนแทกต์ ปลายทางการแชท และส่งข้อความโปรโมต
* `automation`, `worker-engine`, `event-bus`: กลไกการรันงานอัตโนมัติตามอีเวนต์และการรอคิวงาน
* `ai`, `ai-agent`, `ai-feedback`: ส่วนคำนวณสถิติลีด ร่างข้อความตอบกลับ และคิวคัดกรองคำถามของแพทย์
* `blog`, `forum`, `public-content`: บริการหลังบ้านและบริการหน้าบ้านสำหรับบทความและชุมชนสนทนา

---

## Existing Database Areas
โครงสร้างฐานข้อมูลปัจจุบัน (Migration `001` - `037`) ครอบคลุม:
* ระบบเก็บประวัติและตรวจสอบ: ตาราง `audit_logs` (บันทึกผู้ทำ เหตุการณ์ และบริบท contextJson)
* คิวอนุมัติ HITL: ตาราง `ai_hitl_approval_queue` (เก็บข้อมูลข้อความตอบกลับ AI คลินิก ลีด และสถานะอนุมัติ)
* ระบบสมาชิกบล็อก/เว็บบอร์ด: ตาราง `blog_posts`, `forum_topics`, `forum_replies`

---

## Existing Safety Constraints
* **Human-in-the-Loop (HITL)**: บล็อกข้อความที่ประมวลผลผ่าน AI ไม่ให้ถูกส่งตรงออกนอกคลินิกโดยไม่มีการกดอนุมัติจากพนักงานก่อน ทุกข้อความ AI หรือข้อความด้านการแพทย์ (Medical Safety) จะต้องติดสถานะ `pending_approval` เพื่อรอการตรวจสอบและอนุมัติเสมอ
* **LINE & AI Simulated Mode**: โดยดีฟอลต์ในตัวแปรสภาพแวดล้อม `LINE_INTEGRATION_MODE` และ `AI_PROVIDER` จะต้องรันเป็น `simulated` และ `mock` ในเครื่องของนักพัฒนาหรือรันทดสอบ เพื่อความปลอดภัยไม่ให้เชื่อมต่อและส่งข้อมูลจริงออกนอกระบบ
* **Production Config Protection**: ในสภาพแวดล้อม `production` คอนฟิกจะปิดกั้นทันทีและ Fail Closed หากพบว่าระบบไม่มีการกำหนด AUTH_TOKEN_SECRET หรือใช้ค่าดีฟอลต์ หรือใช้ URL ฐานข้อมูลที่เป็น localhost

---

## Gaps Against Requested Multi-Clinic SaaS
จากการตรวจสอบพบข้อผิดพลาดหรือข้อจำกัดเมื่อต้องการปรับปรุงเป็น Multi-Clinic SaaS ดังนี้:
1. **การกำหนดบริบทหน้าบ้าน (Public Client Tenant Context)**: `public-app.jsx` ทำงานผ่าน `PUBLIC_CLINIC_ID` บนตัวแปรสภาพแวดล้อมตัวเดียว ไม่สามารถแกะสลักคลินิกจาก Path URL เช่น `https://beauty.flowbiz.cloud/clinic-slug` มาแปลงเป็น `clinic_id` เพื่อดึงบทความหรือเว็บบอร์ดของคลินิกนั้นโดยตรงได้
2. **การขาด Schema เว็บไซต์เฉพาะคลินิก**: ข้อมูลหน้าเว็บ รายละเอียดบริการ โปรโมชั่น และดีไซน์เฉพาะคลินิก (เช่น สีธีม โลโก้) ยังไม่มีตารางรองรับเฉพาะผู้เช่า
3. **การเข้าถึงข้าม Tenant ของ Member**: ปัจจุบันฟอรั่มและเว็บบอร์ดในฐานข้อมูลไม่มีคอลัมน์เชื่อมต่อกับคลินิกที่สมัคร ทำให้เมื่อรันหน้าเว็บบอร์ด ทุกคลินิกจะเห็นกระทู้ถามตอบชุดเดียวกันทั้งหมด
4. **ความเสี่ยงการละเมิด Reserved Words**: การเปลี่ยนไปใช้ Path-Based Routing `/:clinicSlug` เสี่ยงต่อการโดนคลินิกตั้งค่าสลักทับเส้นทางแอดมิน เช่น `/:clinicSlug` = `/admin` ซึ่งจะแย่งสิทธิ์การเรนเดอร์หน้า SPA ระบบบริหารจัดการของพนักงาน

---

## PR 1 Readiness Checklist
ก่อนที่จะเริ่มต้นดำเนินการปรับปรุงโค้ดใน PR 1 จะต้องทำตามขั้นตอนเหล่านี้:
* [x] จัดทำเอกสาร Roadmap และแผนภาพสถาปัตยกรรมเป้าหมาย (`docs/MULTI_CLINIC_SAAS_ROADMAP.md`)
* [x] วิเคราะห์โครงสร้างรากฐานและจัดทำรายงานชิ้นนี้ (`docs/MULTI_CLINIC_PR0_BASELINE.md`)
* [x] รันตรวจสอบความถูกต้องของสคริปต์ (`npm run validate` ผ่าน 100%)
* [x] รันการทดสอบระบบผ่าน simulated mode (`npm test` ผ่านครบ 163 การทดสอบ)
* [x] อัปเดตรายการ Pull Request และสร้าง Branch สำหรับจัดเก็บบันทึกแผน

---

## Stop Conditions Before Runtime Work
* **กฎข้อห้ามเด็ดขาด**: ใน PR 0 นี้ ห้ามมีการแก้ไขไฟล์โค้ดใดๆ ที่มีผลต่อ Runtime ทั้งหมด (เช่น server.js, app.jsx, public-app.jsx) ห้ามสร้างไฟล์ Migration ฐานข้อมูลจริง และห้ามแก้ไขพฤติกรรมการเชื่อมต่อ API / การ Routing ใดๆ
* ใน PR 1-3 ถัดไป การนำโครงสร้างฐานข้อมูลใหม่มาใช้ต้องผ่านการตรวจสอบความเสี่ยงอย่างละเอียด และสลักของคลินิกจะต้องถูกกรองผ่านชุดคัดแยกคำต้องห้าม (Reserved Words) เสมอเพื่อรักษาโครงสร้างเดิมไม่ให้พัง
* กฎความปลอดภัย AI & HITL จะต้องถูกคงไว้และเข้มข้นยิ่งขึ้นในทุกการแก้ไข ห้ามให้ AI ส่งข้อความภายนอกอัตโนมัติโดยปราศจากการอนุมัติของเจ้าหน้าที่โดยเด็ดขาด
