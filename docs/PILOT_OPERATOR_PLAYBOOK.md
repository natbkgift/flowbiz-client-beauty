# Pilot Operator Playbook - FlowBiz Beauty

Date: 2026-05-27
Scope: FlowBiz operator workflow for friendly pilots

## Purpose

This playbook gives the FlowBiz pilot operator a weekly operating rhythm for demo/pilot support, HITL review, audit review, reporting, and issue triage.

The operator must not enable real provider modes, import sensitive data, or present FlowBiz as a medical or production system during the friendly pilot.

## Weekly Rhythm

| Cadence | Operator Action |
| --- | --- |
| Daily during active pilot | Check staging health, review open issues, confirm no real provider mode |
| 2-3 times per week | Review HITL queue counts and approval patterns |
| Weekly | Run check-in with clinic owner/staff |
| End of pilot | Prepare pilot report and paid conversion recommendation |

## Start Of Week Checklist

- Confirm `/api/ready` is healthy.
- Confirm staging env remains safe: LINE simulated and AI mock.
- Review open support issues.
- Review last week's HITL metrics.
- Confirm selected workflows for the week.
- Confirm clinic staff know the weekly focus.

## Demo Login

Default demo tenant:

```text
Clinic slug: flowbiz-beauty-demo
Workspace slug: beauty-revenue
Owner: owner.demo@flowbiz.local
Password: DemoPass123!
```

Use this only for demo/staging. Do not create these credentials in production.

## Queue Review

Review:

- HITL pending count
- Approved suggestions
- Rejected suggestions
- Modified suggestions
- High-risk labels
- Oldest pending item
- Staff member performing approvals

Operator questions:

- Are staff reviewing daily?
- Are suggestions too generic?
- Are staff modifying the same wording repeatedly?
- Are medical-risk labels appearing?
- Are rejected suggestions useful for prompt/template tuning?

## Audit Review

Review audit log for:

- Demo seed events
- HITL queue views
- HITL approvals
- HITL rejections
- HITL modifications
- Outbound queue attempts
- User/role changes
- Any unexpected provider event

If an expected audit event is missing, record it as a pilot issue.

## HITL Review Process

Operator should reinforce:

- AI drafts only.
- Staff approves, rejects, or edits.
- Rejected suggestions cannot be sent.
- Modified suggestions preserve before/after text.
- Medical or claim-sensitive wording should be rejected or edited conservatively.
- Approval does not replace clinic judgement.

## Safe Messaging Guidance

Prefer:

- Invitation to consult
- Neutral follow-up
- Review request after service
- Reminder to contact clinic
- Clear staff-owned next step

Avoid:

- Diagnosis
- Treatment guarantee
- Absolute safety claim
- Medical instruction
- Pressure tactics
- Sensitive personal details
- Any statement the clinic would not approve manually

## Pilot Reporting Cadence

Weekly report should include:

- Response time trend
- Uncontacted leads
- HITL pending/approved/rejected/modified
- No-show recovery attempts
- Review request attempts
- Botox/Filler repeat opportunities
- Staff adoption
- Issues/risks
- Conservative opportunity notes
- Next action owner

Use:

- `docs/PILOT_WEEKLY_CHECKIN_TEMPLATE.md`
- `docs/PILOT_SUCCESS_METRICS_SCORECARD.md`
- `docs/PILOT_REPORT_TEMPLATE.md`

## Issue Triage

For each issue:

1. Classify severity.
2. Identify affected workflow.
3. Confirm customer-facing impact.
4. Confirm data/privacy impact.
5. Capture evidence.
6. Assign owner.
7. Decide continue, pause, or stop.
8. Update support log.

## Conversion Readiness

A clinic is ready for paid conversion discussion when:

- Staff used the workflow outside demo sessions.
- HITL queue was reviewed consistently.
- Owner sees value in at least one workflow.
- No critical safety issue is open.
- Data handling boundary is clear.
- Support owner is assigned.
- Pricing and scope are understood.

Paid onboarding remains conditional until integration scope and support expectations are agreed.
