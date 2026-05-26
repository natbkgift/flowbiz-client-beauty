# Objection Handling - FlowBiz Beauty

Phase: 10 - Sales package

## 1. "มี CRM อยู่แล้ว"

ตอบ:

ไม่จำเป็นต้องเปลี่ยน CRM เดิมทันทีครับ FlowBiz วางตัวเป็น revenue automation layer ที่ช่วยปิดช่องว่างที่ CRM ทั่วไปมักไม่ทำละเอียดพอ เช่น lead follow-up queue, AI draft ที่ต้อง approve, no-show recovery, review request และ Botox/Filler repeat reminder

Pilot สามารถเริ่มจาก workflow รอบ lead และ repeat customer ก่อน โดยไม่กระทบ system of record เดิม

## 2. "แพงไป"

ตอบ:

เราควรดูจาก opportunity ที่คลินิกเสียอยู่ตอนนี้ เช่น lead ที่ไม่ถูกตาม, no-show ที่ไม่มี recovery, และลูกค้า repeat ที่ไม่ถูกเตือน

Pilot ไม่ได้มีเป้าหมายให้เชื่อจากคำขาย แต่ให้วัด 14-30 วันด้วยข้อมูลจริงว่า workflow นี้ช่วยทีมได้แค่ไหน ถ้าตัวเลขไม่พอ เราจะเห็นชัดและไม่ควร scale ก่อนเวลา

## 3. "กลัว AI ตอบผิด"

ตอบ:

FlowBiz ไม่ให้ AI ส่งข้อความเอง AI ทำหน้าที่ draft เท่านั้น ทุก customer-facing message ที่ AI สร้างต้องผ่าน staff approval ก่อน และข้อความ medical-risk จะถูก flag ให้ review ระวังขึ้น

ถ้า staff reject ข้อความนั้น ระบบไม่ให้ส่งต่อ และ audit trail เก็บ decision ไว้

## 4. "ทีมใช้ไม่เป็น"

ตอบ:

Pilot จะเริ่มจาก workflow ที่ทีมทำอยู่แล้ว ไม่ใช่ให้ทีมเปลี่ยนทั้งระบบในวันเดียว เช่น New Lead Welcome, Uncontacted Lead Alert และ No-Show Recovery

เราวัด staff adoption เป็น metric หลัก ถ้าทีมไม่ใช้จริง pilot ถือว่ายังไม่ผ่าน ไม่ควรบังคับ rollout

## 5. "คลินิกเล็กใช้ได้ไหม"

ตอบ:

ใช้ได้ถ้ามี lead เข้ามาพอให้การ follow-up เป็นปัญหาจริง และ owner หรือ staff ต้องการลดงาน manual

ถ้าคลินิกยังมี lead น้อยมากและ owner ตอบเองได้หมด อาจเริ่มจาก Starter หรือรอจน volume มากขึ้น

## 6. "ใช้ LINE อยู่แล้วต้องเปลี่ยนไหม"

ตอบ:

ไม่จำเป็นต้องเปลี่ยนวิธีทำงานทั้งหมดทันที FlowBiz demo/pilot สามารถเริ่มจากการจัด workflow, AI draft, approval และ audit proof ก่อน

LINE real integration ต้อง setup และ test เพิ่ม โดย default ในระบบตอนนี้ยังเป็น simulated mode เพื่อป้องกันการส่งจริงโดยไม่ตั้งใจ

## 7. "ระบบจะส่งข้อความผิดเองไหม"

ตอบ:

สำหรับ AI-generated message กติกาคือไม่ส่งเอง ต้องมี staff approve ก่อน outbound เสมอ

ระบบมี HITL status, reject state, modified state และ audit trail เพื่อควบคุมว่าอะไรถูก approve โดยใคร เมื่อไร และภายใต้ clinic/workspace ไหน

## 8. "ข้อมูลลูกค้าปลอดภัยไหม"

ตอบ:

MVP มี RBAC, tenant/workspace context, audit trail และแนวทางไม่ log raw PII ใน audit metadata เท่าที่ไม่จำเป็น

ก่อน production ยังต้องทำ staging smoke, consent/PDPA review, integration QA และ operational security checklist เพิ่ม โดยเฉพาะถ้าจะเชื่อม LINE/LLM real mode

## 9. "ยังไม่พร้อมใช้ production ใช่ไหม"

ตอบ:

พูดตรง ๆ: ตอนนี้เหมาะกับ demo, friendly pilot และ staging preparation มากกว่า production rollout เต็มรูปแบบ

เรามี staging runbook, CI gate, HITL safety และ simulated integration foundation แล้ว แต่ production ต้องผ่าน live staging smoke, consent/PDPA, real integration QA, monitoring และ support process ก่อน

## 10. "ถ้า pilot แล้วไม่ได้ผลทำยังไง"

ตอบ:

Pilot ถูกออกแบบมาให้วัดผลแบบตรงไปตรงมา ถ้า workflow ไม่ช่วยลด uncontacted lead, ไม่เพิ่ม follow-up consistency, staff ไม่ใช้ หรือ opportunity ไม่ชัด เราจะสรุปว่าไม่ควร scale

ผลลัพธ์ของ pilot ควรเป็นหนึ่งในสามทาง:

- Convert to paid plan
- Extend pilot with narrower workflow
- Stop and document why it did not fit
