ได้ นี่คือการแตก **Sprint 2 — PR-02 Lead CRM Core** ลงมาเป็น **engineering ticket ระดับใช้งานจริง** ในระดับเดียวกับ Sprint 1

เป้าหมายของ Sprint 2 คือทำให้ FlowBiz มี **Lead CRM ที่ทีมคลินิกใช้ได้จริง** และเป็นฐานที่มั่นคงสำหรับ Sprint 3–5

---

# Sprint 2 — PR-02 Lead CRM Core

## Sprint Goal

ส่งมอบ **Lead CRM แกนหลัก** ที่รองรับ:

* สร้าง / แก้ไข lead
* ดู lead list / detail
* จัด stage / status
* assign owner
* ใส่ note / tag / interest
* filter เพื่องานขายจริง
* ทุกอย่าง tenant-safe และพร้อมต่อ messaging / automation

---

# Epic: Lead CRM Core

---

## T1 — Freeze canonical lead lifecycle model

### Objective

ล็อก model กลางของ lead ก่อนลง schema และ UI เพื่อไม่ให้ stage/status drift ระหว่างทีม

### Scope

กำหนดและล็อก:

* lead status
* lead stage
* owner semantics
* follow-up semantics
* source semantics
* budget / branch fields ที่จะมีใน MVP

### Deliverables

* short design note 1 ฉบับ
* enum กลางสำหรับ:

  * `lead.status`
  * `lead.stage`
  * `lead.source`
* rule เบื้องต้นสำหรับ stage/status transition

### Suggested enums

#### lead.status

* new
* active
* won
* lost
* archived

#### lead.stage

* inquiry
* qualified
* consult_booked
* consult_done
* booked
* no_show
* converted

### Acceptance Criteria

* ทีมใช้ enum ชุดเดียวกันทั้ง backend/frontend
* ระบุชัดว่า status กับ stage ต่างกันอย่างไร
* ระบุชัดว่า `owner_user_id` หมายถึงใคร
* ระบุชัดว่า `next_followup_at` ใช้เพื่ออะไร

---

## T2 — Create database migration for `leads`

### Objective

สร้างตาราง lead หลักของระบบ

### Scope

สร้าง migration สำหรับ `leads` พร้อม:

* PK/FK
* required/optional fields
* baseline indexes
* tenant ownership via `clinic_id`

### Suggested fields

* id
* clinic_id
* source
* source_ref
* full_name
* nickname
* phone
* line_user_id
* email
* gender
* birth_date
* status
* stage
* owner_user_id
* last_contacted_at
* next_followup_at
* intent_score
* budget_range
* preferred_branch
* notes_summary
* created_at
* updated_at

### Acceptance Criteria

* migration รันได้
* rollback ได้
* FK `clinic_id` และ `owner_user_id` ถูกต้อง
* indexes ขั้นต่ำพร้อมใช้

### Suggested indexes

* `(clinic_id, status)`
* `(clinic_id, stage)`
* `(clinic_id, owner_user_id)`
* `(clinic_id, next_followup_at)`
* `(clinic_id, created_at)`

---

## T3 — Create database migrations for `lead_interests`, `notes`, `tags`, `entity_tags`

### Objective

สร้าง schema สำหรับบริบทของ lead

### Scope

สร้าง migrations สำหรับ:

* `lead_interests`
* `notes`
* `tags`
* `entity_tags`

### Suggested fields

#### lead_interests

* id
* clinic_id
* lead_id
* interest_type
* interest_name
* priority
* budget_min
* budget_max
* urgency
* created_at
* updated_at

#### notes

* id
* clinic_id
* entity_type
* entity_id
* author_user_id
* note_type
* content
* created_at
* updated_at

#### tags

* id
* clinic_id
* name
* color
* created_at
* updated_at

#### entity_tags

* id
* clinic_id
* tag_id
* entity_type
* entity_id
* created_at

### Acceptance Criteria

* migrations รันได้
* FK/ownership ถูกต้อง
* note/tag/interest ทุกตัวผูก clinic ชัด
* tag duplication policy ถูกกำหนดชัด เช่น unique by `(clinic_id, name)`

---

## T4 — Add seed data for sample leads and tags

### Objective

ทำให้ทีม dev/test มีข้อมูลลองใช้จริง

### Scope

เพิ่ม seed data สำหรับ:

* 5–10 leads ตัวอย่าง
* หลาย stage/status
* 2–3 tags
* 2–3 notes
* 2–3 interests
* owners หลายคน

### Acceptance Criteria

* seed แล้วเปิด list/detail เห็นเคสที่หลากหลาย
* filters ทดลองได้จริง
* ใช้เดโมเบื้องต้นได้

---

## T5 — Implement lead repository/service layer

### Objective

สร้าง service กลางของ lead domain ที่ tenant-safe และพร้อมขยาย

### Scope

* create lead
* update lead
* get lead by id
* list leads
* assign owner
* update stage/status
* update follow-up fields
* basic search/filter/sort

### Acceptance Criteria

* service methods ทุกตัวรับ clinic context ชัด
* query ทุกตัว tenant-safe
* get/list/create/update ใช้งานได้
* not found / forbidden แยกชัด

### Important

ยังไม่ต้องทำ dedupe intelligence ขั้นสูงใน ticket นี้

---

## T6 — Implement lead validation schemas

### Objective

กันข้อมูล lead เสียตั้งแต่ชั้น API/service

### Scope

สร้าง validation สำหรับ:

* create lead
* update lead
* stage/status update
* owner assignment
* follow-up fields
* contact fields เช่น phone/email

### Acceptance Criteria

* invalid payload ถูก reject
* enum validation ใช้ canonical values เท่านั้น
* required fields ของ MVP ชัดเจน
* frontend ใช้ error contract เดียวกับ Sprint 1 ได้

---

## T7 — Implement create/update lead API endpoints

### Objective

เปิด path สำหรับสร้างและแก้ไข lead

### Scope

* create lead endpoint
* update lead endpoint
* get lead detail endpoint
* list leads endpoint

### Acceptance Criteria

* authenticated clinic member ใช้งานได้
* lead ถูกสร้างใน clinic ปัจจุบันเท่านั้น
* update ข้าม clinic ไม่ได้
* detail/list ตอบข้อมูลครบตาม contract

---

## T8 — Implement lead list query model

### Objective

ทำให้หน้า lead list ใช้งานได้จริงสำหรับทีมขาย

### Scope

รองรับ filter อย่างน้อย:

* status
* stage
* owner
* source
* created date range
* next_followup_at due/overdue
* search by name / phone / email

รองรับ sort ขั้นต่ำ:

* created_at
* updated_at
* next_followup_at

### Acceptance Criteria

* query performance พอใช้งานได้กับข้อมูลระดับ MVP
* filter หลักทำงานได้
* search ใช้งานได้
* pagination หรือ equivalent ถูกกำหนดชัด

---

## T9 — Implement lead detail aggregation service

### Objective

รวมข้อมูล lead หลัก + note/tag/interest สำหรับหน้า detail

### Scope

สร้าง service ที่ดึง:

* lead core data
* owner
* interests
* tags
* notes
* basic recent activity placeholder ถ้ามี

### Acceptance Criteria

* endpoint/detail service คืนข้อมูลครบพอให้หน้า detail ใช้งานได้
* ไม่มี query ข้าม clinic
* shape ของ response คงที่

---

## T10 — Implement owner assignment flow

### Objective

ให้ทีม assign เจ้าของ lead ได้อย่างปลอดภัย

### Scope

* assign owner API/service
* validate owner เป็น member ของ clinic เดียวกัน
* optional unassign path
* update audit/event baseline

### Acceptance Criteria

* assign owner ที่อยู่ clinic เดียวกันได้
* assign ข้าม clinic ไม่ได้
* owner เปลี่ยนแล้ว detail/list สะท้อนผล
* action นี้มี log/event พื้นฐาน

---

## T11 — Implement stage/status transition endpoints

### Objective

ให้ทีมขายอัปเดต pipeline ได้จริง

### Scope

* update stage endpoint
* update status endpoint
* transition validation baseline
* optional reason fields สำหรับ lost/no_show ถ้าต้องการเก็บแบบ lean

### Acceptance Criteria

* เปลี่ยน stage/status ได้
* invalid enum ถูก reject
* transition ที่ระบบไม่อนุญาตถูก reject ตาม policy ที่ตกลง
* action นี้มี event/log พื้นฐาน

### Note

รอบนี้ยังไม่ต้องทำ workflow engine
แค่ rule บางจุดที่ป้องกันความผิดพลาดชัดเจน

---

## T12 — Implement notes module for lead entities

### Objective

ให้ทีมบันทึกบริบทการคุยกับลูกค้าได้

### Scope

* create note
* list notes by entity
* edit note policy เบื้องต้น
* note types baseline

### Suggested note_type

* general
* followup
* consult
* handoff

### Acceptance Criteria

* เพิ่ม note ให้ lead ได้
* อ่าน note list ได้
* note ผูก author ได้
* note ข้าม clinic ไม่ได้

---

## T13 — Implement tags module for lead entities

### Objective

ให้ทีมจัดหมวด lead แบบยืดหยุ่น

### Scope

* create tag
* list tags
* attach tag to lead
* detach tag from lead
* prevent duplicate attachment

### Acceptance Criteria

* สร้าง tag ต่อ clinic ได้
* tag name policy ชัด
* attach/detach ได้
* lead detail แสดง tags ได้

---

## T14 — Implement lead interests module

### Objective

เก็บสิ่งที่ลูกค้าสนใจเพื่อรองรับ messaging/automation รอบถัดไป

### Scope

* create interest
* update interest
* remove interest
* list interests by lead

### Acceptance Criteria

* lead 1 คนมีหลาย interests ได้
* interest fields ใช้งานได้จริง
* detail page ใช้ข้อมูลนี้ได้
* ข้อมูลอยู่ clinic เดียวกันทั้งหมด

---

## T15 — Add lead activity event hooks baseline

### Objective

เริ่มวาง event model สำหรับ automation/analytics โดยยังไม่ต้องเต็มระบบ

### Scope

ยิง event ขั้นต่ำเมื่อเกิด action สำคัญ เช่น:

* lead.created
* lead.updated
* lead.owner_assigned
* lead.stage_changed
* lead.status_changed
* note.created
* tag.attached
* interest.created

### Acceptance Criteria

* action สำคัญมี event hook
* event payload ขั้นต่ำพอใช้ต่อใน Sprint 4/8
* tenant/entity identity ชัด

---

## T16 — Implement lead list UI

### Objective

สร้างหน้า lead list ที่ทีมขายใช้ได้จริง

### Scope

* table/list view
* filters
* search
* owner/stage/status badges
* pagination
* click-through to detail

### Acceptance Criteria

* list แสดงข้อมูลสำคัญพอใช้งาน
* filter/search ทำงานได้
* state ของ filter ไม่งง
* ใช้งานกับ sample data ได้จริง

---

## T17 — Implement lead create/edit UI

### Objective

ให้ทีมสร้างและแก้ไข lead ผ่าน UI ได้จริง

### Scope

* create form
* edit form
* validation display
* required/optional grouping
* save success/error handling

### Acceptance Criteria

* create lead ผ่าน UI ได้
* edit lead ผ่าน UI ได้
* field ที่ไม่ critical ไม่บังคับ
* UX ไม่ยาวจนใช้งานลำบาก

---

## T18 — Implement lead detail UI

### Objective

ให้ทีมเห็นข้อมูล lead ครบในที่เดียว

### Scope

แสดง:

* lead header
* contact info
* stage/status
* owner
* next follow-up
* tags
* interests
* notes

### Acceptance Criteria

* เปิด lead detail แล้วใช้งานได้จริง
* action หลักเข้าถึงได้ง่าย
* sections ไม่รก
* ข้อมูลสำคัญเห็นได้ชัด

---

## T19 — Implement owner/stage/status/follow-up controls on UI

### Objective

ทำให้หน้า detail เป็นหน้าทำงานจริง ไม่ใช่แค่ดูข้อมูล

### Scope

* change owner control
* change stage control
* change status control
* set/update next follow-up
* optional quick actions

### Acceptance Criteria

* action เหล่านี้ทำจาก UI ได้
* update แล้ว state refresh ถูกต้อง
* permission checks ถูก enforce
* error states handle ได้ดี

---

## T20 — Implement notes/tags/interests widgets on lead detail

### Objective

ให้ทีมจัดการบริบท lead จากหน้าเดียว

### Scope

* add note widget
* add/remove tag widget
* add/edit/remove interest widget

### Acceptance Criteria

* widgets ใช้งานได้ไม่สับสน
* optimistic or safe refresh strategy ชัด
* entity clinic consistency ไม่พัง

---

## T21 — Add API and integration tests for lead CRUD and tenant safety

### Objective

กัน regression และยืนยันว่า CRM core ไม่รั่วข้าม clinic

### Scope

ทดสอบอย่างน้อย:

* create lead in current clinic
* update lead in current clinic
* cannot read/update lead in other clinic
* cannot assign owner from other clinic
* cannot attach cross-clinic tag
* cannot create note/interest for foreign lead

### Acceptance Criteria

* tests ผ่าน
* critical tenant paths ถูกครอบคลุม
* CI/local รันได้

---

## T22 — Add query/index review for lead list performance

### Objective

กันหน้า list/detail ช้าเกินตั้งแต่แรก

### Scope

* review indexes
* review common filters
* inspect explain plan baseline ถ้าจำเป็น
* tune list query model ให้เหมาะกับ MVP

### Acceptance Criteria

* filters หลักไม่ช้าผิดปกติ
* indexes สำคัญถูกสร้างแล้ว
* query path ชัด ไม่ซับซ้อนเกิน

---

## T23 — Implement standardized lead API response contracts

### Objective

ให้ frontend/backend ใช้ shape เดียวกัน ลด drift

### Scope

กำหนด response shape สำหรับ:

* lead list item
* lead detail
* create/update response
* note/tag/interest payloads
* validation error shape reuse

### Acceptance Criteria

* contract ใช้จริงใน endpoints หลัก
* frontend mapping ไม่ต้องเดาหลายแบบ
* fields naming สม่ำเสมอ

---

## T24 — Add basic audit/log hooks for lead mutations

### Objective

วางนิสัย traceability สำหรับ action สำคัญใน CRM

### Scope

บันทึก log ขั้นต่ำสำหรับ:

* lead.create
* lead.update
* lead.assign_owner
* lead.change_stage
* lead.change_status
* note.create
* tag.attach/detach
* interest.create/update/delete

### Acceptance Criteria

* action สำคัญ trace ย้อนหลังได้ระดับหนึ่ง
* ไม่เก็บข้อมูลเกินจำเป็น
* พร้อมต่อยอดเข้า PR-08

---

## T25 — Sprint 2 CRM review & schema freeze note

### Objective

สรุปสิ่งที่ build แล้วและล็อก handoff ไป Sprint 3

### Scope

สรุป:

* final lead schema
* stage/status model ที่ใช้จริง
* response contracts
* known limitations
* messaging integration assumptions สำหรับ Sprint 3

### Acceptance Criteria

* มี handoff note สั้น ใช้งานจริง
* ทีมรู้ว่าของไหน lock แล้ว
* dependencies ไป messaging ชัด

---

# Dependencies ระหว่าง Ticket

## กลุ่มต้นน้ำ

* **T1** มาก่อน T2, T5, T6, T11
* **T2 + T3** มาก่อน T4, T5, T21, T22
* **T5 + T6** มาก่อน T7, T8, T9, T10, T11, T14
* **T23** ควรทำก่อนหรือคู่ขนานกับ T7/T9/T16/T18

## กลุ่มกลาง

* **T7 + T8 + T9** มาก่อน T16, T18
* **T10 + T11** มาก่อน T19
* **T12 + T13 + T14** มาก่อน T20
* **T15** ควรตามหลัง core services หลักเริ่มนิ่ง

## กลุ่มปลาย

* **T21, T22, T24, T25** เป็น hardening / closing tickets

---

# Suggested Execution Order

## Phase A — Model Lock

1. T1 Freeze canonical lead lifecycle model

## Phase B — Data Foundation

2. T2 Migration for leads
3. T3 Migrations for interests/notes/tags/entity_tags
4. T4 Seed sample leads and tags

## Phase C — Domain Core

5. T5 Lead repository/service
6. T6 Lead validation schemas
7. T23 Standardized response contracts

## Phase D — API Core

8. T7 Create/update/detail/list endpoints
9. T8 Lead list query model
10. T9 Lead detail aggregation service
11. T10 Owner assignment flow
12. T11 Stage/status transition endpoints
13. T12 Notes module
14. T13 Tags module
15. T14 Interests module
16. T15 Lead activity event hooks

## Phase E — Frontend

17. T16 Lead list UI
18. T17 Lead create/edit UI
19. T18 Lead detail UI
20. T19 Owner/stage/status/follow-up controls
21. T20 Notes/tags/interests widgets

## Phase F — Hardening

22. T21 API/integration tests
23. T22 Query/index review
24. T24 Basic audit/log hooks
25. T25 CRM review & schema freeze

---

# Suggested Ticket Sizing

## S (เล็ก)

* T1
* T4
* T15
* T22
* T23
* T25

## M (กลาง)

* T6
* T8
* T9
* T10
* T11
* T12
* T13
* T14
* T16
* T17
* T19
* T20
* T24

## L (ใหญ่)

* T2
* T3
* T5
* T7
* T18
* T21

---

# Sprint 2 Acceptance Criteria รวม

Sprint 2 ถือว่าเสร็จเมื่อครบทั้งหมดนี้

## Functional

* สร้าง lead ได้
* แก้ไข lead ได้
* ดู lead list / detail ได้
* filter/search ได้
* assign owner ได้
* เปลี่ยน stage/status ได้
* เพิ่ม note/tag/interest ได้

## Product

* หน้า lead list ใช้งานได้จริงกับทีม sale
* หน้า detail ใช้งานเป็น working screen ได้
* field/setups ไม่หนักเกินทีมคลินิกใช้งาน

## Technical

* lead domain tenant-safe
* response contracts ชัด
* indexes พื้นฐานพร้อม
* event hooks พื้นฐานพร้อมสำหรับ Sprint 4

## Safety

* ข้าม clinic อ่าน/แก้ไม่ได้
* assign owner ข้าม clinic ไม่ได้
* note/tag/interest ข้าม clinic ไม่ได้

## Handoff Readiness

* Sprint 3 เริ่ม messaging foundation ได้ทันทีจาก lead context
* lead detail พร้อมเป็นจุดเริ่ม manual send

---

# Suggested backlog labels

* `sprint-2`
* `pr-02`
* `crm`
* `lead`
* `frontend`
* `backend`
* `tenant`
* `validation`
* `test`
* `hardening`

---

# Recommended owner split ถ้าทีมมี 3 คน

## Backend Engineer

* T2, T3, T5, T6, T7, T8, T9, T10, T11, T12, T13, T14, T15, T21, T22, T24

## Frontend Engineer

* T16, T17, T18, T19, T20

## Tech Lead / Fullstack

* T1, T4, T23, T25
* review API contracts
* review query/index
* review tenant safety

---

# ตัวอย่างชื่อ ticket พร้อมใช้

* `[Sprint 2][PR-02] Freeze canonical lead lifecycle model`
* `[Sprint 2][PR-02] Create migration for leads table`
* `[Sprint 2][PR-02] Implement lead repository and service layer`
* `[Sprint 2][PR-02] Implement lead list query filters and sorting`
* `[Sprint 2][PR-02] Implement lead detail aggregation service`
* `[Sprint 2][PR-02] Implement notes tags and interests modules`
* `[Sprint 2][PR-02] Build lead list detail and edit screens`
* `[Sprint 2][PR-02] Add tenant safety tests for lead CRM`

---

# ข้อควรระวังของ Sprint 2

อย่าปล่อยให้ Sprint นี้บวมไปเป็น CRM เต็มระบบ

## ห้ามเผลอเพิ่ม

* inbox chat center
* customer conversion เต็มรูปแบบ
* segmentation engine
* custom pipeline builder
* automation logic
* dedupe engine ใหญ่
* analytics dashboard

## ต้องโฟกัสแค่

* lead usable
* lead traceable
* lead tenant-safe
* lead ready for messaging

---

# สรุปตรงที่สุด

Sprint 2 มีหน้าที่ทำให้ FlowBiz มี **Lead CRM ที่ใช้งานจริง**
และต้องจบด้วยสถานะนี้:

* ทีมคลินิกเปิดระบบแล้วทำงานกับ lead ได้
* ทีม dev ต่อ messaging ได้ทันที
* ทีม architecture ไม่ต้องย้อนมารื้อ schema lead