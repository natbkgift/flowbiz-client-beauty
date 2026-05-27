# Pilot LINE and Gemini Operating Mode — FlowBiz Beauty

Date: 2026-05-28
Version: 1.0

---

## Purpose

This document defines the exact operating mode for LINE and Gemini during the first friendly pilot.
It is binding for all FlowBiz operators and must be reviewed before Day 0.

---

## Default Mode (Pre-Pilot / Demo Phase)

| Setting | Value |
|---|---|
| LINE integration mode | `simulated` |
| LINE real send | `disabled` |
| AI provider | `mock` |
| AI real generation | `disabled` |

In this mode:
- No real LINE messages are sent to anyone
- AI outputs are from mock provider (deterministic test responses)
- Full audit trail still runs
- HITL queue still works — ideal for staff training

---

## LINE Mode for Pilot

### Allowed Modes

| Mode | When | ENV |
|---|---|---|
| `simulated` (default) | Always safe; use for demo and training | `LINE_INTEGRATION_MODE=simulated` |
| `real` (restricted) | Only after QA gate and technical owner approval | `LINE_INTEGRATION_MODE=real` |

### Conditions for Enabling Real LINE

Real LINE send may only be enabled when **ALL** of the following are true:

- [ ] Clinic has an active LINE Official Account connected to staging
- [ ] LINE channel access token is stored securely outside the repo (server env file)
- [ ] FlowBiz technical owner has confirmed LINE QA gate passed
- [ ] Pilot scope is limited to approved workflows only (no broadcast)
- [ ] `LINE_REAL_SEND_ENABLED=true` is set **only** in the staging env file — not committed to repo
- [ ] At least 1 HITL approver is active before first real send
- [ ] Pilot operator has reviewed outbound rules with staff

### What Is Allowed Under Real LINE

- Single message sends to specific leads/customers only
- Staff-approved (HITL) messages only
- Replies to inbound LINE messages (if LINE webhook is connected)
- No scheduled batch sends
- No broadcast
- No AI auto-send without HITL

### What Is Never Allowed

- Broadcast to any number of recipients
- AI-generated text sent directly without HITL approval
- Sending to customers who have not given consent
- Sending content with medical guarantees, outcome claims, or prohibited phrases
- Line sends from production environment

---

## Gemini Mode for Pilot

### Allowed Modes

| Mode | When | ENV |
|---|---|---|
| `mock` (default) | Always safe; use for demo and training | `AI_PROVIDER=mock` |
| `gemini` (restricted) | Only after QA gate and technical owner approval | `AI_PROVIDER=gemini` |

### Conditions for Enabling Real Gemini

Real Gemini generation may only be enabled when **ALL** of the following are true:

- [ ] Gemini API key is stored securely outside the repo (server env file)
- [ ] FlowBiz technical owner has confirmed Gemini QA gate passed (per `docs/REAL_GEMINI_QA_PLAN.md`)
- [ ] HITL queue is confirmed working — AI suggestions cannot bypass review
- [ ] `AI_REAL_GENERATION_ENABLED=true` is set **only** in the staging env file — not committed to repo
- [ ] Pilot operator is monitoring HITL queue at minimum once per operating day
- [ ] Prohibited content filter is in place (see `AI_MEDICAL_SAFETY_POLICY.md`)

### What Gemini Is Allowed To Do

- Generate draft suggestions for selected workflows (New Lead Welcome, No-Show Recovery, etc.)
- Generate text that enters HITL review queue as `pending_approval`
- Generate conservative, helpful, non-medical marketing messages

### What Gemini Is Never Allowed To Do

- Send output directly to LINE without HITL approval
- Generate medical advice, diagnosis, prescription, or treatment instructions
- Generate text with medical outcome guarantees
- Generate prohibited phrases: "ปลอดภัย 100%", "เห็นผลแน่นอน", "หายแน่นอน"
- Generate content for broadcast
- Access customer data beyond what is passed in the workflow context

---

## HITL Requirement Summary

| Step | Rule |
|---|---|
| AI generates draft | Enters `pending_approval` queue |
| Staff reviews | Approve / Modify / Reject |
| Approved | Status → `approved` or `modified`; eligible for outbound queue |
| Rejected | Status → `rejected`; cannot be sent |
| Outbound | Separate deliberate action required; not automatic on approval |
| Audit | Every event recorded: generated, approved, rejected, modified, queued, sent |

**Zero tolerance**: Any AI message that reaches LINE without a matching HITL approval event is a critical violation.
Trigger: immediate pilot pause + incident review.

---

## Outbound Approval Rule

Before any real outbound message is sent:

1. Confirm message has status `approved` or `modified`
2. Confirm message source is `ai` and `approved: true` in metadata
3. Confirm recipient has consent for the outreach channel
4. Staff presses "send" or queues for outbound explicitly
5. Audit event `ai.hitl_outbound_queued` is recorded

---

## Rollback Switches

To disable LINE real send immediately:

```
# On staging server env file
LINE_REAL_SEND_ENABLED=false
LINE_INTEGRATION_MODE=simulated
```

Restart API service after change. No code deployment required.

To disable Gemini real generation immediately:

```
# On staging server env file
AI_REAL_GENERATION_ENABLED=false
AI_PROVIDER=mock
```

Restart API service after change. No code deployment required.

> These env files must never be committed to the repository.
> Changes are applied on the staging server only.

---

## Daily Verification Checklist

Each operating day during the pilot, the FlowBiz operator must confirm:

**LINE:**
- [ ] LINE integration mode matches current approved setting
- [ ] No unexpected real sends found in audit log since last check
- [ ] No broadcast events in audit log

**Gemini / AI:**
- [ ] AI provider mode matches current approved setting
- [ ] No AI-generated messages have `approved: false` in outbound queue
- [ ] HITL queue has no items pending > 24h without review
- [ ] No prohibited phrases found in approved messages (spot check)

**General:**
- [ ] Staging `/api/ready` returns healthy
- [ ] Audit trail is readable and up to date
- [ ] No critical errors in server log since last check

---

## Operating Window

If real LINE or real Gemini is approved for the pilot, define the approved operating window:

| Setting | Value |
|---|---|
| Operating days | `<e.g. Mon–Sat>` |
| Operating hours | `<e.g. 09:00–18:00 ICT>` |
| Outside operating hours | Revert to simulated/mock by env flag or supervisor review |
| Holiday exception | By FlowBiz technical owner approval only |

> Operating window reduces risk of unreviewed AI messages accumulating overnight.

---

## ENV Variable Reference

| Variable | Safe Default | Pilot Real Mode |
|---|---|---|
| `LINE_INTEGRATION_MODE` | `simulated` | `real` (if approved) |
| `LINE_REAL_SEND_ENABLED` | `false` | `true` (if approved) |
| `AI_PROVIDER` | `mock` | `gemini` (if approved) |
| `AI_REAL_GENERATION_ENABLED` | `false` | `true` (if approved) |

> **Never commit `LINE_REAL_SEND_ENABLED=true` or `AI_REAL_GENERATION_ENABLED=true` to the repository.**
> These values belong in server-side env files only (`/etc/flowbiz/flowbiz-beauty-staging.env`).

---

## References

- [PILOT_SCOPE_AND_BOUNDARIES.md](PILOT_SCOPE_AND_BOUNDARIES.md)
- [PILOT_ROLLBACK_AND_DISABLE_PLAN.md](PILOT_ROLLBACK_AND_DISABLE_PLAN.md)
- [../HITL_APPROVAL_CONTRACT.md](../HITL_APPROVAL_CONTRACT.md)
- [../AI_MEDICAL_SAFETY_POLICY.md](../AI_MEDICAL_SAFETY_POLICY.md)
- [../REAL_GEMINI_QA_PLAN.md](../REAL_GEMINI_QA_PLAN.md)
- [../REAL_LINE_QA_PLAN.md](../REAL_LINE_QA_PLAN.md)
- [../LINE_INTEGRATION_RUNBOOK.md](../LINE_INTEGRATION_RUNBOOK.md)
