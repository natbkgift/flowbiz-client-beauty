# Consent Field Spec - FlowBiz Beauty

Date: 2026-05-27
Scope: Future implementation field specification

## Purpose

This document defines proposed fields for future consent, AI processing notice, retention, deletion, and export workflows.

No schema migration is included in this PR. This is a product/ops field specification for engineering and legal review before implementation.

## Design Principles

- Minimize stored personal data.
- Keep consent state explicit and auditable.
- Track source and version of consent text.
- Separate marketing consent from contact-channel consent.
- Separate AI processing notice acknowledgement from marketing consent.
- Preserve audit trail for changes.
- Allow unknown state rather than assuming consent.

## Status Values

Recommended consent status enum:

- `unknown`
- `not_required_for_current_workflow`
- `granted`
- `declined`
- `revoked`

Recommended source values:

- `manual_staff_entry`
- `line_opt_in`
- `web_form`
- `imported_clinic_record`
- `pilot_owner_approved`
- `customer_request`
- `system_migration`

Final enum values require legal/product review before migration.

## Field Specification

| Field | Type | Required | Applies To | Audit Requirement | Notes |
| --- | --- | --- | --- | --- | --- |
| `marketing_consent_status` | text/enum | required when marketing workflow is enabled | lead, customer | audit every change | Default should be `unknown`, not `granted`. |
| `marketing_consent_source` | text/enum | optional until known | lead, customer | audit when status changes | Tracks how consent was collected or imported. |
| `marketing_consent_at` | timestamp with timezone | optional | lead, customer | audit when set/changed | Timestamp of consent grant. |
| `marketing_consent_text_version` | text | optional | lead, customer | audit when set/changed | Version of consent text shown to customer or approved by clinic. |
| `contact_channel_consent_line` | text/enum | optional | lead, customer, channel identity | audit every change | Consent for LINE contact. Unknown should block marketing automation until reviewed. |
| `contact_channel_consent_email` | text/enum | optional | lead, customer, channel identity | audit every change | Consent for email outreach. |
| `contact_channel_consent_phone` | text/enum | optional | lead, customer, channel identity | audit every change | Consent for phone or SMS-style outreach if used. |
| `ai_processing_notice_acknowledged` | boolean | optional for demo, recommended for pilot staff/customer policy | clinic, workspace, user, lead/customer if required | audit when set | Indicates notice acknowledgement, not marketing consent. |
| `ai_processing_notice_at` | timestamp with timezone | optional | clinic, workspace, user, lead/customer if required | audit when set | Time the notice was acknowledged. |
| `ai_processing_notice_version` | text | optional | clinic, workspace, user, lead/customer if required | audit when set | Allows future notice revisions. |
| `data_retention_until` | date or timestamp with timezone | optional | lead, customer, workspace, pilot import batch | audit when set/changed | Used for pilot retention and future cleanup jobs. |
| `data_delete_requested_at` | timestamp with timezone | optional | lead, customer | audit when set | Records request intake, not necessarily completion. |
| `data_delete_completed_at` | timestamp with timezone | optional | lead, customer | audit when set | Set after approved deletion/anonymization workflow. |
| `data_export_requested_at` | timestamp with timezone | optional | lead, customer | audit when set | Records export request intake. |
| `data_export_completed_at` | timestamp with timezone | optional | lead, customer | audit when set | Set after approved export is delivered. |
| `consent_revoked_at` | timestamp with timezone | optional | lead, customer, channel identity | audit when set | Revocation should block future marketing outreach. |
| `consent_revoked_reason` | text | optional | lead, customer, channel identity | audit when set | Keep short; avoid sensitive free text where possible. |
| `consent_last_reviewed_by` | uuid/user id | optional | lead, customer | audit when set | Staff/admin who reviewed ambiguous consent. |
| `consent_last_reviewed_at` | timestamp with timezone | optional | lead, customer | audit when set | Useful for imported pilot data. |
| `data_processing_scope` | text/enum or jsonb | optional | pilot import batch, workspace | audit when set | Example: `demo_only`, `pilot_limited`, `production_operational`. |
| `pilot_data_source` | text | optional | pilot import batch, lead, customer | audit when set | Records source without storing extra raw file data. |
| `pseudonymized_at` | timestamp with timezone | optional | lead, customer, pilot import batch | audit when set | Records anonymization/pseudonymization step. |
| `pseudonymization_method` | text | optional | lead, customer, pilot import batch | audit when set | Example: name replacement, channel hash, free-text removal. |

## Lead-Level Application

Lead records should support:

- consent status for marketing follow-up
- channel-specific consent
- AI processing notice state where applicable
- retention date for pilot imports
- delete/export request timestamps

Lead workflows should not assume marketing consent when status is `unknown`.

## Customer-Level Application

Customer records should support:

- repeat reminder consent state
- review request consent state if needed
- channel-specific consent
- retention date
- delete/export request timestamps

Customer records should not become EMR records. Treatment-cycle fields should remain high-level.

## Channel Identity Application

Channel identity records should support:

- per-channel consent state
- opt-out status
- revocation timestamp
- source and last reviewed timestamp

Channel consent should be evaluated before outbound messaging.

## Audit Requirements

Audit every change to:

- consent status
- consent source
- consent text version
- AI processing notice acknowledgement
- retention date
- deletion/export request
- revocation
- pseudonymization method
- pilot data scope

Audit metadata should store:

- actor user id
- clinic id
- workspace id
- entity id
- previous value
- new value
- timestamp
- reason when available

Avoid storing unnecessary raw PII in audit metadata.

## Migration Guidance For Later PR

Future implementation should consider:

- adding columns to `leads`, `customers`, and `contact_identities`, or
- adding a separate consent ledger table to avoid overloading core tables

Recommended safer approach:

- use a consent ledger for history
- keep denormalized current status fields only where needed for workflow checks
- add tests for marketing send block when consent is unknown or revoked

No migration is included in this PR.

## Open Questions

- Should consent be clinic-level or workspace-level when a clinic has multiple workspaces?
- Should review requests require separate consent from marketing reminders?
- How should consent imported from existing clinic systems be verified?
- What retention period should apply to audit logs in pilot vs production?
- Should customer-facing AI processing notice be separate from clinic/staff notice?
