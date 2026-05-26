# Data Retention Policy Draft - FlowBiz Beauty

Date: 2026-05-27
Scope: Demo, pilot, and future production retention planning

## Purpose

This draft defines retention principles for FlowBiz Beauty data before friendly pilot use.

It is not legal advice and is not a final production retention policy. Legal and clinic-owner review is required before using real customer data or setting production retention periods.

## Retention Principle

Keep data only as long as needed for the agreed workflow, pilot evidence, operational safety, audit trail, or legal/business requirement.

Retention periods must be:

- documented
- purpose-specific
- reviewed before pilot starts
- applied consistently
- reversible only through approved restore procedures

## Data Classes

### Demo Data

Examples:

- demo clinic tenant
- fake leads/customers
- fake treatment-cycle data
- demo HITL suggestions
- demo audit events

Draft retention:

- may be reset at any time
- should not be mixed with real clinic data
- should be clearly labelled demo
- should not be exported as real customer records

### Pilot Data

Examples:

- clinic-approved sample leads
- limited real operational lead/customer data
- pilot workflow actions
- pilot AI suggestions
- pilot approval/rejection records

Draft retention:

- retain during 14-30 day pilot
- retain for short review window after pilot, for example 7-30 days, subject to clinic/legal approval
- delete, export, or extend only after documented pilot decision

### Audit Logs

Examples:

- approval/rejection/modification
- outbound queueing
- consent changes
- role/access changes
- deletion/export request workflow

Draft retention:

- retain longer than operational lead/customer data when needed to prove safety and accountability
- avoid raw PII in metadata
- preserve records needed to show that AI did not bypass HITL
- final retention period requires legal review

### AI Suggestions

Examples:

- generated draft
- risk label
- original text
- modified text
- review status
- approver

Draft retention:

- retain while suggestion is pending
- retain approved/rejected/modified records through pilot review
- avoid provider metadata with unnecessary raw PII
- delete or anonymize after pilot if no longer needed, subject to audit requirements

### Contact Channel Data

Examples:

- LINE user id
- email
- phone
- contact preference
- opt-out state

Draft retention:

- retain only while needed for permitted contact workflow
- remove or deactivate when consent is revoked or pilot ends, unless retention is required for audit proof
- consider hashing channel identifiers in audit metadata

### Backups

Draft retention:

- keep staging/pilot backups for a short, defined operational window
- store backups outside repo
- restrict backup access
- do not reuse backups as test datasets
- document backup deletion window before pilot starts

## Deleted Lead/Customer Handling

Deletion may mean:

- hard delete
- soft delete with suppression
- anonymization
- pseudonymization
- archive with restricted access

The chosen approach depends on legal review, audit requirements, and operational constraints.

Draft workflow:

1. Confirm request and requester authority.
2. Identify all lead/customer/channel records.
3. Check audit and legal retention requirements.
4. Stop marketing/contact workflows.
5. Export data if requested and approved.
6. Delete, anonymize, or suppress operational records.
7. Preserve minimum required audit trail where appropriate.
8. Record completion event.

## Export Request Workflow

Draft steps:

1. Record export request timestamp.
2. Confirm requester and clinic authority.
3. Identify scope: lead, customer, channel, AI suggestion, audit summary.
4. Prepare export with minimum required data.
5. Review export for accidental sensitive data.
6. Deliver through approved secure channel.
7. Record completion timestamp and actor.

## Delete Request Workflow

Draft steps:

1. Record delete request timestamp.
2. Pause non-essential outreach for the requester.
3. Confirm entity and authority.
4. Review audit retention obligations.
5. Apply deletion/anonymization/suppression.
6. Confirm backups retention behavior.
7. Record completion timestamp and actor.

## Exceptions

Potential exceptions requiring legal/owner review:

- active dispute or complaint
- billing or tax record requirement
- security incident investigation
- audit proof for AI/HITL approval
- backup restore constraints
- legal hold

Do not rely on exceptions informally. Record the reason and approval.

## Pilot Retention Recommendation

Recommended pilot default:

- demo data: reset as needed
- pilot operational data: pilot duration plus agreed review window
- pilot exports: only if clinic requests
- audit logs: retain through pilot review and legal-approved retention window
- backups: short operational retention window

The exact number of days should be approved in the pilot agreement.

## What Requires Implementation Later

Future PRs may need:

- consent/retention schema
- delete/export request tables
- admin UI for request tracking
- retention job
- backup retention automation
- consent-aware outbound guards
- audit events for retention actions
- tests for revoked/unknown consent blocking marketing sends

No runtime code or schema change is included in this PR.

## Legal Review Required

Legal or responsible clinic owner review is required before:

- real pilot data import
- production retention window
- delete/export workflow launch
- real LINE integration
- real AI provider integration
- any policy shown to end customers
