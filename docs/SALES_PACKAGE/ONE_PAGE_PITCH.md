# One Page Pitch - FlowBiz Beauty

Phase: 10 - Sales package
Audience: clinic owner, manager, marketing lead

## Product Name

FlowBiz Beauty

## One-Line Positioning

FlowBiz Beauty ช่วยคลินิกความงามลด lead หลุด เพิ่มการตามลูกค้าเก่า และทำให้ AI ช่วยงาน marketing ได้อย่างปลอดภัย โดยทุกข้อความที่ AI สร้างต้องผ่านคนอนุมัติก่อนส่ง

English short line: FlowBiz Beauty is an AI Marketing and Revenue Automation Layer for aesthetic clinics.

## Problem

คลินิกความงามไม่ได้เสียรายได้เพราะไม่มี lead อย่างเดียว แต่เสียรายได้เพราะ lead หลุดระหว่างทาง:

- Lead จาก Facebook, LINE, website และ referral กระจายหลายช่องทาง
- Staff ตอบไม่ทันในช่วงที่ลูกค้ากำลังสนใจ
- Lead ที่ยังไม่พร้อมซื้อไม่ได้ถูก nurture ต่อ
- No-show ไม่ถูกตามกลับอย่างเป็นระบบ
- ลูกค้า Botox/Filler ครบ cycle แล้วไม่มีใครเตือน
- Review request ทำเป็นครั้งคราว ไม่สม่ำเสมอ
- ผู้บริหารตรวจย้อนหลังยากว่าใคร approve หรือส่งอะไร

## Why Clinics Lose Revenue

ช่องว่างหลักอยู่ระหว่าง marketing, staff follow-up, repeat customer และ audit proof:

- Lead ใหม่ตอบช้าเกินไป
- ไม่มี queue สำหรับ lead ที่ยังไม่ถูกติดต่อ
- ข้อความ follow-up ไม่สม่ำเสมอ
- Staff ต้องคิด copy เองซ้ำ ๆ
- ไม่มี workflow ชัดเจนสำหรับ no-show, review และ repeat reminder
- AI อาจเสี่ยงถ้าให้ตอบเองโดยไม่มีคนตรวจ

## Solution

FlowBiz Beauty วางตัวเป็น revenue automation layer เหนือช่องทางและ workflow เดิมของคลินิก:

- รวม lead และ context ที่ต้อง follow-up
- ให้ AI draft ข้อความที่ staff เอาไปตรวจได้เร็วขึ้น
- บังคับ Human-In-The-Loop approval ก่อน outbound
- มี automation preset สำหรับ use case สำคัญของคลินิกความงาม
- มี audit trail, RBAC และ medical safety policy เป็น safety layer

## 8 MVP Workflows

1. New Lead Welcome
2. Uncontacted Lead Alert
3. Lead Qualification Nurture
4. No-Show Recovery
5. Review Request
6. Botox Cycle Reminder
7. Filler Cycle Reminder
8. Daily Marketing Reminder

## AI Safety Promise

FlowBiz ใช้ AI แบบ controlled assistant:

- AI ช่วย draft ไม่ใช่คนส่งแทน staff
- ทุก AI-generated customer-facing message ต้องผ่าน staff approval
- ข้อความที่มี medical risk ถูก flag เพื่อ review
- ข้อความที่ถูก reject จะส่งต่อไม่ได้
- Modified approval เก็บทั้ง before/after
- Audit trail เก็บ approver, clinic/workspace context, risk label และเวลา

## What FlowBiz Is Not

FlowBiz Beauty ไม่ใช่:

- EMR หรือเวชระเบียน
- ระบบนัดหมอเต็มรูปแบบ
- Inventory system
- Payment system
- CRM replacement แบบเต็มตั้งแต่วันแรก
- ระบบให้คำแนะนำทางการแพทย์แทนแพทย์
- AI auto-reply ที่ส่งหาลูกค้าเองโดยไม่มีคนอนุมัติ

## Demo-Ready Status

Demo-ready:

- Demo clinic tenant
- Demo leads/customers
- 8 automation preset workflows
- AI suggestion and HITL queue
- Audit trail proof
- Staging runbook and CI safety gate

Still limited:

- LINE real outbound is not the default; current sales demo uses simulated mode unless a separate integration test plan is approved.
- AI real provider generation is not the default; current safe default is mock provider unless a separate integration test plan is approved.
- Production onboarding requires live staging smoke, consent/PDPA review, real integration QA และ support process confirmation.

## Pilot CTA

เหมาะสำหรับคลินิกที่ต้องการทดลอง 14-30 วัน เพื่อวัดว่า FlowBiz ช่วยลด lead หลุด, เร่ง follow-up, recover no-show และดึง repeat customer กลับมาตาม cycle ได้มากแค่ไหน โดยวัดผลจาก workflow จริงของทีม ไม่ใช่การคาดเดา.
