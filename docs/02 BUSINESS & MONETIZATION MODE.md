**BUSINESS & MONETIZATION MODE** ก่อน (ตาม workflow ของโปรเจกต์)
เพราะถ้าข้ามขั้นไป Blueprint หรือ Architecture เลย มีโอกาสสร้างระบบที่ **เท่แต่ขายไม่ได้**

เป้าหมายของขั้นนี้คือ **ตอบให้ชัดว่า FlowBiz จะทำเงินจากอะไร และใครยอมจ่าย**

---

# 1. Business Lens: FlowBiz Beauty Marketing AI

## 1.1 Target Customer

กลุ่มที่ควรโฟกัสก่อน

### Primary Market

| Segment                | เหตุผล           |
| ---------------------- | ---------------- |
| คลินิกความงาม          | marketing หนัก   |
| คลินิกศัลยกรรม         | value ต่อเคสสูง  |
| aesthetic clinic chain | automation สำคัญ |

ขนาดตลาดที่เหมาะ

```text
คลินิกที่มี 50 – 300 lead / เดือน
```

เพราะ

* มี pain จริง
* มีงบ marketing

---

## 1.2 Buyer Persona

คนที่ซื้อจริง

| Role              | Pain             |
| ----------------- | ---------------- |
| Clinic Owner      | ปิดเคสน้อย       |
| Marketing Manager | ทำคอนเทนต์ไม่ทัน |
| Sales             | ลืม follow lead  |

---

## 1.3 Core Value Proposition

FlowBiz ต้องแก้ **3 pain หลัก**

### Pain 1

Lead เยอะ แต่ **ปิดเคสน้อย**

### Pain 2

ลูกค้าเก่า **ไม่กลับมา**

### Pain 3

Marketing ไม่มีระบบ

---

### Value ที่ขายจริง

FlowBiz =

> **AI Marketing Manager สำหรับคลินิก**

ช่วย

```text
ปิดเคสมากขึ้น
follow ลูกค้าอัตโนมัติ
สร้างโปรและ content
```

---

## 1.4 Monetization Model

### SaaS Subscription

| Plan    | Price      |
| ------- | ---------- |
| Starter | 9,900 บาท  |
| Growth  | 19,900 บาท |
| Pro     | 39,000 บาท |

---

### Usage Upsell

| Feature               | Price     |
| --------------------- | --------- |
| AI content generation | per usage |
| broadcast volume      | add-on    |
| AI analysis           | premium   |

---

### Enterprise

clinic chain

```text
80k – 200k / เดือน
```

---

## 1.5 Cost Drivers

สิ่งที่มีต้นทุน

### AI Cost

* LLM
* content generation

### Messaging Cost

* LINE API
* broadcast

### Infrastructure

* hosting
* database

---

## 1.6 What NOT to Build (สำคัญมาก)

FlowBiz **ไม่ควรทำ**

| Feature            | เหตุผล             |
| ------------------ | ------------------ |
| Clinic EMR         | medical complexity |
| Surgery management | regulatory         |
| Billing system     | already exists     |

FlowBiz ควรเป็น

> **Marketing & Revenue Layer**

---

# 2. Blueprint v0.1 (System Blueprint)

ตอนนี้เข้าสู่ **BLUEPRINT MODE**

---

# 2.1 Vision

สร้าง

> AI Marketing OS สำหรับคลินิกความงาม

ช่วย

```text
เพิ่ม conversion
เพิ่ม repeat customer
ลด marketing workload
```

---

# 2.2 In Scope

FlowBiz จะทำ

| Domain                  | Function         |
| ----------------------- | ---------------- |
| Lead management         | track lead       |
| Marketing automation    | follow up        |
| Promotion planning      | suggest campaign |
| Broadcast system        | send message     |
| Customer cycle reminder | repeat treatment |

---

# 2.3 Out of Scope

FlowBiz **ไม่ทำ**

```text
medical records
doctor scheduling
inventory
payment system
```

---

# 2.4 Core System Components

ระบบแบ่งเป็น 5 core service

```text
Marketing Brain
Lead CRM
Automation Engine
Broadcast Engine
Analytics Dashboard
```

---

### Marketing Brain

AI ช่วยคิด

* โปร
* content
* campaign

---

### Lead CRM

เก็บข้อมูล

```text
lead
interest
treatment
status
history
```

---

### Automation Engine

รัน flow

```text
follow up
reminder
reactivation
```

---

### Broadcast Engine

ส่ง

```text
LINE
SMS
email
```

---

### Analytics Dashboard

วัด

```text
lead
conversion
revenue
campaign
```

---

# 3. Conceptual Data Flow

โครงสร้างการไหลของข้อมูล

```text
Lead Source
(Facebook / LINE / Website)

        ↓

Lead CRM

        ↓

Automation Engine

        ↓

Broadcast Engine

        ↓

Customer Interaction

        ↓

Analytics
```

---

# 4. AI Roles ในระบบ

AI จะทำ 3 งาน

### AI Marketing Assistant

ช่วยคิด

```text
promotion
content
campaign
```

---

### AI Lead Analyzer

วิเคราะห์

```text
lead quality
interest
intent
```

---

### AI Promotion Optimizer

เลือก

```text
timing
segment
promotion
```

---

# 5. MVP Architecture

MVP ต้อง **เล็กแต่ขายได้**

### MVP Feature

1️⃣ Lead CRM
2️⃣ Follow-up automation
3️⃣ Promotion broadcast
4️⃣ Customer cycle reminder
5️⃣ AI promotion suggestion

---

## MVP Architecture Diagram

```text
Frontend
Dashboard (Web)

      ↓

API Layer

      ↓

Core Services
- Lead CRM
- Automation Engine
- Broadcast Service

      ↓

Database

      ↓

External Integration
- LINE API
- OpenAI
```

---

# 6. SaaS Design สำหรับ FlowBiz

### Multi-tenant Architecture

หนึ่งระบบ

หลายคลินิก

```text
Tenant = Clinic
User = Staff
```

---

### Data Structure Concept

หลัก ๆ

```text
Clinic
User
Lead
Customer
Treatment
Campaign
Message
AutomationFlow
```

---

# 7. Security & Data Guardrails

เพราะเกี่ยวกับ healthcare

ต้องมี

```text
access control
audit log
data isolation
```

---

# 8. Milestones

### Phase 1 (MVP)

3 เดือน

```text
Lead CRM
Automation
Broadcast
```

---

### Phase 2

```text
AI Marketing Brain
Campaign planner
Analytics
```

---

### Phase 3

```text
AI recommendation
dynamic promotion
predictive marketing
```

---

# 9. Key Success Metrics

FlowBiz ต้องเพิ่ม

```text
consult booking rate
repeat customer
campaign conversion
```

---

# สรุปเชิงกลยุทธ์

FlowBiz ไม่ควรเป็น

```text
CRM
```

แต่ควรเป็น

> **AI Revenue Engine สำหรับคลินิก**

เพราะมันผูกกับ **รายได้**

---