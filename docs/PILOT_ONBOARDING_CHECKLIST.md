# Pilot Onboarding Checklist - FlowBiz Beauty

Date: 2026-05-27
Scope: friendly pilot clinic onboarding, 14-30 days

## Purpose

Use this checklist to onboard a friendly pilot clinic into FlowBiz Beauty without over-collecting data, enabling unsafe provider modes, or presenting the system as a production replacement for existing clinic systems.

FlowBiz Beauty is an AI Marketing and Revenue Automation Layer. It is not an EMR, doctor scheduling system, inventory system, payment system, or full CRM replacement.

## Pilot Prerequisites

Before onboarding:

- Pilot owner is assigned by the clinic.
- FlowBiz operator is assigned.
- Pilot dates are agreed.
- Pilot workflows are selected from the MVP scope.
- Data mode is agreed: demo, pseudonymized, or limited clinic-approved operational data.
- Consent/data handling approach is reviewed by the clinic owner.
- Staff roles are identified.
- Support and escalation contacts are confirmed.
- Real LINE send is not enabled by default.
- Real AI provider generation is not enabled by default.

## Staff Roles

| Role | Responsibility |
| --- | --- |
| Clinic owner/manager | Approves pilot scope, data mode, success criteria, and paid conversion decision |
| Clinic admin | Manages staff access, reviews metrics, and joins weekly check-ins |
| Clinic operator/staff | Reviews HITL queue, approves/rejects/edits AI drafts, and records workflow feedback |
| FlowBiz operator | Runs onboarding, monitors pilot workflow, prepares weekly reports, and escalates issues |
| FlowBiz technical owner | Handles staging, incidents, safety concerns, and integration readiness decisions |

## Onboarding Flow

### Step 1 - Scope Confirmation

- Confirm pilot duration: 14-30 days.
- Confirm selected workflows.
- Confirm what is out of scope.
- Confirm data mode.
- Confirm success metrics.
- Confirm stop conditions.

### Step 2 - Demo First

- Use the demo tenant first.
- Show dashboard overview.
- Show unified lead flow.
- Show HITL queue.
- Show approve/reject/modify behavior.
- Show audit log proof.
- Explain that approval is required before customer-facing AI-generated messages can move outbound.

### Step 3 - Staff Setup

- Create only the staff accounts needed for the pilot.
- Assign least-privilege roles.
- Confirm staff can log in.
- Confirm staff know where to review AI suggestions.
- Confirm staff know who to contact for support.

### Step 4 - Workflow Setup

Select pilot workflows:

- New Lead Welcome
- Uncontacted Lead Alert
- Lead Qualification Nurture
- No-Show Recovery
- Review Request
- Botox Cycle Reminder
- Filler Cycle Reminder
- Daily Marketing Reminder

Start with 3-5 workflows if staff capacity is limited.

### Step 5 - Safety Briefing

Explain:

- AI drafts only.
- Staff approval is required.
- Medical advice should not be generated or sent through FlowBiz.
- No sensitive medical records should be imported.
- Audit logs exist for key actions.
- Real external send/provider modes require separate QA.

## Demo Data Setup

Recommended first session:

```text
npm run seed:demo
```

Use fake demo data for first walkthrough. Do not use real customer data during the first sales/demo onboarding unless the clinic owner explicitly approves a limited data pilot.

## HITL Explanation

Use this language:

```text
FlowBiz can draft a suggested follow-up, but staff must approve, reject, or edit it. A rejected suggestion cannot be sent. A modified suggestion keeps both original and edited text for audit trail.
```

## Support Contacts

Fill before pilot starts:

| Contact | Name | Channel | Hours |
| --- | --- | --- | --- |
| FlowBiz pilot operator | `<name>` | `<LINE/email/phone>` | `<hours>` |
| FlowBiz technical owner | `<name>` | `<channel>` | `<hours>` |
| Clinic owner/manager | `<name>` | `<channel>` | `<hours>` |
| Clinic staff lead | `<name>` | `<channel>` | `<hours>` |

## Safety Reminders

- Do not import national ID, passport, payment card, EMR, diagnosis, medication, allergy, procedure photo, or full chat history unless separately approved and reviewed.
- Do not enable real LINE or real AI provider mode during normal pilot onboarding.
- Do not promise financial outcome.
- Do not present AI as medical advice.
- Do not bypass HITL.

## Onboarding Completion Criteria

Pilot is ready to start when:

- Clinic owner approves pilot scope.
- Staff can log in.
- Selected workflows are visible.
- HITL queue is explained.
- Support contacts are confirmed.
- Data mode is documented.
- Safety reminders are acknowledged.
- Baseline metrics are captured or marked as estimated.
