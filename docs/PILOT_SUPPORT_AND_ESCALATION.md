# Pilot Support And Escalation - FlowBiz Beauty

Date: 2026-05-27
Scope: friendly pilot support operations

## Purpose

This document defines how FlowBiz handles support, incidents, safety concerns, and stop conditions during a friendly pilot.

FlowBiz pilot support is not medical support, legal support, or emergency clinic operations support.

## Support Boundary

In scope:

- Login/access help
- Demo data questions
- HITL workflow support
- Template/workflow tuning
- Audit log review
- Pilot metric collection
- Staging availability issue triage

Out of scope:

- Medical advice
- Emergency patient handling
- EMR migration
- Payment reconciliation
- Full CRM migration
- Real LINE/AI integration unless separately approved
- Production support commitment

## Severity Matrix

| Severity | Definition | Examples | Target Response |
| --- | --- | --- | --- |
| Critical | Safety, privacy, or tenant isolation concern | Wrong clinic data visible, AI sent without approval, real provider mode unexpectedly enabled | Same business day, pause affected workflow |
| High | Pilot workflow blocked | Staff cannot log in, HITL queue unavailable, readiness unhealthy | Same business day |
| Medium | Workflow degraded | Template issue, metric mismatch, dashboard stale | 1-2 business days |
| Low | General question or enhancement | Wording preference, report format request | Next check-in or 3 business days |

Response targets are pilot operating targets, not a production SLA.

## Escalation Owners

| Area | Owner | Backup |
| --- | --- | --- |
| Pilot operations | `<name>` | `<name>` |
| Technical incident | `<name>` | `<name>` |
| Data handling concern | `<name>` | `<name>` |
| AI safety concern | `<name>` | `<name>` |
| Clinic decision owner | `<name>` | `<name>` |

## Pilot Stop Conditions

Pause the affected workflow if:

- AI-generated customer-facing message is sent without staff approval.
- Wrong tenant or wrong workspace data is exposed.
- Real LINE or real AI provider mode is enabled without approval.
- Sensitive medical records are imported outside agreed scope.
- Staff uses FlowBiz to give medical advice.
- Clinic requests production use before readiness review.
- Readiness endpoint is unhealthy and pilot data access is unreliable.

## Disable Or Rollback Workflow

For pilot workflow safety:

1. Pause the affected workflow.
2. Capture issue time, user, clinic, workspace, and action.
3. Confirm whether any customer-facing message was sent.
4. Disable external provider mode if relevant.
5. Confirm HITL queue state.
6. Preserve audit evidence.
7. Notify clinic owner with a concise incident note.
8. Decide whether to resume, limit scope, or stop pilot.

Do not run destructive rollback during pilot support.

## Communication Template

```text
Subject: FlowBiz Pilot Issue Update - <severity>

Clinic:
Time observed:
Affected workflow:
Current status:
Customer-facing impact:
Data/privacy impact:
Action taken:
Next step:
Owner:
Expected next update:

Note: AI-generated customer-facing messages remain staff-review only. Real LINE/AI provider modes are not enabled by default.
```

## Escalation Log

| Date | Severity | Issue | Owner | Action | Status |
| --- | --- | --- | --- | --- | --- |
| `<date>` | `<severity>` | `<issue>` | `<owner>` | `<action>` | `<status>` |

## Weekly Support Review

During weekly check-in, review:

- Open issues
- Severity changes
- Staff confusion points
- HITL rejections/modifications
- Workflow pauses
- Data handling exceptions
- Next-week support commitments
