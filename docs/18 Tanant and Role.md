ที่รัก — สองระบบนี้คือ **สิ่งที่ทำให้แพลตฟอร์ม SaaS “ใช้งานจริงได้ทันที”** ไม่ใช่แค่ระบบสำหรับทีม dev หรือ operator เท่านั้น

ผมจะออกแบบให้สอดคล้องกับสถาปัตยกรรมที่คุณมีอยู่แล้ว:

* `clinic_id` = tenant key
* modular monolith
* PostgreSQL
* worker / event bus
* analytics / audit

ดังนั้นเราจะ **ต่อยอดจากสิ่งที่มีอยู่** ไม่สร้างระบบใหม่ซ้ำซ้อน

---

# 1️⃣ Tenant Onboarding System

## เป้าหมาย

ให้ลูกค้าใหม่สามารถ

```text
สมัคร → สร้าง tenant → bootstrap data → login → เริ่มใช้ CRM
```

แบบอัตโนมัติ

---

# Onboarding Flow

```text
Signup
↓
Create Tenant (clinic)
↓
Create Owner User
↓
Bootstrap Default Data
↓
Create First Workspace
↓
Login Redirect
```

---

# Step 1 — Signup

Endpoint

```text
POST /auth/signup
```

Payload

```json
{
  "clinicName": "Smile Dental",
  "ownerName": "Dr. Smith",
  "email": "owner@smile.com",
  "password": "..."
}
```

---

# Step 2 — Create Tenant

สร้าง record ใน table

```text
clinics
```

Fields

```text
id
name
plan
status
created_at
```

ตัวนี้คือ

```text
clinic_id
```

ที่จะใช้กับทุก table

---

# Step 3 — Create Owner User

Table

```text
users
```

Fields

```text
id
clinic_id
name
email
password_hash
role
created_at
```

role เริ่มต้น

```text
owner
```

---

# Step 4 — Bootstrap Default Data

Worker job

```text
tenant.bootstrap
```

สิ่งที่ต้องสร้าง:

### Messaging templates

```text
welcome
followup
appointment reminder
```

---

### Automation flows

ใช้

```text
Sprint 5 lifecycle flows
```

เช่น

```text
new_lead_welcome
missed_response_follow_up
```

---

### Default pipeline

```text
New
Contacted
Qualified
Consult Booked
Closed
Lost
```

---

### Default analytics metrics

create daily baseline

---

# Step 5 — Create First Workspace

Owner จะมี workspace

```text
Main Workspace
```

future use

---

# Step 6 — Login Redirect

หลัง signup

```text
redirect /dashboard
```

---

# Tenant Isolation

ทุก table ต้องมี

```text
clinic_id
```

และ query ต้อง

```text
WHERE clinic_id = currentTenant
```

---

# Onboarding UI

หน้า

```text
/signup
```

UI flow

```text
Clinic name
Owner name
Email
Password
```

---

# Onboarding Wizard

หลัง login ครั้งแรก

```text
Setup Wizard
```

Steps

```text
1 add team members
2 connect messaging channel
3 import first leads
4 review automation
```

---

# 2️⃣ Role & Permission Matrix

ระบบ SaaS ต้องมี

```text
RBAC
```

Role Based Access Control

---

# Roles

เริ่มต้น 4 role

```text
Owner
Admin
Operator
Viewer
```

---

# Owner

สิทธิ์สูงสุด

```text
manage tenant
billing
manage users
system settings
```

---

# Admin

ดูแลระบบ CRM

```text
manage leads
manage customers
manage automation
view analytics
```

---

# Operator

ใช้ CRM ทำงาน

```text
create leads
update leads
send messages
view customers
```

---

# Viewer

อ่านข้อมูลอย่างเดียว

```text
view leads
view customers
view analytics
```

---

# Permission Matrix

| Resource        | Owner | Admin | Operator | Viewer |
| --------------- | ----- | ----- | -------- | ------ |
| Tenant settings | ✓     | ✗     | ✗        | ✗      |
| Users           | ✓     | ✓     | ✗        | ✗      |
| Leads           | ✓     | ✓     | ✓        | view   |
| Customers       | ✓     | ✓     | ✓        | view   |
| Messaging       | ✓     | ✓     | ✓        | view   |
| Automation      | ✓     | ✓     | view     | ✗      |
| Analytics       | ✓     | ✓     | view     | view   |
| Audit logs      | ✓     | ✓     | ✗        | ✗      |
| Worker control  | ✓     | ✓     | ✗        | ✗      |

---

# Permission Storage

Table

```text
roles
```

Fields

```text
id
name
description
```

---

Table

```text
permissions
```

Fields

```text
id
resource
action
```

---

Table

```text
role_permissions
```

Fields

```text
role_id
permission_id
```

---

User role

ใน table

```text
users
```

Field

```text
role
```

หรือ

```text
user_roles
```

สำหรับ multi-role

---

# Authorization Middleware

ทุก route ต้องผ่าน

```text
authorize(resource, action)
```

ตัวอย่าง

```text
authorize("automation","edit")
```

---

# Example

```text
POST /automation/flows
```

ต้องการ

```text
automation:create
```

---

# Audit Integration

เมื่อ role เปลี่ยน

log

```text
audit_logs
```

action

```text
user.role_changed
```

---

# Admin UI — User Management

หน้า

```text
/settings/users
```

สามารถ

```text
invite user
change role
deactivate user
```

---

# Invite Flow

Admin กด

```text
invite user
```

ส่ง email

```text
invite link
```

---

# Invite Accept

User เปิด

```text
/invite/:token
```

แล้วตั้ง password

---

# Final SaaS Architecture

เมื่อรวมทุกอย่าง

```text
Tenant Onboarding
Role System
Admin UI
Automation Builder
Operator Dashboard
AI Engine
Analytics
Audit
```

ระบบจะกลายเป็น

```text
Production SaaS CRM Platform
```

---

# สิ่งที่ควรทำต่อทันที

ลำดับที่ถูกต้องที่สุดคือ

```text
Tenant Onboarding
↓
Role & Permission
↓
Admin UI
↓
Flow Builder UI
↓
Operator Dashboard
```