# Sprint 4 — PR-04 Automation Engine v1

## Sprint Goal

ส่งมอบ **Automation Engine v1** ที่รองรับ:

* trigger จาก event ภายในระบบ
* สร้าง execution ได้
* รัน steps ตามลำดับได้
* รองรับ delayed/wait steps
* เรียก action หลักได้
* เก็บ execution log ได้
* ปลอดภัยพอสำหรับเป็นฐานของ MVP Automation Pack ใน Sprint 5

---

# Epic: Automation Engine v1

---

## T1 — Freeze canonical automation domain model

### Objective

ล็อก model กลางของ automation engine ก่อนลง schema และ worker runtime

### Scope

กำหนดและล็อก:

* flow model
* step model
* execution model
* task/reminder model
* trigger types v1
* step types v1
* execution state machine
* failure model
* idempotency strategy
* event-to-flow mapping boundary

### Deliverables

* short design note 1 ฉบับ
* enum กลางสำหรับ:

  * `automation_flow.status`
  * `automation_execution.status`
  * `automation_step.step_type`
  * `automation_task.status`
  * `reminder.status`
  * `trigger_type`

### Suggested enums

#### automation_flow.status

* draft
* active
* disabled
* archived

#### automation_execution.status

* pending
* running
* waiting
* completed
* failed
* cancelled

#### automation_step.step_type

* wait
* send_message
* create_task
* add_tag
* remove_tag
* change_stage
* create_reminder
* notify_user

#### automation_task.status

* open
* completed
* cancelled

#### reminder.status

* pending
* due
* completed
* cancelled

#### trigger_type

* event
* scheduled

### Acceptance Criteria

* ทีมใช้ enum ชุดเดียวกันทั้ง backend/frontend
* ระบุชัดว่า execution 1 ตัวผูกกับ entity ไหน
* ระบุชัดว่า delayed step กลับมาทำต่ออย่างไร
* ระบุชัดว่า step failure ส่งผลต่อ execution อย่างไร
* ระบุชัดว่า trigger ซ้ำถูกกันอย่างไร

---

## T2 — Create database migration for `automation_flows`

### Objective

สร้างตาราง flow definition

### Scope

สร้าง migration สำหรับ `automation_flows`

### Suggested fields

* id
* clinic_id
* name
* flow_type
* trigger_type
* status
* version
* entry_rule_json
* created_by
* created_at
* updated_at

### Acceptance Criteria

* migration รันได้
* rollback ได้
* flow ผูก clinic ชัด
* baseline indexes พร้อม

### Suggested indexes

* `(clinic_id, status)`
* `(clinic_id, trigger_type)`
* `(clinic_id, created_at)`

---

## T3 — Create database migration for `automation_steps`

### Objective

สร้างตาราง step definition ต่อ flow

### Scope

สร้าง migration สำหรับ `automation_steps`

### Suggested fields

* id
* clinic_id
* flow_id
* step_order
* step_type
* delay_minutes
* config_json
* created_at
* updated_at

### Acceptance Criteria

* migration รันได้
* rollback ได้
* unique policy สำหรับ `(flow_id, step_order)` ชัด
* step ทุกตัวอยู่ clinic เดียวกับ flow

---

## T4 — Create database migration for `automation_executions`

### Objective

สร้างตาราง execution runtime ของ flow

### Scope

สร้าง migration สำหรับ `automation_executions`

### Suggested fields

* id
* clinic_id
* flow_id
* entity_type
* entity_id
* trigger_event
* status
* started_at
* finished_at
* last_step_order
* context_json
* created_at
* updated_at

### Acceptance Criteria

* migration รันได้
* rollback ได้
* execution ผูก clinic/flow/entity ชัด
* indexes พร้อมสำหรับ runtime lookup

### Suggested indexes

* `(clinic_id, flow_id, status)`
* `(clinic_id, entity_type, entity_id)`
* `(clinic_id, created_at)`

---

## T5 — Create database migration for `automation_tasks` and `reminders`

### Objective

สร้างตารางผลลัพธ์ runtime สำหรับ action ประเภท task/reminder

### Scope

สร้าง migrations สำหรับ:

* `automation_tasks`
* `reminders`

### Suggested fields: automation_tasks

* id
* clinic_id
* execution_id
* assigned_user_id
* task_type
* title
* description
* due_at
* status
* created_at
* updated_at

### Suggested fields: reminders

* id
* clinic_id
* entity_type
* entity_id
* reminder_type
* title
* due_at
* status
* payload_json
* created_at
* updated_at

### Acceptance Criteria

* migrations รันได้
* rollback ได้
* task/reminder ผูก clinic ได้ชัด
* due lookup indexes พร้อม

### Suggested indexes

* `(clinic_id, status, due_at)`
* `(clinic_id, entity_type, entity_id)`

---

## T6 — Add seed data for sample predefined flows

### Objective

ทำให้ทีม dev/test มี flow ตัวอย่างลองกับ runtime ได้เร็ว

### Scope

seed flow ตัวอย่างอย่างน้อย 2–3 flow เช่น

* New Lead Welcome
* Uncontacted Lead Alert
* Consult Reminder skeleton

พร้อม steps ที่ใช้ type หลัก

### Acceptance Criteria

* seed แล้วมี flow ให้เปิดดูในระบบ
* ใช้ทดสอบ runner ได้
* step definitions ครอบคลุม step types หลักบางส่วน

---

## T7 — Implement internal event contract and event dispatcher baseline

### Objective

สร้าง internal event path กลางสำหรับ trigger automation

### Scope

* define canonical internal event payload
* implement dispatcher/publisher
* implement subscription/handler registration baseline
* bridge event hooks จาก CRM/Messaging ไป automation trigger layer

### Suggested event payload baseline

* clinic_id
* event_type
* entity_type
* entity_id
* actor metadata
* occurred_at
* metadata_json

### Acceptance Criteria

* event จาก domain อื่นส่งเข้าระบบ trigger ได้
* event contract เดียวกันใช้ทั่วระบบ
* dispatcher ไม่ผูกกับ module เดียวเกินไป
* tenant identity อยู่ใน event ชัด

---

## T8 — Implement automation flow repository/service layer

### Objective

สร้าง service กลางของ flow definitions

### Scope

* create flow
* update flow metadata
* list flows
* get flow detail
* enable/disable flow
* validate clinic ownership
* fetch active flows by trigger type

### Acceptance Criteria

* flow CRUD ขั้นพื้นฐานใช้งานได้
* enable/disable ทำงานได้
* active flows query ใช้กับ trigger runtime ได้
* clinic isolation ถูกต้อง

---

## T9 — Implement automation step repository/service layer

### Objective

สร้าง service กลางสำหรับ step definitions

### Scope

* add step
* update step
* reorder steps
* delete/disable step ตาม policy
* validate step type/config
* fetch ordered steps for flow

### Acceptance Criteria

* step order คงที่และอ่านง่าย
* config validation ขั้นพื้นฐานทำงานได้
* delete/update ไม่ทำให้ order พัง
* fetch ordered steps ใช้กับ runner ได้

---

## T10 — Implement execution state model and repository/service layer

### Objective

สร้าง service กลางสำหรับ runtime execution

### Scope

* create execution
* load execution
* update execution status
* persist last_step_order
* mark waiting/completed/failed
* store execution context
* attach runtime metadata

### Acceptance Criteria

* execution state transitions ทำงานได้
* status machine deterministic
* execution trace ได้
* clinic/entity consistency ไม่พัง

---

## T11 — Implement trigger evaluation service

### Objective

ประเมินว่า event หนึ่งควรสร้าง execution อะไรบ้าง

### Scope

* receive internal event
* find active flows matching trigger
* evaluate entry_rule_json baseline
* return eligible flows
* skip disabled/incompatible flows

### Acceptance Criteria

* event trigger หา matching flows ได้
* entry rule baseline ใช้งานได้
* flow ที่ disabled ไม่ถูกสร้าง execution
* clinic scoping ถูกต้อง

### Note

entry_rule_json v1 ควร lean มาก
เช่น exact event type + simple entity filters

---

## T12 — Implement execution creation and deduplication strategy

### Objective

กัน duplicate execution ตั้งแต่ทางเข้า

### Scope

* create execution from eligible trigger
* dedupe by clinic + flow + entity + trigger signature ตาม policy
* define idempotency key
* skip or coalesce duplicate triggers ตาม policy

### Acceptance Criteria

* trigger ซ้ำไม่สร้าง execution ซ้ำแบบไม่ตั้งใจ
* idempotency key ถูกเก็บหรือ derive ได้ชัด
* retry ของ event handler ไม่ทำให้ข้อมูลพัง

---

## T13 — Implement background job / worker foundation for automation runtime

### Objective

สร้าง runtime worker ที่ใช้รัน execution asynchronously

### Scope

* queue job structure
* worker consumer
* execution dispatch job
* delayed resume job
* retry policy baseline
* dead-letter / failure handling baseline เท่าที่จำเป็น

### Acceptance Criteria

* execution jobs ถูก queue/run ได้
* worker restart แล้ว recover ได้ระดับหนึ่ง
* delayed resume jobs schedule ได้
* retry behavior ชัดและไม่ยิงซ้ำมั่ว

---

## T14 — Implement step runner contract

### Objective

สร้าง abstraction กลางสำหรับ step execution แต่ละชนิด

### Scope

* define step runner interface
* common input/output contract
* handler registry by step_type
* normalized step result:

  * success
  * waiting
  * failed
  * skipped

### Acceptance Criteria

* step type ใหม่ผูกเข้า registry ได้
* runner contract ใช้ซ้ำได้ทุก step
* result model สม่ำเสมอ
* execution engine ไม่ต้องรู้รายละเอียด provider/domain มากเกินไป

---

## T15 — Implement `wait` step handler

### Objective

รองรับ delayed flow continuation

### Scope

* compute wait target time
* persist execution as waiting
* schedule resume job
* resume from next step after wait

### Acceptance Criteria

* wait step ทำให้ execution หยุดชั่วคราวได้
* ถึงเวลาแล้ว resume ได้
* resume ไม่รัน step เดิมซ้ำโดยไม่ตั้งใจ
* timestamps trace ได้

---

## T16 — Implement `send_message` step handler

### Objective

เชื่อม automation กับ messaging foundation

### Scope

* resolve target entity
* resolve template or message config from step
* call manual/automation send service boundary
* persist outcome to execution context

### Acceptance Criteria

* step เรียก messaging ได้จริง
* ใช้ clinic resources ถูกต้อง
* success/failure ถูกสะท้อนกลับ execution
* outbound log ผูก trace ได้

---

## T17 — Implement `create_task` step handler

### Objective

ให้ flow สร้าง task ให้ staff ได้

### Scope

* create task record
* assign user ตาม config
* due date calculation baseline
* task title/description templating แบบ lean

### Acceptance Criteria

* task ถูกสร้างจาก flow ได้
* assigned user validation ถูกต้อง
* due_at ถูกต้องตาม config
* execution trace ผูกกับ task ได้

---

## T18 — Implement `create_reminder` step handler

### Objective

ให้ flow สร้าง reminder ตาม entity ได้

### Scope

* create reminder record
* due time calculation
* reminder payload
* clinic/entity consistency validation

### Acceptance Criteria

* reminder ถูกสร้างได้
* due_at ถูกต้อง
* payload พอใช้ต่อใน UI/summary
* execution trace ผูก reminder ได้

---

## T19 — Implement `add_tag` and `remove_tag` step handlers

### Objective

ให้ automation เปลี่ยน tag บน lead/customer ได้

### Scope

* attach tag
* detach tag
* validate tag ownership
* prevent duplicate attach
* graceful no-op on missing detach target ตาม policy

### Acceptance Criteria

* add/remove tag ใช้งานได้
* ไม่ผูก tag ข้าม clinic
* duplicate attach ไม่พัง
* action นี้ trace ได้

---

## T20 — Implement `change_stage` step handler

### Objective

ให้ flow เปลี่ยน stage ของ lead ได้ใน use case ที่จำเป็น

### Scope

* validate target entity เป็น lead
* validate target stage
* call lead service transition path
* persist execution trace

### Acceptance Criteria

* change stage ผ่าน automation ได้
* invalid stage/entity ถูก reject
* ใช้ lead transition rules เดียวกับ CRM
* action นี้ trace ได้

---

## T21 — Implement `notify_user` step handler baseline

### Objective

รองรับ internal notification path ขั้นพื้นฐาน

### Scope

อย่างน้อย 1 ทาง:

* create internal notification record
  หรือ
* create task-like lightweight notification
  หรือ
* system event feed entry

### Acceptance Criteria

* notify path ทำงานได้อย่างน้อย 1 รูปแบบ
* assigned/target user ถูกต้อง
* ใช้ใน MVP flows ได้จริง

---

## T22 — Implement execution runner orchestration service

### Objective

เอา trigger, execution, step runner, worker มาประกอบเป็น runtime เดียว

### Scope

* load execution
* fetch ordered steps
* run from current position
* persist last_step_order
* stop on wait/fail/complete
* update execution status accordingly

### Acceptance Criteria

* execution เดินตามลำดับ step ได้
* wait/fail/complete ถูก handle ถูกต้อง
* last_step_order อัปเดตถูก
* replay/debug ได้ระดับหนึ่ง

---

## T23 — Implement failure handling and retry policy baseline

### Objective

ทำให้ runtime ทน failure ได้โดยไม่สร้าง chaos

### Scope

* classify retriable vs non-retriable failures
* worker retry policy
* step-level failure persistence
* execution failure reason baseline
* manual inspection-friendly logs

### Acceptance Criteria

* failure ถูกจัดประเภทอย่างน้อยในระดับพื้นฐาน
* retriable failures ไม่สร้าง duplicate side effects
* execution failure state อ่านเข้าใจได้
* logs/debugging path ใช้งานได้

---

## T24 — Implement idempotency and locking baseline

### Objective

ป้องกัน step ยิงซ้ำและ execution race condition

### Scope

* execution lock strategy
* step idempotency guard
* de-duplicate resume jobs
* no double-run on concurrent workers

### Acceptance Criteria

* execution เดียวไม่ถูก worker หลายตัวรันชนกัน
* step side effects สำคัญไม่เกิดซ้ำแบบไม่ตั้งใจ
* concurrent trigger/retry path ปลอดภัยระดับ MVP

---

## T25 — Implement flow list/detail/status API endpoints

### Objective

เปิด API ให้ UI จัดการ flow และดูสถานะได้

### Scope

* list flows
* get flow detail
* enable/disable flow
* list flow steps
* list recent executions for flow

### Acceptance Criteria

* flow management path ใช้งานได้
* enable/disable ผ่าน API ได้
* recent executions เรียกดูได้
* tenant-safe ทุก path

---

## T26 — Implement execution history query service

### Objective

ให้ทีม dev/staff/admin ตรวจย้อนหลังได้ว่า flow ทำอะไรไปแล้ว

### Scope

* list executions by flow
* list executions by entity
* filter by status
* sort by created_at/started_at
* include lightweight step progress summary

### Acceptance Criteria

* execution history query ใช้งานได้
* debug flow issues ได้ระดับหนึ่ง
* query tenant-safe
* performance พอใช้สำหรับ MVP

---

## T27 — Implement automation flow list/detail UI

### Objective

ให้มี UI ขั้นต่ำสำหรับดู flows และสถานะการเปิด/ปิด

### Scope

* flow list page
* flow detail page
* status badges
* trigger/step summary
* enable/disable action

### Acceptance Criteria

* clinic เห็น flow ที่มีได้
* เปิด/ปิด flow ได้จาก UI
* flow detail อ่านแล้วเข้าใจว่า flow ทำอะไร
* UI ไม่พยายามเป็น visual builder

---

## T28 — Implement execution history UI

### Objective

ให้ทีมดู execution logs ได้โดยไม่ต้องเปิด DB/logs

### Scope

* execution list on flow detail
* execution status badges
* entity reference
* trigger event display
* started/finished timestamps
* failure state display
* step progress summary แบบ lean

### Acceptance Criteria

* execution history อ่านเข้าใจได้
* flow failures มองเห็นได้
* ใช้งาน debug ระดับ product ได้
* ไม่รกเกินไป

---

## T29 — Implement reminder/task minimal views

### Objective

ให้สิ่งที่ automation สร้างขึ้น “มองเห็นได้” และใช้งานได้

### Scope

* task list view ขั้นต่ำ
* reminder list view ขั้นต่ำ
* due/overdue state display
* basic filters by status/due

### Acceptance Criteria

* task/reminder ที่เกิดจาก flow มองเห็นได้
* due items แยกได้
* assigned user / entity reference เห็นได้
* ใช้งานเดโมได้จริง

---

## T30 — Implement standardized automation API response contracts

### Objective

ให้ frontend/backend ใช้ shape เดียวกันใน automation domain

### Scope

กำหนด response shape สำหรับ:

* flow list item
* flow detail
* step item
* execution item
* task item
* reminder item
* enable/disable action response
* execution failure summary

### Acceptance Criteria

* contracts ใช้จริงใน endpoints หลัก
* naming สม่ำเสมอ
* frontend mapping ไม่ต้องเดาหลายแบบ

---

## T31 — Add automation activity event hooks baseline

### Objective

วาง event model สำหรับ Sprint 5 และ Sprint 8

### Scope

ยิง event ขั้นต่ำเมื่อเกิด:

* flow.created / updated / enabled / disabled
* execution.created
* execution.started
* execution.waiting
* execution.completed
* execution.failed
* task.created
* reminder.created

### Acceptance Criteria

* action สำคัญมี event hook
* payload พอใช้ต่อ analytics/audit
* clinic/entity/execution identity ชัด

---

## T32 — Add API and integration tests for automation runtime

### Objective

พิสูจน์ว่า engine ทำงานจริงและไม่รั่ว

### Scope

ทดสอบอย่างน้อย:

* event creates execution for active flow
* disabled flow does not execute
* wait step pauses and resumes
* send_message step produces outbound log
* create_task/create_reminder works
* duplicate trigger does not create duplicate side effects
* cross-clinic flow/entity mismatch rejected

### Acceptance Criteria

* tests ผ่าน
* trigger/runtime/tenant paths ครอบคลุม
* idempotency baseline ถูกครอบคลุมระดับหนึ่ง

---

## T33 — Add worker sandbox / deterministic test harness

### Objective

ทำให้ทีมทดสอบ runtime ได้แบบควบคุมได้

### Scope

* test harness สำหรับ worker jobs
* deterministic clock/time control ถ้าเป็นไปได้
* fake delayed scheduling path
* simulation helpers for step outcomes

### Acceptance Criteria

* wait/resume tests ทำได้เสถียร
* step runner tests ไม่ flaky
* local dev debug runtime ได้ง่ายขึ้น

---

## T34 — Add query/index review for execution, task, and reminder paths

### Objective

กัน runtime และ execution history ช้าเกินไป

### Scope

* review indexes
* review matching query paths
* inspect execution history / due task queries
* tune lookup paths ให้เหมาะกับ MVP

### Acceptance Criteria

* runtime queries ไม่ช้าผิดปกติ
* due task/reminder queries พอใช้ได้
* execution list/history พอใช้ได้
* indexes สำคัญถูกสร้างแล้ว

---

## T35 — Add basic audit/log hooks for automation mutations

### Objective

วางนิสัย traceability สำหรับ automation domain

### Scope

บันทึก log ขั้นต่ำสำหรับ:

* flow.enable/disable
* step definition updates
* execution.start/complete/fail
* task.create
* reminder.create

### Acceptance Criteria

* action สำคัญ trace ได้ระดับหนึ่ง
* execution failures อ่านย้อนหลังได้
* พร้อมต่อยอดเข้า PR-08

---

## T36 — Sprint 4 automation review & schema freeze note

### Objective

สรุปสิ่งที่ build แล้วและล็อก handoff ไป Sprint 5

### Scope

สรุป:

* final automation schema
* execution state model
* idempotency strategy
* worker/retry behavior
* step types ที่รองรับจริง
* known limitations
* assumptions สำหรับ MVP flow pack ใน Sprint 5

### Acceptance Criteria

* มี handoff note สั้น ใช้งานจริง
* ทีมรู้ว่าของไหน lock แล้ว
* MVP flow pack สามารถ build ต่อได้โดยไม่ย้อนมารื้อ engine

---

# Dependencies ระหว่าง Ticket

## กลุ่มต้นน้ำ

* **T1** มาก่อน T2, T3, T4, T5, T7, T14, T23, T24
* **T2 + T3 + T4 + T5** มาก่อน T6, T8, T9, T10, T25, T26, T32, T34
* **T7** มาก่อน T11, T12, T31
* **T30** ควรทำก่อนหรือคู่ขนานกับ T25, T26, T27, T28, T29

## กลุ่มกลาง

* **T8 + T9** มาก่อน T11, T22, T25, T27
* **T10** มาก่อน T12, T22, T23, T24, T26
* **T13** มาก่อน T15, T22, T23, T24, T33
* **T14** มาก่อน T15–T21 และ T22
* **T16–T21** มาก่อน T22
* **T22** มาก่อน T26, T28, T32
* **T31** ควรตามหลัง runtime หลักเริ่มนิ่ง

## กลุ่มปลาย

* **T32, T33, T34, T35, T36** เป็น hardening / closing tickets

---

# Suggested Execution Order

## Phase A — Model Lock

1. T1 Freeze canonical automation domain model

## Phase B — Data Foundation

2. T2 Migration for automation_flows
3. T3 Migration for automation_steps
4. T4 Migration for automation_executions
5. T5 Migrations for automation_tasks and reminders
6. T6 Seed sample predefined flows

## Phase C — Domain Core

7. T7 Internal event contract and dispatcher
8. T8 Flow repository/service
9. T9 Step repository/service
10. T10 Execution repository/service
11. T11 Trigger evaluation service
12. T12 Execution creation and deduplication
13. T13 Worker foundation
14. T14 Step runner contract
15. T30 Standardized automation response contracts

## Phase D — Step Handlers

16. T15 Wait step handler
17. T16 Send_message step handler
18. T17 Create_task step handler
19. T18 Create_reminder step handler
20. T19 Add/remove_tag handlers
21. T20 Change_stage handler
22. T21 Notify_user handler baseline

## Phase E — Runtime Orchestration

23. T22 Execution runner orchestration
24. T23 Failure handling and retry baseline
25. T24 Idempotency and locking baseline
26. T31 Automation activity event hooks

## Phase F — API / UI

27. T25 Flow list/detail/status APIs
28. T26 Execution history query service
29. T27 Automation flow list/detail UI
30. T28 Execution history UI
31. T29 Reminder/task minimal views

## Phase G — Hardening

32. T33 Worker sandbox / deterministic test harness
33. T32 API and integration tests
34. T34 Query/index review
35. T35 Basic audit/log hooks
36. T36 Automation review & schema freeze

---

# Suggested Ticket Sizing

## S (เล็ก)

* T1
* T6
* T21
* T30
* T31
* T34
* T36

## M (กลาง)

* T7
* T8
* T9
* T10
* T11
* T15
* T17
* T18
* T19
* T20
* T23
* T25
* T26
* T27
* T28
* T29
* T35

## L (ใหญ่)

* T2
* T3
* T4
* T5
* T12
* T13
* T14
* T16
* T22
* T24
* T32
* T33

---

# Sprint 4 Acceptance Criteria รวม

Sprint 4 ถือว่าเสร็จเมื่อครบทั้งหมดนี้

## Functional

* event trigger สร้าง execution ได้
* flow ที่ active เท่านั้นที่รัน
* step รันตามลำดับได้
* wait step หยุดและ resume ได้
* send_message/create_task/create_reminder ทำงานได้
* add/remove_tag และ change_stage ใช้งานได้

## Product

* มี flow list/detail UI ขั้นต่ำ
* เปิด/ปิด flow ได้
* ดู execution history ได้
* เห็น task/reminder ที่ automation สร้างได้

## Technical

* execution state machine เสถียร
* worker foundation ใช้งานได้
* idempotency baseline ใช้งานได้
* response contracts ชัด
* event hooks พร้อมสำหรับ Sprint 5/8

## Safety

* duplicate trigger ไม่สร้าง side effects ซ้ำโดยไม่ตั้งใจ
* cross-clinic flow/entity usage ถูก reject
* execution failure trace ได้
* worker restart ไม่ทำให้ runtime พังง่าย

## Handoff Readiness

* Sprint 5 สามารถเอา predefined flows 8 ตัวมาลงได้ทันที
* marketing/task/reminder outcomes ถูก surface ได้
* engine ไม่ต้องย้อนมารื้อครั้งใหญ่ก่อน productization

---

# Suggested backlog labels

* `sprint-4`
* `pr-04`
* `automation`
* `worker`
* `runtime`
* `eventing`
* `frontend`
* `backend`
* `tenant`
* `test`
* `hardening`

---

# Recommended owner split ถ้าทีมมี 3 คน

## Backend Engineer

* T2, T3, T4, T5, T7, T8, T9, T10, T11, T12, T13, T14, T15, T16, T17, T18, T19, T20, T21, T22, T23, T24, T31, T32, T33, T34, T35

## Frontend Engineer

* T27, T28, T29

## Tech Lead / Fullstack

* T1, T6, T25, T26, T30, T36
* review state model
* review idempotency/locking
* review event contract and runtime boundaries

---

# ตัวอย่างชื่อ ticket พร้อมใช้

* `[Sprint 4][PR-04] Freeze canonical automation domain model`
* `[Sprint 4][PR-04] Create migrations for automation flows steps executions tasks and reminders`
* `[Sprint 4][PR-04] Implement internal event dispatcher baseline`
* `[Sprint 4][PR-04] Implement execution creation and deduplication strategy`
* `[Sprint 4][PR-04] Implement step runner contract and core step handlers`
* `[Sprint 4][PR-04] Implement execution runner orchestration service`
* `[Sprint 4][PR-04] Build automation flow list and execution history screens`
* `[Sprint 4][PR-04] Add integration tests for automation runtime idempotency and tenant safety`

---

# ข้อควรระวังของ Sprint 4

Sprint นี้เสี่ยงที่สุดทางเทคนิคใน MVP

## ห้ามเผลอเพิ่ม

* visual flow builder
* branching engine ซับซ้อน
* custom scripting
* generic workflow DSL
* omnichannel orchestration
* AI-generated flow logic

## ต้องโฟกัสแค่

* engine รันได้จริง
* side effects เชื่อถือได้
* trace ได้
* debug ได้
* พร้อมให้ Sprint 5 productize

---

# สรุปตรงที่สุด

Sprint 4 มีหน้าที่สร้าง **automation backbone ที่เชื่อถือได้**
และต้องจบด้วยสถานะนี้:

* event เข้าแล้ว flow รันได้
* flow หยุด/รอ/ทำต่อได้
* task/reminder/message ออกได้
* ทีมตรวจย้อนหลัง execution ได้
* Sprint 5 สามารถเอา 8 MVP flows มาลงเป็น product ได้ทันที

