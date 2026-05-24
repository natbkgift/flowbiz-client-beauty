ได้ อันนี้คือการแตก **Sprint 1 — PR-01 Foundation & Multi-Tenant Base** ลงมาเป็น **engineering ticket** ที่ทีมเอาไปทำงานต่อได้ทันที

ผมจะจัดให้เป็น 6 ส่วน:

1. **Sprint Goal**
2. **Ticket List**
3. **Dependencies**
4. **Acceptance Criteria ราย ticket**
5. **Suggested Execution Order**
6. **Sprint Exit Checklist**

---

# Sprint 1 — PR-01 Foundation & Multi-Tenant Base

## Sprint Goal

ส่งมอบระบบฐานสำหรับ FlowBiz แบบ **multi-tenant SaaS** ที่มี:

* auth/login ใช้งานได้
* clinic context ชัด
* membership/role baseline ใช้งานได้
* tenant isolation พร้อมสำหรับ PR-02

---

# Epic: Foundation & Multi-Tenant Base

---

## T1 — Define canonical auth/tenant domain model

### Objective

ล็อก domain model กลางของ Sprint 1 ก่อนเริ่มลง schema และ API

### Scope

กำหนด model และความสัมพันธ์ของ:

* Clinic
* User
* ClinicUser
* Role
* Session Context

### Deliverables

* short design note 1 ฉบับ
* canonical enums:

  * clinic status
  * user status
  * clinic_user status
  * role
* ownership rules ระหว่าง user กับ clinic

### Acceptance Criteria

* ทีมตกลง enum ชุดเดียวกัน
* ระบุได้ชัดว่า user 1 คนอยู่ได้หลาย clinic หรือไม่
* ระบุได้ชัดว่า current clinic ถูก resolve อย่างไร
* ระบุได้ชัดว่า role ถูกเก็บที่ level ไหน

### Notes

ticket นี้เล็กแต่สำคัญมาก เพราะถ้าไม่ล็อกก่อน schema จะเริ่ม drift

---

## T2 — Create initial database migrations for `clinics`, `users`, `clinic_users`

### Objective

สร้างฐานข้อมูลแกนกลางของระบบ

### Scope

สร้าง migration สำหรับ:

* `clinics`
* `users`
* `clinic_users`

พร้อม:

* PK/FK
* timestamps
* unique constraints
* baseline indexes

### Suggested fields

#### clinics

* id
* name
* slug
* plan
* status
* timezone
* created_at
* updated_at

#### users

* id
* email
* name
* password_hash
* status
* last_login_at
* created_at
* updated_at

#### clinic_users

* id
* clinic_id
* user_id
* role
* status
* created_at
* updated_at

### Acceptance Criteria

* migration run ขึ้นใหม่ได้
* rollback migration ได้
* FK relations ถูกต้อง
* unique constraints อย่างน้อย:

  * users.email
  * clinics.slug
  * clinic_users (clinic_id, user_id)

---

## T3 — Add seed data for local development

### Objective

ทำให้ local dev ใช้งานเร็ว ไม่ต้องสร้างข้อมูลมือทุกครั้ง

### Scope

สร้าง seed สำหรับ:

* 1 clinic ตัวอย่าง
* 2 users ตัวอย่าง
* 2 clinic memberships
* roles ที่ต่างกันอย่างน้อย 2 แบบ

### Acceptance Criteria

* run seed แล้ว login ด้วย user ตัวอย่างได้
* user แต่ละคนผูก clinic ถูกต้อง
* local dev setup ใช้งานได้ใน 1 คำสั่งหรือ flow เดียว

---

## T4 — Implement password-based authentication baseline

### Objective

สร้างระบบ login พื้นฐานให้ใช้งานได้จริง

### Scope

* login endpoint/service
* password hash verification
* session/token issuance
* logout path
* current authenticated user retrieval

### Non-Goal

* SSO
* magic link
* OAuth social login
* MFA

### Acceptance Criteria

* login ด้วย email/password ได้
* invalid credentials ถูก reject
* session/token ใช้เรียก authenticated endpoint ได้
* logout แล้ว session/token ใช้ต่อไม่ได้
* current user endpoint ใช้งานได้

### Security Baseline

* password hash ต้องไม่เก็บ plain text
* auth errors ไม่ leak รายละเอียดเกินจำเป็น

---

## T5 — Implement auth middleware / request identity context

### Objective

ให้ทุก request ที่ผ่าน auth มี user context ที่อ่านได้มาตรฐานเดียวกัน

### Scope

* auth middleware
* inject current user ลง request context
* standardized unauthorized/forbidden response
* helper สำหรับ endpoint ที่ต้อง auth

### Acceptance Criteria

* protected routes require auth
* current user context ถูก resolve ได้ใน service layer
* unauthorized และ forbidden แยกกันชัด
* routes ที่ไม่ต้อง auth ยังใช้งานได้

---

## T6 — Implement current clinic resolution strategy

### Objective

กำหนดว่า request หนึ่ง ๆ อยู่ใน clinic ไหนอย่างปลอดภัย

### Scope

สร้างกลไก resolve current clinic จากหนึ่งในแนวทางที่ทีมเลือก เช่น:

* active clinic in session
* clinic id in route/header + membership check
* selected clinic persisted in user session

### Recommended MVP

ใช้ **selected clinic in session/context** + membership validation

### Acceptance Criteria

* request ที่ต้องมี clinic context สามารถ resolve clinic ได้
* ถ้า user ไม่ใช่สมาชิก clinic นั้น ต้องถูก reject
* current clinic ถูกเรียกใช้ซ้ำใน service layer ได้
* behaviour ตรงกันทุก endpoint ที่เกี่ยวข้องกับ clinic

### Important

ต้องล็อกวิธีนี้ให้ชัดตั้งแต่ต้น ห้ามแต่ละ endpoint resolve คนละแบบ

---

## T7 — Build clinic membership lookup service

### Objective

ทำ service กลางสำหรับตรวจ membership และ role

### Scope

* get user memberships
* verify user belongs to clinic
* get role for user in clinic
* optional helper for current clinic membership

### Acceptance Criteria

* service ใช้งานได้จาก API layer และ service layer
* role lookup ถูกต้อง
* membership missing → forbidden/not found ตาม policy ที่ตกลง
* มี test ครอบคลุมกรณี user อยู่หลาย clinic

---

## T8 — Implement RBAC baseline guards

### Objective

วาง role-based access control รุ่นแรก

### Scope

รองรับอย่างน้อย roles:

* owner
* manager
* sales
* marketing
* staff

สร้าง guard/helper เช่น:

* require owner/manager
* require any clinic member
* require one of allowed roles

### Non-Goal

* permission matrix ละเอียดระดับ action-by-action ทั้งระบบ
* custom policy editor

### Acceptance Criteria

* endpoint สามารถกำหนด allowed roles ได้
* user role ไม่ถึงถูก reject
* owner/manager restricted paths ใช้งานได้
* role checks ผูก clinic context ที่ถูกต้อง

---

## T9 — Create tenant-aware base repository/service pattern

### Objective

กัน tenant leakage ตั้งแต่ระดับ coding pattern

### Scope

สร้าง convention/helper/base abstraction ที่ทำให้ query สำคัญต้องรับ `clinic_id` หรือ clinic context ชัดเจน

ตัวอย่าง:

* base query helper
* service input contract ที่มี clinic context
* repository method signatures ที่ explicit

### Acceptance Criteria

* business queries สำคัญใน Sprint นี้ไม่สามารถอ่านข้อมูลแบบไม่รู้ clinic ได้
* service/repository signatures สื่อ ownership ชัด
* team มี pattern เดียวกัน ไม่ทำคนละแบบ

### Important

ไม่ต้อง generic framework ใหญ่
เอาแค่ **guardrail ที่ทีมใช้จริง**

---

## T10 — Add tenant isolation integration tests

### Objective

พิสูจน์ว่า foundation ไม่รั่วข้าม clinic

### Scope

เขียน tests อย่างน้อยสำหรับกรณี:

* user A clinic X เข้า resource clinic Y ไม่ได้
* role ใน clinic X ไม่ควร apply ให้ clinic Y
* current clinic switch invalid ถูก reject
* clinic membership missing ถูก reject

### Acceptance Criteria

* มี integration tests ครอบคลุม cross-tenant denial
* tests รันผ่านใน CI/local
* failure message ชัดพอ debug ได้

---

## T11 — Implement login UI + session bootstrap

### Objective

ทำ frontend ขั้นต่ำให้ใช้งาน auth flow ได้จริง

### Scope

* login page
* login form validation
* store auth session
* fetch current user
* bootstrap app หลัง login

### Acceptance Criteria

* login ผ่าน UI ได้
* invalid login แสดง error ที่เหมาะสม
* refresh page แล้วยังรักษา session ได้ตาม strategy ที่เลือก
* app รู้ current user หลัง login

---

## T12 — Implement current clinic state on frontend

### Objective

ให้ frontend รู้ว่าตอนนี้อยู่ clinic ไหน

### Scope

* current clinic state store
* load memberships/current clinic
* clinic selection handling ถ้าจำเป็น
* render guard เมื่อยังไม่มี current clinic

### Acceptance Criteria

* app รู้ current clinic ที่ใช้งานอยู่
* ถ้ามีหลาย clinic เลือก clinic ได้ตาม policy ที่ทีมเลือก
* หน้าจอที่ต้องใช้ clinic context ไม่ทำงานแบบคลุมเครือ
* invalid clinic selection ถูก handle

---

## T13 — Build minimal clinic membership admin view or internal utility

### Objective

ให้ทีม dev/admin จัดการสมาชิก clinic ขั้นพื้นฐานได้ เพื่อรองรับการทดสอบและเดโม

### Scope

อย่างน้อย 1 ทาง:

* minimal internal admin page
  หรือ
* internal API + script utility

สำหรับ:

* add user to clinic
* set role
* list memberships

### Acceptance Criteria

* เพิ่ม user เข้า clinic ได้
* เปลี่ยน role ได้
* list memberships ได้
* ใช้งานได้จริงโดยไม่ต้องแก้ DB ตรง ๆ

### Note

ถ้าเวลาไม่พอ ให้ internal tool/script ก่อน UI

---

## T14 — Standardize API error shape for auth/tenant errors

### Objective

ทำให้ frontend และ backend คุยกันได้ชัดเมื่อเจอ auth/tenant problems

### Scope

กำหนด response shape สำหรับ:

* unauthorized
* forbidden
* invalid clinic context
* membership missing
* validation error

### Acceptance Criteria

* auth/tenant errors ใช้ shape เดียวกัน
* frontend handle ได้สม่ำเสมอ
* logs อ่านเข้าใจง่าย

---

## T15 — Environment & config baseline for Sprint 1

### Objective

ล็อก config ที่จำเป็นต่อ foundation

### Scope

* DB config
* auth secret/session config
* app env template
* migration command docs
* seed command docs

### Acceptance Criteria

* มี `.env.example` หรือเทียบเท่า
* dev ใหม่เปิดโปรเจกต์แล้วรันได้
* staging/local config ไม่ปะปนกัน
* secrets ไม่ hardcode ใน repo

---

## T16 — Add basic audit hooks for auth and clinic membership changes

### Objective

เริ่มวางนิสัย auditability ตั้งแต่ foundation

### Scope

ขั้นต่ำบันทึก action สำคัญ เช่น:

* login success/fail แบบ summarized
* clinic membership create/update
* role update

### Non-Goal

ยังไม่ต้องทำ audit log module เต็ม PR-08

### Acceptance Criteria

* action สำคัญมี log/event ขั้นพื้นฐาน
* debug ย้อนหลังได้ระดับหนึ่ง
* ไม่เก็บข้อมูล sensitive เกินจำเป็น

---

## T17 — Sprint 1 architecture review & schema freeze note

### Objective

สรุปสิ่งที่ build แล้วและล็อกขอบเขตเพื่อไม่ให้ PR-02 แตกออกนอกทาง

### Scope

ทำ note สั้น ๆ หลังจบ sprint:

* final schema decisions
* auth strategy
* current clinic strategy
* role model
* known debts
* explicit handoff to PR-02

### Acceptance Criteria

* มีเอกสาร handoff สั้น กระชับ ใช้งานจริง
* ทีมรู้ว่าของไหน lock แล้ว
* ของไหนยัง intentionally postponed ถูกระบุชัด

---

# Dependencies ระหว่าง Ticket

## กลุ่มต้นน้ำ

* **T1** ต้องมาก่อน T2, T4, T6, T8
* **T2** มาก่อน T3, T7, T9, T10
* **T4** มาก่อน T5, T11
* **T6** มาก่อน T7, T8, T12

## กลุ่มกลาง

* **T5 + T6 + T7** มาก่อน protected clinic APIs
* **T8** มาก่อน role-restricted paths
* **T9** มาก่อน integration tests ที่จริงจัง

## กลุ่มปลาย

* **T10, T14, T15, T16, T17** เป็น hardening/closing tickets ของ sprint

---

# Suggested Execution Order

## Phase A — Design Lock

1. T1 Define canonical domain model

## Phase B — Data Foundation

2. T2 Create migrations
3. T3 Add seed data

## Phase C — Auth Foundation

4. T4 Password-based auth
5. T5 Auth middleware / request identity

## Phase D — Clinic Context & Access

6. T6 Current clinic resolution
7. T7 Clinic membership lookup
8. T8 RBAC baseline guards
9. T9 Tenant-aware base repository/service pattern

## Phase E — Frontend Foundation

10. T11 Login UI + session bootstrap
11. T12 Current clinic state
12. T13 Membership admin utility

## Phase F — Hardening

13. T14 API error shape
14. T10 Tenant isolation integration tests
15. T15 Env/config baseline
16. T16 Basic audit hooks
17. T17 Architecture review & schema freeze

---

# Suggested Ticket Sizing

## S (เล็ก)

* T1
* T3
* T14
* T15
* T17

## M (กลาง)

* T5
* T7
* T8
* T11
* T12
* T13
* T16

## L (ใหญ่)

* T2
* T4
* T6
* T9
* T10

---

# Sprint 1 Acceptance Criteria รวม

Sprint 1 ถือว่าเสร็จเมื่อครบทั้งหมดนี้

## Functional

* user login ได้
* resolve current clinic ได้
* user เห็นเฉพาะ clinic ที่เป็นสมาชิก
* role baseline ใช้งานได้

## Technical

* migrations/seed รันได้
* request context ใช้งานได้
* service/repository มี tenant-aware pattern
* env/config พร้อมสำหรับทีม

## Safety

* cross-tenant access tests ผ่าน
* invalid clinic context ถูก reject
* auth/tenant errors เป็นมาตรฐานเดียวกัน

## Handoff Readiness

* PR-02 สามารถเริ่มสร้าง lead table และ lead APIs โดยยึด clinic context เดียวกันได้ทันที

---

# Suggested backlog labels

เพื่อให้คุมงานง่าย แนะนำติด label แบบนี้:

* `sprint-1`
* `pr-01`
* `foundation`
* `auth`
* `tenant`
* `rbac`
* `frontend`
* `backend`
* `infra`
* `test`
* `hardening`

---

# Recommended owner split ถ้าทีมมี 3 คน

## Backend Engineer

* T2, T4, T5, T6, T7, T8, T9, T10, T16

## Frontend Engineer

* T11, T12, T13, T14

## Tech Lead / Fullstack

* T1, T3, T15, T17
* review architecture, migrations, tenant safety

---

# Ticket template ที่ควรใช้

ทุก ticket ใช้ template นี้ได้เลย:

## Title

`[Sprint 1][PR-01] <ticket name>`

## Description

* Objective
* Scope
* Non-goals
* Dependencies

## Acceptance Criteria

* ...
* ...
* ...

## Test Notes

* unit/integration/manual cases

## Risks

* ...

## Rollback / Safe fallback

* ...

---

# ตัวอย่างชื่อ ticket พร้อมใช้

* `[Sprint 1][PR-01] Define canonical auth and tenant domain model`
* `[Sprint 1][PR-01] Create initial migrations for clinics users and clinic_users`
* `[Sprint 1][PR-01] Implement password-based authentication baseline`
* `[Sprint 1][PR-01] Implement current clinic resolution strategy`
* `[Sprint 1][PR-01] Add tenant isolation integration tests`

---

# สรุปตรงที่สุด

Sprint 1 ไม่ได้มีหน้าที่ “ทำให้ระบบดูเยอะ”
แต่มันต้องทำให้ 4 อย่างนี้ **แน่น**:

* Auth
* Clinic context
* Membership/role
* Tenant isolation

ถ้าสี่อย่างนี้แน่น Sprint 2 จะเริ่ม Lead CRM ได้เร็วและไม่ต้องย้อนมาซ่อมฐาน

