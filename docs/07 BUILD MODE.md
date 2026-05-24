เข้าสู่ **BUILD MODE**
อ้างอิงจาก Blueprint, MVP scope, และ PR Summary ที่ผ่านแล้ว

เป้าหมายของคำตอบนี้คือทำ **implementation roadmap ระดับ sprint** สำหรับ **PR-01 ถึง PR-08** แบบที่ทีมใช้คุมงานได้จริง

ผมจะจัดเป็น 4 ส่วน:

1. **Build Strategy**
2. **Sprint Roadmap**
3. **Dependencies / Gates**
4. **Execution Rules ระหว่าง build**

---

# 1) Build Strategy

## Build Objective

ส่งมอบ **FlowBiz MVP** ที่ขายคลินิกได้ โดยมี 5 ความสามารถหลัก

* multi-tenant SaaS foundation
* lead CRM
* messaging foundation
* automation flows ที่ช่วยงานจริง
* AI suggestion + analytics/audit ขั้นใช้งานจริง

---

## Recommended Delivery Shape

### ทีมเล็ก

ถ้าทีม 2–4 คน ให้ใช้

* **Sprint ละ 2 สัปดาห์**
* **8 sprints**
* 1 sprint = 1 logical delivery slice
* หลีกเลี่ยงทำหลาย PR ใหญ่ชนกันเกินไป

### เหตุผล

เพราะ PR-01 ถึง PR-08 มี dependency ชัด
ถ้าเปิดหลาย front พร้อมกันเร็วเกิน จะได้ของที่ต่อกันไม่สนิท

---

## Release Strategy

### Internal Milestones

* **M0**: foundation ready
* **M1**: CRM + messaging usable
* **M2**: automation MVP usable
* **M3**: repeat revenue usable
* **M4**: AI + analytics demo-ready

### Recommended External Demo Points

* หลัง Sprint 3
* หลัง Sprint 5
* หลัง Sprint 8

---

# 2) Sprint Roadmap

---

# Sprint 0 — Engineering Setup & Operating Rules

## Goal

ตั้งกติกาและโครงฐานสำหรับ build ให้ทีมเดินตรงทางเดียวกัน

## Scope

* repo conventions
* branching / PR convention
* environment strategy
* migration strategy
* secrets/config management baseline
* error logging baseline
* task tracking board
* canonical enums draft
* event naming convention draft

## Deliverables

* engineering README
* env templates
* migration workflow
* coding rules
* definition of done ต่อ PR
* staging environment baseline

## Exit Gate

* ทุกคนรัน local/staging ได้
* schema migration flow ใช้ได้
* naming conventions ถูกล็อก

## Risks

* ทีมเริ่มเขียนก่อนกติกานิ่ง
* enum/event naming เปลี่ยนระหว่างทาง

---

# Sprint 1 — PR-01 Foundation & Multi-Tenant Base

## Goal

ส่งมอบ SaaS foundation ที่ tenant-safe

## PR Mapping

* **PR-01**

## Scope

* auth baseline
* clinics/users/clinic_users
* role baseline
* current clinic resolution
* tenant-aware middleware / request context
* migration + seed
* basic clinic/user management path

## Backend Tasks

* ออกแบบ schema `clinics`, `users`, `clinic_users`
* สร้าง auth/session flow
* สร้าง clinic context resolver
* สร้าง role guard ขั้นพื้นฐาน
* บังคับ service/repository ให้รับ clinic context
* เพิ่ม tenant isolation tests

## Frontend Tasks

* login page
* session bootstrap
* current clinic state
* minimal clinic membership screen ถ้าจำเป็น

## QA / Verification

* cross-tenant access denied
* clinic member read/write works
* role baseline works

## Deliverables

* login ได้
* clinic context ใช้งานได้
* member/role ใช้งานได้
* tenant-safe base พร้อมต่อยอด

## Sprint Gate

ห้ามไป Sprint 2 ถ้า

* tenant leakage test ยังไม่ผ่าน
* current clinic context ยังไม่นิ่ง

---

# Sprint 2 — PR-02 Lead CRM Core

## Goal

ให้ทีมคลินิกเริ่มเก็บและติดตาม lead ได้จริง

## PR Mapping

* **PR-02**

## Scope

* leads
* lead_interests
* notes
* tags
* entity_tags
* lead CRUD
* lead list/detail
* stage/status update
* owner assignment
* follow-up fields

## Backend Tasks

* ออกแบบ schema lead domain
* สร้าง lead service / repository
* สร้าง validation สำหรับ create/update
* สร้าง stage/status transitions แบบพื้นฐาน
* เพิ่ม note/tag/interest handling
* เพิ่ม lead filters/search

## Frontend Tasks

* lead list page
* lead detail page
* create/edit lead form
* note widget
* tag widget
* interest widget
* owner/stage/status controls

## QA / Verification

* create/update lead ได้
* filter ตาม stage/status/owner ได้
* note/tag/interest ผูก lead ถูก
* tenant isolation ยังสมบูรณ์

## Deliverables

* lead CRM ใช้งานได้จริง
* staff เริ่ม track lead ได้
* data structure พร้อมต่อ messaging/automation

## Sprint Gate

ห้ามไป Sprint 3 ถ้า

* lead detail ยังไม่ usable
* stage/status model ยังสับสน
* owner mapping ยังไม่เสถียร

---

# Sprint 3 — PR-03 Messaging & Template Foundation

## Goal

ให้ FlowBiz ส่งข้อความออกจาก lead/customer context ได้และ trace ย้อนหลังได้

## PR Mapping

* **PR-03**

## Scope

* channels
* contact_identities
* message_templates
* outbound_messages
* 1 primary channel integration
* manual send path
* template rendering
* outbound log

## Backend Tasks

* ออกแบบ messaging schema
* สร้าง provider adapter สำหรับ 1 channel หลัก
* สร้าง template CRUD
* สร้าง contact identity mapping
* สร้าง manual send service
* สร้าง outbound status logging
* เพิ่ม failure handling baseline

## Frontend Tasks

* template list/create/edit
* manual send action from lead detail
* outbound history section

## QA / Verification

* ส่งข้อความจาก lead detail ได้
* template render ถูก
* outbound log ครบ
* failure status บันทึกได้

## Deliverables

* clinic ส่งข้อความได้
* มี template ใช้งานได้
* message history trace ได้

## Demo Point M1

เดโมได้ว่า:

* สร้าง lead
* assign owner
* ส่งข้อความ
* ดูประวัติข้อความย้อนหลัง

---

# Sprint 4 — PR-04 Automation Engine v1

## Goal

สร้าง execution backbone สำหรับ automation ทั้งระบบ

## PR Mapping

* **PR-04**

## Scope

* automation_flows
* automation_steps
* automation_executions
* automation_tasks
* reminders
* trigger dispatcher
* step runner
* delayed steps
* execution logs

## Backend Tasks

* ออกแบบ automation schema
* สร้าง internal event dispatcher
* สร้าง execution state model
* สร้าง step runner สำหรับ:

  * wait
  * send_message
  * create_task
  * add_tag
  * remove_tag
  * change_stage
  * create_reminder
  * notify_user
* สร้าง background worker
* ทำ idempotency guard
* สร้าง execution logs

## Frontend Tasks

* flow list
* flow status
* execution history view ขั้นพื้นฐาน
* reminder/task views เบื้องต้น

## QA / Verification

* trigger แล้ว execution ถูกสร้าง
* wait step resume ได้
* send_message step ใช้งานได้
* create_task / reminder ทำงานได้
* worker restart แล้ว state ไม่พัง

## Deliverables

* automation engine รุ่นแรกพร้อมใช้
* execution trace ได้
* รองรับ flow สำเร็จรูปใน Sprint ถัดไป

## Sprint Gate

ห้ามไป Sprint 5 ถ้า

* duplicate execution ยังแก้ไม่ได้
* delayed steps ยังไม่เสถียร
* execution trace ยังไม่พอ debug

---

# Sprint 5 — PR-05 MVP Automation Pack

## Goal

ทำให้ระบบเริ่มช่วยงานคลินิกจริงด้วย flow สำเร็จรูป

## PR Mapping

* **PR-05**

## Scope

เปิดใช้ 8 flows:

1. New Lead Welcome
2. Uncontacted Lead Alert
3. Lead Qualification Nurture
4. Consult Reminder Flow
5. No-Show Recovery
6. Review Request
7. Botox Cycle Reminder
8. Daily Marketing Reminder

## Backend Tasks

* seed predefined flows
* config model ต่อ clinic
* activate/deactivate flows
* default delays / templates / assignments
* daily summary generator
* suppression / cooldown baseline

## Frontend Tasks

* flow pack page
* flow activation/config UI
* daily marketing summary widget
* reminder/task list improvements
* recent automation activity

## QA / Verification

* เปิด flow ต่อ clinic ได้
* trigger แล้ว action ตรงตาม preset
* task/reminder/message ออกถูก
* flow ปิดแล้วไม่รัน
* cooldown กันยิงซ้ำได้ระดับหนึ่ง

## Deliverables

* productized automation outcome
* clinic demo เห็นคุณค่าชัด
* staff เริ่มพึ่งระบบได้จริง

## Demo Point M2

เดโมได้ว่า:

* lead เข้าใหม่ → welcome + task
* lead ไม่ถูก follow → alert
* consult booked → reminder
* no-show → recovery flow
* daily summary บอกทีมว่าต้องทำอะไร

---

# Sprint 6 — PR-07 Customer & Repeat Revenue Layer

## Goal

ให้ระบบรองรับรายได้จากลูกค้าเก่า ไม่ใช่แค่ lead ใหม่

## PR Mapping

* **PR-07**

## Scope

* customers
* customer_treatments
* lead → customer conversion
* treatment history
* cycle due logic
* inactive customer logic
* reactivation candidate list

## Backend Tasks

* ออกแบบ customer schema
* สร้าง conversion service
* สร้าง treatment history service
* สร้าง cycle calculator
* สร้าง inactive/reactivation selectors
* ผูก event hooks เข้ากับ automation

## Frontend Tasks

* customer list/detail
* convert lead to customer action
* treatment history UI
* cycle due / inactive candidate views

## QA / Verification

* convert lead → customer ได้
* treatment history บันทึกได้
* next recommended date ทำงานได้
* cycle due customers แสดงได้
* automation ใช้ customer/treatment data ได้

## Deliverables

* repeat revenue foundation ใช้งานได้
* botox/filler cycle reminder มีฐานจริง
* customer lifecycle เริ่มครบขึ้น

## Demo Point M3

เดโมได้ว่า:

* lead convert เป็น customer
* เพิ่ม treatment history
* ระบบเตือนลูกค้าที่ถึงรอบ
* ระบบดึงลูกค้า inactive กลับมาได้

---

# Sprint 7 — PR-06 AI Marketing Suggestion v1

## Goal

เพิ่ม AI advisory layer ให้ทีมการตลาดและ sales ใช้งานได้จริง

## PR Mapping

* **PR-06**

## Scope

* content_suggestions
* prompt orchestration
* suggestion generation
* review/approve/reject/regenerate
* convert suggestion → template/promotion draft
* daily marketing summary AI

## Backend Tasks

* ออกแบบ suggestion schema
* สร้าง context builder
* สร้าง prompt registry/versioning
* สร้าง LLM provider adapter
* สร้าง approval workflow
* สร้าง usage/budget guardrails
* สร้าง suggestion reuse path

## Frontend Tasks

* suggestion list/detail
* approve/reject/regenerate controls
* convert to template/draft actions
* daily AI summary panel

## QA / Verification

* generate suggestion ได้
* context snapshot ถูกเก็บ
* approve/reject ได้
* ไม่มี auto-send path
* suggestion ใช้ต่อใน template/promotion draft ได้

## Deliverables

* AI marketing assistant รุ่นแรก
* monthly promo ideas
* broadcast copy suggestion
* daily marketing advice

## Sprint Gate

ห้ามไป Sprint 8 ถ้า

* AI output trace ไม่ได้
* approval flow ยังไม่ชัด
* cost guardrail ยังไม่มี

---

# Sprint 8 — PR-08 Analytics & Audit v1

## Goal

ให้ owner / manager วัดผล และให้ระบบตรวจย้อนหลังได้จริง

## PR Mapping

* **PR-08**

## Scope

* activity_events
* audit_logs
* KPI summary cards
* actionable lists
* automation summaries
* messaging failures
* cycle due / inactive views
* audit trail

## Backend Tasks

* ออกแบบ event/audit schema
* สร้าง event tracking hooks
* สร้าง audit logging service
* สร้าง canonical metric queries
* สร้าง summary aggregations ที่จำเป็น
* เพิ่ม indexes สำหรับ dashboard/audit

## Frontend Tasks

* analytics dashboard
* actionable widgets
* automation outcome widgets
* audit trail page
* recent activity feed

## QA / Verification

* KPI หลักแสดงได้
* follow-up due / cycle due / message failures มองเห็นได้
* AI approval / flow toggle / message send trace ได้
* audit query/filter ใช้งานได้

## Deliverables

* owner เห็นผลลัพธ์จริง
* manager เห็นงานที่ต้องแก้
* ระบบพร้อม demo แบบ evidence-based

## Demo Point M4

เดโมได้ว่า:

* lead เข้าเท่าไร
* follow-up ค้างเท่าไร
* messages ส่งออกกี่ครั้ง
* automation ช่วยอะไร
* ลูกค้าเก่าที่ควรกลับมามีใครบ้าง
* ใคร approve AI suggestion / เปิด flow / ส่งข้อความ

---

# 3) Dependencies / Gates

## Dependency Chain

```text
Sprint 1  → Sprint 2 → Sprint 3 → Sprint 4 → Sprint 5 → Sprint 6 → Sprint 7 → Sprint 8
PR-01       PR-02      PR-03      PR-04      PR-05      PR-07      PR-06      PR-08
```

---

## Hard Gates

### Gate A — ก่อนเริ่ม PR-03

ต้องมี:

* tenant-safe auth
* usable lead model
* owner/stage/status เสถียร

### Gate B — ก่อนเริ่ม PR-04

ต้องมี:

* outbound messaging log ใช้งานได้
* template foundation เสถียร
* lead event hooks พร้อม

### Gate C — ก่อนเริ่ม PR-05

ต้องมี:

* automation execution เสถียร
* wait/send/task/reminder steps ใช้งานได้
* duplicate execution ถูกคุมได้

### Gate D — ก่อนเริ่ม PR-07

ต้องมี:

* lead CRM + automation + messaging ใช้งานจริง
* event model เริ่มนิ่ง

### Gate E — ก่อนเริ่ม PR-06

ต้องมี:

* messaging templates
* customer data
* daily actionable data
* approval-capable user roles

### Gate F — ก่อนเริ่ม PR-08

ต้องมี:

* events หลักจาก CRM / messaging / automation / AI / customer
* canonical metrics definitions ล็อกแล้ว

---

# 4) Recommended Sprint Outputs

## End of Sprint 1

* tenant-safe auth foundation

## End of Sprint 2

* usable lead CRM

## End of Sprint 3

* messaging foundation usable

## End of Sprint 5

* first sellable automation demo

## End of Sprint 6

* repeat revenue story usable

## End of Sprint 8

* AI + analytics + audit MVP ready

---

# 5) Resource View by Role

## Backend-heavy sprints

* Sprint 1
* Sprint 4
* Sprint 6
* Sprint 8

## Product/UI-heavy sprints

* Sprint 2
* Sprint 3
* Sprint 5
* Sprint 7

## Highest risk sprints

* Sprint 4: automation engine
* Sprint 7: AI suggestion quality/cost
* Sprint 8: analytics correctness

---

# 6) Recommended QA Matrix

ทุก sprint ควรมี 4 ชั้น

## A. Functional QA

ฟีเจอร์ทำงานตรงตาม acceptance criteria

## B. Tenant QA

ข้าม clinic ไม่รั่ว

## C. Audit QA

action สำคัญ trace ได้

## D. Regression QA

ของ sprint ก่อนหน้ายังไม่พัง

---

# 7) Suggested Sprint Rituals

## ทุกต้น sprint

* review scope เทียบ PR Summary
* lock non-goals
* identify integration points
* set demo scenario ปลาย sprint

## ทุกกลาง sprint

* architecture check
* data model check
* migration review
* cross-module dependency review

## ทุกปลาย sprint

* demo บน scenario จริง
* test auditability
* test tenant isolation
* capture rollback risks

---

# 8) Build Guardrails

## ห้ามทำระหว่าง build

* refactor ใหญ่ที่ไม่ผูกกับ PR ปัจจุบัน
* เพิ่ม feature เพราะ “น่าจะมีประโยชน์”
* ย้ายไป microservices
* ทำ visual builders ก่อนเวลา
* ทำ analytics ใหญ่ก่อน canonical metrics ชัด

## ต้องทำเสมอ

* migration review
* index review
* role/tenant review
* audit implications review
* failure path review

---

# 9) Fastest Path to First Revenue Demo

ถ้าอยากเร่งเดโมขายเร็วที่สุด ให้เน้นเส้นนี้:

### Revenue Demo Path

* Sprint 1: tenant foundation
* Sprint 2: lead CRM
* Sprint 3: messaging
* Sprint 4: automation engine
* Sprint 5: 8 MVP flows

แปลว่า **จบ Sprint 5 ก็เริ่ม demo ขายได้แล้ว**

แล้วค่อยเสริม:

* Sprint 6: repeat revenue
* Sprint 7: AI suggestion
* Sprint 8: analytics & audit

นี่คือเส้นที่ pragmatic ที่สุด

---

# 10) Final Implementation Roadmap Summary

## Phase 1 — Foundation

* Sprint 0
* Sprint 1
* Sprint 2
* Sprint 3

## Phase 2 — Productization

* Sprint 4
* Sprint 5

## Phase 3 — Revenue Expansion

* Sprint 6

## Phase 4 — Intelligence & Trust

* Sprint 7
* Sprint 8

---

# 11) Recommended Approval Statement

> อนุมัติให้เข้าสู่ Build Mode ตาม implementation roadmap นี้
> โดยยึดลำดับ Sprint 0 ถึง Sprint 8 และ scope ของ PR-01 ถึง PR-08 ที่อนุมัติแล้ว
> ทุก sprint ต้องผ่าน gate ด้าน tenant isolation, reliability, traceability, และ scope discipline ก่อนเริ่ม sprint ถัดไป
> หากมี requirement ใหม่ ให้แตกเป็น backlog หลัง MVP ห้ามแทรกเข้าระหว่าง roadmap นี้

---

# สรุปตรงที่สุด

Roadmap นี้ทำให้ FlowBiz เดินจาก

* **ฐานระบบ**
* ไปสู่ **CRM ที่ใช้ได้**
* ไปสู่ **Automation ที่ขายได้**
* ไปสู่ **Repeat Revenue**
* ไปสู่ **AI + Analytics ที่ดูเป็น SaaS ธุรกิจจริง**

