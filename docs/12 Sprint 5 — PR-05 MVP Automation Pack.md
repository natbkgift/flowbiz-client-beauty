# Sprint 5 — PR-05 MVP Automation Pack

## Sprint Goal

ส่งมอบ **MVP Automation Pack** ที่รองรับ flow สำเร็จรูป 8 ตัว:

1. New Lead Welcome
2. Uncontacted Lead Alert
3. Lead Qualification Nurture
4. Consult Reminder Flow
5. No-Show Recovery
6. Review Request
7. Botox Cycle Reminder
8. Daily Marketing Reminder

โดยต้องทำให้ clinic:

* เปิด/ปิด flow ได้
* ตั้งค่า baseline ได้
* ใช้งานจริงได้
* เห็น task/reminder/outbound action ที่เกิดจาก flow ได้
* เดโมเชิงธุรกิจได้ชัด

---

# Epic: MVP Automation Pack

---

## T1 — Freeze canonical preset flow specifications

### Objective

ล็อกสเปก flow ทั้ง 8 ตัวก่อนลง config, seeds, และ UI เพื่อไม่ให้ logic drift

### Scope

กำหนดสเปกมาตรฐานของแต่ละ flow:

* trigger
* entry condition
* default steps
* default delays
* required templates
* optional suppressions
* expected business outcome
* per-clinic configurable fields

### Deliverables

* preset spec doc 1 ฉบับ
* flow IDs/names ที่ canonical
* trigger mapping ของทั้ง 8 flows
* default template mapping

### Acceptance Criteria

* ทีมเห็นตรงกันว่าแต่ละ flow ทำอะไร
* ระบุชัดว่าจุดไหน configurable
* ระบุชัดว่าจุดไหน fixed by product
* ไม่มี flow ไหนหลุดไปเป็น custom workflow builder

---

## T2 — Define preset configuration schema per flow

### Objective

สร้าง config contract ที่ lean และใช้งานได้จริงต่อ clinic

### Scope

กำหนด config schema สำหรับแต่ละ flow เช่น:

* enabled
* assigned_user_id / assigned_role
* delay settings
* template IDs
* cooldown windows
* quiet hours
* review wait days
* cycle reminder days

### Acceptance Criteria

* config schema ไม่เยอะเกินจำเป็น
* ใช้กับทั้ง backend/frontend ได้
* validation rules ชัด
* flow แต่ละตัวมี config เฉพาะที่จำเป็นจริง

---

## T3 — Implement preset flow seed generator

### Objective

ให้ clinic ใหม่หรือ environment ใหม่มี flow pack พร้อมใช้งานทันที

### Scope

* seed predefined flows 8 ตัว
* seed steps ต่อ flow
* seed default config placeholders
* version preset definitions
* support idempotent reseed/update strategy ตาม policy

### Acceptance Criteria

* clinic สามารถมี flow pack เริ่มต้นได้
* seed ซ้ำไม่สร้างของซ้อนมั่ว
* versioning ของ preset ชัด
* default steps ตรงตาม preset spec

---

## T4 — Implement preset flow activation service

### Objective

ทำ service กลางสำหรับเปิด/ปิด preset ต่อ clinic

### Scope

* activate preset flow
* deactivate preset flow
* reset to default config
* read activation state
* enforce preset ownership and version compatibility

### Acceptance Criteria

* clinic เปิด/ปิด flow ได้
* disabled flow ไม่สร้าง execution ใหม่
* reset config ได้ตาม policy
* tenant-safe

---

## T5 — Implement flow configuration service for clinic-specific settings

### Objective

ให้แต่ละ clinic ปรับ baseline flow ได้โดยไม่แตะ step engine โดยตรง

### Scope

* update preset config
* validate config fields
* read effective config
* merge defaults + clinic override
* config change audit hook baseline

### Acceptance Criteria

* clinic ปรับค่า config หลักได้
* invalid config ถูก reject
* effective config ถูก resolve ชัด
* update config ไม่ทำให้ flow schema พัง

---

## T6 — Implement template dependency resolver for preset flows

### Objective

ทำให้แต่ละ flow หา template ที่ต้องใช้ได้อย่างชัดเจน

### Scope

* map preset step → required template category/id
* validate template availability
* fallback strategy ตาม policy
* clinic-specific template override support

### Acceptance Criteria

* flow ที่ต้องส่งข้อความรู้ว่าจะใช้ template ไหน
* ถ้า template ขาด ระบบแจ้งชัด
* override ต่อ clinic ได้ตาม policy
* ไม่ต้อง hardcode กระจัดกระจายตามหลาย layer

---

## T7 — Implement suppression and cooldown policy baseline

### Objective

กัน flow ยิงข้อความหรือสร้าง action ซ้ำมากเกินไป

### Scope

* define cooldown logic by flow/entity
* quiet hours baseline
* suppression check before message-related steps
* daily summary dedupe baseline
* review request repeat suppression

### Acceptance Criteria

* flow สำคัญไม่ spam
* quiet hours ถูกเคารพตาม config
* review request ไม่ยิงซ้ำถี่เกิน
* duplicate reminder/message ถูกคุมระดับ MVP

---

## T8 — Implement New Lead Welcome preset flow runtime mapping

### Objective

ทำ flow #1 ให้เป็น productized preset

### Scope

* trigger: lead.created
* default steps:

  * send welcome message
  * add baseline tag if needed
  * create follow-up reminder/task ตาม preset
* config support:

  * template
  * delay
  * assigned role/user

### Acceptance Criteria

* lead ใหม่ trigger flow ได้
* welcome message ถูกส่งตาม config
* reminder/task ถูกสร้างตาม preset
* flow นี้เปิด/ปิดได้ราย clinic

---

## T9 — Implement Uncontacted Lead Alert preset flow runtime mapping

### Objective

ทำ flow #2 ให้ช่วยกัน lead ตกหล่นจริง

### Scope

* trigger: lead.created + no outbound within threshold
* default steps:

  * create task
  * notify manager/owner ตาม config
* config support:

  * SLA threshold
  * assigned role/user
  * notify path

### Acceptance Criteria

* lead ที่ไม่มีการติดต่อในเวลาที่กำหนดถูกตรวจเจอ
* task/alert ถูกสร้างจริง
* lead ที่ถูกติดต่อแล้วไม่ถูกยิงผิด
* flow นี้ช่วยทีมเห็น lead ตกหล่นได้

---

## T10 — Implement Lead Qualification Nurture preset flow runtime mapping

### Objective

ทำ flow #3 ให้ nurture lead อัตโนมัติแบบเป็น sequence

### Scope

* trigger: lead.stage = inquiry หรือ lead created ตาม policy ที่ล็อก
* default steps:

  * intro message
  * educational follow-up
  * proof/review message
  * consult CTA
* config support:

  * delays
  * templates
  * cooldown/stop conditions

### Acceptance Criteria

* sequence รันตามลำดับได้
* wait steps ทำงานได้
* ถ้า lead ตอบหรือ stage เปลี่ยนจนไม่เข้าเงื่อนไข ต้องหยุดหรือ suppress ตาม policy
* ใช้ messaging foundation ได้จริง

---

## T11 — Implement Consult Reminder preset flow runtime mapping

### Objective

ทำ flow #4 ให้ลด no-show ก่อน consult

### Scope

* trigger: consult booked
* default steps:

  * confirmation
  * reminder T-1 day
  * reminder T-3 hours หรือ equivalent ตาม product policy
* config support:

  * reminder timings
  * templates
  * suppression on cancelled/rescheduled

### Acceptance Criteria

* consult booking trigger flow ได้
* reminder schedule ตรงตาม preset
* ถ้าสถานะเปลี่ยนเป็นยกเลิก/ย้ายเวลา ต้องไม่ยิงผิด
* clinic ปรับเวลาพื้นฐานได้

---

## T12 — Implement No-Show Recovery preset flow runtime mapping

### Objective

ทำ flow #5 ให้ recovery คนที่ไม่มานัดได้

### Scope

* trigger: lead/appointment marked no_show
* default steps:

  * send rebooking message
  * create staff task
  * optional second follow-up after delay
* config support:

  * delays
  * templates
  * assigned role/user

### Acceptance Criteria

* no-show trigger flow ได้
* rebooking action เกิดขึ้นจริง
* task ถูกสร้างจริง
* cooldown/suppression ป้องกันการยิงซ้ำเกินจำเป็น

---

## T13 — Implement Review Request preset flow runtime mapping

### Objective

ทำ flow #6 ให้ขอรีวิวเป็นระบบ

### Scope

* trigger: treatment completed + wait period
* default steps:

  * review request message
  * optional gentle reminder
* config support:

  * wait days before request
  * templates
  * reminder toggle

### Acceptance Criteria

* treatment completion trigger flow ได้
* review request ถูกส่งตาม wait period
* reminder รอบสองทำงานตาม config
* suppression กันยิงรีวิวซ้ำได้

---

## T14 — Implement Botox Cycle Reminder preset flow runtime mapping

### Objective

ทำ flow #7 ให้ดึงลูกค้า Botox กลับมาตามรอบ

### Scope

* trigger: customer treatment cycle due
* default steps:

  * send reminder
  * optional create sales task
* config support:

  * cycle days override
  * templates
  * assigned role/user

### Acceptance Criteria

* customer ที่ถึงรอบถูกตรวจเจอ
* reminder ถูกส่งจริง
* optional sales task ถูกสร้างได้
* flow ใช้ customer/treatment data ถูกต้อง

### Note

ticket นี้ต้อง design ให้ไม่ล็อกจนใช้กับ repeat flow อื่นต่อไม่ได้ในอนาคต แต่ยังไม่ generalize มากเกินจำเป็น

---

## T15 — Implement Daily Marketing Reminder preset flow runtime mapping

### Objective

ทำ flow #8 ให้ระบบสรุปสิ่งที่ทีมควรทำทุกวัน

### Scope

* trigger: daily scheduled run
* summary content อย่างน้อย:

  * leads overdue follow-up
  * uncontacted leads
  * due reminders/tasks
  * cycle due customers
  * optional campaign actions placeholder
* output path:

  * internal dashboard widget
  * internal task/notification artifact
  * optional message summary ถ้านโยบายอนุญาต

### Acceptance Criteria

* summary สร้างได้ทุกวัน
* เนื้อหา actionable
* ไม่เป็น noisy dump
* clinic เห็นงานที่ต้องทำจริง

---

## T16 — Implement stop-condition and execution suppression rules per preset

### Objective

ทำให้ preset flows หยุดอย่างถูกจังหวะเมื่อบริบทธุรกิจเปลี่ยน

### Scope

อย่างน้อยรองรับ:

* lead already contacted
* stage changed beyond applicable state
* consult cancelled
* treatment already reviewed
* entity archived/lost
* duplicate pending execution of same preset

### Acceptance Criteria

* flow หยุดเมื่อไม่ควรไปต่อ
* ไม่สร้าง side effects ที่ขัดกับสถานะล่าสุด
* suppression logic อธิบายได้และ debug ได้

---

## T17 — Implement clinic onboarding helper for preset automation pack

### Objective

ทำให้เปิดใช้งาน flow pack สำหรับ clinic ใหม่ได้ง่าย

### Scope

* initialize preset pack for clinic
* seed default templates mapping placeholders
* detect missing dependencies
* return readiness state:

  * ready
  * needs templates
  * needs channel
  * partially configured

### Acceptance Criteria

* clinic ใหม่ onboard flow pack ได้
* readiness state ชัด
* ข้อขาดเหลือถูกบอกชัด
* ลดงาน manual ของทีม setup

---

## T18 — Implement flow readiness and dependency status service

### Objective

บอกให้ clinic รู้ว่า flow ไหนพร้อมใช้งานจริงหรือยัง

### Scope

ตรวจอย่างน้อย:

* has active channel
* has required templates
* has required identities/data source assumptions
* has mandatory config fields
* has event source support

### Acceptance Criteria

* flow แต่ละตัวมี readiness state
* ข้อขาดเหลือมองเห็นได้ชัด
* clinic เปิด flow แบบงง ๆ ไม่ได้โดยไม่มีคำเตือน

---

## T19 — Implement preset configuration APIs

### Objective

เปิด API สำหรับ frontend จัดการ activation/config/readiness ของ flow pack

### Scope

* list presets
* get preset detail
* activate/deactivate preset
* update config
* get readiness state
* reset config to default

### Acceptance Criteria

* frontend ใช้งานได้ครบสำหรับ preset management
* tenant-safe
* response contracts ชัด
* invalid config/readiness states สื่อสารชัด

---

## T20 — Implement preset execution summary query service

### Objective

ให้ UI และ daily summary ดึงข้อมูลผลลัพธ์ของ preset ได้

### Scope

* executions by preset
* success/failure counts
* last run time
* due tasks/reminders created
* recent outcomes by clinic

### Acceptance Criteria

* query summary ใช้งานได้
* preset-level visibility ชัด
* รองรับ UI summary card/list ได้
* performance พอใช้ระดับ MVP

---

## T21 — Implement flow pack list and activation UI

### Objective

ให้ clinic เปิด/ปิด flow สำเร็จรูปได้ง่าย

### Scope

* preset list page/section
* status badge
* readiness badge
* activate/deactivate actions
* last run / recent activity summary

### Acceptance Criteria

* clinic เห็น flow 8 ตัวครบ
* เปิด/ปิดได้จาก UI
* readiness และ missing dependencies เห็นได้ชัด
* UI ไม่พยายามเป็น builder

---

## T22 — Implement preset configuration UI

### Objective

ให้ clinic ปรับค่า flow พื้นฐานได้โดยไม่สับสน

### Scope

รองรับการแก้ config หลัก เช่น:

* template
* delays
* assigned role/user
* review wait days
* cycle days
* quiet hours / cooldown if included in product surface

### Acceptance Criteria

* clinic ปรับค่าที่จำเป็นได้
* UI ไม่รกเกิน
* validation errors แสดงชัด
* reset to default ทำงานได้

---

## T23 — Implement flow readiness and setup guidance UI

### Objective

ลด friction ตอนเปิดใช้ flow

### Scope

* show missing channel/template/config items
* inline setup guidance
* CTA ไปยังหน้า template/channel ที่เกี่ยวข้อง
* readiness state explanation

### Acceptance Criteria

* clinic รู้ว่าทำไม flow ยังไม่พร้อม
* มีทางแก้ต่อชัด
* ลด support burden ตอน onboarding

---

## T24 — Implement daily marketing summary UI widget

### Objective

ทำให้ผลลัพธ์ของ flow #8 ใช้งานได้จริงใน dashboard/work area

### Scope

* daily summary card/widget
* actionable sections
* click-through ไป leads/tasks/customers ที่เกี่ยวข้อง
* stale summary handling

### Acceptance Criteria

* summary อ่านแล้วรู้ว่าต้องทำอะไร
* action links ใช้งานได้
* ไม่แสดงข้อมูลฟุ่มเฟือย
* รองรับ use ใน demo ได้ดี

---

## T25 — Implement task/reminder surfacing improvements for preset outcomes

### Objective

ทำให้ output ของ flow pack ถูกมองเห็นและนำไปใช้จริง

### Scope

* preset source badge บน task/reminder
* entity reference clarity
* due/overdue emphasis
* recent preset-created activity list

### Acceptance Criteria

* staff รู้ว่า task/reminder มาจาก flow ไหน
* ใช้งาน operationally ได้จริง
* ลดความสับสนระหว่างงาน manual กับ automation

---

## T26 — Implement standardized preset flow API response contracts

### Objective

ให้ frontend/backend ใช้ shape เดียวกันใน MVP Automation Pack domain

### Scope

กำหนด response shape สำหรับ:

* preset list item
* preset detail
* readiness state
* config payload
* activation result
* summary item
* missing dependency item

### Acceptance Criteria

* contracts ใช้จริงใน endpoints หลัก
* naming สม่ำเสมอ
* frontend mapping ไม่ต้องเดาหลายแบบ

---

## T27 — Add preset-specific activity event hooks baseline

### Objective

วาง event model ที่สะท้อน productized preset outcomes

### Scope

ยิง event ขั้นต่ำเมื่อเกิด:

* preset.activated
* preset.deactivated
* preset.config_updated
* preset.readiness_changed
* preset.execution_completed
* preset.execution_failed
* daily_summary.generated

### Acceptance Criteria

* productized flow events มีให้ใช้ต่อ analytics/audit
* clinic/preset/execution identity ชัด
* event names ไม่ชนมั่วกับ engine ชั้นล่าง

---

## T28 — Add API and integration tests for 8 preset flows

### Objective

พิสูจน์ว่า flow pack ทำงานจริงใน use case ธุรกิจ

### Scope

อย่างน้อยทดสอบ:

* New Lead Welcome triggers and sends expected actions
* Uncontacted Lead Alert creates task after threshold
* Lead Qualification Nurture respects wait steps and stop conditions
* Consult Reminder stops on cancellation/reschedule policy
* No-Show Recovery creates rebooking action
* Review Request respects waiting period and suppression
* Botox Cycle Reminder uses due cycle correctly
* Daily Marketing Reminder generates actionable summary

### Acceptance Criteria

* critical business paths ครอบคลุม
* stop/suppression paths ครอบคลุมพอใช้
* preset executions ไม่หลุดข้าม clinic
* side effects ตรงตาม preset spec

---

## T29 — Add clinic configuration and readiness edge-case tests

### Objective

กัน regression ด้าน setup/onboarding

### Scope

ทดสอบอย่างน้อย:

* missing channel → readiness not ready
* missing template → readiness warning/block ตาม policy
* invalid config rejected
* disabled preset produces no new executions
* reset config restores defaults
* clinic override does not mutate preset base definition

### Acceptance Criteria

* setup edge cases ครอบคลุม
* readiness model น่าเชื่อถือ
* config isolation ต่อ clinic ชัด

---

## T30 — Add query/index review for preset list, readiness, and daily summary paths

### Objective

กันหน้า preset management และ summary ช้าเกิน

### Scope

* review preset list queries
* review readiness dependency queries
* review daily summary aggregation path
* tune indexes/joins ให้เหมาะกับ MVP

### Acceptance Criteria

* preset list/recent summary ใช้งานได้ลื่นพอ
* readiness checks ไม่แพงเกินจำเป็น
* daily summary path พอใช้ได้จริง

---

## T31 — Add basic audit/log hooks for preset management actions

### Objective

วาง traceability สำหรับ product actions ที่ owner/manager จะถามหา

### Scope

บันทึก log ขั้นต่ำสำหรับ:

* preset.activate/deactivate
* preset.config.update
* reset to default
* readiness critical failure detected
* preset execution high-level outcome

### Acceptance Criteria

* action สำคัญ trace ได้
* พร้อมต่อยอดเข้า PR-08
* debug setup issues ได้ระดับหนึ่ง

---

## T32 — Create demo data and guided demo scenario for MVP Automation Pack

### Objective

ทำให้ Sprint 5 เดโมขายได้ทันที ไม่ใช่แค่ test ผ่าน

### Scope

สร้าง demo fixtures/scenarios สำหรับ:

* new lead enters
* lead not followed
* consult booked then reminded
* no-show then recovered
* treatment completed then review request
* botox customer due
* daily summary generated

### Acceptance Criteria

* demo path รันได้บน staging/dev
* scenario สะท้อน business value ชัด
* ทีม sales/product ใช้เดโมได้จริง

---

## T33 — Sprint 5 preset pack review & schema freeze note

### Objective

สรุปสิ่งที่ build แล้วและล็อก handoff ไป Sprint 6

### Scope

สรุป:

* final preset specs
* config model
* readiness model
* suppression rules
* known limitations
* assumptions สำหรับ customer/repeat revenue layer ใน Sprint 6

### Acceptance Criteria

* มี handoff note สั้น ใช้งานจริง
* ทีมรู้ว่าของไหน lock แล้ว
* Sprint 6 ต่อเรื่อง repeat revenue ได้โดยไม่ย้อนมารื้อ preset pack

---

# Dependencies ระหว่าง Ticket

## กลุ่มต้นน้ำ

* **T1** มาก่อน T2, T3, T6, T7, T16, T28
* **T2** มาก่อน T5, T19, T22, T29
* **T3** มาก่อน T4, T17
* **T4 + T5** มาก่อน T19, T21, T22, T31
* **T6** มาก่อน T8–T15

## กลุ่มกลาง

* **T7** มาก่อน T8, T10, T11, T12, T13, T14
* **T8–T15** มาก่อน T20, T24, T28, T32
* **T16** มาก่อน T10–T15 และ T28
* **T17 + T18** มาก่อน T21, T22, T23, T29
* **T26** ควรทำก่อนหรือคู่ขนานกับ T19–T25

## กลุ่มปลาย

* **T27, T28, T29, T30, T31, T32, T33** เป็น hardening / closing tickets

---

# Suggested Execution Order

## Phase A — Product Spec Lock

1. T1 Freeze canonical preset flow specifications
2. T2 Define preset configuration schema per flow

## Phase B — Preset Foundation

3. T3 Preset flow seed generator
4. T4 Preset flow activation service
5. T5 Flow configuration service
6. T6 Template dependency resolver
7. T7 Suppression and cooldown policy baseline

## Phase C — Runtime Mapping for 8 Flows

8. T8 New Lead Welcome
9. T9 Uncontacted Lead Alert
10. T10 Lead Qualification Nurture
11. T11 Consult Reminder
12. T12 No-Show Recovery
13. T13 Review Request
14. T14 Botox Cycle Reminder
15. T15 Daily Marketing Reminder
16. T16 Stop-condition and suppression rules per preset

## Phase D — Onboarding / Readiness

17. T17 Clinic onboarding helper
18. T18 Flow readiness and dependency status service
19. T26 Standardized preset flow response contracts
20. T19 Preset configuration APIs

## Phase E — Frontend Productization

21. T20 Preset execution summary query service
22. T21 Flow pack list and activation UI
23. T22 Preset configuration UI
24. T23 Flow readiness and setup guidance UI
25. T24 Daily marketing summary widget
26. T25 Task/reminder surfacing improvements

## Phase F — Hardening / Demo

27. T27 Preset-specific activity event hooks
28. T28 Preset flow integration tests
29. T29 Readiness edge-case tests
30. T30 Query/index review
31. T31 Basic audit/log hooks
32. T32 Demo data and guided demo scenario
33. T33 Sprint review & schema freeze

---

# Suggested Ticket Sizing

## S (เล็ก)

* T1
* T2
* T7
* T16
* T26
* T27
* T30
* T33

## M (กลาง)

* T4
* T5
* T6
* T8
* T9
* T11
* T12
* T13
* T14
* T15
* T17
* T18
* T19
* T20
* T21
* T22
* T23
* T24
* T25
* T29
* T31
* T32

## L (ใหญ่)

* T3
* T10
* T28

---

# Sprint 5 Acceptance Criteria รวม

Sprint 5 ถือว่าเสร็จเมื่อครบทั้งหมดนี้

## Functional

* flow สำเร็จรูป 8 ตัวเปิดใช้ได้จริง
* activate/deactivate ราย clinic ได้
* config พื้นฐานต่อ flow ใช้งานได้
* readiness state บอกได้ว่าพร้อมหรือยัง
* daily marketing summary สร้างได้
* task/reminder/outbound actions จาก flow มองเห็นได้

## Product

* clinic เข้าใจว่าแต่ละ flow ช่วยอะไร
* setup flow pack ได้โดยไม่ต้องแก้ DB/manual ลึก
* owner/manager เห็นคุณค่าทางธุรกิจจาก UI ได้
* staff เห็นสิ่งที่ต้องทำจริงจาก output ของ flows

## Technical

* preset pack ไม่ทำให้ engine generic เกินจำเป็น
* config merge/default model เสถียร
* suppression/cooldown baseline ใช้งานได้
* response contracts ชัด
* event hooks พร้อมสำหรับ analytics/audit

## Safety

* clinic ข้ามกันใช้ preset config ไม่ได้
* missing dependencies ถูกเตือนชัด
* disabled preset ไม่สร้าง execution ใหม่
* stop conditions ลด side effects ที่ไม่ควรเกิด

## Handoff Readiness

* Sprint 6 ต่อ customer/repeat revenue layer ได้ทันที
* flow #7 Botox Cycle Reminder พร้อมใช้ customer/treatment layer แบบจริง
* product demo ขายได้ตั้งแต่จบ Sprint 5

---

# Suggested backlog labels

* `sprint-5`
* `pr-05`
* `automation-pack`
* `preset-flows`
* `productization`
* `frontend`
* `backend`
* `tenant`
* `test`
* `hardening`

---

# Recommended owner split ถ้าทีมมี 3 คน

## Backend Engineer

* T3, T4, T5, T6, T7, T8, T9, T10, T11, T12, T13, T14, T15, T16, T17, T18, T19, T20, T27, T28, T29, T30, T31

## Frontend Engineer

* T21, T22, T23, T24, T25

## Tech Lead / Fullstack

* T1, T2, T26, T32, T33
* review preset specs
* review suppression/readiness logic
* review product UI clarity for demoability

---

# ตัวอย่างชื่อ ticket พร้อมใช้

* `[Sprint 5][PR-05] Freeze canonical preset flow specifications`
* `[Sprint 5][PR-05] Implement preset flow seed generator`
* `[Sprint 5][PR-05] Implement flow activation and clinic-specific configuration service`
* `[Sprint 5][PR-05] Implement runtime mapping for 8 MVP preset flows`
* `[Sprint 5][PR-05] Implement readiness and dependency status service for preset flows`
* `[Sprint 5][PR-05] Build flow pack activation and configuration screens`
* `[Sprint 5][PR-05] Build daily marketing summary widget`
* `[Sprint 5][PR-05] Add integration tests for 8 preset flows`

---

# ข้อควรระวังของ Sprint 5

Sprint นี้เสี่ยงบวมในเชิง product

## ห้ามเผลอเพิ่ม

* custom flow editor
* flow marketplace
* branching visual UX
* omnichannel campaign builder
* AI-generated preset logic
* analytics dashboard ใหญ่
* full onboarding wizard ซับซ้อน

## ต้องโฟกัสแค่

* 8 flows นี้ต้องใช้ได้จริง
* เปิด/ปิดง่าย
* setup ไม่ยาก
* output มองเห็นได้
* เดโมแล้ว “ขายได้”

---

# สรุปตรงที่สุด

Sprint 5 มีหน้าที่เปลี่ยน FlowBiz จาก

* “มี automation engine”
  ไปเป็น
* “มี automation product ที่คลินิกเข้าใจและพร้อมจ่าย”

และต้องจบด้วยสถานะนี้:

* 8 MVP flows ใช้งานได้
* clinic setup ได้
* staff ใช้ได้
* owner เห็นคุณค่า
* ทีมเดโมขายได้ทันที
