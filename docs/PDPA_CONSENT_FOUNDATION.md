# PDPA Consent Foundation - FlowBiz Beauty

Date: 2026-05-27
Scope: Post-Phase 10 PR 3 - consent and data handling foundation

## Purpose

This document defines a consent and personal-data handling foundation for FlowBiz Beauty before friendly pilot clinics use real or clinic-approved customer data.

It is intended to guide product, engineering, operations, and clinic-owner review for:

- marketing consent
- contact channel consent
- AI processing notice
- pilot data minimization
- data retention
- staff access control
- data subject request workflow
- audit trail preservation

## Scope

This foundation applies to FlowBiz Beauty MVP workflows:

1. New Lead Welcome
2. Uncontacted Lead Alert
3. Lead Qualification Nurture
4. No-Show Recovery
5. Review Request
6. Botox Cycle Reminder
7. Filler Cycle Reminder
8. Daily Marketing Reminder

It applies to demo, friendly pilot, staging, and future production planning. It does not convert FlowBiz into an EMR, medical record system, diagnosis tool, or doctor scheduling system.

## Important Disclaimer

This document is a draft for legal, clinic owner, and operator review. It is not legal advice and must not be treated as a final legal compliance opinion.

Before using real patient, lead, or customer data, the clinic and FlowBiz operator should confirm the final consent text, data processing scope, retention period, and operating procedure with qualified legal counsel or the clinic's responsible compliance owner.

## Data Minimization Principle

Collect and process only the minimum data needed to support the selected pilot workflow.

Do not import or store data just because it is available. For pilot work, prefer fake demo data first, then clinic-approved sample data, then limited real operational data only after explicit approval.

## Data Categories

### Lead/Customer Data

Potentially needed:

- name or display name
- lead/customer status
- source channel
- assigned staff
- high-level interest category, such as Botox, filler, facial, surgery inquiry
- follow-up status
- last contact timestamp
- no-show marker where relevant
- review request eligibility
- repeat reminder eligibility

Avoid unless explicitly approved:

- full medical history
- diagnosis
- prescription or medication detail
- national ID/passport
- payment card data
- highly detailed treatment notes
- sensitive images
- free-text medical notes copied from another system

### Contact Channel Data

Potentially needed:

- LINE user id or channel identity reference
- phone number
- email address
- Facebook/TikTok lead source identifier
- consent source
- contact preference
- opt-out or revocation status

Handling principle:

- Store channel identifiers only for operational follow-up.
- Do not expose raw channel identifiers in audit metadata when hashes or references are enough.
- Respect channel-specific consent and opt-out state.

### Treatment-Cycle Data

Potentially needed for the MVP:

- treatment category, such as Botox or filler
- treatment-cycle reference date
- estimated repeat reminder due date
- staff-owned note that a reminder is appropriate

Avoid:

- clinical diagnosis
- detailed treatment chart
- dosage
- complications history unless legally reviewed and required
- any content that turns FlowBiz into a medical record system

### AI-Generated Suggestion Data

Potentially stored:

- AI-generated draft text
- use case, such as no-show recovery or repeat reminder
- risk label
- HITL status
- approver/reviewer
- original and modified text when staff edits
- generated timestamp and review timestamp

Handling principle:

- AI-generated customer-facing text must enter HITL.
- Staff approval is required before outbound.
- Rejected suggestions cannot be sent.
- Audit metadata should use hashes/lengths where raw text is not operationally needed.

### Audit Trail Data

Potentially stored:

- actor user id
- clinic id
- workspace id
- action name
- entity type and id
- status transition
- timestamp
- risk label
- outbound queue reference
- limited metadata needed for accountability

Handling principle:

- Preserve audit events needed to prove safety and operational accountability.
- Avoid unnecessary raw PII in audit context.
- Audit retention may differ from lead/customer operational retention and needs legal review.

## Consent Types

### Marketing Consent

Purpose:

- permission to send marketing or promotional follow-up
- support review request and repeat reminder workflows where legally appropriate

Suggested states:

- `unknown`
- `not_required_for_current_workflow`
- `granted`
- `revoked`
- `declined`

Minimum metadata:

- consent source
- consent timestamp
- consent text version
- actor or system source
- revocation timestamp and reason when available

### Contact Channel Consent

Purpose:

- record whether the clinic can contact a person through LINE, phone, email, or other channel

Suggested per-channel fields:

- LINE consent
- email consent
- phone consent

Principle:

- A lead may allow one channel and reject another.
- Channel consent should be evaluated before outbound workflow execution.
- If consent is unknown, staff should confirm before sending marketing content.

### AI Processing Notice

Purpose:

- inform the clinic and staff that FlowBiz may use AI to draft suggestions and summarize workflow context
- clarify that AI does not send customer-facing messages by itself
- clarify that staff remains responsible for approval and correctness

Minimum notice themes:

- AI may generate drafts based on lead/customer workflow context.
- AI suggestions are not medical advice.
- AI suggestions must be reviewed by staff before outbound.
- Medical-risk text should be escalated to staff or doctor review.
- Provider metadata may be recorded for audit without unnecessary raw PII.
- Real AI provider use requires separate setup and approval.

### Operational Processing Notice

Purpose:

- explain to clinic staff how FlowBiz processes operational data for lead follow-up, reminders, no-show recovery, and audit logs

Minimum notice themes:

- data is processed for clinic revenue operations and workflow visibility
- role-based access applies
- actions are audited
- retention and deletion/export handling must follow the agreed pilot or production policy

## Data Retention Concept

Retention should be purpose-limited:

- demo data: disposable, can be reset
- pilot data: retained only for agreed pilot period plus short review window
- audit logs: retained long enough to prove approvals and safety actions
- AI suggestions: retained while needed for HITL proof and pilot review
- backups: retained for a defined short period and excluded from ad hoc reuse

Detailed draft: [DATA_RETENTION_POLICY_DRAFT.md](DATA_RETENTION_POLICY_DRAFT.md)

## Access Control Principle

Access must follow least privilege:

- owner/admin: manage pilot setup, staff access, reporting, and audit review
- operator/staff: work assigned leads, review AI suggestions, approve/modify/reject where permission allows
- viewer: read-only access where appropriate
- no shared personal accounts for real pilot data
- no demo credentials for production or real pilot data

Every staff member using real or clinic-approved data should have an assigned user account and role.

## Data Subject Request Workflow Draft

This workflow is a draft and needs legal review.

Possible request types:

- access/export request
- correction request
- deletion request
- marketing consent revocation
- channel contact opt-out
- objection to AI-assisted processing

Suggested workflow:

1. Record request date, requester identity proof method, clinic owner, and request type.
2. Confirm whether FlowBiz is acting as tool/provider for the clinic or direct controller for the specific data.
3. Freeze non-essential outreach for the requester while the request is reviewed.
4. Export or locate relevant lead/customer, channel, AI suggestion, outbound, and audit records.
5. Apply approved correction, deletion, or consent revocation.
6. Preserve required audit events where legally appropriate.
7. Record completion timestamp, actor, and summary.
8. Escalate ambiguous or sensitive requests to legal/clinic owner.

## What Is Not Covered Yet

Not included in this foundation:

- final legal consent wording
- full production privacy notice
- data processing agreement
- cross-border transfer analysis
- real LINE webhook consent flow
- real OpenAI/Gemini provider data-processing assessment
- automated deletion implementation
- data export UI
- consent schema migration
- retention job implementation
- backup deletion automation
- incident response policy

## Required Next Step

Before friendly pilot with real data:

- legal/owner review this document
- choose pilot-safe data mode
- approve consent text
- confirm retention window
- assign staff roles
- confirm no real LINE/AI provider mode unless separately QA-approved
