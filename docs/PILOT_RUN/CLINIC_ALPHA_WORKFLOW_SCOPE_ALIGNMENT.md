# Clinic Alpha - Workflow Scope Alignment (PR-21)

Document type: Selected workflow scope alignment and exception note
Pilot clinic: Clinic Alpha (pseudonym only)
Date: 2026-05-28
Canonical staging URL: https://beauty.flowbiz.cloud

---

## 1) Selected Day 1 Workflow Scope

Selected workflows for Clinic Alpha Day 1:
1. New Lead Welcome.
2. Uncontacted Lead Alert.
3. No-Show Recovery.
4. Review Request.
5. Botox/Filler Repeat Reminder.

PR-21 live recheck confirms all selected workflow paths are represented in the demo staging workspace.

---

## 2) Live Workflow Evidence

| Workflow | PR-21 Evidence | Result |
|---|---|---|
| New Lead Welcome | Active workflow present | PASS |
| Uncontacted Lead Alert | Active workflow present | PASS |
| No-Show Recovery | Active workflow present | PASS |
| Review Request | Active workflow present | PASS |
| Botox/Filler Repeat Reminder | Represented by Botox Cycle Reminder and Filler Cycle Reminder | PASS_WITH_MAPPING |

---

## 3) Extra Demo Workflow Exception

Extra active demo workflows observed:
1. Daily Marketing Reminder.
2. Lead Qualification Nurture.

Exception handling:
1. These remain excluded from Clinic Alpha Day 1 operating scope.
2. They are treated as demo workspace artifacts, not Day 1 pilot workflows.
3. FlowBiz-Ops must not use these paths in the Day 1 start log.
4. FlowBiz-Tech must pause or isolate them before operational use if they can trigger outside the selected scope.
5. No broad data import or outbound send was performed in PR-21.

---

## 4) Acceptance

Sanitized role-level acceptance:
1. Owner-A: accepts the selected five-workflow Day 1 scope with extra demo workflows excluded from operation.
2. FlowBiz-Ops: accepts operator control to use only selected workflow paths.
3. FlowBiz-Tech: accepts the requirement to keep excluded paths from operational use.

---

## 5) Scope Status

Workflow scope status:
- ACCEPTED_WITH_DEMO_ONLY_EXCLUDED_PATHS
