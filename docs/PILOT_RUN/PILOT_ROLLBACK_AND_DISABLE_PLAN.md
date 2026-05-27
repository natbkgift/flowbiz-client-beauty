# Pilot Rollback and Disable Plan — FlowBiz Beauty

Date: 2026-05-28
Version: 1.0

---

## Purpose

This document defines the exact steps to disable the pilot immediately, safely, and completely.
It covers: environment switches, user access, data handling, incident response, and owner notification.

> **This plan must be executable at any time during the pilot, by any FlowBiz technical owner.**
> All actions are on staging infrastructure only. Production is not in scope.

---

## Trigger Conditions

Activate this plan when **any** of the following occur:

| Trigger | Severity |
|---|---|
| AI auto-send to real customer (HITL bypass) | Critical — immediate |
| Real data exposure (national ID, payment, medical) | Critical — immediate |
| Tenant isolation breach | Critical — immediate |
| Unauthorized access to staging system | Critical — immediate |
| Owner withdrawal of consent | High — same day |
| Staff refusal to continue | High — same day |
| Sustained outage FlowBiz cannot resolve | High — within 4h |
| Pilot score NO-GO at exit evaluation | Planned — end of pilot |
| Any other request from FlowBiz technical owner | Per decision |

---

## Step 1 — Disable Real LINE Send (Immediate)

> **Do this first if a real-send incident has occurred or is suspected.**

### SSH to staging server

```bash
ssh <DEPLOY_USER>@<STAGING_HOST>
```

### Edit staging env file

```bash
sudo nano /etc/flowbiz/flowbiz-beauty-staging.env
```

Change:
```
LINE_INTEGRATION_MODE=real
LINE_REAL_SEND_ENABLED=true
```
To:
```
LINE_INTEGRATION_MODE=simulated
LINE_REAL_SEND_ENABLED=false
```

### Restart API process

```bash
sudo systemctl restart flowbiz-api
# or via PM2:
pm2 restart flowbiz-api
```

### Verify

```bash
curl https://<STAGING_HOST>/api/ready
# Confirm: {"status":"ok"}
```

> After this step, no LINE messages can be sent from the staging system.
> All LINE send calls will be logged as simulated and will not reach real contacts.

---

## Step 2 — Disable AI Real Generation (Immediate)

### Edit staging env file

```bash
sudo nano /etc/flowbiz/flowbiz-beauty-staging.env
```

Change:
```
AI_PROVIDER=gemini
AI_REAL_GENERATION_ENABLED=true
```
To:
```
AI_PROVIDER=mock
AI_REAL_GENERATION_ENABLED=false
```

### Restart API process

```bash
sudo systemctl restart flowbiz-api
# or via PM2:
pm2 restart flowbiz-api
```

> After this step, all AI suggestions will return mock/placeholder text only.
> No real Gemini API calls will be made.

---

## Step 3 — Disable All Clinic User Accounts

Revoke access for all clinic accounts in staging:

```sql
-- Run against staging database only
UPDATE workspace_memberships
SET status = 'disabled'
WHERE workspace_id = '<PILOT_CLINIC_WORKSPACE_ID>';
```

Or via admin UI (if available):
- Navigate to workspace admin → members
- Set each clinic member to inactive/disabled

Verify:
- [ ] Clinic operator can no longer log in
- [ ] Clinic owner account is disabled
- [ ] FlowBiz operator account remains active

---

## Step 4 — Pause Workflow Automations

Pause all running workflow automations for the pilot clinic:

```sql
-- Run against staging database only
UPDATE automation_workflows
SET enabled = false
WHERE workspace_id = '<PILOT_CLINIC_WORKSPACE_ID>';
```

Or via admin UI: pause all workflows in the clinic workspace.

---

## Step 5 — Export or Delete Data (Per Clinic Request)

### If clinic requests data export

- Export lead records: `<format: CSV / JSON>`
- Export audit trail: `<CSV>`
- Deliver securely to clinic owner via agreed channel
- Record export event in pilot documentation

### If clinic requests data deletion (or default on pilot close)

```sql
-- STAGING ONLY — Run only after confirming with FlowBiz technical owner
-- Replace <PILOT_CLINIC_WORKSPACE_ID> with actual workspace UUID

DELETE FROM messages WHERE workspace_id = '<PILOT_CLINIC_WORKSPACE_ID>';
DELETE FROM leads WHERE workspace_id = '<PILOT_CLINIC_WORKSPACE_ID>';
DELETE FROM contacts WHERE workspace_id = '<PILOT_CLINIC_WORKSPACE_ID>';
DELETE FROM automation_logs WHERE workspace_id = '<PILOT_CLINIC_WORKSPACE_ID>';
-- Do NOT delete audit_trail rows — archive them
```

> **All deletions require prior written confirmation from:**
> - [ ] FlowBiz technical owner
> - [ ] Clinic owner (if real or pseudonymized data was present)

### Audit trail preservation

Do not delete audit trail rows. Archive them:

```sql
-- Mark as archived; do not delete
UPDATE audit_trail
SET archived = true
WHERE workspace_id = '<PILOT_CLINIC_WORKSPACE_ID>';
```

---

## Step 6 — Emergency Incident Response

If a real-send incident or data exposure has occurred:

1. **Stop** — Execute Steps 1–4 immediately
2. **Document** — Record exact timestamp, what was sent/exposed, affected contact(s)
3. **Preserve evidence** — Do not delete any logs
4. **Notify FlowBiz technical owner** within 30 minutes
5. **Notify clinic owner** within agreed SLA (same day for high severity)
6. **File incident report** (see template below)
7. **Assess whether PDPA notification is required** — consult clinic owner and legal counsel
8. **Do not restart real-send mode** without full post-incident review

---

## Incident Report Template

```
Incident Report — FlowBiz Beauty Pilot
Date/Time: <DATE> <TIME>
Severity: Critical / High / Medium

Summary:
<Describe what happened>

What was affected:
- Real LINE messages sent: <Yes / No> — Count: <N>
- Data exposed: <Describe>
- Contacts affected: <Pseudonym IDs only>

Root cause (preliminary):
<Describe>

Immediate actions taken:
1. <Action 1> — Time: <TIME>
2. <Action 2> — Time: <TIME>

Owner notification:
- FlowBiz technical owner notified: <Yes / No> — Time: <TIME>
- Clinic owner notified: <Yes / No> — Time: <TIME>

Evidence preserved:
- Audit trail: <Yes / No>
- Server logs: <Yes / No>

PDPA notification required: <Yes / No / Unclear — escalate>

Post-incident review scheduled: <DATE>
Signed by: <FLOWBIZ_OPERATOR> — <DATE>
```

---

## Step 7 — Owner Notification Template

Send to clinic owner at time of rollback or pilot close:

```
เรียน คุณ <CLINIC_OWNER_NAME>,

ทีม FlowBiz ขอแจ้งว่าระบบ pilot สำหรับ <CLINIC_NAME> ได้รับการปิดชั่วคราว / สิ้นสุดแล้ว ณ วันที่ <DATE>

สาเหตุ: <Describe reason briefly>

สิ่งที่เราดำเนินการแล้ว:
1. ปิดการส่ง LINE ทั้งหมด
2. ปิดการสร้าง AI suggestions
3. ระงับการเข้าถึงของพนักงาน
4. ข้อมูลถูกเก็บรักษา / ลบ (แล้วแต่กรณี) ตามที่ตกลงไว้

ขั้นตอนถัดไป: <Next steps or "will contact within X days">

หากมีข้อสงสัยกรุณาติดต่อ: <FLOWBIZ_SUPPORT_CONTACT>

ขอบคุณครับ/ค่ะ
FlowBiz Team
```

---

## Step 8 — Post-Incident Review

Schedule within 48h of any Critical/High incident:

- [ ] Timeline reconstruction complete
- [ ] Root cause identified
- [ ] Affected contacts documented (pseudonymized)
- [ ] Corrective action defined
- [ ] PDPA obligation assessed
- [ ] Control gaps identified
- [ ] Updated plan to prevent recurrence

---

## Rollback Verification Checklist

After completing rollback steps:

| Check | Status |
|---|---|
| LINE mode = simulated, real send = false | `[ ]` |
| AI mode = mock, real generation = false | `[ ]` |
| All clinic user accounts disabled | `[ ]` |
| All workflows paused | `[ ]` |
| No outbound LINE calls in last 15 min | `[ ]` |
| Audit trail preserved | `[ ]` |
| Clinic owner notified | `[ ]` |
| Incident report filed (if applicable) | `[ ]` |

---

## References

- [PILOT_LINE_GEMINI_OPERATING_MODE.md](PILOT_LINE_GEMINI_OPERATING_MODE.md)
- [PILOT_DATA_INTAKE_CHECKLIST.md](PILOT_DATA_INTAKE_CHECKLIST.md)
- [PILOT_STAFF_ACCESS_PLAN.md](PILOT_STAFF_ACCESS_PLAN.md)
- [PILOT_EXIT_AND_CONVERSION_CRITERIA.md](PILOT_EXIT_AND_CONVERSION_CRITERIA.md)
- [../ROLLBACK_PROCEDURE.md](../ROLLBACK_PROCEDURE.md)
- [../REAL_LINE_ROLLBACK_CHECKLIST.md](../REAL_LINE_ROLLBACK_CHECKLIST.md)
- [../REAL_GEMINI_ROLLBACK_CHECKLIST.md](../REAL_GEMINI_ROLLBACK_CHECKLIST.md)
- [../PDPA_CONSENT_FOUNDATION.md](../PDPA_CONSENT_FOUNDATION.md)
