# Demo Clinic Script - FlowBiz Beauty

Phase: 7 - Demo clinic seed data
Date: 2026-05-26

## Purpose

This document defines the 15-minute MVP demo story for FlowBiz Beauty. The demo tenant shows FlowBiz as an AI Marketing & Revenue Automation Layer for beauty clinics, not as a full EMR, scheduling, inventory, or payment system.

All data is fake demo data. Do not use real patient, lead, LINE, or clinic data in this seed.

## Demo Seed

Run the base migrations first, then seed the demo clinic:

```powershell
npm run migrate
npm run seed:demo
```

The demo seed is intentionally separate from `npm run seed` so regular local/base seed data does not always include sales demo records.

Demo login:

- Clinic slug: `flowbiz-beauty-demo`
- Workspace slug: `beauty-revenue`
- Owner: `owner.demo@flowbiz.local`
- Admin: `admin.demo@flowbiz.local`
- Operator: `operator.demo@flowbiz.local`
- Password for all demo users: `DemoPass123!`

The password is a local demo credential only. It must not be reused for staging or production accounts.

## Seeded Demo Data

The seed creates:

- Demo clinic: `FlowBiz Beauty Demo Clinic`
- Organization and workspace for beauty revenue operations
- Owner, admin, and operator users with RBAC memberships
- LINE, Facebook, and email channels in simulated mode
- Six leads:
  - Facebook new lead
  - LINE new lead
  - Hot lead
  - Cold lead
  - No-show lead
  - Uncontacted lead
- Three customers:
  - Botox repeat customer at the 4-month cycle
  - Filler repeat customer at the 6-month cycle
  - Aftercare customer ready for review request
- Treatment history represented through customer timeline events
- Eight automation preset flows:
  - New Lead Welcome
  - Uncontacted Lead Alert
  - Lead Qualification Nurture
  - No-Show Recovery
  - Review Request
  - Botox Cycle Reminder
  - Filler Cycle Reminder
  - Daily Marketing Reminder
- Eight message templates matching the MVP use cases
- Pending AI suggestions in the HITL queue
- Demo audit events and dashboard metrics

## Fifteen-Minute Demo Story

### 0-2 minutes - Dashboard overview

Open the admin app as the demo owner and show the FlowBiz positioning:

- The clinic sees lead activity, repeat revenue opportunities, automation activity, and AI suggestions in one operating layer.
- The dashboard is a revenue operations view, not an EMR or doctor schedule.
- Point out that real sending is not automatic; staff approval is the safety gate.

### 2-4 minutes - Unified inbox and lead context

Open the unified inbox or lead list and show:

- Facebook lead asking about Botox
- LINE lead asking about filler
- Hot lead ready for consult
- Uncontacted lead that needs staff follow-up

Explain the operational problem:

- Leads arrive from multiple channels.
- Staff need a fast, consistent follow-up process.
- FlowBiz helps prevent lead leakage.

### 4-6 minutes - AI suggestion with HITL

Open the AI Agent or HITL queue and show pending suggestions:

- New lead reply suggestion
- No-show recovery suggestion
- Medical-sensitive suggestion labelled high risk

State the safety rule clearly:

- AI drafts only.
- Staff approval is required before outbound queueing.
- Medical-sensitive text remains pending until reviewed.

### 6-8 minutes - Staff approval

Approve or modify a low-risk suggestion in the demo flow:

- Show original text.
- If modifying, show before/after preservation.
- Explain that approval does not mean automatic external send; it only allows the next outbound action.

Demo proof point:

- The audit log records the approver, clinic/workspace context, status, risk label, and timestamps.

### 8-10 minutes - Automation execution

Open automation flows and show the eight preset flows.

Focus on:

- New Lead Welcome
- Uncontacted Lead Alert
- Lead Qualification Nurture
- Daily Marketing Reminder

Explain that flows are presets for clinic revenue operations and can be tuned per clinic during pilot.

### 10-12 minutes - No-show recovery and review request

Show the no-show lead and the recovery flow:

- AI suggests a soft recovery message.
- Staff can approve or edit.
- The flow helps recover missed consult opportunities.

Then show the aftercare customer:

- Review request template is ready after aftercare.
- The message avoids medical claims and does not promise outcomes.

### 12-14 minutes - Repeat treatment reminder

Show repeat customers:

- Botox customer at 4-month repeat cycle
- Filler customer at 6-month repeat cycle

Explain the revenue angle:

- FlowBiz surfaces repeat opportunities.
- Staff can approve reminders instead of manually tracking every cycle.
- This supports repeat revenue without replacing medical judgement.

### 14-15 minutes - Audit trail proof and close

Open audit logs and show:

- Demo seed event
- HITL pending demo event
- Automation demo-ready event
- Approval/modification/outbound queue events if the presenter performed the live approval step

Close with the MVP promise:

- Reduce lead leakage
- Increase repeat follow-up
- Standardize staff workflows
- Keep AI controlled by RBAC, HITL, audit trail, and medical safety rules

## Demo Readiness Checklist

Before presenting:

- `npm run migrate` completed
- `npm run seed:demo` completed
- Demo owner login works
- Dashboard has daily metrics
- Lead list has at least six demo leads
- Customer list has Botox, filler, and aftercare customers
- Automation page shows eight active demo flows
- HITL queue has at least three pending AI suggestions
- Audit log contains demo events
- LINE and AI integrations remain simulated unless an explicit staging test plan enables real mode

## Validation

The seed script verifies:

- Demo login succeeds
- At least six leads exist
- At least three customers exist
- At least eight active automation flows exist
- At least three pending HITL records exist
- Demo audit trail exists
- Dashboard metrics exist for the demo clinic

Use:

```powershell
npm run seed:demo
```

Expected output includes JSON with `lead_count`, `customer_count`, `flow_count`, `hitl_count`, `audit_count`, and `dashboard_count`.

## Residual Risks

- Treatment history is represented through `customer_events`; there is no dedicated treatment table in the current MVP schema.
- Demo outbound delivery remains simulated. Do not present it as real LINE sending.
- The HITL queue currently covers lead-scoped AI suggestions. Customer and broadcast AI approval should be generalized in a later phase.
- Demo users use shared local credentials and must not be created in production.
