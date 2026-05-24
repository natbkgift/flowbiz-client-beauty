**Blueprint + MVP Planning + PR Summary Mode** แบบจริงจังแล้ว

ผมจะจัดให้ 4 ส่วน:

1. **System Architecture ระดับ Tech Lead**
2. **Database Schema สำหรับ FlowBiz**
3. **Automation Flow จริง 25 Flow**
4. **PR Summary สำหรับเริ่ม Build MVP**

**ยังไม่เขียนโค้ด** และจะคุมให้อยู่ในกรอบที่ build ได้จริง ไม่บวม

---

# 1) System Architecture ระดับ Tech Lead

## 1.1 Product Boundary

FlowBiz สำหรับคลินิกความงามควรเป็น:

> **AI Marketing & Lifecycle Automation Layer**

ไม่ใช่ HIS / EMR / ระบบแพทย์ / ระบบ billing เต็มรูปแบบ

### In Scope

* Lead intake
* Lead CRM
* Segmentation
* Broadcast
* Follow-up automation
* Booking reminder
* Customer reactivation
* AI promotion / content suggestion
* Dashboard / analytics

### Out of Scope

* Medical record เชิงลึก
* Surgery workflow ทางคลินิก
* Prescription / billing
* Inventory
* Full doctor scheduling system

---

## 1.2 High-Level Architecture

```text
[ Lead Sources ]
- LINE OA
- Facebook Lead / Chat
- Website Form / Landing Page
- Manual Import

        ↓

[ Ingestion Layer ]
- Webhook Receiver
- Import Processor
- Event Normalizer

        ↓

[ Core Platform API ]
- Auth / RBAC
- Tenant Management
- Lead / Customer Service
- Campaign Service
- Automation Service
- Messaging Service
- AI Suggestion Service
- Analytics Service

        ↓

[ Data Layer ]
- PostgreSQL
- Redis (queue / cache / rate limiting)
- Object Storage (media / templates / exports)

        ↓

[ Async Workers ]
- Automation Runner
- Broadcast Dispatcher
- AI Job Worker
- Reminder Scheduler
- Webhook Retry Worker

        ↓

[ External Integrations ]
- LINE Messaging API
- OpenAI / LLM Provider
- Optional: Meta / Email / SMS
```

---

## 1.3 Recommended Service Decomposition

สำหรับ MVP **ยังไม่ควรแยก microservices**
ใช้ **modular monolith** ก่อน แล้วค่อยแตกภายหลัง

### Recommended Modules

| Module        | Responsibility                    |
| ------------- | --------------------------------- |
| Auth & Tenant | login, clinic isolation, roles    |
| CRM           | lead, customer, tags, status      |
| Messaging     | broadcast, message log, template  |
| Automation    | triggers, rules, executions       |
| AI Brain      | promotion/content suggestion      |
| Campaigns     | campaign planning, targeting      |
| Analytics     | funnel, conversions, activity     |
| Integrations  | LINE webhook, outbound connectors |

### เหตุผลที่เลือก Modular Monolith

* เร็วต่อ MVP
* debug ง่าย
* deploy ง่าย
* schema evolution ง่าย
* ทีมเล็กดูแลไหว

---

## 1.4 Core Domain Model

มี 5 domain หลัก

### A. Tenant Domain

* Clinic
* User
* Role
* Membership

### B. CRM Domain

* Lead
* Customer
* Inquiry
* Interest
* Treatment History
* Tag
* Note

### C. Marketing Domain

* Campaign
* Promotion
* Content Suggestion
* Segment
* Broadcast

### D. Automation Domain

* Trigger
* Flow
* Step
* Execution
* Task
* Reminder

### E. Messaging Domain

* Channel
* Message Template
* Outbound Message
* Delivery Status
* Conversation Event

---

## 1.5 Event-Driven Internal Design

แม้จะเป็น monolith แต่ควรคิดแบบ event-driven ภายใน

### Example Internal Events

* `lead.created`
* `lead.tagged`
* `lead.status_changed`
* `consult.booked`
* `appointment.reminder_due`
* `customer.treatment_completed`
* `customer.inactive_detected`
* `broadcast.sent`
* `message.replied`
* `review.request_due`

### ประโยชน์

* automation ต่อได้ง่าย
* ลด coupling
* เพิ่ม flow ใหม่ได้โดยไม่แก้ core มาก

---

## 1.6 Key Technical Decisions

## A. Primary Database

**PostgreSQL**

เหตุผล:

* relational ชัด
* query analytics เบื้องต้นได้
* transaction ดี
* schema ชัดสำหรับ SaaS B2B

## B. Queue / Background Jobs

**Redis + worker**

* automation scheduling
* broadcast batching
* retries
* reminder jobs

## C. API Style

* Internal: service-layer methods / events
* External frontend: REST ก่อน
* Webhooks: dedicated receiver endpoints

## D. Frontend

* Web dashboard สำหรับ owner / staff / marketer
* Mobile-first responsive ได้ แต่ไม่ต้องเริ่ม native app

---

## 1.7 Multi-Tenant Strategy

Tenant = 1 clinic

ทุก table สำคัญต้องมี:

* `tenant_id`

### Isolation Rules

* app-level authorization บังคับทุก query
* index composite ตาม `(tenant_id, ...)`
* audit log ระบุ tenant/user ทุกครั้ง
* ห้ามมี query ข้าม tenant โดยไม่มี admin-level system path

### Recommended Roles

* Owner
* Manager
* Sales
* Marketing
* Staff
* Admin (internal support)

---

## 1.8 Integration Architecture

## LINE OA Integration

### Inbound

* webhook รับข้อความ / postback / follow
* map external user → contact identity
* create event เข้า conversation / lead timeline

### Outbound

* broadcast
* direct follow-up
* reminders
* campaign messages

### Important Guardrails

* rate limiting
* message quota awareness
* opt-out / contactability flags
* delivery logging

---

## 1.9 AI Layer Architecture

AI ไม่ควรเป็นตัวคุมระบบหลัก
AI เป็น **advisory + generation layer** เท่านั้น

### AI Responsibilities

* Suggest promotion ideas
* Suggest broadcast copy
* Suggest content calendar
* Suggest follow-up text
* Summarize customer history
* Recommend reactivation candidates

### AI Must Not Do

* auto-change business-critical data โดยไม่มี rule
* auto-send expensive campaigns แบบไม่มี approval
* auto-diagnose medical issues

### AI Output Pattern

ทุก suggestion ควรเก็บเป็น:

* input context
* prompt version
* output
* approved_by
* approved_at

เพื่อ audit ได้

---

## 1.10 Security / Audit Baseline

อย่างต่ำต้องมี

### Access Control

* RBAC
* tenant-scoped authorization

### Auditability

* ใครสร้าง/แก้ lead
* ใคร approve campaign
* ใครส่ง broadcast
* AI suggestion อะไรถูกนำไปใช้

### Data Protection

* encrypt at rest where possible
* secure secrets management
* PII masking บางจุด
* soft delete สำหรับ record สำคัญ

---

# 2) Database Schema สำหรับ FlowBiz

นี่คือ **logical schema ระดับ MVP+**

---

## 2.1 Core Tables Overview

### Tenant & Auth

* clinics
* users
* clinic_users
* roles

### CRM

* leads
* customers
* lead_interests
* customer_treatments
* notes
* tags
* entity_tags

### Messaging

* channels
* message_templates
* outbound_messages
* inbound_messages
* contact_identities

### Marketing

* campaigns
* promotions
* segments
* segment_memberships
* content_suggestions

### Automation

* automation_flows
* automation_steps
* automation_executions
* automation_tasks
* reminders

### Analytics / Audit

* activity_events
* audit_logs

---

## 2.2 Suggested Schema Detail

## `clinics`

```text
id
name
slug
plan
status
timezone
line_channel_id
settings_json
created_at
updated_at
```

## `users`

```text
id
email
name
password_hash
status
last_login_at
created_at
updated_at
```

## `clinic_users`

```text
id
clinic_id
user_id
role
status
created_at
updated_at
```

---

## `leads`

ใช้สำหรับคนที่ยังไม่เป็นลูกค้าจริง

```text
id
clinic_id
source
source_ref
full_name
nickname
phone
line_user_id
email
gender
birth_date
status
stage
owner_user_id
last_contacted_at
next_followup_at
intent_score
budget_range
preferred_branch
notes_summary
created_at
updated_at
```

### Suggested enums

* `status`: new, active, won, lost, archived
* `stage`: inquiry, qualified, consult_booked, consult_done, booked, no_show, converted

---

## `customers`

เมื่อ convert แล้วให้มี customer record

```text
id
clinic_id
lead_id
full_name
nickname
phone
line_user_id
email
customer_since
lifetime_value
last_visit_at
reactivation_score
customer_status
created_at
updated_at
```

### customer_status

* active
* inactive
* vip
* churn_risk

---

## `lead_interests`

เก็บสิ่งที่ลูกค้าสนใจ

```text
id
clinic_id
lead_id
interest_type
interest_name
priority
budget_min
budget_max
urgency
created_at
updated_at
```

ตัวอย่าง `interest_name`

* nose surgery
* botox
* filler
* skin booster
* laser

---

## `customer_treatments`

ไม่ใช่ medical chart เต็มรูปแบบ
แค่ treatment history เชิงการตลาด

```text
id
clinic_id
customer_id
treatment_name
treatment_category
performed_at
provider_name
branch_name
price
cycle_days
next_recommended_at
status
created_at
updated_at
```

---

## `notes`

```text
id
clinic_id
entity_type
entity_id
author_user_id
note_type
content
created_at
updated_at
```

### entity_type

* lead
* customer
* campaign
* execution

---

## `tags`

```text
id
clinic_id
name
color
created_at
updated_at
```

## `entity_tags`

```text
id
clinic_id
tag_id
entity_type
entity_id
created_at
```

---

## `contact_identities`

ใช้ map external channel identity

```text
id
clinic_id
entity_type
entity_id
channel
external_id
display_name
is_primary
created_at
updated_at
```

---

## `channels`

```text
id
clinic_id
channel_type
name
status
config_json
created_at
updated_at
```

### channel_type

* line
* email
* sms
* meta

---

## `message_templates`

```text
id
clinic_id
channel_type
name
category
language
content
variables_json
approval_status
created_at
updated_at
```

### category

* followup
* reminder
* promotion
* review_request
* reactivation

---

## `outbound_messages`

```text
id
clinic_id
channel_id
entity_type
entity_id
campaign_id
template_id
automation_execution_id
message_type
recipient_ref
content_rendered
status
scheduled_at
sent_at
delivered_at
failed_at
failure_reason
created_at
updated_at
```

---

## `inbound_messages`

```text
id
clinic_id
channel_id
external_message_id
sender_ref
entity_type
entity_id
content
message_type
received_at
created_at
```

---

## `campaigns`

```text
id
clinic_id
name
campaign_type
objective
status
start_date
end_date
target_segment_id
budget
owner_user_id
created_at
updated_at
```

### campaign_type

* monthly_promo
* seasonal
* reactivation
* referral
* review
* consult_push

---

## `promotions`

```text
id
clinic_id
campaign_id
title
description
offer_type
offer_value
start_at
end_at
eligibility_json
status
created_at
updated_at
```

---

## `segments`

```text
id
clinic_id
name
entity_type
rule_json
is_dynamic
created_at
updated_at
```

### entity_type

* lead
* customer

---

## `segment_memberships`

ถ้าอยาก materialize membership เพื่อเร็ว

```text
id
clinic_id
segment_id
entity_type
entity_id
computed_at
```

---

## `content_suggestions`

เก็บ output จาก AI

```text
id
clinic_id
suggestion_type
title
input_context_json
prompt_version
content
status
approved_by
approved_at
created_at
updated_at
```

### suggestion_type

* promotion
* broadcast_copy
* content_calendar
* followup_copy
* campaign_idea

---

## `automation_flows`

```text
id
clinic_id
name
flow_type
trigger_type
status
version
entry_rule_json
created_by
created_at
updated_at
```

---

## `automation_steps`

```text
id
clinic_id
flow_id
step_order
step_type
delay_minutes
config_json
created_at
updated_at
```

### step_type

* wait
* send_message
* create_task
* add_tag
* remove_tag
* change_stage
* create_reminder
* notify_user
* branch_condition

---

## `automation_executions`

```text
id
clinic_id
flow_id
entity_type
entity_id
trigger_event
status
started_at
finished_at
last_step_order
context_json
created_at
updated_at
```

---

## `automation_tasks`

```text
id
clinic_id
execution_id
assigned_user_id
task_type
title
description
due_at
status
created_at
updated_at
```

---

## `reminders`

```text
id
clinic_id
entity_type
entity_id
reminder_type
title
due_at
status
payload_json
created_at
updated_at
```

---

## `activity_events`

timeline กลางของระบบ

```text
id
clinic_id
entity_type
entity_id
event_type
event_data_json
occurred_at
created_at
```

---

## `audit_logs`

```text
id
clinic_id
actor_type
actor_id
action
entity_type
entity_id
before_json
after_json
ip_address
created_at
```

---

## 2.3 Relationship Summary

### Lead Lifecycle

* lead 1:N lead_interests
* lead 1:N notes
* lead 1:N activity_events
* lead 1:1 customer (optional after conversion)

### Customer Lifecycle

* customer 1:N customer_treatments
* customer 1:N notes
* customer 1:N activity_events

### Marketing / Campaign

* campaign 1:N promotions
* campaign 1:N outbound_messages

### Automation

* automation_flow 1:N automation_steps
* automation_flow 1:N automation_executions
* automation_execution 1:N automation_tasks

---

## 2.4 Critical Indexes

ต้องมีตั้งแต่ต้น

### Leads

* `(clinic_id, status)`
* `(clinic_id, stage)`
* `(clinic_id, next_followup_at)`
* `(clinic_id, last_contacted_at)`
* `(clinic_id, created_at)`

### Customers

* `(clinic_id, last_visit_at)`
* `(clinic_id, reactivation_score)`
* `(clinic_id, customer_status)`

### Messages

* `(clinic_id, scheduled_at, status)`
* `(clinic_id, campaign_id)`
* `(clinic_id, entity_type, entity_id)`

### Automations

* `(clinic_id, flow_id, status)`
* `(clinic_id, due_at, status)` on reminders/tasks

---

# 3) Automation Flow จริง 25 Flow

ผมจะแบ่งตาม lifecycle เพื่อให้ build และขายง่าย

---

## A. Lead Intake & Qualification (1–5)

## 1. New Lead Welcome

**Trigger:** lead.created
**Steps:**

1. add tag `new_lead`
2. send welcome message
3. create internal activity
4. schedule follow-up in 1 day

**Goal:** ตอบเร็ว ลด lead เย็น

---

## 2. Lead Source Routing

**Trigger:** lead.created
**Steps:**

1. detect source
2. assign owner ตาม rule
3. add source tag
4. notify assigned staff

**Goal:** ไม่ให้ lead ตกหล่น

---

## 3. Interest Capture

**Trigger:** inbound message / form submit
**Steps:**

1. detect interest เช่น botox / nose / filler
2. create lead_interest
3. add related tag
4. update intent score

**Goal:** เริ่มมีข้อมูลยิง follow-up ได้

---

## 4. Uncontacted Lead Alert

**Trigger:** lead.created + no outbound in 30 min / 1 hr
**Steps:**

1. create task ให้ sales
2. notify manager ถ้าเกิน SLA

**Goal:** คุม response time

---

## 5. Lead Qualification Nurture

**Trigger:** stage = inquiry
**Steps:**

1. Day 0 send intro
2. Day 1 send educational message
3. Day 3 send case / review
4. Day 5 ask booking intent
5. if replied → assign to staff

**Goal:** warm up lead อัตโนมัติ

---

## B. Consult Conversion (6–10)

## 6. Consult Booking Prompt

**Trigger:** intent_score above threshold
**Steps:**

1. send consult CTA
2. create reminder for staff
3. if no response 2 days → resend soft CTA

---

## 7. Abandoned Inquiry Recovery

**Trigger:** no reply for 3 days
**Steps:**

1. send “ยังสนใจอยู่ไหม”
2. Day 5 send review / before-after
3. Day 7 send limited promo
4. mark stale if no response

---

## 8. Consult Reminder Flow

**Trigger:** consult booked
**Steps:**

1. confirmation now
2. reminder T-1 day
3. reminder T-3 hr
4. add no-show watch task

---

## 9. Pre-Consult Education

**Trigger:** consult booked
**Steps:**

1. send preparation info
2. send doctor intro / clinic trust content
3. send FAQ
4. encourage question reply

---

## 10. No-Show Recovery

**Trigger:** appointment marked no_show
**Steps:**

1. send rebooking message
2. create staff task
3. Day 2 resend softer invitation
4. Day 5 offer alternate slot

---

## C. Booking & Treatment (11–15)

## 11. Booking Confirmation

**Trigger:** booked
**Steps:**

1. send confirmation
2. add booked tag
3. remove consult_pending tag
4. create timeline event

---

## 12. Pre-Treatment Reminder

**Trigger:** treatment date approaching
**Steps:**

1. T-3 day reminder
2. T-1 day reminder
3. send preparation instructions

---

## 13. Treatment Day Check-In

**Trigger:** treatment date = today
**Steps:**

1. send arrival reminder
2. notify assigned team
3. mark today activity

---

## 14. Post-Treatment Day 1 Care

**Trigger:** treatment completed
**Steps:**

1. Day 1 care message
2. ask symptom check
3. escalate if concerning reply keywords

---

## 15. Post-Treatment Day 7 Follow-Up

**Trigger:** treatment completed
**Steps:**

1. Day 7 check-in
2. request progress update
3. create follow task if issue reported

---

## D. Review / Trust / Advocacy (16–18)

## 16. Review Request

**Trigger:** treatment completed + enough recovery days
**Steps:**

1. send review request
2. send easy review link
3. if no reply in 3 days → gentle reminder

---

## 17. Before-After Consent Follow-Up

**Trigger:** satisfied treatment outcome tag / positive response
**Steps:**

1. ask consent for case sharing
2. create task for marketing if approved

---

## 18. Referral Invitation

**Trigger:** customer marked satisfied / VIP
**Steps:**

1. send referral incentive
2. tag referral_candidate
3. track invitation sent

---

## E. Repeat Revenue / Reactivation (19–23)

## 19. Botox Cycle Reminder

**Trigger:** treatment_name = Botox and next_recommended_at due
**Steps:**

1. send refill reminder
2. if no reply 5 days → resend
3. create sales task if high LTV

---

## 20. Filler Renewal Reminder

**Trigger:** filler cycle due
**Steps:**

1. personalized reminder
2. suggest consult / top-up
3. attach current promo if active

---

## 21. Inactive Customer Reactivation

**Trigger:** no visit for X days
**Steps:**

1. send comeback campaign
2. Day 5 send benefit-oriented message
3. Day 10 create manual follow task

---

## 22. VIP Reactivation

**Trigger:** VIP inactive for threshold
**Steps:**

1. priority message
2. exclusive promo
3. notify owner/manager for manual outreach

---

## 23. Seasonal Repeat Campaign

**Trigger:** campaign launched
**Steps:**

1. select relevant past customers
2. send personalized seasonal offer
3. track click/reply/book outcomes

---

## F. Marketing Operations (24–25)

## 24. Monthly Promotion Suggestion

**Trigger:** start of month
**Steps:**

1. AI generate promo suggestions
2. AI draft broadcast copy
3. create approval task for marketer

**Goal:** ระบบช่วย “คิดโปร”

---

## 25. Daily Marketing Reminder

**Trigger:** every morning
**Steps:**

1. summarize leads to follow
2. summarize reminders due
3. highlight inactive customers
4. show campaign suggestions

**Goal:** เป็น AI marketing coordinator

---

# 4) MVP ที่ควร Build ก่อนจริง

จาก 25 flow ทั้งหมด
**MVP ไม่ควร build ทุก flow พร้อมกัน**

## MVP Flow Pack v1

เลือก 8 flow ที่ผูกกับรายได้มากสุด

1. New Lead Welcome
2. Uncontacted Lead Alert
3. Lead Qualification Nurture
4. Consult Reminder Flow
5. No-Show Recovery
6. Review Request
7. Botox Cycle Reminder
8. Daily Marketing Reminder

### เหตุผล

* ครอบคลุม lead → consult → repeat
* ทำ demo ง่าย
* ขายคลินิกง่าย
* ไม่ต้อง integration หนักเกินไป

---

# 5) PR Summary สำหรับการเริ่ม Build MVP

ตอนนี้ยังไม่ build code แต่ผมจะสรุปเป็น **PR-by-PR plan** แบบพร้อมใช้

---

## PR-01: Project Foundation & Multi-Tenant Base

### PR Goal

วางโครงสร้างระบบพื้นฐานสำหรับ SaaS แบบหลายคลินิก

### Why

ถ้า tenant model ไม่ชัดตั้งแต่ต้น ระบบจะพังตอนขยาย clinic ที่ 2–3

### In Scope

* clinic model
* user model
* clinic_users
* auth + role baseline
* tenant-aware base query pattern
* migration setup

### Non-Goal

* automation
* messaging
* AI
* campaign UI เต็มรูปแบบ

### Expected Files / Modules

* auth
* tenant
* db migrations
* base API middleware
* role / permission layer

### Acceptance Criteria

* สร้าง clinic ได้
* invite/add user เข้า clinic ได้
* ทุก query สำคัญ scope ตาม tenant ได้
* RBAC พื้นฐานใช้งานได้

### Risks

* tenant leakage
* role model ซับซ้อนเกิน

### Rollback Plan

* keep schema minimal
* isolate auth changes behind internal admin only

---

## PR-02: Lead CRM Core

### PR Goal

สร้าง Lead CRM แกนหลักให้ทีมคลินิกเก็บและติดตาม lead ได้

### Why

นี่คือฐานของทุก automation และ analytics

### In Scope

* leads table
* lead interests
* notes
* tags
* lead status/stage transitions
* lead list/detail API + basic UI

### Non-Goal

* customer conversion ลึก
* campaign
* AI suggestions

### Acceptance Criteria

* สร้าง/edit lead ได้
* ใส่ interest/tag/note ได้
* เปลี่ยน stage ได้
* filter lead ตาม stage/status/owner ได้

### Risks

* stage model ไม่ตรงการใช้งานจริง
* fields เยอะเกินจนทีมใช้ยาก

### Rollback Plan

* keep optional fields nullable
* preserve minimal stage machine

---

## PR-03: Messaging & Template Foundation

### PR Goal

สร้างระบบ template และ outbound message logging

### Why

ถ้าไม่มี message log จะ audit ไม่ได้ และต่อ automation ลำบาก

### In Scope

* channels
* templates
* outbound_messages
* contact identity mapping
* manual send test path
* delivery status model

### Non-Goal

* full broadcast UI
* advanced retry orchestration

### Acceptance Criteria

* บันทึก template ได้
* ส่งข้อความออกผ่าน 1 channel หลักได้
* มี message log/status
* map lead/customer กับ external recipient ได้

### Risks

* external identity mapping ซ้ำ
* message state ไม่ครบ

### Rollback Plan

* support single primary channel first
* keep template categories simple

---

## PR-04: Automation Engine v1

### PR Goal

สร้าง automation engine รุ่นแรกแบบ rules + scheduled steps

### Why

นี่คือหัวใจของ product

### In Scope

* automation_flows
* automation_steps
* automation_executions
* reminders/tasks
* trigger from lead/treatment events
* worker for delayed steps

### Non-Goal

* visual drag-and-drop builder
* complex nested branching
* AI-generated flow logic

### Acceptance Criteria

* flow เปิด/ปิดได้
* trigger แล้ว execution ถูกสร้าง
* step แบบ wait/send/create_task ทำงานได้
* execution log ดูย้อนหลังได้

### Risks

* scheduler ซ้ำซ้อน
* jobs ยิงซ้ำ
* state inconsistency

### Rollback Plan

* idempotency key ต่อ execution/step
* feature flag on flow activation

---

## PR-05: MVP Automation Pack

### PR Goal

ลง flow สำเร็จรูปที่ขายได้ทันที 8 ตัว

### Why

จาก “platform” ต้องกลายเป็น “product ที่ใช้ได้จริง”

### In Scope

* 8 MVP flows
* template seeds
* staff reminder views
* basic daily summary

### Non-Goal

* full automation marketplace
* custom flow editor สำหรับลูกค้า

### Acceptance Criteria

* เปิดใช้งาน flow สำเร็จรูปได้ต่อ clinic
* แต่ละ flow ยิงตาม trigger ถูก
* มี execution logs
* marketer/staff เห็นสิ่งที่ต้อง follow ได้

### Risks

* business rules ไม่ flexible พอ
* message fatigue

### Rollback Plan

* per-flow toggle
* per-step toggle
* quiet hours / send suppression

---

## PR-06: AI Marketing Suggestion v1

### PR Goal

เพิ่ม AI เพื่อช่วยคิดโปร ข้อความ และงานการตลาดรายวัน

### Why

นี่คือจุดต่างของ FlowBiz จาก CRM ทั่วไป

### In Scope

* content_suggestions
* AI prompt orchestration
* monthly promotion suggestion
* broadcast copy suggestion
* daily marketing summary

### Non-Goal

* auto-send without approval
* long-form content studio
* medical recommendation

### Acceptance Criteria

* generate suggestion ได้
* staff approve/reject ได้
* เก็บ prompt version / output / approval log ได้
* เอา suggestion ไปใช้กับ campaign/template ได้

### Risks

* AI hallucination
* copy ใช้งานจริงไม่ได้
* ต้นทุน LLM สูง

### Rollback Plan

* manual approval mandatory
* prompt versioning
* usage cap per clinic

---

## PR-07: Customer & Repeat Revenue Layer

### PR Goal

เพิ่ม customer profile และ repeat-treatment reminders

### Why

รายได้คลินิกไม่ได้มาจาก lead ใหม่อย่างเดียว แต่จากลูกค้าเก่า

### In Scope

* customers
* customer_treatments
* conversion lead→customer
* botox/filler cycle reminder
* reactivation candidates

### Non-Goal

* full medical records
* billing integration

### Acceptance Criteria

* convert lead to customer ได้
* เพิ่ม treatment history ได้
* cycle reminder ทำงานได้
* reactivation list สร้างได้

### Risks

* treatment cycle data ไม่สม่ำเสมอ
* history incomplete

### Rollback Plan

* allow manual correction
* simple cycle defaults by treatment type

---

## PR-08: Analytics & Audit v1

### PR Goal

ให้ owner เห็นผลลัพธ์ และให้ระบบตรวจสอบย้อนหลังได้

### Why

B2B SaaS ขายยากถ้าวัดผลไม่ได้

### In Scope

* activity_events
* audit_logs
* dashboard metrics
* funnel counters
* automation outcome summary

### Non-Goal

* advanced BI
* cohort science แบบลึก

### Acceptance Criteria

* เห็นจำนวน lead ใหม่
* เห็น follow-up due
* เห็น message sent/replied
* เห็น conversion/repeat reminder stats
* มี audit log สำคัญ

### Risks

* metrics definition ไม่ชัด
* event loss

### Rollback Plan

* define canonical metrics early
* event backfill jobs later

---

# 6) Recommended MVP Delivery Order

นี่คือ order ที่ pragmatic ที่สุด

1. **PR-01 Foundation**
2. **PR-02 Lead CRM Core**
3. **PR-03 Messaging Foundation**
4. **PR-04 Automation Engine v1**
5. **PR-05 MVP Automation Pack**
6. **PR-07 Customer & Repeat Revenue Layer**
7. **PR-06 AI Marketing Suggestion v1**
8. **PR-08 Analytics & Audit v1**

### ทำไม PR-07 มาก่อน PR-06

เพราะ repeat revenue use case สร้างเงินตรงกว่า และทำ demo ขายง่ายกว่า AI copy ล้วน ๆ

---

# 7) สิ่งที่ห้ามพลาดก่อน Build

## ต้อง define ให้ชัดก่อน

* canonical lead stages
* consult / booking / treatment event model
* message approval policy
* tenant isolation rule
* contact identity dedupe strategy

## ต้องเลี่ยง

* custom flow builder ตั้งแต่วันแรก
* omnichannel ตั้งแต่วันแรก
* dashboard ใหญ่เกิน
* AI ส่งเองอัตโนมัติ
* schema medical ซับซ้อนเกินจริง

---

# 8) ข้อสรุปเชิงกลยุทธ์

FlowBiz MVP ที่ขายได้จริง ไม่ใช่ “CRM ใหม่”
แต่คือ:

> **ระบบติดตาม lead + automation follow-up + repeat reminder + AI ช่วยคิดการตลาด**

นี่คือ package ที่คลินิกเข้าใจและพร้อมจ่าย