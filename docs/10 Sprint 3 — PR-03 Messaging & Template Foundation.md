ได้ นี่คือการแตก **Sprint 3 — PR-03 Messaging & Template Foundation** ลงมาเป็น **engineering ticket ระดับใช้งานจริง** ในระดับเดียวกับ Sprint 1–2

เป้าหมายของ Sprint 3 คือทำให้ FlowBiz มี **Messaging Foundation ที่ส่งข้อความได้จริง, trace ได้, และพร้อมต่อ Automation ใน Sprint 4–5**

---

# Sprint 3 — PR-03 Messaging & Template Foundation

## Sprint Goal

ส่งมอบ **Messaging Foundation** ที่รองรับ:

* ตั้งค่า 1 primary channel ต่อ clinic
* ผูก lead/customer กับ external recipient identity
* สร้างและแก้ template ได้
* ส่งข้อความแบบ manual จาก lead context ได้
* เก็บ outbound log และ delivery state ได้
* ทุกอย่าง tenant-safe และพร้อมต่อ automation engine

---

# Epic: Messaging & Template Foundation

---

## T1 — Freeze canonical messaging domain model

### Objective

ล็อก domain model กลางของ messaging ก่อนลง schema และ integration

### Scope

กำหนดและล็อก:

* channel model
* contact identity model
* template categories
* outbound message states
* manual send path
* recipient resolution rules
* provider abstraction boundary

### Deliverables

* short design note 1 ฉบับ
* enum กลางสำหรับ:

  * `channel_type`
  * `template.category`
  * `outbound_message.status`
  * `outbound_message.message_type`
* recipient selection rules
* content rendering rules เบื้องต้น

### Suggested enums

#### channel_type

* line
* email
* sms

#### template.category

* followup
* reminder
* promotion
* review_request
* reactivation

#### outbound_message.status

* pending
* sent
* delivered
* failed
* cancelled

#### outbound_message.message_type

* manual
* template
* automation
* campaign

### Acceptance Criteria

* ทีมใช้ enum ชุดเดียวกันทั้ง backend/frontend
* ระบุชัดว่า 1 clinic รองรับกี่ primary channels ใน MVP
* ระบุชัดว่า identity ไหนถูกใช้เป็น default recipient
* ระบุชัดว่า template render ใช้ variable policy แบบไหน

---

## T2 — Create database migration for `channels`

### Objective

สร้างตาราง channel configuration ต่อ clinic

### Scope

สร้าง migration สำหรับ `channels` พร้อม:

* PK/FK
* tenant ownership via `clinic_id`
* channel status
* config json
* timestamps
* baseline indexes

### Suggested fields

* id
* clinic_id
* channel_type
* name
* status
* config_json
* created_at
* updated_at

### Acceptance Criteria

* migration รันได้
* rollback ได้
* channel ผูก clinic ชัด
* index สำหรับ `(clinic_id, channel_type)` พร้อมใช้

---

## T3 — Create database migration for `contact_identities`

### Objective

สร้างตาราง map external recipient identity กับ lead/customer

### Scope

สร้าง migration สำหรับ `contact_identities`

### Suggested fields

* id
* clinic_id
* entity_type
* entity_id
* channel
* external_id
* display_name
* is_primary
* created_at
* updated_at

### Suggested entity_type

* lead
* customer

### Acceptance Criteria

* migration รันได้
* rollback ได้
* uniqueness policy ชัด เช่น primary per entity/channel
* ownership อยู่ clinic เดียวกับ entity

### Important

ต้องกัน path ที่ identity ไปผูกข้าม clinic

---

## T4 — Create database migration for `message_templates`

### Objective

สร้างฐานข้อมูล template ของระบบ

### Scope

สร้าง migration สำหรับ `message_templates`

### Suggested fields

* id
* clinic_id
* channel_type
* name
* category
* language
* content
* variables_json
* approval_status
* created_at
* updated_at

### Suggested approval_status

* draft
* approved
* archived

### Acceptance Criteria

* migration รันได้
* rollback ได้
* template ผูก clinic และ channel_type ชัด
* unique policy ขั้นพื้นฐาน เช่น `(clinic_id, channel_type, name)` ถ้าทีมเห็นเหมาะ

---

## T5 — Create database migration for `outbound_messages`

### Objective

สร้าง log กลางของข้อความขาออก

### Scope

สร้าง migration สำหรับ `outbound_messages`

### Suggested fields

* id
* clinic_id
* channel_id
* entity_type
* entity_id
* campaign_id nullable
* template_id nullable
* automation_execution_id nullable
* message_type
* recipient_ref
* content_rendered
* status
* scheduled_at
* sent_at
* delivered_at
* failed_at
* failure_reason
* created_at
* updated_at

### Acceptance Criteria

* migration รันได้
* rollback ได้
* FK สำคัญครบ
* index ขั้นต่ำพร้อม

### Suggested indexes

* `(clinic_id, status)`
* `(clinic_id, entity_type, entity_id)`
* `(clinic_id, channel_id, created_at)`
* `(clinic_id, template_id)`

---

## T6 — Add seed data for sample channel, templates, and message history

### Objective

ทำให้ทีม dev/test มีข้อมูลลองใช้จริง

### Scope

เพิ่ม seed สำหรับ:

* 1 sample channel
* 3–5 message templates
* 3–5 contact identities
* 5–10 outbound messages sample

### Acceptance Criteria

* seed แล้วเปิดหน้าจอ messaging มีข้อมูลลองทันที
* lead detail สามารถทดลอง manual send path ได้
* template categories กระจายพอให้ test UI

---

## T7 — Implement channel repository/service layer

### Objective

สร้าง service กลางสำหรับจัดการ channel config ต่อ clinic

### Scope

* create/update channel config
* get active channels by clinic
* get primary channel for clinic/type
* enable/disable channel
* validate channel ownership

### Acceptance Criteria

* service methods tenant-safe
* clinic จัดการเฉพาะ channel ตัวเองได้
* active/inactive state ใช้งานได้
* path ข้าม clinic ถูก reject

---

## T8 — Implement contact identity repository/service layer

### Objective

สร้าง service กลางสำหรับ map recipient identity

### Scope

* create identity
* update identity
* list identities by entity
* resolve primary identity by entity + channel
* validate identity ownership

### Acceptance Criteria

* lead/customer มีหลาย identities ได้ตาม channel
* resolve primary identity ได้
* ไม่มี cross-clinic attachment
* duplicate primary identity ถูกกันตาม policy

---

## T9 — Implement template repository/service layer

### Objective

สร้าง service กลางสำหรับจัดการ template

### Scope

* create template
* update template
* list templates
* get template detail
* archive template
* validate category/channel consistency

### Acceptance Criteria

* template CRUD ใช้งานได้
* template อยู่ clinic เดียวกัน
* archived template ถูก handle ตาม policy
* list/filter ตาม category/channel ได้

---

## T10 — Implement template rendering engine v1

### Objective

ทำให้ template ถูกแปลงเป็นข้อความพร้อมส่งได้

### Scope

* variable interpolation แบบพื้นฐาน
* strict validation ของ required variables
* render preview
* fallback/error handling ถ้า variable ไม่ครบ

### Suggested variable sources v1

* lead fields
* clinic fields
* static input overrides

### Acceptance Criteria

* render template ได้เมื่อข้อมูลครบ
* missing variable ถูก reject หรือแจ้งชัด
* rendered content ถูกเก็บก่อนส่งจริงได้
* deterministic output

### Important

ยังไม่ต้องทำ expression language ซับซ้อน

---

## T11 — Implement provider adapter interface for 1 primary messaging provider

### Objective

สร้าง abstraction สำหรับ provider จริง 1 ตัว โดยแยก domain logic ออกจาก external API

### Scope

* define provider interface
* implement adapter สำหรับ provider หลัก 1 ตัว
* normalize request/response
* map provider error → domain error

### Acceptance Criteria

* domain layer ไม่ขึ้นกับ provider payload โดยตรง
* adapter ส่งข้อความได้
* adapter คืน normalized result ได้
* error mapping พอใช้งานจริง

### Note

เลือก provider ให้ชัดตั้งแต่ต้น แต่ architecture ต้องเปิดทางสำหรับตัวอื่นในอนาคต

---

## T12 — Implement manual send message service

### Objective

เปิด path สำหรับ staff ส่งข้อความจาก lead/customer context ได้จริง

### Scope

* resolve clinic channel
* resolve recipient identity
* optional template render
* send via provider adapter
* persist outbound message log
* return normalized result

### Supported send modes v1

* raw text manual send
* template-based send

### Acceptance Criteria

* ส่งข้อความจาก entity context ได้
* recipient identity ถูกต้อง
* ใช้ channel ของ clinic เดียวกันเท่านั้น
* สร้าง outbound log ทุกครั้ง
* failure ถูกบันทึก

---

## T13 — Implement outbound message status model and logging flow

### Objective

ทำให้ message trace ได้ครบตั้งแต่ขอส่งจนสำเร็จ/ล้มเหลว

### Scope

* pending/sent/failed baseline
* delivered รองรับถ้ามี provider callback หรือ manual simulation path
* content_rendered persistence
* failure reason mapping
* sent timestamps

### Acceptance Criteria

* ทุก send path มี outbound record
* status transitions ชัด
* rendered content เก็บใน log
* failure reason อ่านเข้าใจได้ระดับหนึ่ง

---

## T14 — Implement channel configuration endpoints / internal management path

### Objective

ให้ clinic หรือ internal admin ตั้งค่า channel หลักได้

### Scope

อย่างน้อย 1 path:

* internal admin API/UI
  หรือ
* clinic settings API/UI แบบ minimal

สำหรับ:

* create channel
* update config
* activate/deactivate

### Acceptance Criteria

* config channel ได้
* deactivate channel ได้
* invalid config ถูก reject ขั้นพื้นฐาน
* access control ถูกต้อง

---

## T15 — Implement template CRUD API endpoints

### Objective

เปิด path ให้ frontend จัดการ template

### Scope

* create template
* update template
* list templates
* get template detail
* archive template

### Acceptance Criteria

* authenticated clinic member ใช้งานได้ตาม role
* template ข้าม clinic อ่าน/แก้ไม่ได้
* response contracts ชัด
* validation/error shape มาตรฐานเดียวกับ sprint ก่อนหน้า

---

## T16 — Implement contact identity APIs and lead integration hooks

### Objective

ให้ lead/customer มี recipient identity ที่ใช้ส่งข้อความได้จริง

### Scope

* create/update/list identity endpoints
* helper hook สำหรับผูก identity กับ lead
* optional auto-create identity จาก lead fields บางประเภท เช่น line_user_id

### Acceptance Criteria

* lead detail ดึง identity ได้
* create/update identity ได้
* identity clinic consistency ไม่พัง
* duplicate primary identity ถูก handle ตาม policy

---

## T17 — Implement manual send API endpoints

### Objective

เปิด API สำหรับ manual send จาก UI

### Scope

* send raw text endpoint
* send from template endpoint
* validation ของ channel/template/recipient/entity ownership
* normalized response contract

### Acceptance Criteria

* send path ใช้งานได้จาก lead context
* invalid recipient/channel/template ถูก reject
* outbound log ถูกสร้างทุกครั้ง
* API response มีข้อมูลพอ refresh UI ได้

---

## T18 — Implement outbound history query service

### Objective

ให้หน้า detail และ messaging views แสดงประวัติข้อความได้

### Scope

* list outbound by entity
* filter by status
* filter by channel
* sort by created_at/sent_at
* pagination baseline

### Acceptance Criteria

* lead detail แสดงประวัติข้อความได้
* query tenant-safe
* performance พอใช้กับข้อมูลระดับ MVP
* response shape เหมาะกับ UI

---

## T19 — Add messaging activity event hooks baseline

### Objective

วาง event model สำหรับ Sprint 4/8

### Scope

ยิง event ขั้นต่ำเมื่อเกิด:

* channel.created / updated / disabled
* template.created / updated / archived
* message.send_requested
* message.sent
* message.failed
* identity.created / updated

### Acceptance Criteria

* action สำคัญมี event hook
* payload ขั้นต่ำพอใช้ต่อ automation/analytics
* clinic/entity identity ชัด

---

## T20 — Implement template list/create/edit UI

### Objective

ให้ทีมใช้งาน template ได้จริงผ่าน UI

### Scope

* template list page
* create template page/form
* edit template page/form
* category/channel/language fields
* preview render step แบบพื้นฐานถ้าไหว

### Acceptance Criteria

* สร้าง template ผ่าน UI ได้
* แก้ template ผ่าน UI ได้
* list/filter ใช้งานได้
* validation errors แสดงชัด

---

## T21 — Implement manual send UI from lead detail

### Objective

ทำให้ lead detail เป็นจุดเริ่มส่งข้อความจริง

### Scope

* send message modal/panel ใน lead detail
* เลือก send mode:

  * raw text
  * template
* แสดง recipient identity
* confirm send
* show result/failure

### Acceptance Criteria

* staff ส่งข้อความจาก lead detail ได้
* UI ไม่สับสน
* ถ้า identity ยังไม่มี ต้องแจ้งชัด
* ส่งสำเร็จแล้ว history refresh ถูก

---

## T22 — Implement outbound message history UI

### Objective

ให้ทีมตรวจย้อนหลังการส่งข้อความได้

### Scope

* history list on lead detail
* status badge
* timestamps
* template/raw indicator
* rendered content preview
* failure reason display

### Acceptance Criteria

* ประวัติข้อความอ่านเข้าใจได้
* แยก sent/failed ได้
* template/raw source เห็นชัด
* ใช้งาน debug เบื้องต้นได้

---

## T23 — Implement minimal channel settings UI or internal utility

### Objective

ให้ทีม dev/admin ตั้งค่า channel โดยไม่แตะ DB ตรง

### Scope

อย่างน้อย 1 ทาง:

* minimal settings UI
  หรือ
* internal admin utility/script

สำหรับ:

* create/update channel config
* activate/deactivate channel
* inspect current config status

### Acceptance Criteria

* ตั้งค่า channel ได้จริง
* ปิด/เปิด channel ได้
* ใช้งานในการ dev/staging/demo ได้

---

## T24 — Implement standardized messaging API response contracts

### Objective

ให้ frontend/backend ใช้ shape เดียวกันใน messaging domain

### Scope

กำหนด response shape สำหรับ:

* channel
* identity
* template list/detail
* send response
* outbound history item
* provider failure error shape

### Acceptance Criteria

* contracts ใช้จริงใน endpoints หลัก
* naming สม่ำเสมอ
* frontend mapping ไม่ต้องเดาหลายแบบ

---

## T25 — Add API and integration tests for messaging tenant safety and send flow

### Objective

กัน regression และพิสูจน์ว่า messaging core ปลอดภัยและใช้งานได้

### Scope

ทดสอบอย่างน้อย:

* clinic A ใช้ template clinic B ไม่ได้
* clinic A ใช้ channel clinic B ไม่ได้
* send to identity ที่ไม่อยู่ clinic เดียวกันไม่ได้
* manual send success path works
* template send with missing variables fails correctly
* outbound log is created on success/failure

### Acceptance Criteria

* tests ผ่าน
* critical tenant paths ถูกครอบคลุม
* send flow หลักถูกครอบคลุม
* failure paths ถูกครอบคลุมระดับพอใช้

---

## T26 — Add provider sandbox/mock strategy for local and staging

### Objective

ทำให้ทีมพัฒนาและทดสอบได้โดยไม่พึ่ง provider จริงทุกครั้ง

### Scope

* mock provider adapter
* sandbox config path
* simulation mode for send success/failure
* switch by environment

### Acceptance Criteria

* local dev ส่งผ่าน mock ได้
* staging เลือก mock/sandbox ได้ตาม strategy
* UI flow ทดสอบได้โดยไม่ยิงจริงเสมอ
* provider abstraction ยังสะอาด

---

## T27 — Add query/index review for templates and outbound history

### Objective

กัน list/history ช้าเกินตั้งแต่แรก

### Scope

* review indexes
* review common query paths
* inspect outbound history query patterns
* tune template list/history queries ให้เหมาะกับ MVP

### Acceptance Criteria

* history/list ไม่ช้าผิดปกติ
* indexes สำคัญถูกสร้างแล้ว
* query path ชัด ไม่ซับซ้อนเกิน

---

## T28 — Add basic audit/log hooks for messaging mutations

### Objective

วางนิสัย traceability สำหรับ messaging domain

### Scope

บันทึก log ขั้นต่ำสำหรับ:

* channel.create/update/disable
* template.create/update/archive
* identity.create/update
* message.send
* message.fail

### Acceptance Criteria

* action สำคัญ trace ได้ระดับหนึ่ง
* ไม่เก็บข้อมูล sensitive เกินจำเป็น
* พร้อมต่อยอดเข้า PR-08

---

## T29 — Sprint 3 messaging review & schema freeze note

### Objective

สรุปสิ่งที่ build แล้วและล็อก handoff ไป Sprint 4

### Scope

สรุป:

* final messaging schema
* provider abstraction
* status model
* response contracts
* known limitations
* automation integration assumptions สำหรับ Sprint 4

### Acceptance Criteria

* มี handoff note สั้น ใช้งานจริง
* ทีมรู้ว่าของไหน lock แล้ว
* event/send/template assumptions ชัดสำหรับ automation engine

---

# Dependencies ระหว่าง Ticket

## กลุ่มต้นน้ำ

* **T1** มาก่อน T2, T3, T4, T5, T10, T11
* **T2 + T3 + T4 + T5** มาก่อน T6, T7, T8, T9, T13, T25, T27
* **T11** มาก่อน T12, T17, T26
* **T24** ควรทำก่อนหรือคู่ขนานกับ T14, T15, T16, T17, T18

## กลุ่มกลาง

* **T7** มาก่อน T12, T14, T23
* **T8** มาก่อน T12, T16, T21
* **T9 + T10** มาก่อน T12, T15, T20, T21
* **T12 + T13** มาก่อน T17, T18, T21, T22
* **T19** ควรตามหลัง core services หลักเริ่มนิ่ง

## กลุ่มปลาย

* **T25, T26, T27, T28, T29** เป็น hardening / closing tickets

---

# Suggested Execution Order

## Phase A — Model Lock

1. T1 Freeze canonical messaging domain model

## Phase B — Data Foundation

2. T2 Migration for channels
3. T3 Migration for contact_identities
4. T4 Migration for message_templates
5. T5 Migration for outbound_messages
6. T6 Seed sample channel/templates/history

## Phase C — Domain Core

7. T7 Channel repository/service
8. T8 Contact identity repository/service
9. T9 Template repository/service
10. T10 Template rendering engine v1
11. T11 Provider adapter interface + primary provider
12. T24 Standardized messaging response contracts

## Phase D — API Core

13. T12 Manual send message service
14. T13 Outbound status model and logging
15. T14 Channel config endpoints / management path
16. T15 Template CRUD endpoints
17. T16 Contact identity APIs + lead hooks
18. T17 Manual send endpoints
19. T18 Outbound history query service
20. T19 Messaging activity event hooks

## Phase E — Frontend

21. T20 Template list/create/edit UI
22. T21 Manual send UI from lead detail
23. T22 Outbound history UI
24. T23 Minimal channel settings UI / utility

## Phase F — Hardening

25. T26 Provider sandbox/mock strategy
26. T25 API/integration tests
27. T27 Query/index review
28. T28 Basic audit/log hooks
29. T29 Messaging review & schema freeze

---

# Suggested Ticket Sizing

## S (เล็ก)

* T1
* T6
* T19
* T24
* T27
* T29

## M (กลาง)

* T7
* T8
* T9
* T10
* T13
* T14
* T15
* T16
* T18
* T20
* T21
* T22
* T23
* T28

## L (ใหญ่)

* T2
* T3
* T4
* T5
* T11
* T12
* T17
* T25
* T26

---

# Sprint 3 Acceptance Criteria รวม

Sprint 3 ถือว่าเสร็จเมื่อครบทั้งหมดนี้

## Functional

* clinic ตั้งค่า 1 primary channel ได้
* lead/customer มี contact identity ใช้งานได้
* สร้าง template ได้
* แก้ template ได้
* ส่งข้อความแบบ manual จาก lead context ได้
* เก็บ outbound history ได้
* แสดง sent/failed status ได้

## Product

* lead detail กลายเป็นจุดเริ่ม follow-up จริง
* template ใช้งานได้จริงกับเคสคลินิก
* staff ตรวจย้อนหลังได้ว่าเคยส่งอะไรไปแล้ว

## Technical

* provider adapter แยกจาก domain logic
* rendering engine ใช้งานได้
* response contracts ชัด
* event hooks พื้นฐานพร้อมสำหรับ Sprint 4/8

## Safety

* clinic ข้ามกันใช้ channel/template/identity ไม่ได้
* invalid recipient ถูก reject
* missing variables ตอน template send ถูก reject ชัด
* outbound log ถูกสร้างทั้ง success และ failure path

## Handoff Readiness

* Sprint 4 เริ่ม automation engine ได้ทันที
* step `send_message` สามารถพึ่ง messaging foundation นี้ได้
* execution trace ในอนาคตสามารถอ้าง outbound log ได้

---

# Suggested backlog labels

* `sprint-3`
* `pr-03`
* `messaging`
* `template`
* `channel`
* `integration`
* `frontend`
* `backend`
* `tenant`
* `test`
* `hardening`

---

# Recommended owner split ถ้าทีมมี 3 คน

## Backend Engineer

* T2, T3, T4, T5, T7, T8, T9, T10, T11, T12, T13, T14, T15, T16, T17, T18, T19, T25, T26, T27, T28

## Frontend Engineer

* T20, T21, T22, T23

## Tech Lead / Fullstack

* T1, T6, T24, T29
* review provider abstraction
* review identity ownership rules
* review failure model and traceability

---

# ตัวอย่างชื่อ ticket พร้อมใช้

* `[Sprint 3][PR-03] Freeze canonical messaging domain model`
* `[Sprint 3][PR-03] Create migrations for channels contact identities templates and outbound messages`
* `[Sprint 3][PR-03] Implement provider adapter interface and primary messaging provider`
* `[Sprint 3][PR-03] Implement manual send message service`
* `[Sprint 3][PR-03] Implement template rendering engine v1`
* `[Sprint 3][PR-03] Build template management screens`
* `[Sprint 3][PR-03] Build manual send flow from lead detail`
* `[Sprint 3][PR-03] Add messaging tenant safety and send flow integration tests`

---

# ข้อควรระวังของ Sprint 3

อย่าปล่อยให้ Sprint นี้บวมไปเป็น communication platform เต็มระบบ

## ห้ามเผลอเพิ่ม

* inbound chat center
* campaign broadcast orchestration
* multi-provider orchestration ใหญ่
* A/B testing
* AI copy generation
* conversation threading เต็มรูปแบบ
* delivery analytics เชิงลึก

## ต้องโฟกัสแค่

* ส่งออกได้
* trace ได้
* template ใช้ได้
* identity ถูกต้อง
* พร้อมให้ automation เรียกใช้

---

# สรุปตรงที่สุด

Sprint 3 มีหน้าที่ทำให้ FlowBiz มี **Messaging Foundation ที่เชื่อถือได้**
และต้องจบด้วยสถานะนี้:

* staff ส่งข้อความจาก lead ได้จริง
* ระบบรู้ว่าใช้ template ไหน ส่งให้ใคร ผ่าน channel อะไร
* automation engine ใน Sprint 4 สามารถเรียก `send_message` ได้โดยไม่ต้องย้อนมารื้อ messaging