

# Sprint 8 — PR-08 Analytics & Audit v1

## Sprint Goal

ส่งมอบ **Analytics & Audit v1** ที่รองรับ:

* KPI หลักของ lead / messaging / automation / repeat revenue
* actionable lists ที่ทีมใช้งานได้จริง
* recent activity / operational visibility
* audit logs สำหรับ action สำคัญ
* traceability สำหรับ AI approvals, flow toggles, message send, lead/customer changes
* ทุกอย่าง tenant-safe และพร้อมต่อยอดในอนาคต

---

# Epic: Analytics & Audit v1

---

## T1 — Freeze canonical metrics and audit domain model

### Objective

ล็อกนิยาม metric และ audit model กลางก่อนทำ schema, queries, dashboard และ hooks

### Scope

กำหนดและล็อก:

* canonical KPI definitions
* event naming baseline
* audit action taxonomy
* actor model
* entity model
* summary vs raw event separation
* actionable lists ที่ product ต้องมีใน v1

### Deliverables

* short design note 1 ฉบับ
* canonical metrics list
* canonical audit action list
* event naming convention ที่ final สำหรับ MVP
* dashboard sections ที่ final

### Suggested KPI set v1

#### Lead / Funnel

* new leads
* leads by stage
* overdue follow-ups
* consult booked
* no-show count

#### Messaging

* outbound sent
* outbound failed
* outbound by type

#### Automation

* executions started
* executions completed
* executions failed
* tasks created
* reminders due / overdue

#### Customer / Repeat

* lead converted to customer
* cycle-due customers
* inactive customers
* reactivation candidates

#### AI

* suggestions generated
* suggestions approved
* suggestions rejected

### Suggested audit action set v1

* lead.create
* lead.update
* lead.change_stage
* lead.assign_owner
* message.send
* template.create
* template.update
* flow.enable
* flow.disable
* preset.config.update
* customer.convert
* treatment.create
* treatment.update
* suggestion.generate
* suggestion.approve
* suggestion.reject

### Acceptance Criteria

* ทีมใช้ metric definitions ชุดเดียวกัน
* event names ไม่ชนมั่วระหว่าง domains
* audit actions ชัดพอให้ implement hooks ได้
* ระบุชัดว่าอะไรคือ summary KPI และอะไรคือ raw feed

---

## T2 — Create database migration for `activity_events`

### Objective

สร้างตาราง raw operational events สำหรับ analytics และ activity feed

### Scope

สร้าง migration สำหรับ `activity_events`

### Suggested fields

* id
* clinic_id
* entity_type
* entity_id
* event_type
* event_data_json
* occurred_at
* created_at

### Acceptance Criteria

* migration รันได้
* rollback ได้
* clinic ownership ชัด
* indexes ขั้นต่ำพร้อม

### Suggested indexes

* `(clinic_id, event_type, occurred_at)`
* `(clinic_id, entity_type, entity_id)`
* `(clinic_id, occurred_at)`

---

## T3 — Create database migration for `audit_logs`

### Objective

สร้างตาราง audit trail สำหรับ action สำคัญ

### Scope

สร้าง migration สำหรับ `audit_logs`

### Suggested fields

* id
* clinic_id
* actor_type
* actor_id
* action
* entity_type
* entity_id
* before_json
* after_json
* ip_address
* created_at

### Suggested actor_type

* user
* system
* automation
* ai

### Acceptance Criteria

* migration รันได้
* rollback ได้
* clinic ownership ชัด
* before/after structure รองรับ update actions
* indexes ขั้นต่ำพร้อม

### Suggested indexes

* `(clinic_id, action, created_at)`
* `(clinic_id, entity_type, entity_id, created_at)`
* `(clinic_id, actor_type, actor_id, created_at)`

---

## T4 — Add seed data for sample activity events and audit logs

### Objective

ทำให้ทีม dev/test/UI มีข้อมูล analytics/audit ใช้งานทันที

### Scope

เพิ่ม seed สำหรับ:

* lead events
* messaging events
* automation events
* customer/treatment events
* suggestion events
* audit entries หลาย action types

### Acceptance Criteria

* seed แล้ว dashboard/audit screens มีข้อมูลลองใช้
* filters and widgets ทดสอบได้
* demo analytics/audit ได้โดยไม่ต้องรอระบบ generate เองทั้งหมด

---

## T5 — Implement activity event repository/service layer

### Objective

สร้าง service กลางสำหรับบันทึกและ query raw events

### Scope

* create event
* batch create if needed
* list events by clinic
* list by entity
* list by event type/date range
* support operational feed queries

### Acceptance Criteria

* activity events ถูกบันทึกได้
* query หลักใช้งานได้
* tenant-safe ทุก path
* response path พร้อมต่อ dashboard/feed

---

## T6 — Implement audit log repository/service layer

### Objective

สร้าง service กลางสำหรับบันทึกและ query audit trail

### Scope

* create audit entry
* list audit logs
* filter by action
* filter by entity
* filter by actor
* filter by date range
* get audit history for entity

### Acceptance Criteria

* audit entries ถูกบันทึกได้
* filter/query ใช้งานได้
* tenant-safe ทุก path
* before/after data เข้าถึงได้ตาม policy

---

## T7 — Implement canonical event creation helpers across domains

### Objective

ทำ helper กลางให้ทุก domain ยิง event ได้มาตรฐานเดียว

### Scope

* helper for CRM events
* helper for messaging events
* helper for automation events
* helper for customer/treatment events
* helper for AI suggestion events
* event payload normalization

### Acceptance Criteria

* domains ต่าง ๆ ใช้ helper เดียวกันได้
* event shape สม่ำเสมอ
* clinic/entity identity ชัด
* ลด custom event payload มั่ว

---

## T8 — Implement canonical audit logging helpers across domains

### Objective

ทำ helper กลางให้ทุก domain บันทึก audit ได้มาตรฐานเดียว

### Scope

* helper for create/update actions
* helper for status/transition actions
* helper for send/approve/enable actions
* actor extraction baseline
* before/after shaping policy

### Acceptance Criteria

* domains ต่าง ๆ ใช้ helper เดียวกันได้
* before/after policy ชัด
* actor metadata ถูกต้อง
* action naming คงที่

---

## T9 — Implement missing event hooks completion pass

### Objective

เติม event hooks จาก sprint ก่อนหน้าให้ครบตาม canonical model

### Scope

review และเติม hooks จาก:

* lead CRM
* messaging
* automation engine
* preset flow pack
* customer/repeat revenue
* AI suggestion

### Acceptance Criteria

* KPI ที่ตกลงใน T1 มี event source รองรับ
* event coverage ครบพอสำหรับ dashboard v1
* ไม่มี domain สำคัญตกหล่น

---

## T10 — Implement missing audit hooks completion pass

### Objective

เติม audit hooks จาก sprint ก่อนหน้าให้ครบตาม canonical action list

### Scope

review และเติม audit hooks จาก:

* lead actions
* owner/stage/status changes
* template/channel changes
* message send
* flow enable/disable
* preset config update
* conversion/treatment updates
* suggestion approval/rejection/generation

### Acceptance Criteria

* audit action list จาก T1 ถูกครอบคลุมพอใช้
* action สำคัญ trace ได้
* actor/action/entity linkage ครบ

---

## T11 — Implement metrics aggregation service for lead/funnel KPIs

### Objective

สร้าง query/service สำหรับ KPI กลุ่ม lead/funnel

### Scope

อย่างน้อยรองรับ:

* new leads count
* leads by stage
* overdue follow-ups count
* consult booked count
* no-show count

### Acceptance Criteria

* KPI นิยามตรงตาม canonical model
* query ใช้งานได้ตาม clinic/date range
* results น่าเชื่อถือระดับ MVP
* performance พอใช้ได้

---

## T12 — Implement metrics aggregation service for messaging KPIs

### Objective

สร้าง query/service สำหรับ KPI กลุ่ม messaging

### Scope

อย่างน้อยรองรับ:

* outbound sent count
* outbound failed count
* outbound by message type
* recent failed sends list

### Acceptance Criteria

* messaging KPIs ดึงได้จริง
* failed sends list actionable
* clinic/date filtering ทำงานได้
* query path ไม่ซับซ้อนเกิน

---

## T13 — Implement metrics aggregation service for automation KPIs

### Objective

สร้าง query/service สำหรับ KPI กลุ่ม automation

### Scope

อย่างน้อยรองรับ:

* executions started
* executions completed
* executions failed
* tasks created
* reminders due / overdue
* recent failed executions

### Acceptance Criteria

* automation KPIs ดึงได้จริง
* failed execution list actionable
* due reminder/task counts ใช้งานได้
* clinic/date filtering ทำงานได้

---

## T14 — Implement metrics aggregation service for customer/repeat KPIs

### Objective

สร้าง query/service สำหรับ KPI กลุ่ม repeat revenue

### Scope

อย่างน้อยรองรับ:

* customers converted
* cycle-due customers count
* inactive customers count
* high-value inactive customers count
* reactivation candidate count

### Acceptance Criteria

* repeat KPIs ดึงได้จริง
* numbers ตรงกับ selector logic เดิม
* clinic/date filtering ใช้งานได้ตามเหมาะสม
* usable ใน dashboard จริง

---

## T15 — Implement metrics aggregation service for AI suggestion KPIs

### Objective

สร้าง query/service สำหรับ KPI กลุ่ม AI usage/outcomes

### Scope

อย่างน้อยรองรับ:

* suggestions generated
* approved
* rejected
* by suggestion type
* recent approval activity

### Acceptance Criteria

* AI KPIs ดึงได้จริง
* approval metrics น่าเชื่อถือ
* clinic/date filtering ใช้งานได้
* owner/manager เห็น adoption ได้

---

## T16 — Implement actionable list query: overdue lead follow-ups

### Objective

ทำ list ที่ทีมใช้ลงมือทำได้จริง ไม่ใช่แค่ดูตัวเลข

### Scope

* list overdue leads
* include owner/stage/next_followup_at
* include priority indicators baseline
* click-through references to lead detail

### Acceptance Criteria

* list actionable
* data ตรงกับ lead CRM
* ใช้งานได้จาก dashboard/widget
* query performance พอใช้

---

## T17 — Implement actionable list query: due and overdue reminders/tasks

### Objective

ให้ทีมเห็นงาน automation ที่ต้องจัดการ

### Scope

* list due reminders
* list overdue reminders
* list open tasks from automation
* include source flow/preset where available

### Acceptance Criteria

* due/overdue items แยกได้
* source/context ชัด
* actionable สำหรับ staff/manager
* query performance พอใช้

---

## T18 — Implement actionable list query: failed automation executions and messaging failures

### Objective

ทำ failure visibility เพื่อให้ทีมแก้ปัญหาได้เร็ว

### Scope

* recent failed executions
* recent failed outbound sends
* include minimal diagnostic info
* include entity/source references

### Acceptance Criteria

* failure lists ใช้งานได้จริง
* อ่านแล้วรู้ว่าควรดูอะไรต่อ
* ไม่ต้องเปิด raw logs ก่อนเสมอ
* query ใช้งานได้บน dashboard

---

## T19 — Implement actionable list query: cycle-due and inactive customers

### Objective

ให้ owner/marketing เห็น repeat revenue opportunities จาก dashboard

### Scope

* cycle-due customer list
* inactive/high-value inactive list
* include last visit / next recommended / value indicators baseline
* click-through to customer detail

### Acceptance Criteria

* repeat opportunity lists actionable
* ดึงจาก customer selectors เดียวกันกับ domain logic
* ใช้ใน dashboard/widget ได้จริง

---

## T20 — Implement recent activity feed query service

### Objective

ให้ระบบมี operational feed ที่ owner/manager อ่านภาพรวมได้

### Scope

* recent events feed
* filter by event types
* filter by entity types
* sort by occurred_at desc
* compact activity representation

### Acceptance Criteria

* feed ใช้งานได้
* noise ไม่เยอะเกิน
* event labels อ่านเข้าใจได้
* tenant-safe

---

## T21 — Implement audit trail query service with filters

### Objective

ให้ทีมตรวจย้อนหลังการเปลี่ยนแปลงสำคัญได้จริง

### Scope

รองรับ filter อย่างน้อย:

* action
* actor
* entity type
* entity id
* date range

รวม:

* entity audit history query
* recent audit list
* before/after shaping for UI

### Acceptance Criteria

* audit queries ใช้งานได้
* filter หลักทำงานได้
* before/after แสดงได้อย่างปลอดภัยพอ
* tenant-safe

---

## T22 — Implement analytics summary API endpoints

### Objective

เปิด API สำหรับ dashboard summary cards/widgets

### Scope

* summary endpoint รวม KPI หลัก
* optional section endpoints per domain
* date range handling baseline
* clinic-scoped response contracts

### Acceptance Criteria

* dashboard summary ดึงได้จาก endpoint เดียวหรือ path ที่ชัด
* response contracts คงที่
* clinic/date filters ใช้งานได้
* performance พอใช้ระดับ MVP

---

## T23 — Implement actionable widget APIs

### Objective

เปิด API สำหรับ lists ที่ทีมต้องใช้จริงทุกวัน

### Scope

* overdue leads endpoint
* due reminders/tasks endpoint
* failed actions endpoint
* cycle-due/inactive customers endpoint
* recent activity endpoint

### Acceptance Criteria

* endpoints ใช้งานได้
* filters พื้นฐานทำงานได้
* response contracts เหมาะกับ UI
* tenant-safe

---

## T24 — Implement audit trail APIs

### Objective

เปิด API สำหรับ audit pages / entity trace views

### Scope

* list audit logs endpoint
* filtered audit endpoint
* entity audit history endpoint
* recent audit activity endpoint

### Acceptance Criteria

* audit APIs ใช้งานได้
* filter หลักทำงานได้
* tenant-safe
* response shape ชัด

---

## T25 — Implement analytics dashboard UI

### Objective

ทำ dashboard ที่ owner/manager ใช้งานได้จริง ไม่ใช่แค่โชว์ตัวเลข

### Scope

แสดงอย่างน้อย:

* KPI summary cards
* lead/funnel snapshot
* automation snapshot
* repeat revenue snapshot
* AI usage snapshot
* links ไป actionable sections

### Acceptance Criteria

* dashboard อ่านง่าย
* KPI สำคัญเห็นได้ทันที
* ไม่ยัดตัวเลขเยอะเกิน
* ใช้งานใน demo และใช้งานจริงได้

---

## T26 — Implement actionable widgets UI

### Objective

ทำให้ dashboard มี “สิ่งที่ต้องทำ” ไม่ใช่แค่ “สิ่งที่เกิดขึ้น”

### Scope

* overdue follow-up widget
* due reminders/tasks widget
* failed actions widget
* cycle-due/inactive customers widget
* recent activity widget

### Acceptance Criteria

* widgets actionable จริง
* click-through ไปหน้าเกี่ยวข้องได้
* owner/manager/staff ใช้งานต่อได้จริง
* UX ไม่รก

---

## T27 — Implement audit trail UI

### Objective

ให้ทีมตรวจย้อนหลัง action สำคัญได้โดยไม่ต้องเปิด DB/logs

### Scope

* audit list page/section
* filters
* actor/action/entity/date columns
* detail expansion for before/after
* entity trace jump links if applicable

### Acceptance Criteria

* audit UI ใช้งานได้จริง
* filter ใช้งานได้
* before/after อ่านเข้าใจได้
* ไม่ overload ผู้ใช้ด้วย technical detail เกินจำเป็น

---

## T28 — Implement entity-level trace panels baseline

### Objective

ทำให้ในหน้า lead/customer/flow/suggestion สามารถดู trace ย้อนหลังเฉพาะ entity นั้นได้

### Scope

อย่างน้อยรองรับ:

* lead trace panel
* customer trace panel
* suggestion trace panel
* flow/preset trace reference where feasible

### Acceptance Criteria

* เปิดดู audit/activity เฉพาะ entity ได้
* context สำหรับ debugging หรือ review ชัด
* ใช้ต่อจาก detail screens ได้

---

## T29 — Implement standardized analytics and audit API response contracts

### Objective

ให้ frontend/backend ใช้ shape เดียวกันใน analytics/audit domain

### Scope

กำหนด response shape สำหรับ:

* KPI summary cards
* actionable list items
* activity feed items
* audit list items
* audit detail items
* date range/filter metadata

### Acceptance Criteria

* contracts ใช้จริงใน endpoints หลัก
* naming สม่ำเสมอ
* frontend mapping ไม่ต้องเดาหลายแบบ

---

## T30 — Add analytics and audit integration tests

### Objective

พิสูจน์ว่า metrics และ audit ทำงานจริงและน่าเชื่อถือพอ

### Scope

ทดสอบอย่างน้อย:

* KPI counts for leads/messaging/automation/customer/AI
* actionable lists reflect actual domain data
* failed executions/messages appear in failure widgets
* audit logs created for critical actions
* actor/action/entity linkage preserved
* cross-clinic analytics/audit isolation enforced

### Acceptance Criteria

* critical metrics paths ครอบคลุม
* audit paths ครอบคลุม
* tenant isolation ครอบคลุม
* regressions สำคัญถูกกันได้

---

## T31 — Add metric regression fixtures and canonical query checks

### Objective

กัน metric drift เมื่อทีมแก้ logic ในอนาคต

### Scope

* fixed fixture datasets
* expected KPI outputs
* expected actionable list counts
* query validation for canonical date ranges and states

### Acceptance Criteria

* canonical metrics ถูกล็อกด้วย fixtures
* การเปลี่ยน logic ทำให้เห็นผลกระทบได้
* fixtures ใช้งานได้ใน CI/local อย่างน้อยบางส่วน

---

## T32 — Add query/index review for dashboard, activity, and audit paths

### Objective

กัน dashboard และ audit ช้าเกินจน unusable

### Scope

* review KPI aggregation queries
* review actionable list queries
* review activity feed queries
* review audit filter queries
* tune indexes/materialization strategy baseline เท่าที่จำเป็น

### Acceptance Criteria

* dashboard initial load พอใช้ได้
* audit filters พอใช้ได้
* widgets หลักไม่ช้าผิดปกติ
* indexes สำคัญถูกสร้างแล้ว

---

## T33 — Add basic hardening for sensitive audit data display

### Objective

กัน UI แสดงข้อมูล before/after แบบเกินจำเป็นหรือเสี่ยงเกินไป

### Scope

* masking policy baseline for sensitive fields where needed
* safe rendering for before/after JSON
* truncate noisy payloads
* actor visibility rules baseline

### Acceptance Criteria

* audit UI ไม่เปิดข้อมูลเกินความจำเป็น
* before/after อ่านได้แบบปลอดภัยพอ
* noisy payload ไม่ทำให้ UI unusable

---

## T34 — Create demo data and guided demo scenario for analytics and audit

### Objective

ทำให้ Sprint 8 เดโม “ระบบวัดผลได้จริง” ได้ทันที

### Scope

สร้าง demo fixtures/scenarios สำหรับ:

* lead enters and moves stages
* messages sent / failed
* automation succeeds / fails
* customer becomes due/inactive
* AI suggestion approved
* audit trail for key actions visible

### Acceptance Criteria

* demo path รันได้บน staging/dev
* owner/manager เห็นคุณค่า analytics/audit ชัด
* scenario เชื่อมทั้งระบบจาก Sprint 1–7 ได้

---

## T35 — Sprint 8 analytics/audit review & MVP closeout note

### Objective

สรุปสิ่งที่ build แล้วและปิด MVP roadmap อย่างมีวินัย

### Scope

สรุป:

* final metric definitions
* final audit action coverage
* dashboard scope จริงที่ ship
* known limitations
* performance notes
* next-step backlog หลัง MVP
* rollout / demo readiness notes

### Acceptance Criteria

* มี closeout note สั้น ใช้งานจริง
* ทีมรู้ว่าของไหน ship-ready
* MVP roadmap ปิดแบบ auditably และไม่ค้างความกำกวม

---

# Dependencies ระหว่าง Ticket

## กลุ่มต้นน้ำ

* **T1** มาก่อน T2, T3, T7, T8, T11–T15, T21, T29, T30, T31
* **T2 + T3** มาก่อน T4, T5, T6, T20, T21, T24, T30, T32
* **T7 + T8** มาก่อน T9, T10
* **T29** ควรทำก่อนหรือคู่ขนานกับ T22–T28

## กลุ่มกลาง

* **T9 + T10** มาก่อน T11–T15, T20, T21, T30
* **T11–T15** มาก่อน T22, T25, T30, T31
* **T16–T19** มาก่อน T23, T26
* **T20 + T21** มาก่อน T23, T24, T27, T28

## กลุ่มปลาย

* **T30, T31, T32, T33, T34, T35** เป็น hardening / closing tickets

---

# Suggested Execution Order

## Phase A — Model Lock

1. T1 Freeze canonical metrics and audit domain model

## Phase B — Data Foundation

2. T2 Migration for activity_events
3. T3 Migration for audit_logs
4. T4 Seed sample analytics/audit data

## Phase C — Event/Audit Core

5. T5 Activity event repository/service
6. T6 Audit log repository/service
7. T7 Canonical event creation helpers
8. T8 Canonical audit logging helpers
9. T9 Missing event hooks completion pass
10. T10 Missing audit hooks completion pass
11. T29 Standardized analytics/audit response contracts

## Phase D — Metrics & Query Layer

12. T11 Lead/funnel KPI aggregation
13. T12 Messaging KPI aggregation
14. T13 Automation KPI aggregation
15. T14 Customer/repeat KPI aggregation
16. T15 AI suggestion KPI aggregation
17. T16 Overdue lead follow-ups list
18. T17 Due reminders/tasks list
19. T18 Failed actions list
20. T19 Cycle-due/inactive customers list
21. T20 Recent activity feed
22. T21 Audit trail query service

## Phase E — API Layer

23. T22 Analytics summary APIs
24. T23 Actionable widget APIs
25. T24 Audit trail APIs

## Phase F — Frontend Productization

26. T25 Analytics dashboard UI
27. T26 Actionable widgets UI
28. T27 Audit trail UI
29. T28 Entity-level trace panels

## Phase G — Hardening / Demo / Closeout

30. T30 Analytics/audit integration tests
31. T31 Metric regression fixtures
32. T32 Query/index review
33. T33 Sensitive audit data display hardening
34. T34 Demo data and guided scenario
35. T35 MVP closeout note

---

# Suggested Ticket Sizing

## S (เล็ก)

* T1
* T4
* T7
* T8
* T29
* T33
* T35

## M (กลาง)

* T5
* T6
* T9
* T10
* T11
* T12
* T13
* T14
* T15
* T16
* T17
* T18
* T19
* T20
* T21
* T22
* T23
* T24
* T25
* T26
* T27
* T28
* T31
* T32
* T34

## L (ใหญ่)

* T2
* T3
* T30

---

# Sprint 8 Acceptance Criteria รวม

Sprint 8 ถือว่าเสร็จเมื่อครบทั้งหมดนี้

## Functional

* KPI summary หลักแสดงได้
* actionable lists หลักใช้งานได้
* recent activity feed ใช้งานได้
* audit trail ใช้งานได้
* entity-level trace baseline ใช้งานได้

## Product

* owner/manager เปิด dashboard แล้วรู้ทั้ง “สถานะ” และ “งานที่ต้องทำ”
* failures มองเห็นได้
* repeat revenue opportunities มองเห็นได้
* AI approvals และ automation actions trace ได้
* demo “ระบบวัดผลได้จริง” ทำได้ชัด

## Technical

* canonical metrics ถูกล็อก
* event/audit helpers ใช้งานได้ข้าม domains
* response contracts ชัด
* integration tests และ regression fixtures มีพอ
* performance baseline พอใช้ระดับ MVP

## Safety

* analytics/audit ข้าม clinic ไม่เห็นกัน
* sensitive audit payload ถูกแสดงอย่างระวัง
* actor/action/entity linkage ชัด
* metrics ไม่นับมั่วจาก event drift ง่ายเกินไป

## Handoff Readiness

* MVP พร้อม demo และใช้งานระดับ pilot
* ทีมมีหลักฐานวัดผลและตรวจย้อนหลังได้
* backlog หลัง MVP ถูกแยกชัด ไม่ปนกับ scope ที่ส่งแล้ว

---

# Suggested backlog labels

* `sprint-8`
* `pr-08`
* `analytics`
* `audit`
* `dashboard`
* `observability`
* `frontend`
* `backend`
* `tenant`
* `test`
* `hardening`

---

# Recommended owner split ถ้าทีมมี 3 คน

## Backend Engineer

* T2, T3, T5, T6, T7, T8, T9, T10, T11, T12, T13, T14, T15, T16, T17, T18, T19, T20, T21, T22, T23, T24, T30, T31, T32, T33

## Frontend Engineer

* T25, T26, T27, T28

## Tech Lead / Fullstack

* T1, T4, T29, T34, T35
* review canonical metrics
* review audit coverage and masking policy
* review dashboard clarity from business lens

---

# ตัวอย่างชื่อ ticket พร้อมใช้

* `[Sprint 8][PR-08] Freeze canonical metrics and audit domain model`
* `[Sprint 8][PR-08] Create migrations for activity events and audit logs`
* `[Sprint 8][PR-08] Implement canonical event and audit helpers across domains`
* `[Sprint 8][PR-08] Implement KPI aggregation services for lead messaging automation customer and AI domains`
* `[Sprint 8][PR-08] Implement actionable widget queries for overdue leads failed actions and cycle-due customers`
* `[Sprint 8][PR-08] Build analytics dashboard and audit trail screens`
* `[Sprint 8][PR-08] Add integration tests and metric regression fixtures`
* `[Sprint 8][PR-08] Create guided demo scenario for analytics and audit MVP`

---

# ข้อควรระวังของ Sprint 8

Sprint นี้เสี่ยงบวมไปเป็น BI platform หรือ compliance suite

## ห้ามเผลอเพิ่ม

* custom report builder
* advanced cohort analytics
* attribution platform
* anomaly detection
* forecasting engine
* enterprise evidence portal เต็มชุด
* immutable ledger system พิเศษ

## ต้องโฟกัสแค่

* KPI หลัก
* actionable lists
* recent activity
* audit trail
* traceability ที่ใช้งานจริง

---

# สรุปตรงที่สุด

Sprint 8 มีหน้าที่ปิด MVP ให้สมบูรณ์ในเชิง “ธุรกิจใช้งานจริง”
ไม่ใช่แค่ฟีเจอร์ครบ แต่ต้อง **พิสูจน์ได้** และ **ตรวจย้อนหลังได้**

และต้องจบด้วยสถานะนี้:

* owner เห็นตัวเลขสำคัญ
* manager เห็นงานที่ต้องทำ
* failures มองเห็นได้
* AI / automation / messaging / customer actions trace ได้
* MVP พร้อมเดโมและพร้อม pilot อย่างมีวินัย

