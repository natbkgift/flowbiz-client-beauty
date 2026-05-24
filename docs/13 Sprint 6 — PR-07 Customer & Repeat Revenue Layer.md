ได้ นี่คือการแตก **Sprint 6 — PR-07 Customer & Repeat Revenue Layer** ลงมาเป็น **engineering ticket ระดับใช้งานจริง** ในระดับเดียวกับ Sprint 1–5

Sprint นี้มีหน้าที่สำคัญมาก เพราะเป็นจุดที่ FlowBiz เริ่มสร้างมูลค่าแบบ **LTV / Repeat Revenue** ไม่ใช่แค่จัดการ lead ใหม่

เป้าหมายคือทำให้ระบบตอบคำถามนี้ได้จริง:

* ลูกค้าคนไหนควรกลับมาแล้ว
* ลูกค้าคนไหนควรถูก follow
* treatment ไหนมีรอบ
* ใครเป็น reactivation candidate
* flow แบบ Botox Cycle Reminder ใช้ data จริงได้

---

# Sprint 6 — PR-07 Customer & Repeat Revenue Layer

## Sprint Goal

ส่งมอบ **Customer & Repeat Revenue Layer** ที่รองรับ:

* convert lead → customer
* เก็บ customer profile ได้
* เก็บ treatment history เชิงการตลาดได้
* คำนวณรอบ follow-up / next recommended ได้
* หา cycle-due และ inactive customers ได้
* ป้อนข้อมูลให้ repeat revenue flows ใช้งานได้จริง

---

# Epic: Customer & Repeat Revenue Layer

---

## T1 — Freeze canonical customer and treatment domain model

### Objective

ล็อก model กลางของ customer/repeat layer ก่อนลง schema, UI, และ automation hooks

### Scope

กำหนดและล็อก:

* customer model
* lead → customer conversion semantics
* treatment history model
* customer status model
* LTV semantics
* `last_visit_at`
* `reactivation_score`
* `cycle_days`
* `next_recommended_at`
* inactive customer rule baseline

### Deliverables

* short design note 1 ฉบับ
* enum กลางสำหรับ:

  * `customer_status`
  * `customer_treatments.status`
  * `treatment_category`
* conversion rules
* cycle default rules baseline

### Suggested enums

#### customer_status

* active
* inactive
* vip
* churn_risk

#### customer_treatments.status

* planned
* completed
* cancelled

### Suggested treatment_category

* injectables
* laser
* skin
* surgery
* consultation
* other

### Acceptance Criteria

* ทีมเห็นตรงกันว่า customer ต่างจาก lead อย่างไร
* ระบุชัดว่า lead record หลัง convert จะยังอยู่แบบไหน
* ระบุชัดว่า treatment model เป็น marketing-oriented ไม่ใช่ EMR
* ระบุชัดว่า inactive/cycle due ตีความอย่างไรใน MVP

---

## T2 — Create database migration for `customers`

### Objective

สร้างตาราง customer profile หลักของระบบ

### Scope

สร้าง migration สำหรับ `customers`

### Suggested fields

* id
* clinic_id
* lead_id nullable
* full_name
* nickname
* phone
* line_user_id
* email
* customer_since
* lifetime_value
* last_visit_at
* reactivation_score
* customer_status
* created_at
* updated_at

### Acceptance Criteria

* migration รันได้
* rollback ได้
* customer ผูก clinic ชัด
* lead linkage รองรับได้
* indexes ขั้นต่ำพร้อม

### Suggested indexes

* `(clinic_id, customer_status)`
* `(clinic_id, last_visit_at)`
* `(clinic_id, reactivation_score)`
* `(clinic_id, created_at)`
* `(clinic_id, lead_id)`

---

## T3 — Create database migration for `customer_treatments`

### Objective

สร้างตาราง treatment history เชิงการตลาด

### Scope

สร้าง migration สำหรับ `customer_treatments`

### Suggested fields

* id
* clinic_id
* customer_id
* treatment_name
* treatment_category
* performed_at
* provider_name
* branch_name
* price
* cycle_days
* next_recommended_at
* status
* created_at
* updated_at

### Acceptance Criteria

* migration รันได้
* rollback ได้
* treatment ผูก customer และ clinic ถูกต้อง
* indexes ขั้นต่ำพร้อม

### Suggested indexes

* `(clinic_id, customer_id, performed_at)`
* `(clinic_id, next_recommended_at)`
* `(clinic_id, treatment_category, next_recommended_at)`
* `(clinic_id, status)`

---

## T4 — Add seed data for sample customers and treatments

### Objective

ทำให้ทีม dev/test มีข้อมูล repeat revenue ใช้งานทันที

### Scope

เพิ่ม seed สำหรับ:

* converted customers 5–10 ราย
* treatment histories หลายประเภท
* some cycle due records
* some inactive customers
* some VIP/high-LTV customers

### Acceptance Criteria

* seed แล้ว customer list/detail ใช้งานได้
* cycle due / inactive views มีข้อมูลจริง
* demo repeat revenue flow ได้

---

## T5 — Implement customer repository/service layer

### Objective

สร้าง service กลางสำหรับ customer domain

### Scope

* create customer
* update customer
* get customer detail
* list customers
* update customer status
* compute/display summary fields baseline
* tenant-safe query model

### Acceptance Criteria

* customer CRUD หลักใช้งานได้
* tenant-safe ทุก path
* response path พร้อมต่อ UI
* customer summary fields อ่านใช้งานได้

---

## T6 — Implement customer validation schemas

### Objective

กันข้อมูล customer เสียตั้งแต่ชั้น API/service

### Scope

สร้าง validation สำหรับ:

* create customer
* update customer
* convert lead to customer
* customer status update
* treatment-related summary field updates เท่าที่จำเป็น

### Acceptance Criteria

* invalid payload ถูก reject
* enum validation ใช้ canonical values เท่านั้น
* field required/optional ชัด
* error contract สม่ำเสมอกับ sprint ก่อนหน้า

---

## T7 — Implement lead-to-customer conversion service

### Objective

ทำ path แปลง lead → customer แบบไม่ทำข้อมูลหาย

### Scope

* convert lead to customer
* map lead fields → customer fields
* preserve link via `lead_id`
* update lead stage/status according to policy
* avoid duplicate conversion
* migrate/retain useful context policy

### Acceptance Criteria

* convert lead เป็น customer ได้
* lead เดิมไม่หาย
* conversion ซ้ำแบบผิดพลาดถูกกัน
* conversion result trace ได้
* stage/status ของ lead หลัง convert ตรง policy

### Important

ห้ามทำ destructive migration ของ lead data

---

## T8 — Implement customer treatment repository/service layer

### Objective

สร้าง service กลางสำหรับ treatment history

### Scope

* create treatment entry
* update treatment entry
* list treatments by customer
* cancel/mark treatment status
* calculate/store basic treatment summary hooks

### Acceptance Criteria

* treatment CRUD หลักใช้งานได้
* treatment อยู่ clinic เดียวกับ customer
* query by customer ใช้งานได้
* status handling ใช้งานได้

---

## T9 — Implement treatment cycle calculation helper

### Objective

ทำ baseline logic สำหรับรอบการกลับมา

### Scope

* resolve default cycle days by treatment/category
* allow manual override
* compute `next_recommended_at`
* recompute when treatment date/cycle changes
* support null cycle for non-repeat treatments

### Acceptance Criteria

* cycle calculation deterministic
* override ได้
* non-repeat treatments ไม่ถูกบังคับมี cycle
* computed field ใช้งานได้กับ reminder flows

---

## T10 — Implement customer status and recency updater

### Objective

ทำให้ summary fields เช่น `last_visit_at`, `customer_status` อัปเดตสม่ำเสมอ

### Scope

* update `last_visit_at` when relevant treatment completed
* basic customer status recalculation policy
* mark inactive by threshold
* support VIP/manual status policy if applicable in MVP

### Acceptance Criteria

* last_visit_at สะท้อนข้อมูลจริงพอใช้
* inactive baseline ทำงานได้
* active/inactive/vip/churn_risk ไม่มั่ว
* recalculation path อธิบายได้

---

## T11 — Implement reactivation candidate selector service

### Objective

หา customer ที่ควรดึงกลับมา

### Scope

* select inactive customers by threshold
* sort/prioritize by recency / LTV / score baseline
* identify high-value inactive customers
* support clinic-level filters

### Acceptance Criteria

* reactivation candidate list ใช้งานได้
* priority baseline พอมีเหตุผล
* tenant-safe
* query performance พอใช้ระดับ MVP

---

## T12 — Implement cycle-due selector service

### Objective

หา customer ที่ถึงรอบ treatment

### Scope

* find due by `next_recommended_at`
* filter by treatment category/name
* support overdue vs upcoming
* optionally prioritize by value/assigned owner later

### Acceptance Criteria

* due customers ถูกหาได้ถูกต้อง
* overdue/upcoming แยกได้
* ใช้กับ Botox Cycle Reminder ได้จริง
* query path ไม่ซับซ้อนเกิน

---

## T13 — Implement customer list and detail APIs

### Objective

เปิด path ให้ frontend ใช้งาน customer domain

### Scope

* customer list endpoint
* customer detail endpoint
* create/update customer endpoint
* status update endpoint
* list filters baseline

### Acceptance Criteria

* customer list/detail ใช้งานได้
* tenant-safe
* response contracts ชัด
* filters หลักใช้งานได้

---

## T14 — Implement conversion API endpoints

### Objective

เปิด API ให้ UI แปลง lead เป็น customer ได้

### Scope

* convert lead to customer endpoint
* duplicate conversion protection
* optional preview/confirmation payload
* normalized response contract

### Acceptance Criteria

* convert ผ่าน API ได้
* invalid/duplicate conversion ถูก reject
* response มีข้อมูลพอให้ UI redirect/update state ได้
* tenant-safe

---

## T15 — Implement treatment CRUD API endpoints

### Objective

เปิด API สำหรับจัดการ treatment history

### Scope

* create treatment
* update treatment
* list treatments by customer
* cancel/update status
* recompute cycle fields when needed

### Acceptance Criteria

* treatment endpoints ใช้งานได้
* status/cycle updates ถูกต้อง
* invalid customer/treatment clinic mismatch ถูก reject
* response contracts ชัด

---

## T16 — Implement customer list query model

### Objective

ทำให้หน้า customer list ใช้งานได้จริงสำหรับ owner/marketing/sales

### Scope

รองรับ filter อย่างน้อย:

* customer_status
* last_visit_at range
* cycle due / overdue
* inactive
* treatment category/name
* search by name / phone / email

รองรับ sort ขั้นต่ำ:

* last_visit_at
* created_at
* lifetime_value
* next due date proxy where applicable

### Acceptance Criteria

* filters หลักทำงานได้
* search ใช้งานได้
* pagination ชัด
* query performance พอใช้ระดับ MVP

---

## T17 — Implement customer detail aggregation service

### Objective

รวมข้อมูล customer หลัก + treatments + lineage จาก lead เดิม

### Scope

แสดง:

* customer core profile
* linked lead summary
* lifetime value
* last visit
* customer status
* treatments
* due signals / reactivation signals

### Acceptance Criteria

* detail service คืนข้อมูลครบพอให้ UI ใช้งานได้
* ไม่มี query ข้าม clinic
* shape ของ response คงที่
* linked lead summary ใช้งานได้

---

## T18 — Implement customer list UI

### Objective

สร้างหน้า customer list ที่ใช้คัด repeat revenue opportunities ได้จริง

### Scope

* table/list view
* filters
* search
* status badges
* last visit column
* due/inactive indicators
* click-through to detail

### Acceptance Criteria

* customer list ใช้งานได้จริง
* filters และ search ทำงานได้
* repeat revenue opportunities มองเห็นได้
* UI ไม่รกเกินไป

---

## T19 — Implement customer detail UI

### Objective

ให้ทีมเห็นภาพลูกค้าเก่าในที่เดียว

### Scope

แสดง:

* customer header
* contact info
* linked lead
* status
* last visit
* lifetime value
* treatment history
* next recommended indicators
* reactivation signal

### Acceptance Criteria

* detail screen ใช้งานได้จริง
* ข้อมูล repeat revenue เห็นชัด
* sections ไม่สับสน
* action หลักเข้าถึงง่าย

---

## T20 — Implement lead-to-customer conversion UI flow

### Objective

ทำให้ทีมขาย convert ได้จาก lead screen แบบไม่งง

### Scope

* convert action from lead detail/list where appropriate
* confirmation UI
* mapped data preview baseline
* post-conversion redirect/update behavior

### Acceptance Criteria

* staff/authorized roles convert ได้จาก UI
* conversion success path ชัด
* duplicate conversion ถูกแจ้งชัด
* lead/customer views sync กันถูกต้อง

---

## T21 — Implement treatment history UI widgets

### Objective

ให้ทีมเพิ่มและดู treatment history ได้ง่าย

### Scope

* treatment list section
* add treatment form
* edit treatment form
* status controls
* cycle / next recommended display

### Acceptance Criteria

* เพิ่ม treatment ผ่าน UI ได้
* แก้ treatment ได้
* cycle info เห็นชัด
* ไม่ต้องกรอกข้อมูลเยอะเกินจำเป็น

---

## T22 — Implement cycle-due and inactive customer views

### Objective

ทำให้ทีมเห็นรายชื่อที่ควร follow เพื่อสร้างรายได้ซ้ำ

### Scope

* cycle-due list view
* inactive/reactivation list view
* filters baseline
* quick links to customer detail

### Acceptance Criteria

* due/inactive lists ใช้งานได้
* actionable พอสำหรับทีม sale/marketing
* ช่วยป้อนงานให้ flow และทีม manual ได้

---

## T23 — Implement customer/treatment activity event hooks baseline

### Objective

วาง event model สำหรับ repeat automation และ analytics

### Scope

ยิง event ขั้นต่ำเมื่อเกิด:

* customer.created
* customer.updated
* lead.converted_to_customer
* treatment.created
* treatment.updated
* treatment.completed
* customer.became_inactive
* customer.cycle_due_detected

### Acceptance Criteria

* action สำคัญมี event hook
* payload พอใช้ต่อ Sprint 7/8 และ flow repeat revenue
* clinic/entity identity ชัด

---

## T24 — Implement treatment presets and category defaults baseline

### Objective

ลดความมั่วในการกรอก treatment และ cycle defaults

### Scope

* default cycle rules by treatment/category
* optional treatment presets list เช่น Botox/Filler/Laser
* human-editable override path
* helper for UI dropdown defaults

### Acceptance Criteria

* common treatments ใช้งานง่ายขึ้น
* cycle defaults ไม่ต้องกรอกใหม่ทุกครั้ง
* ยัง override ได้
* ไม่ทำให้ระบบ rigid เกินไป

---

## T25 — Implement standardized customer domain API response contracts

### Objective

ให้ frontend/backend ใช้ shape เดียวกันใน customer domain

### Scope

กำหนด response shape สำหรับ:

* customer list item
* customer detail
* conversion result
* treatment list item
* treatment detail/update result
* due/inactive list item

### Acceptance Criteria

* contracts ใช้จริงใน endpoints หลัก
* naming สม่ำเสมอ
* frontend mapping ไม่ต้องเดาหลายแบบ

---

## T26 — Add API and integration tests for customer conversion and treatment lifecycle

### Objective

พิสูจน์ว่า repeat revenue layer ทำงานจริงและไม่รั่ว

### Scope

ทดสอบอย่างน้อย:

* convert lead to customer success path
* duplicate conversion rejected
* conversion across clinics rejected
* treatment create/update/list works
* cycle calculation works
* inactive selector works
* due selector works
* cross-clinic treatment/customer mismatch rejected

### Acceptance Criteria

* tests ผ่าน
* critical business paths ครอบคลุม
* tenant paths ครอบคลุม
* cycle/inactive logic ครอบคลุมพอใช้

---

## T27 — Add query/index review for customer, treatment, and due/inactive paths

### Objective

กัน customer list/detail และ due views ช้าเกินไป

### Scope

* review customer list queries
* review treatment-by-customer queries
* review due/inactive selector queries
* tune indexes/joins ให้เหมาะกับ MVP

### Acceptance Criteria

* customer list/detail ใช้งานได้ลื่นพอ
* due/inactive selectors ไม่แพงเกิน
* indexes สำคัญถูกสร้างแล้ว

---

## T28 — Add basic audit/log hooks for customer and treatment mutations

### Objective

วาง traceability สำหรับ conversion และ repeat revenue actions

### Scope

บันทึก log ขั้นต่ำสำหรับ:

* customer.create/update
* lead.convert_to_customer
* treatment.create/update/cancel
* cycle override changes
* customer status changes

### Acceptance Criteria

* action สำคัญ trace ได้
* พร้อมต่อยอดเข้า PR-08
* debug conversion/treatment issues ได้ระดับหนึ่ง

---

## T29 — Implement reactivation summary card/query baseline

### Objective

ปูทางให้ Sprint 7/8 และ daily marketing summary ใช้ข้อมูล repeat revenue ได้

### Scope

* count inactive customers
* count high-value inactive customers
* count cycle-due customers
* expose summary query for dashboard/widget use

### Acceptance Criteria

* summary counts ใช้งานได้
* numbers พอเชื่อถือได้ระดับ MVP
* รองรับ UI/widget integration

---

## T30 — Create demo data and guided demo scenario for repeat revenue flows

### Objective

ทำให้ Sprint 6 เดโม repeat revenue value ได้ทันที

### Scope

สร้าง demo fixtures/scenarios สำหรับ:

* lead converted to customer
* botox customer due
* inactive customer reactivation candidate
* treatment history visible
* next recommended populated

### Acceptance Criteria

* demo path รันได้บน staging/dev
* scenario สะท้อน LTV value ชัด
* ใช้ต่อร่วมกับ Sprint 5 flow pack ได้

---

## T31 — Sprint 6 customer/repeat review & schema freeze note

### Objective

สรุปสิ่งที่ build แล้วและล็อก handoff ไป Sprint 7

### Scope

สรุป:

* final customer schema
* final treatment schema
* conversion semantics
* cycle/inactive rules
* known limitations
* assumptions สำหรับ AI suggestion และ analytics ใน Sprint 7/8

### Acceptance Criteria

* มี handoff note สั้น ใช้งานจริง
* ทีมรู้ว่าของไหน lock แล้ว
* Sprint 7/8 ใช้ customer/repeat layer ต่อได้ทันที

---

# Dependencies ระหว่าง Ticket

## กลุ่มต้นน้ำ

* **T1** มาก่อน T2, T3, T7, T9, T10, T11, T12, T24, T26
* **T2 + T3** มาก่อน T4, T5, T8, T13, T15, T16, T17, T26, T27
* **T5 + T6** มาก่อน T13, T14, T17, T25
* **T7** มาก่อน T14, T20, T26

## กลุ่มกลาง

* **T8 + T9** มาก่อน T10, T12, T15, T21, T24
* **T10 + T11 + T12** มาก่อน T22, T29
* **T25** ควรทำก่อนหรือคู่ขนานกับ T13–T22
* **T23** ควรตามหลัง core services หลักเริ่มนิ่ง

## กลุ่มปลาย

* **T26, T27, T28, T29, T30, T31** เป็น hardening / closing tickets

---

# Suggested Execution Order

## Phase A — Model Lock

1. T1 Freeze canonical customer and treatment domain model

## Phase B — Data Foundation

2. T2 Migration for customers
3. T3 Migration for customer_treatments
4. T4 Seed sample customers and treatments

## Phase C — Domain Core

5. T5 Customer repository/service
6. T6 Customer validation schemas
7. T7 Lead-to-customer conversion service
8. T8 Customer treatment repository/service
9. T9 Treatment cycle calculation helper
10. T10 Customer status and recency updater
11. T11 Reactivation candidate selector
12. T12 Cycle-due selector
13. T24 Treatment presets and category defaults
14. T25 Standardized customer response contracts

## Phase D — API Layer

15. T13 Customer list/detail APIs
16. T14 Conversion APIs
17. T15 Treatment CRUD APIs
18. T16 Customer list query model
19. T17 Customer detail aggregation service
20. T23 Customer/treatment activity event hooks

## Phase E — Frontend Productization

21. T18 Customer list UI
22. T19 Customer detail UI
23. T20 Lead-to-customer conversion UI
24. T21 Treatment history widgets
25. T22 Cycle-due and inactive customer views
26. T29 Reactivation summary card/query baseline

## Phase F — Hardening / Demo

27. T26 API and integration tests
28. T27 Query/index review
29. T28 Basic audit/log hooks
30. T30 Demo data and guided scenario
31. T31 Sprint review & schema freeze

---

# Suggested Ticket Sizing

## S (เล็ก)

* T1
* T4
* T9
* T23
* T24
* T25
* T29
* T31

## M (กลาง)

* T5
* T6
* T8
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
* T27
* T28
* T30

## L (ใหญ่)

* T2
* T3
* T7
* T26

---

# Sprint 6 Acceptance Criteria รวม

Sprint 6 ถือว่าเสร็จเมื่อครบทั้งหมดนี้

## Functional

* convert lead → customer ได้
* customer profile ใช้งานได้
* treatment history เพิ่ม/แก้ไขได้
* cycle calculation ทำงานได้
* inactive customer list ใช้งานได้
* cycle-due customer list ใช้งานได้

## Product

* ทีมเห็นลูกค้าเก่าและโอกาส repeat revenue ชัด
* conversion path จาก lead ไม่งง
* treatment history เป็นภาษาธุรกิจ ใช้งานง่าย
* Botox Cycle Reminder และ flow ที่เกี่ยวข้องใช้ data จริงได้

## Technical

* customer/treatment domain tenant-safe
* response contracts ชัด
* event hooks พร้อมสำหรับ Sprint 7/8
* due/inactive selector ใช้งานได้เสถียร

## Safety

* ข้าม clinic convert/customer/treatment ไม่ได้
* duplicate conversion ถูกกัน
* cycle override ไม่ทำให้ข้อมูลเพี้ยน
* logs/audit baseline มีพอ debug

## Handoff Readiness

* Sprint 7 ใช้ customer/repeat signals เป็น context ให้ AI suggestion ได้
* Sprint 8 ใช้ customer/repeat events เป็น analytics inputs ได้
* repeat revenue demo ทำได้ทันทีหลังจบ sprint

---

# Suggested backlog labels

* `sprint-6`
* `pr-07`
* `customer`
* `repeat-revenue`
* `treatments`
* `conversion`
* `frontend`
* `backend`
* `tenant`
* `test`
* `hardening`

---

# Recommended owner split ถ้าทีมมี 3 คน

## Backend Engineer

* T2, T3, T5, T6, T7, T8, T9, T10, T11, T12, T13, T14, T15, T16, T17, T23, T24, T26, T27, T28, T29

## Frontend Engineer

* T18, T19, T20, T21, T22

## Tech Lead / Fullstack

* T1, T4, T25, T30, T31
* review conversion semantics
* review cycle logic
* review repeat revenue usability from product lens

---

# ตัวอย่างชื่อ ticket พร้อมใช้

* `[Sprint 6][PR-07] Freeze canonical customer and treatment domain model`
* `[Sprint 6][PR-07] Create migrations for customers and customer treatments`
* `[Sprint 6][PR-07] Implement lead to customer conversion service`
* `[Sprint 6][PR-07] Implement treatment cycle calculation helper`
* `[Sprint 6][PR-07] Implement inactive and cycle-due customer selectors`
* `[Sprint 6][PR-07] Build customer list detail and treatment history screens`
* `[Sprint 6][PR-07] Build lead to customer conversion flow in UI`
* `[Sprint 6][PR-07] Add integration tests for customer conversion and repeat revenue selectors`

---

# ข้อควรระวังของ Sprint 6

Sprint นี้เสี่ยง drift ไปเป็น clinic operations system หรือ EMR แบบไม่ตั้งใจ

## ห้ามเผลอเพิ่ม

* medical chart เต็มรูปแบบ
* doctor workflow
* prescription
* package accounting
* inventory
* surgery scheduling
* clinical outcome system

## ต้องโฟกัสแค่

* customer profile
* treatment history เชิงการตลาด
* repeat cycle
* inactive/reactivation
* support repeat revenue flows

---

# สรุปตรงที่สุด

Sprint 6 มีหน้าที่ทำให้ FlowBiz ไม่ได้เก่งแค่ “ตาม lead ใหม่”
แต่เก่งเรื่อง “**ดึงเงินจากลูกค้าเก่ากลับมาอย่างเป็นระบบ**”

และต้องจบด้วยสถานะนี้:

* lead แปลงเป็น customer ได้
* treatment history ใช้ได้
* รอบกลับมาถูกคำนวณได้
* due/inactive customers มองเห็นได้
* repeat revenue automation ใช้ข้อมูลจริงได้
