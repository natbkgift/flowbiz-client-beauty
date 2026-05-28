# Clinic Alpha - Day 1 Workflow Activation (PR-22)

Document type: Opening-day workflow activation scope
Pilot clinic: Clinic Alpha (pseudonym only)
Date: 2026-05-28
Start timestamp: 2026-05-28T08:53:41+07:00

---

## 1) Allowed Workflow Scope

Allowed Day 1 workflow paths:
1. New Lead Welcome.
2. Uncontacted Lead Alert.
3. No-Show Recovery.
4. Review Request.
5. Botox/Filler Repeat Reminder.

All selected workflow paths require HITL for customer-facing drafts.

---

## 2) Live Workflow Evidence

| Workflow Scope | Staging Representation | Day 1 Status |
|---|---|---|
| New Lead Welcome | Active workflow present | ALLOWED |
| Uncontacted Lead Alert | Active workflow present | ALLOWED |
| No-Show Recovery | Active workflow present | ALLOWED |
| Review Request | Active workflow present | ALLOWED |
| Botox/Filler Repeat Reminder | Botox Cycle Reminder + Filler Cycle Reminder | ALLOWED_WITH_MAPPING |

---

## 3) Excluded Workflow Scope

Excluded from Clinic Alpha Day 1 operation:
1. Daily Marketing Reminder.
2. Lead Qualification Nurture.

Handling:
1. Excluded workflows are treated as demo workspace artifacts.
2. Operators must not use excluded workflows in Day 1 operations.
3. If an excluded workflow triggers operationally, pause Day 1 and review scope.

---

## 4) Activation Guardrails

1. No broadcast.
2. No automatic AI send.
3. No workflow outside selected scope.
4. No broad import to populate workflow inputs.
5. No medical record or full chat history input.
6. Audit events must remain visible.

---

## 5) Workflow Activation Decision

Workflow activation status:
- ACTIVE_LIMITED_SCOPE_WITH_EXCLUSIONS
