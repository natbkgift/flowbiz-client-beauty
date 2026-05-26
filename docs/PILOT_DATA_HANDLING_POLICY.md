# Pilot Data Handling Policy - FlowBiz Beauty

Date: 2026-05-27
Scope: Friendly pilot data handling draft

## Purpose

This policy defines how FlowBiz Beauty should handle data during a friendly pilot before production readiness.

It is a draft for clinic owner, operations, and legal review. It is not legal advice and is not a final production privacy policy.

## Pilot Data Rules

Default rule:

- Use fake demo data first.
- Use clinic-approved non-sensitive sample data second.
- Use limited real operational data only when the clinic explicitly approves the scope and legal/owner review is complete.

Do not import broad customer exports just to make the pilot look realistic. The pilot should prove workflow value with the minimum data needed.

## Preferred Pilot Mode

Preferred order:

1. Demo/fake data from `npm run seed:demo`
2. Pseudonymized lead/customer sample
3. Limited real lead/customer operational data for selected workflows

The pilot should begin with demo data in onboarding and switch to real or clinic-approved data only after the clinic understands:

- what data will be processed
- why it is needed
- who can access it
- how AI suggestions are reviewed
- when data will be deleted/exported after pilot

## No Real Data Unless Explicitly Approved

Real lead/customer data may be used only when:

- clinic owner or authorized operator approves the pilot data scope
- data fields are listed before import
- retention period is agreed
- staff roles are assigned
- AI/HITL rules are explained
- no real LINE/AI external send/generation is enabled unless a separate QA plan exists

Approval should be documented in the pilot notes or agreement.

## Minimum Necessary Data

For most pilots, only these fields are needed:

- display name or pseudonym
- contact channel reference
- lead source
- stage/status
- inquiry interest category
- last contact timestamp
- no-show marker where relevant
- repeat reminder category and due date where relevant
- staff assignment
- consent status if known

Avoid free-text imports unless they are reviewed and cleaned.

## Data Not Allowed By Default

Do not import by default:

- diagnosis or medical record details
- full EMR export
- national ID or passport
- payment card data
- insurance data
- detailed medication/allergy/condition notes
- procedure photos
- sensitive medical notes
- minor data without special review
- full chat history unless specifically approved

If the clinic says these are required, stop and request legal/owner review before proceeding.

## Treatment-Cycle Data

Allowed for MVP pilot with approval:

- treatment category, such as Botox or filler
- estimated treatment-cycle date
- repeat reminder due date
- high-level aftercare/review request checkpoint

Not allowed by default:

- clinical diagnosis
- dosage details
- complication notes
- medical suitability assessment
- doctor treatment plan

FlowBiz should store only what is needed to surface a reminder opportunity. It should not become the treatment record.

## AI Data Handling

AI may draft operational messages for staff review.

Rules:

- AI-generated customer-facing messages must enter HITL.
- Staff must approve or modify before outbound.
- Rejected suggestions must not be sent.
- Medical-risk content must be reviewed carefully and may need doctor review.
- Audit should preserve approval decisions without unnecessary raw PII in metadata.
- Real provider generation remains off by default unless separately approved and tested.

## Anonymization And Pseudonymization

Preferred pilot practice:

- replace customer names with initials or demo names
- replace phone/email/LINE ids with sample values
- remove national ID/passport/payment data
- convert detailed treatment text into high-level category
- replace free-text medical notes with controlled labels
- remove photos and attachments
- avoid importing full conversation history

Example:

```text
Before: Jane Doe, 081-xxx-xxxx, asked about filler after previous swelling note
After: Lead A, LINE sample id, interest=filler, risk_review_required=true
```

## Staff Access Rules

Access should follow least privilege:

- assign named users
- avoid shared staff accounts for real pilot data
- owner/admin approves staff access
- operator/staff access only to workflows they need
- viewer access is read-only where possible
- revoke access at pilot end or staff role change
- audit critical actions

Staff should understand that FlowBiz is not a medical advice tool and that AI suggestions require review.

## Storage And Transfer Rules

Pilot data should:

- stay in staging or approved pilot environment
- not be copied into personal drives or chat apps
- not be sent to external AI providers unless real provider mode is approved separately
- not be exported casually after pilot
- be backed up only under the agreed backup window

Secrets and credentials must not be pasted into repo files or committed.

## End-Of-Pilot Data Handling

At pilot end, choose one path:

- delete pilot data
- export pilot data for clinic record, then delete working copy
- retain limited data for extended pilot with written approval
- convert to paid onboarding only after agreement, consent, and staging/production readiness are confirmed

The decision should be recorded with date, clinic owner, FlowBiz operator, and scope.

## Pilot Deletion/Export Checklist

Before deleting or exporting:

- identify clinic/workspace
- identify pilot date range
- identify data categories included
- confirm requester authority
- export lead/customer data if requested
- export approved audit summary if appropriate
- preserve required audit trail where legally appropriate
- remove or anonymize operational pilot records according to approved path
- confirm backups retention window
- record completion timestamp and operator

## Stop Conditions

Pause pilot data import if:

- real medical records are requested
- consent status is unknown and marketing outreach is planned
- staff wants AI to send without approval
- real LINE/AI provider mode is requested without QA plan
- production DB or production secrets are involved
- clinic cannot identify a data owner
- requested data exceeds selected MVP workflows

## Legal/Owner Review Required

Before using real data, review:

- consent text
- AI processing notice
- retention window
- deletion/export handling
- staff access roles
- support/escalation process
- real integration plan if applicable
