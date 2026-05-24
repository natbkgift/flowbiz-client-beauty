# Sprint 7 — PR-06 AI Marketing Suggestion v1

## Sprint Goal

ส่งมอบ **AI Marketing Suggestion v1** ที่รองรับ:

* ช่วยคิดโปรรายเดือน
* ช่วยร่าง broadcast / follow-up copy
* ช่วยสรุปสิ่งที่ทีมควรทำวันนี้
* ช่วยร่างข้อความตาม context ของ lead/customer
* ทุก suggestion ต้อง review / approve / reject / regenerate ได้
* ไม่มี auto-send
* ทุก output trace กลับได้ว่าใช้ context อะไร, prompt เวอร์ชันไหน, model อะไร

---

# Epic: AI Marketing Suggestion v1

---

## T1 — Freeze canonical AI suggestion domain model

### Objective

ล็อก model กลางของ AI suggestion ก่อนลง schema, provider adapter, และ UI

### Scope

กำหนดและล็อก:

* suggestion model
* suggestion types v1
* status model
* approval semantics
* regenerate semantics
* prompt versioning strategy
* context snapshot policy
* usage/cost tracking baseline
* conversion-to-template/draft policy

### Deliverables

* short design note 1 ฉบับ
* enum กลางสำหรับ:

  * `content_suggestions.suggestion_type`
  * `content_suggestions.status`
* canonical generation workflow
* approval workflow policy

### Suggested enums

#### suggestion_type

* promotion
* broadcast_copy
* content_calendar
* followup_copy
* campaign_idea
* daily_summary

#### status

* draft
* generated
* approved
* rejected
* archived

### Acceptance Criteria

* ทีมเห็นตรงกันว่า suggestion แต่ละ type ใช้ทำอะไร
* ระบุชัดว่า AI output ไหนเอาไปใช้ต่อได้
* ระบุชัดว่า regenerate สร้าง record ใหม่หรือ revision ภายใต้ policy ใด
* ระบุชัดว่า approval คือ gate ก่อนใช้งานจริง

---

## T2 — Create database migration for `content_suggestions`

### Objective

สร้างตารางเก็บ AI suggestions และ metadata ที่จำเป็นต่อ auditability

### Scope

สร้าง migration สำหรับ `content_suggestions`

### Suggested fields

* id
* clinic_id
* suggestion_type
* title
* input_context_json
* prompt_version
* content
* status
* approved_by
* approved_at
* created_at
* updated_at

### Recommended additional fields

* model_name
* generation_params_json
* source_refs_json
* rejected_by
* rejected_at
* approval_note
* usage_tokens_input
* usage_tokens_output

### Acceptance Criteria

* migration รันได้
* rollback ได้
* clinic ownership ชัด
* fields สำคัญต่อ traceability มีพร้อม
* indexes ขั้นต่ำพร้อม

### Suggested indexes

* `(clinic_id, suggestion_type, status)`
* `(clinic_id, created_at)`
* `(clinic_id, approved_at)`

---

## T3 — Add seed data for sample AI suggestions

### Objective

ทำให้ทีม dev/test/UI มีข้อมูลลองใช้ทันที

### Scope

เพิ่ม seed สำหรับ:

* promotion suggestions
* broadcast copy suggestions
* follow-up copy suggestions
* daily summary suggestions
* approved / rejected / generated states

### Acceptance Criteria

* seed แล้ว list/detail UI ใช้งานได้
* approval paths ทดสอบได้
* demo AI screens ได้โดยไม่ต้อง generate ทุกครั้ง

---

## T4 — Implement prompt registry and versioning baseline

### Objective

ทำให้ prompt management มีระเบียบและ trace ได้

### Scope

* define prompt registry structure
* assign stable prompt_version identifiers
* map suggestion type → prompt template
* support versioned retrieval
* store prompt metadata baseline

### Acceptance Criteria

* prompt_version ถูก resolve ได้ชัด
* suggestion generation อ้าง prompt version เดียวกันได้
* เปลี่ยน prompt ในอนาคตไม่ทำให้ trace ย้อนหลังหาย
* prompt registry ไม่กระจัดกระจายหลายจุด

---

## T5 — Implement AI provider abstraction and primary LLM adapter

### Objective

แยก domain logic ออกจากผู้ให้บริการ LLM

### Scope

* define LLM provider interface
* implement primary provider adapter 1 ตัว
* normalize request/response
* normalize token usage metadata
* map provider failures → domain errors

### Acceptance Criteria

* domain layer ไม่ผูกกับ provider payload ตรง ๆ
* provider adapter เรียก generate ได้
* token usage ถูกเก็บได้
* error mapping ใช้งานได้จริง

---

## T6 — Implement suggestion repository/service layer

### Objective

สร้าง service กลางของ AI suggestion domain

### Scope

* create suggestion record
* update suggestion status
* get suggestion detail
* list suggestions
* approve suggestion
* reject suggestion
* archive suggestion
* fetch by type/status

### Acceptance Criteria

* CRUD หลักใช้งานได้
* tenant-safe ทุก path
* status transitions ทำงานได้
* approved_by/rejected_by ถูกเก็บถูกต้อง

---

## T7 — Implement context builder baseline for suggestion generation

### Objective

ดึง context ที่เกี่ยวข้องจริงมาให้ AI โดยไม่บวมเกินและไม่มั่วเกิน

### Scope

รองรับ context สำหรับ suggestion types หลัก เช่น:

* clinic profile summary
* recent leads summary
* overdue follow-ups
* cycle-due customers
* active promo/campaign context
* lead/customer-specific context for follow-up copy
* template inventory where relevant

### Acceptance Criteria

* context builder ได้ข้อมูลที่เกี่ยวข้องจริง
* context ถูกจำกัดขนาดอย่างมีวินัย
* context มาจาก clinic เดียวกันเท่านั้น
* shape ของ context คงที่พอให้ prompt ใช้ได้เสถียร

---

## T8 — Implement generation orchestration service

### Objective

เชื่อม context builder + prompt registry + provider adapter + persistence เข้าด้วยกัน

### Scope

* receive generation request
* build context
* resolve prompt version
* invoke provider
* persist suggestion + metadata
* return normalized suggestion result

### Acceptance Criteria

* generate suggestion ได้ end-to-end
* context/prompt/output ถูกเก็บครบ
* generation failures ถูก handle ได้
* response ใช้งานต่อใน UI ได้

---

## T9 — Implement suggestion type: Monthly Promotion Suggestion

### Objective

ทำ AI use case #1 ที่ owner/marketing เห็น value ได้ชัด

### Scope

* build promotion-specific context
* prompt for monthly promo ideas
* output structure เช่น

  * campaign title
  * promo angle
  * target segment
  * suggested CTA
  * optional timing note

### Acceptance Criteria

* generate promo idea ได้
* output ใช้ต่อเชิงธุรกิจได้
* ไม่ generic จนไร้ค่า
* สามารถ approve/reject ได้

---

## T10 — Implement suggestion type: Broadcast Copy Suggestion

### Objective

ทำ AI use case #2 สำหรับร่างข้อความ broadcast หรือ campaign message

### Scope

* build copywriting context
* generate concise message drafts
* support promotion/reminder/reactivation contexts
* output structure for reuse in template draft

### Acceptance Criteria

* broadcast copy ใช้งานได้จริง
* tone เหมาะกับคลินิก
* output สั้น กระชับ และส่งต่อให้ template ได้
* ไม่มี auto-send path

---

## T11 — Implement suggestion type: Follow-up Copy Suggestion

### Objective

ทำ AI use case #3 สำหรับ lead/customer follow-up แบบ contextual

### Scope

* build context from lead/customer record
* include stage/status/treatment relevance
* generate follow-up drafts แบบ short-form
* support lead follow-up และ customer reactivation contexts

### Acceptance Criteria

* follow-up copy สัมพันธ์กับบริบทจริง
* ไม่ generic จนเหมือนส่งสุ่ม
* staff เอาไปใช้ต่อได้จริง
* trace กลับได้ว่าอิง data อะไร

---

## T12 — Implement suggestion type: Daily Marketing Summary

### Objective

ทำ AI use case #4 สำหรับสรุปสิ่งที่ทีมควรทำวันนี้

### Scope

* gather actionable inputs:

  * overdue leads
  * uncontacted leads
  * due reminders/tasks
  * cycle-due customers
  * high-value inactive customers
* generate operational summary แบบ concise
* support dashboard/widget rendering

### Acceptance Criteria

* summary actionable
* ไม่ยาวฟุ่มเฟือย
* ช่วย owner/manager เห็นงานสำคัญของวัน
* ไม่ใช่แค่ทวนข้อมูลดิบ

---

## T13 — Implement regenerate suggestion flow

### Objective

ให้ staff ขอ output ใหม่ได้โดยยัง trace lineage ได้

### Scope

* regenerate from prior suggestion
* preserve parent/previous linkage ตาม policy
* optionally tweak generation params
* store new record with updated metadata

### Acceptance Criteria

* regenerate ใช้งานได้
* lineage ระหว่าง suggestion เดิม/ใหม่ trace ได้
* record เก่าไม่ถูกเขียนทับมั่ว
* status model ยังชัด

---

## T14 — Implement approval and rejection workflow service

### Objective

ทำ human-in-the-loop ให้ชัดและใช้ได้จริง

### Scope

* approve suggestion
* reject suggestion
* optional approval note
* enforce role policy baseline
* prevent invalid status transitions

### Acceptance Criteria

* approved/rejected states เปลี่ยนได้ถูกต้อง
* actor ถูกบันทึก
* rejected suggestions ไม่นำไปใช้ต่อใน approved-only paths
* role restrictions ทำงานได้ตาม baseline

---

## T15 — Implement usage quota and cost guardrail baseline

### Objective

กัน AI cost บวมและกัน misuse

### Scope

* usage tracking per clinic
* per-day / per-period generation cap baseline
* soft/hard limit policy
* token usage persistence
* guardrail errors ที่สื่อสารชัด

### Acceptance Criteria

* clinic ถูกจำกัด usage ได้
* token usage เก็บได้
* เกิน quota แล้วถูก reject หรือ warn ตาม policy
* cost guardrail ใช้งานจริงได้ระดับ MVP

---

## T16 — Implement generation failure handling and retry baseline

### Objective

ทำให้ AI generation ล้มได้อย่างปลอดภัยและ debug ได้

### Scope

* classify provider failures
* retry policy baseline where appropriate
* no duplicate record chaos
* persist failure metadata
* user-friendly error mapping

### Acceptance Criteria

* failure paths handle ได้
* ไม่สร้าง suggestion ซ้ำมั่วจาก retry
* logs/debug path ชัด
* UI รับมือได้

---

## T17 — Implement suggestion list and detail APIs

### Objective

เปิด API ให้ frontend ใช้งาน suggestion domain

### Scope

* list suggestions
* get suggestion detail
* filter by type/status/date
* pagination baseline
* include approval metadata

### Acceptance Criteria

* list/detail ใช้งานได้
* tenant-safe
* response contracts ชัด
* sort/filter พอใช้กับงานจริง

---

## T18 — Implement generate suggestion APIs

### Objective

เปิด API สำหรับสร้าง suggestions ตาม type ต่าง ๆ

### Scope

* generate promotion suggestion
* generate broadcast copy suggestion
* generate follow-up copy suggestion
* generate daily summary suggestion
* validate required inputs/context references

### Acceptance Criteria

* generate APIs ใช้งานได้
* invalid requests ถูก reject ชัด
* result กลับมาพร้อม metadata สำคัญ
* tenant-safe

---

## T19 — Implement approve/reject/regenerate APIs

### Objective

เปิด API ให้ frontend ทำ human review loop ได้ครบ

### Scope

* approve suggestion endpoint
* reject suggestion endpoint
* regenerate suggestion endpoint
* role/permission checks
* normalized response contracts

### Acceptance Criteria

* review actions ใช้งานได้
* invalid status transitions ถูก reject
* actor metadata ถูกบันทึก
* regenerate path เชื่อมกับ generation orchestration ถูกต้อง

---

## T20 — Implement suggestion-to-template draft conversion service

### Objective

ทำให้ AI output ถูกนำไปใช้ต่อจริง ไม่ใช่ค้างอยู่ในหน้าดู

### Scope

* convert approved broadcast/follow-up suggestion → message template draft
* map relevant fields
* preserve source reference linkage
* optional title/category defaults

### Acceptance Criteria

* approved suggestion แปลงเป็น template draft ได้
* unapproved suggestion ถูกกันตาม policy
* trace กลับได้ว่า template draft มาจาก suggestion ไหน
* messaging team ใช้ต่อได้จริง

---

## T21 — Implement suggestion-to-promotion draft conversion baseline

### Objective

ให้ promotion suggestion เอาไปใช้ต่อใน campaign/promo flow ได้

### Scope

* convert approved promotion suggestion → promotion draft or structured payload
* preserve source linkage
* map title/description/segment notes

### Acceptance Criteria

* approved promo suggestion นำไปใช้ต่อได้
* source linkage ชัด
* ไม่ต้องทำ campaign builder เต็มระบบใน sprint นี้

---

## T22 — Implement suggestion list UI

### Objective

ให้ทีมเห็น AI outputs ได้เป็นระบบ

### Scope

* suggestion list page/section
* filters by type/status/date
* status badges
* created/approved metadata
* quick open detail

### Acceptance Criteria

* suggestion list ใช้งานได้จริง
* filter หลักทำงานได้
* UI ไม่รก
* staff หา suggestion ที่ต้อง review ได้ง่าย

---

## T23 — Implement suggestion detail UI

### Objective

ให้ทีมอ่าน, ตรวจ, และตัดสินใจต่อ suggestion ได้

### Scope

แสดง:

* title
* suggestion type
* content
* context summary
* prompt version
* model metadata baseline
* status
* approve/reject/regenerate actions
* convert-to-template/draft actions where applicable

### Acceptance Criteria

* detail screen ใช้งานได้จริง
* context และ trace info เห็นพอสำหรับตัดสินใจ
* actions หลักเข้าถึงง่าย
* ไม่ overload ด้วย technical detail เกินจำเป็น

---

## T24 — Implement generation entry points in product UI

### Objective

ให้ทีมเริ่ม generate suggestion จากจุดที่เหมาะใน product

### Scope

อย่างน้อยรองรับ:

* AI tab/page สำหรับ manual generation
* generate from lead/customer context สำหรับ follow-up copy
* generate from marketing section สำหรับ promo/broadcast
* generate daily summary on demand หรือ scheduled path ที่ surface ได้

### Acceptance Criteria

* user เริ่ม generate ได้จาก UI ที่เข้าใจง่าย
* context-bound generation ใช้งานได้
* UX ไม่ทำให้เข้าใจผิดว่า AI จะส่งเอง

---

## T25 — Implement daily marketing summary AI widget

### Objective

ทำให้ daily summary ใช้ได้จริงในหน้า dashboard/work area

### Scope

* latest daily summary display
* actionable sections
* click-through ไป leads/customers/tasks ที่เกี่ยวข้อง
* stale/generated-at indicator
* regenerate path if policy allows

### Acceptance Criteria

* summary อ่านแล้วรู้ว่าต้องทำอะไร
* action links ใช้งานได้
* stale state เข้าใจง่าย
* widget ใช้ใน demo ได้ดี

---

## T26 — Implement standardized AI suggestion API response contracts

### Objective

ให้ frontend/backend ใช้ shape เดียวกันใน AI domain

### Scope

กำหนด response shape สำหรับ:

* suggestion list item
* suggestion detail
* generate result
* approval result
* rejection result
* regenerate result
* conversion result
* quota error shape

### Acceptance Criteria

* contracts ใช้จริงใน endpoints หลัก
* naming สม่ำเสมอ
* frontend mapping ไม่ต้องเดาหลายแบบ

---

## T27 — Add AI suggestion activity event hooks baseline

### Objective

วาง event model สำหรับ Sprint 8 analytics/audit

### Scope

ยิง event ขั้นต่ำเมื่อเกิด:

* suggestion.generated
* suggestion.approved
* suggestion.rejected
* suggestion.regenerated
* suggestion.converted_to_template
* suggestion.converted_to_promotion_draft
* daily_summary.generated

### Acceptance Criteria

* events สำคัญมีให้ใช้ต่อ
* clinic/suggestion/actor identity ชัด
* event naming ไม่ชนมั่วกับ domain อื่น

---

## T28 — Add API and integration tests for AI suggestion workflow

### Objective

พิสูจน์ว่า AI workflow ทำงานจริงและปลอดภัยพอ

### Scope

ทดสอบอย่างน้อย:

* generate suggestion success path per core type
* context is clinic-scoped
* approve/reject transitions work
* invalid status transitions rejected
* regenerate preserves lineage
* unapproved suggestion cannot convert to approved-only outputs
* quota limits enforced
* provider failure paths handled

### Acceptance Criteria

* critical business paths ครอบคลุม
* tenant-safe generation paths ครอบคลุม
* approval/conversion paths ครอบคลุม
* failure and quota paths ครอบคลุมพอใช้

---

## T29 — Add prompt and context regression fixtures

### Objective

กัน AI output quality drift ระดับ baseline เมื่อ prompt/context เปลี่ยน

### Scope

* fixed sample contexts
* expected output structure checks
* prompt-version test fixtures
* schema/format assertions for generated content

### Acceptance Criteria

* generation output format ไม่ drift มั่ว
* prompt changes ตรวจจับผลกระทบได้ระดับหนึ่ง
* fixtures ใช้งานได้ใน CI/local อย่างน้อยบางส่วน

---

## T30 — Add query/index review for suggestion list/detail/history paths

### Objective

กันหน้า AI list/detail ช้าเกินและ query ฟุ่มเฟือย

### Scope

* review suggestion list queries
* review detail query shape
* review status/type/date filters
* tune indexes ให้เหมาะกับ MVP

### Acceptance Criteria

* list/detail/filter ใช้งานได้ลื่นพอ
* indexes สำคัญถูกสร้างแล้ว
* query path ไม่ซับซ้อนเกิน

---

## T31 — Add basic audit/log hooks for AI suggestion actions

### Objective

วาง traceability สำหรับ action ที่อ่อนไหวต่อธุรกิจ

### Scope

บันทึก log ขั้นต่ำสำหรับ:

* suggestion.generate
* suggestion.approve
* suggestion.reject
* suggestion.regenerate
* suggestion.convert_to_template
* suggestion.convert_to_promotion_draft
* quota limit hit

### Acceptance Criteria

* action สำคัญ trace ได้
* พร้อมต่อยอดเข้า PR-08
* debug approval/use path ได้

---

## T32 — Create demo data and guided demo scenario for AI Marketing Suggestion

### Objective

ทำให้ Sprint 7 เดโมความต่างของ product ได้ชัด

### Scope

สร้าง demo fixtures/scenarios สำหรับ:

* monthly promotion suggestion
* broadcast copy generation
* lead-specific follow-up copy
* daily marketing summary
* approve → convert to template draft flow

### Acceptance Criteria

* demo path รันได้บน staging/dev
* scenario สะท้อน “AI ช่วยคิด” ได้ชัด
* product value ต่างจาก CRM ธรรมดาอย่างเห็นได้จริง

---

## T33 — Sprint 7 AI suggestion review & schema freeze note

### Objective

สรุปสิ่งที่ build แล้วและล็อก handoff ไป Sprint 8

### Scope

สรุป:

* final suggestion schema
* prompt versioning strategy
* generation/approval workflow
* quota and cost guardrails
* conversion paths
* known limitations
* assumptions สำหรับ analytics/audit ใน Sprint 8

### Acceptance Criteria

* มี handoff note สั้น ใช้งานจริง
* ทีมรู้ว่าของไหน lock แล้ว
* Sprint 8 ใช้ AI events/logs ต่อได้ทันที

---

# Dependencies ระหว่าง Ticket

## กลุ่มต้นน้ำ

* **T1** มาก่อน T2, T4, T7, T13, T14, T15, T28, T29
* **T2** มาก่อน T3, T6, T17, T22, T30
* **T4 + T5** มาก่อน T8, T16, T18
* **T6 + T7** มาก่อน T8, T17, T23
* **T26** ควรทำก่อนหรือคู่ขนานกับ T17–T25

## กลุ่มกลาง

* **T8** มาก่อน T9, T10, T11, T12, T13, T18
* **T9–T12** มาก่อน T18, T23, T24, T32
* **T13 + T14** มาก่อน T19, T23, T28, T31
* **T20 + T21** มาก่อน conversion actions ใน UI
* **T27** ควรตามหลัง core workflow เริ่มนิ่ง

## กลุ่มปลาย

* **T28, T29, T30, T31, T32, T33** เป็น hardening / closing tickets

---

# Suggested Execution Order

## Phase A — Model Lock

1. T1 Freeze canonical AI suggestion domain model

## Phase B — Data & Provider Foundation

2. T2 Migration for content_suggestions
3. T3 Seed sample AI suggestions
4. T4 Prompt registry and versioning baseline
5. T5 AI provider abstraction and primary adapter
6. T6 Suggestion repository/service
7. T7 Context builder baseline
8. T26 Standardized AI response contracts

## Phase C — Generation Core

9. T8 Generation orchestration service
10. T9 Monthly Promotion Suggestion
11. T10 Broadcast Copy Suggestion
12. T11 Follow-up Copy Suggestion
13. T12 Daily Marketing Summary
14. T13 Regenerate suggestion flow
15. T14 Approval/rejection workflow
16. T15 Usage quota and cost guardrails
17. T16 Generation failure handling and retry baseline

## Phase D — API Layer

18. T17 Suggestion list/detail APIs
19. T18 Generate suggestion APIs
20. T19 Approve/reject/regenerate APIs
21. T20 Suggestion-to-template draft conversion
22. T21 Suggestion-to-promotion draft conversion
23. T27 AI suggestion activity event hooks

## Phase E — Frontend Productization

24. T22 Suggestion list UI
25. T23 Suggestion detail UI
26. T24 Generation entry points in product UI
27. T25 Daily marketing summary AI widget

## Phase F — Hardening / Demo

28. T28 AI workflow integration tests
29. T29 Prompt/context regression fixtures
30. T30 Query/index review
31. T31 Basic audit/log hooks
32. T32 Demo data and guided scenario
33. T33 Sprint review & schema freeze

---

# Suggested Ticket Sizing

## S (เล็ก)

* T1
* T3
* T4
* T15
* T26
* T27
* T30
* T33

## M (กลาง)

* T6
* T7
* T9
* T10
* T11
* T12
* T13
* T14
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
* T29
* T31
* T32

## L (ใหญ่)

* T2
* T5
* T8
* T28

---

# Sprint 7 Acceptance Criteria รวม

Sprint 7 ถือว่าเสร็จเมื่อครบทั้งหมดนี้

## Functional

* generate suggestion ได้อย่างน้อย 4 core types
* review/approve/reject/regenerate ได้
* suggestion-to-template draft ใช้งานได้
* promotion suggestion นำไปใช้ต่อได้ในระดับ draft
* daily marketing summary AI ใช้งานได้

## Product

* AI output อ่านแล้ว usable จริง
* owner/marketing เห็นคุณค่าจาก promo/copy suggestions
* staff ใช้ follow-up copy ได้จาก context จริง
* dashboard/work area มี daily AI summary ที่ actionable

## Technical

* prompt versioning ทำงานได้
* context snapshots ถูกเก็บได้
* provider abstraction ชัด
* response contracts ชัด
* quota/cost guardrails ใช้งานได้
* event hooks พร้อมสำหรับ Sprint 8

## Safety

* ไม่มี auto-send path
* context ข้าม clinic ไม่ได้
* approval gate ถูก enforce
* quota เกินแล้ว handle ได้
* failure paths trace ได้

## Handoff Readiness

* Sprint 8 ใช้ suggestion events/actions ไปทำ analytics และ audit ได้
* AI feature demo ได้แบบ SaaS ธุรกิจจริง
* ทีมไม่ต้องย้อนมารื้อ workflow AI ก่อนเริ่ม metrics/audit

---

# Suggested backlog labels

* `sprint-7`
* `pr-06`
* `ai`
* `marketing-suggestions`
* `prompting`
* `frontend`
* `backend`
* `tenant`
* `test`
* `hardening`

---

# Recommended owner split ถ้าทีมมี 3 คน

## Backend Engineer

* T2, T4, T5, T6, T7, T8, T9, T10, T11, T12, T13, T14, T15, T16, T17, T18, T19, T20, T21, T27, T28, T29, T30, T31

## Frontend Engineer

* T22, T23, T24, T25

## Tech Lead / Fullstack

* T1, T3, T26, T32, T33
* review prompt/versioning strategy
* review approval gate and cost guardrails
* review usability of AI outputs from business lens

---

# ตัวอย่างชื่อ ticket พร้อมใช้

* `[Sprint 7][PR-06] Freeze canonical AI suggestion domain model`
* `[Sprint 7][PR-06] Create migration for content suggestions`
* `[Sprint 7][PR-06] Implement prompt registry and versioning baseline`
* `[Sprint 7][PR-06] Implement AI provider abstraction and generation orchestration`
* `[Sprint 7][PR-06] Implement monthly promotion broadcast and follow-up suggestion types`
* `[Sprint 7][PR-06] Implement approval rejection and regenerate workflow`
* `[Sprint 7][PR-06] Build AI suggestion list detail and generation entry points`
* `[Sprint 7][PR-06] Add integration tests for AI suggestion workflow and quota guards`

---

# ข้อควรระวังของ Sprint 7

Sprint นี้เสี่ยง drift ไปเป็น “AI โชว์ของ” แทนที่จะเป็น “AI ใช้งานได้”

## ห้ามเผลอเพิ่ม

* auto-send campaign
* AI chatbot เต็มรูปแบบ
* long-form content studio
* image/video generation pipeline
* personalization engine ขั้นสูง
* model fine-tuning
* medical advice features

## ต้องโฟกัสแค่

* AI ช่วยคิด
* AI ช่วยร่าง
* AI ช่วยสรุป
* ทุกอย่างมี approval
* ทุกอย่าง trace ได้
* ทุกอย่างมี cost guardrail

---

# สรุปตรงที่สุด

Sprint 7 มีหน้าที่ทำให้ FlowBiz เริ่มมี “สมองการตลาด”
แต่ต้องเป็นสมองที่ **ควบคุมได้**, **ตรวจย้อนหลังได้**, และ **เอาไปใช้ต่อได้จริง**

และต้องจบด้วยสถานะนี้:

* AI generate ได้
* คนอนุมัติได้
* suggestion เอาไปใช้ต่อได้
* ไม่มี auto-send
* owner เห็นความต่างจาก CRM ทั่วไปชัด


