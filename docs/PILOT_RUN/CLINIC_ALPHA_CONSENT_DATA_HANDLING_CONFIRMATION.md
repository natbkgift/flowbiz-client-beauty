# Clinic Alpha — Consent and Data Handling Confirmation (PR-18)

Document type: Consent/data handling confirmation checklist for limited pilot preparation
Pilot clinic: Clinic Alpha (pseudonym only)
Date: 2026-05-28
Status: CLOSED

---

## 1) Data Mode Confirmation

Current approved mode for follow-up stage:
1. Demo/fake data first.
2. Clinic-approved minimal sample data only when explicitly confirmed.
3. No broad real customer import in PR-18 limited pilot prep stage.

Current mode status: DEMO_OR_MINIMUM_SAMPLE_ONLY

---

## 2) Allowed Fields (Minimum Necessary)

Allowed for pilot preparation with approval:
1. pseudonym/display name
2. contact channel reference (masked/reference form)
3. lead source
4. stage/status
5. interest category
6. last-contact timestamp
7. no-show marker where relevant
8. repeat reminder due date/category where relevant
9. staff assignment
10. consent status metadata

---

## 3) Disallowed Fields (By Default)

Not allowed in this closure stage:
1. diagnosis or medical record details
2. national ID/passport
3. payment card data
4. insurance data
5. detailed medication/allergy/condition notes
6. procedure photos/attachments
7. full chat history import
8. any credential/secret/token in repo

If any disallowed field is requested, status must move to BLOCKED until legal/owner review completes.

---

## 4) Consent Acknowledgement Checklist

| Consent ID | Requirement | Owner | Evidence Required | Status |
|---|---|---|---|---|
| CONSENT-01 | Marketing/contact consent basis acknowledged for selected workflows | Owner-A + FlowBiz-Ops | Consent basis note (outside repo record) | PASS |
| CONSENT-02 | Channel consent logic acknowledged by channel | Owner-A + FlowBiz-Ops | Operator checklist sign-off | PASS |
| CONSENT-03 | AI processing notice acknowledged (draft-only + HITL) | Owner-A + Staff-A1 | Session note acknowledgment | PASS |
| CONSENT-04 | Staff role/access scope confirmed for pilot data | Owner-A + FlowBiz-Ops | Role map note | PASS |

---

## 5) Data Deletion/Export Path

Required closure notes before pilot prep start:
1. Decide end-of-pilot path: delete, export then delete, or approved retention extension.
2. Identify requester authority and approver role.
3. Record completion timestamp and operator.

Current status: ACKNOWLEDGED

---

## 6) Audit Retention Note

Operational expectation:
1. Preserve approval and safety-relevant audit events for accountability.
2. Avoid unnecessary raw PII in audit metadata.
3. Align retention window with owner/legal-reviewed policy before real data usage.

Current status: ACKNOWLEDGED

---

## 7) Legal Review Note

This checklist is operational guidance only and not legal advice.

Before enabling limited real operational data, legal/owner review should confirm:
1. consent wording
2. AI processing notice scope
3. retention window
4. deletion/export handling
5. role/access approvals

Current legal-review status: ACKNOWLEDGED_REQUIRED_BEFORE_EXPANSION

---

## 8) Decision Impact

- Consent/data items are confirmed in sanitized PR-18 evidence and contribute to READY_FOR_LIMITED_PILOT_PREP.
- If owner/business confirmations are revoked or disputed -> re-evaluate decision.
- Any consent/data safety ambiguity -> decision BLOCKED.

---

## 9) Sign-Off (Pseudonym)

- Prepared by: FlowBiz-Ops
- Reviewed by: FlowBiz-Tech
- Owner confirmation: Completed (Owner-A; sanitized role only)
