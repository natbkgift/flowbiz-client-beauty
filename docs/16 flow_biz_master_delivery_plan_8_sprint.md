# FlowBiz Master Delivery Plan — 8 Sprint

## 1. Executive Summary

เอกสารนี้คือแผนส่งมอบหลักสำหรับการพัฒนา **FlowBiz Beauty Marketing SaaS** จากแนวคิดไปสู่ MVP ที่ขายคลินิกได้จริง โดยจัดงานเป็น **8 Sprint** ตามลำดับ dependency ที่ควบคุมได้ และยึดหลักว่า

- เริ่มจากฐานระบบที่ปลอดภัยก่อน
- สร้างของที่ขายได้เร็ว
- เพิ่มความสามารถที่ผูกกับรายได้ทีละชั้น
- ทุกการตัดสินใจต้อง trace ย้อนหลังได้

แผนนี้อ้างอิงจาก Blueprint, MVP Scope, และ PR Summary ที่ผ่านการกำหนดแล้ว

---

## 2. Product Goal

สร้าง **AI Marketing & Revenue Automation SaaS สำหรับคลินิกความงาม/ศัลยกรรม** ที่ช่วยให้คลินิก

- เก็บและติดตาม lead ได้ดีขึ้น
- ส่งข้อความและ follow-up ได้เป็นระบบ
- ใช้ automation เพื่อลดงาน manual
- ดึงลูกค้าเก่ากลับมาซื้อซ้ำ
- ใช้ AI ช่วยคิดโปรและคอนเทนต์
- วัดผลและตรวจย้อนหลังได้จริง

---

## 3. MVP Outcome ที่ต้องได้

เมื่อจบ Sprint 8 ระบบต้องสามารถทำสิ่งต่อไปนี้ได้

1. เป็น SaaS แบบหลายคลินิกที่ tenant-safe
2. มี Lead CRM ใช้งานจริง
3. ส่งข้อความจาก lead/customer context ได้
4. มี Automation Engine ที่รัน flow ได้จริง
5. มี MVP Automation Pack 8 flow ที่ขายได้
6. รองรับ customer conversion และ repeat revenue logic
7. มี AI Marketing Suggestion ที่มี approval gate
8. มี Analytics + Audit ที่วัดผลและ trace ย้อนหลังได้

---

## 4. Delivery Principles

### 4.1 Scope Discipline
- 1 Sprint = 1 logical delivery slice
- ห้ามแทรก feature นอก scope ของ sprint
- ห้าม refactor ใหญ่ที่ไม่ผูกกับ PR/sprint ปัจจุบัน

### 4.2 Technical Discipline
- ใช้ **modular monolith**
- ใช้ **PostgreSQL** เป็น source of truth
- ใช้ **Redis/queue workers** สำหรับ async runtime
- ทุก domain สำคัญต้อง tenant-scoped

### 4.3 Product Discipline
- ทำของที่ “ขายได้” ก่อนของที่ “ดูสวย”
- เน้น actionable workflows มากกว่า generic platform
- AI เป็น advisory layer ไม่ใช่ autonomous operator

### 4.4 Trust & Auditability
- ทุก action สำคัญต้อง trace ได้
- ทุก automation ต้อง debug ได้
- ทุก AI suggestion ต้องมี human approval ก่อนใช้ใน path สำคัญ

---

## 5. Architecture Direction

### 5.1 Core Architecture
- Frontend dashboard (web)
- Backend modular monolith
- PostgreSQL
- Redis / background workers
- External integrations: messaging provider, LLM provider

### 5.2 Core Domains
- Tenant & Auth
- Lead CRM
- Messaging
- Automation
- Customer & Repeat Revenue
- AI Suggestion
- Analytics & Audit

---

## 6. Sprint Roadmap Overview

| Sprint | PR | Theme | Core Outcome |
|---|---|---|---|
| Sprint 1 | PR-01 | Foundation & Multi-Tenant Base | tenant-safe SaaS foundation |
| Sprint 2 | PR-02 | Lead CRM Core | usable lead management |
| Sprint 3 | PR-03 | Messaging & Template Foundation | traceable outbound messaging |
| Sprint 4 | PR-04 | Automation Engine v1 | execution backbone |
| Sprint 5 | PR-05 | MVP Automation Pack | 8 sellable preset flows |
| Sprint 6 | PR-07 | Customer & Repeat Revenue Layer | repeat revenue foundation |
| Sprint 7 | PR-06 | AI Marketing Suggestion v1 | AI advisory layer |
| Sprint 8 | PR-08 | Analytics & Audit v1 | measurement + traceability |

---

## 7. Sprint-by-Sprint Master Plan

# Sprint 1 — Foundation & Multi-Tenant Base

## Objective
วางฐาน SaaS แบบหลายคลินิกที่ปลอดภัยและพร้อมรองรับทุก domain ถัดไป

## Key Deliverables
- auth/login baseline
- clinics, users, clinic_users
- role baseline
- current clinic resolution
- tenant-aware request context
- tenant isolation tests

## Core Tickets Summary
- define canonical auth/tenant domain model
- create migrations for clinics/users/clinic_users
- add seed data for local dev
- implement password-based authentication baseline
- implement auth middleware and request identity context
- implement current clinic resolution strategy
- build clinic membership lookup service
- implement RBAC baseline guards
- create tenant-aware repository/service pattern
- add tenant isolation tests
- login UI and clinic state bootstrap
- env/config baseline
- basic audit hooks for auth/membership

## Exit Criteria
- login ได้
- current clinic context ใช้งานได้
- role/membership ใช้งานได้
- cross-tenant access ถูก reject

## Risks
- tenant leakage
- role model บวมเกิน
- auth/session strategy ไม่ชัด

## Gate to Next Sprint
ห้ามเริ่ม Sprint 2 ถ้า clinic context และ tenant safety ยังไม่นิ่ง

---

# Sprint 2 — Lead CRM Core

## Objective
ทำให้ทีมคลินิกเก็บและติดตาม lead ได้จริง และเป็นฐานของ messaging/automation

## Key Deliverables
- leads, lead_interests, notes, tags, entity_tags
- lead create/update/list/detail
- stage/status transitions
- owner assignment
- follow-up fields
- lead list/detail UI

## Core Tickets Summary
- freeze canonical lead lifecycle model
- create migrations for leads and supporting tables
- add sample lead seed data
- implement lead repository/service layer
- implement validation schemas
- implement CRUD/list/detail APIs
- implement lead list query model
- implement detail aggregation service
- implement owner assignment
- implement stage/status transitions
- implement notes/tags/interests modules
- add lead activity event hooks
- build lead list/create/edit/detail screens
- add tenant safety and integration tests
- query/index review
- basic audit/log hooks

## Exit Criteria
- สร้าง lead ได้
- แก้ lead ได้
- ดู list/detail ได้
- assign owner ได้
- เปลี่ยน stage/status ได้
- note/tag/interest ใช้งานได้

## Risks
- lead model ใหญ่เกิน
- stage/status สับสน
- duplicate leads ยังไม่มี strategy ที่ดีพอ

## Gate to Next Sprint
ห้ามเริ่ม Sprint 3 ถ้า lead detail ยังไม่ usable สำหรับทีมขาย

---

# Sprint 3 — Messaging & Template Foundation

## Objective
ทำให้ FlowBiz ส่งข้อความออกได้จริง, trace ได้, และพร้อมให้ automation เรียกใช้

## Key Deliverables
- channels
- contact_identities
- message_templates
- outbound_messages
- 1 primary provider integration
- template rendering v1
- manual send from lead context
- outbound history UI

## Core Tickets Summary
- freeze canonical messaging domain model
- create migrations for channels/contact_identities/templates/outbound_messages
- add sample channel/template/history seed data
- implement channel, identity, template services
- implement template rendering engine v1
- implement provider adapter abstraction + primary provider
- implement manual send service and APIs
- implement outbound status and logging flow
- implement channel config endpoints
- implement template CRUD endpoints
- implement identity APIs and lead hooks
- implement outbound history query service
- add messaging activity event hooks
- build template screens and manual send UI from lead detail
- add provider mock/sandbox strategy
- add integration tests for send flow and tenant safety
- query/index review
- basic audit/log hooks

## Exit Criteria
- clinic ตั้งค่า channel ได้
- สร้าง template ได้
- ส่งข้อความจาก lead context ได้
- message logs ใช้งานได้
- failure path trace ได้

## Risks
- recipient mapping ผิดคน
- template variables ไม่ครบแล้ว render พัง
- provider integration ไม่เสถียร

## Gate to Next Sprint
ห้ามเริ่ม Sprint 4 ถ้า send_message path ยังไม่เสถียรและ outbound logs ยังไม่เชื่อถือได้

---

# Sprint 4 — Automation Engine v1

## Objective
สร้าง execution backbone สำหรับ automation ทั้งระบบ

## Key Deliverables
- automation_flows
- automation_steps
- automation_executions
- automation_tasks
- reminders
- internal event dispatcher
- worker runtime
- step runner contract
- wait/send_message/create_task/create_reminder handlers
- execution history UI

## Core Tickets Summary
- freeze canonical automation domain model
- create migrations for flows/steps/executions/tasks/reminders
- add sample flow seeds
- implement internal event contract and dispatcher
- implement flow/step/execution services
- implement trigger evaluation service
- implement execution creation and deduplication strategy
- implement worker foundation
- implement step runner contract
- implement step handlers: wait, send_message, create_task, create_reminder, add/remove_tag, change_stage, notify_user
- implement execution orchestration service
- implement failure handling and retry baseline
- implement idempotency and locking baseline
- implement flow list/detail/status APIs
- implement execution history query service
- build flow list/detail and execution history UI
- build minimal task/reminder views
- add activity event hooks
- add runtime integration tests
- add deterministic worker test harness
- query/index review
- basic audit/log hooks

## Exit Criteria
- event trigger สร้าง execution ได้
- flow รันตาม step ลำดับได้
- wait/resume ได้
- send_message/create_task/create_reminder ทำงานได้
- execution history ใช้งานได้

## Risks
- duplicate execution
- side effects ยิงซ้ำ
- worker race conditions
- state machine ไม่ deterministic

## Gate to Next Sprint
ห้ามเริ่ม Sprint 5 ถ้า idempotency และ execution traceability ยังไม่พอ debug ได้

---

# Sprint 5 — MVP Automation Pack

## Objective
เปลี่ยน automation engine ให้กลายเป็น product ที่ clinic เข้าใจและพร้อมจ่าย

## MVP Preset Flows
1. New Lead Welcome
2. Uncontacted Lead Alert
3. Lead Qualification Nurture
4. Consult Reminder Flow
5. No-Show Recovery
6. Review Request
7. Botox Cycle Reminder
8. Daily Marketing Reminder

## Key Deliverables
- preset flow specifications
- config schema per flow
- preset seed generator
- activation/deactivation
- readiness/dependency checks
- clinic-specific config
- suppression/cooldown baseline
- setup guidance UI
- flow pack list/config UI
- daily marketing summary widget

## Core Tickets Summary
- freeze canonical preset flow specifications
- define preset configuration schema
- implement preset flow seed generator
- implement activation service and config service
- implement template dependency resolver
- implement suppression/cooldown policy
- implement runtime mapping for all 8 preset flows
- implement stop-condition and suppression rules
- implement clinic onboarding helper for preset pack
- implement readiness and dependency status service
- implement preset configuration APIs
- implement preset execution summary query service
- build flow pack list/activation/config/setup guidance UI
- build daily marketing summary widget
- improve task/reminder surfacing for preset outcomes
- add preset activity event hooks
- add integration tests for 8 preset flows
- add readiness edge-case tests
- query/index review
- basic audit/log hooks
- create guided demo scenario

## Exit Criteria
- flow ทั้ง 8 เปิดใช้ได้จริง
- clinic ปรับ config baseline ได้
- readiness state บอกได้ว่าพร้อมหรือยัง
- daily summary ใช้งานได้
- flow outputs มองเห็นและใช้งานได้

## Risks
- preset logic drift
- message fatigue
- config ซับซ้อนเกิน
- setup friction สูง

## Gate to Next Sprint
จบ Sprint 5 ต้องเดโมขายได้แล้วในเส้นทาง lead → follow-up → reminder → repeat prompt

---

# Sprint 6 — Customer & Repeat Revenue Layer

## Objective
ทำให้ FlowBiz รองรับรายได้จากลูกค้าเก่าและ repeat revenue use cases

## Key Deliverables
- customers
- customer_treatments
- lead → customer conversion
- treatment history UI
- cycle calculation
- inactive/reactivation selectors
- cycle-due views
- repeat revenue summary baseline

## Core Tickets Summary
- freeze canonical customer and treatment domain model
- create migrations for customers and customer_treatments
- add sample customer/treatment seed data
- implement customer repository/service layer
- implement validation schemas
- implement lead-to-customer conversion service and APIs
- implement treatment repository/service and CRUD APIs
- implement treatment cycle calculation helper
- implement customer status and recency updater
- implement reactivation candidate selector
- implement cycle-due selector
- implement customer list/detail APIs and query model
- implement customer detail aggregation service
- build customer list/detail UI
- build conversion UI flow from lead
- build treatment history widgets
- build due/inactive customer views
- add customer/treatment activity event hooks
- implement treatment presets and default cycle rules
- add customer response contracts
- add integration tests for conversion and treatment lifecycle
- query/index review
- basic audit/log hooks
- create repeat revenue demo scenario

## Exit Criteria
- convert lead → customer ได้
- treatment history ใช้งานได้
- cycle due customers หาได้
- inactive/reactivation customers หาได้
- Botox cycle reminder ใช้ data จริงได้

## Risks
- drift ไปเป็น EMR
- treatment model หนักเกิน
- cycle logic ไม่ชัด
- conversion ทำข้อมูล lead หาย

## Gate to Next Sprint
ห้ามเริ่ม Sprint 7 ถ้า customer/treatment data ยังไม่พอเป็น AI context ที่เชื่อถือได้

---

# Sprint 7 — AI Marketing Suggestion v1

## Objective
ทำให้ FlowBiz มี AI advisory layer ที่ช่วยคิด, ร่าง, และสรุป โดยยังคุมความเสี่ยงได้

## Key Deliverables
- content_suggestions
- prompt registry and versioning
- primary LLM provider adapter
- context builder
- generation orchestration
- approval/rejection/regenerate workflow
- quota/cost guardrails
- suggestion conversion to template/promo draft
- suggestion list/detail UI
- daily AI summary widget

## Core Suggestion Types
- Monthly Promotion Suggestion
- Broadcast Copy Suggestion
- Follow-up Copy Suggestion
- Daily Marketing Summary

## Core Tickets Summary
- freeze canonical AI suggestion domain model
- create migration for content_suggestions
- add seed sample suggestions
- implement prompt registry and versioning baseline
- implement AI provider abstraction and primary adapter
- implement suggestion repository/service layer
- implement context builder
- implement generation orchestration service
- implement core suggestion types
- implement regenerate flow
- implement approval/rejection workflow
- implement usage quota and cost guardrails
- implement generation failure handling and retry baseline
- implement list/detail/generate/review APIs
- implement suggestion-to-template and suggestion-to-promotion draft conversion
- build suggestion list/detail UI
- build generation entry points in product UI
- build daily marketing summary AI widget
- add AI suggestion activity event hooks
- add integration tests for AI workflow
- add prompt/context regression fixtures
- query/index review
- basic audit/log hooks
- create guided demo scenario

## Exit Criteria
- generate suggestion ได้จริง
- review/approve/reject/regenerate ได้
- suggestion ใช้ต่อเป็น template/promotion draft ได้
- quota/cost guardrails ทำงานได้
- ไม่มี auto-send path

## Risks
- AI output generic เกิน
- cost พุ่ง
- approval workflow ไม่ชัด
- context quality ต่ำ

## Gate to Next Sprint
ห้ามเริ่ม Sprint 8 ถ้า AI actions ยัง trace ไม่ได้และ approval gate ยังไม่ enforce ชัด

---

# Sprint 8 — Analytics & Audit v1

## Objective
ปิด MVP ให้ owner/manager วัดผลและตรวจย้อนหลังได้จริง

## Key Deliverables
- activity_events
- audit_logs
- canonical metrics services
- actionable query services
- analytics summary APIs
- actionable widget APIs
- audit APIs
- analytics dashboard UI
- actionable widgets UI
- audit trail UI
- entity-level trace panels
- metric regression fixtures

## KPI Domains
- Lead/Funnel
- Messaging
- Automation
- Customer/Repeat Revenue
- AI Suggestion

## Core Tickets Summary
- freeze canonical metrics and audit domain model
- create migrations for activity_events and audit_logs
- add seed analytics/audit data
- implement activity event repository/service
- implement audit log repository/service
- implement canonical event helpers and audit helpers
- complete missing event hooks and audit hooks across domains
- implement KPI aggregation services for lead/messaging/automation/customer/AI
- implement actionable queries: overdue leads, due reminders/tasks, failures, cycle-due/inactive customers
- implement recent activity feed query service
- implement audit trail query service
- implement analytics summary APIs
- implement actionable widget APIs
- implement audit trail APIs
- build analytics dashboard UI
- build actionable widgets UI
- build audit trail UI
- build entity-level trace panels
- add integration tests and metric regression fixtures
- query/index review
- harden sensitive audit data display
- create guided demo scenario
- write MVP closeout note

## Exit Criteria
- KPI summary หลักแสดงได้
- actionable lists ใช้งานได้
- audit trail ใช้งานได้
- AI/automation/messaging/customer actions trace ได้
- dashboard ใช้งานได้จริงสำหรับ owner/manager

## Risks
- metrics drift
- dashboard ช้า
- noisy activity feed
- audit payload แสดงข้อมูลเกินจำเป็น

## MVP Close Gate
เมื่อจบ Sprint 8 ต้องสามารถเดโมทั้งระบบแบบ end-to-end ได้ และมี traceability พอสำหรับ pilot จริง

---

## 8. Dependencies and Gates

### Hard Dependency Chain
Sprint 1 → Sprint 2 → Sprint 3 → Sprint 4 → Sprint 5 → Sprint 6 → Sprint 7 → Sprint 8

### Critical Gates
- Sprint 1 must stabilize tenant safety before CRM
- Sprint 3 must stabilize messaging before automation
- Sprint 4 must stabilize execution runtime before preset flows
- Sprint 5 must stabilize preset usability before repeat revenue expansion
- Sprint 6 must stabilize customer/treatment data before AI contexting
- Sprint 7 must stabilize AI approval/traceability before analytics/audit finalization

---

## 9. Demo Milestones

### M1 — End of Sprint 3
- Lead CRM + Messaging usable

### M2 — End of Sprint 5
- First sellable automation demo

### M3 — End of Sprint 6
- Repeat revenue demo

### M4 — End of Sprint 8
- Full MVP demo with AI + Analytics + Audit

---

## 10. Recommended Team Split

### Backend Engineer
รับผิดชอบ domain services, schema, APIs, workers, event/audit hooks, integrations, tests

### Frontend Engineer
รับผิดชอบ dashboard, CRM screens, messaging screens, flow pack UI, AI UI, analytics/audit UI

### Tech Lead / Fullstack
รับผิดชอบ domain model freeze, contracts, architecture reviews, risk control, schema freeze notes, demo readiness

---

## 11. Quality Gates Per Sprint

ทุก sprint ต้องผ่าน 4 ชั้นนี้ก่อน move ต่อ

### Functional QA
ฟีเจอร์ตรงตาม acceptance criteria

### Tenant QA
ไม่มี cross-clinic leakage

### Traceability QA
actions สำคัญ trace ได้

### Regression QA
ของ sprint ก่อนหน้ายังไม่พัง

---

## 12. Global Guardrails

### ห้ามทำระหว่าง roadmap นี้
- microservices migration
- visual flow builder
- custom workflow DSL ขนาดใหญ่
- omnichannel orchestration เต็มรูปแบบ
- EMR / billing / inventory / surgery operations
- AI auto-send campaign
- BI platform เต็มตัว
- compliance portal เต็มชุด

### ทำได้เฉพาะเมื่อจำเป็นจริง
- indexes สำหรับ performance
- minimal helper abstractions ที่ลด tenant risk
- audit hooks ที่เพิ่มความ traceable
- seed/demo fixtures สำหรับขายและทดสอบ

---

## 13. Release Readiness Checklist

MVP ถือว่าพร้อม pilot เมื่อครบทั้งหมดนี้

- multi-tenant foundation เสถียร
- lead CRM ใช้งานได้จริง
- messaging traceable
- automation engine เชื่อถือได้
- 8 preset flows ใช้งานได้จริง
- customer conversion และ repeat revenue layer ใช้งานได้
- AI suggestion มี approval gate และ traceability
- analytics dashboard และ audit trail ใช้งานได้จริง
- demo scenario end-to-end พร้อม
- known limitations ถูกบันทึกชัด

---

## 14. Post-MVP Backlog (Out of Scope for Now)

รายการต่อไปนี้ควรอยู่หลัง MVP เท่านั้น

- custom flow builder
- advanced segmentation engine
- campaign orchestration แบบเต็ม
- omnichannel messaging
- AI personalization engine ขั้นสูง
- attribution / forecasting / advanced analytics
- enterprise-grade compliance evidence tooling
- branch hierarchy / multi-location operations depth

---

## 15. Final Delivery Statement

FlowBiz roadmap นี้ตั้งใจพา product จาก

- **foundation**
ไปสู่
- **usable CRM**
ไปสู่
- **automation ที่ขายได้**
ไปสู่
- **repeat revenue engine**
ไปสู่
- **AI advisory + analytics + audit**

โดยไม่ข้ามขั้น และไม่สร้าง platform ที่ใหญ่เกินสิ่งที่ตลาดยอมจ่ายในช่วงแรก

เป้าหมายสุดท้ายของแผนนี้คือ:

> ทำให้ FlowBiz Beauty Marketing SaaS เป็น MVP ที่ใช้งานจริง ขายได้จริง และตรวจสอบย้อนหลังได้จริง

