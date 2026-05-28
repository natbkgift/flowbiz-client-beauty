# Clinic Alpha - Limited Pilot Data Scope (PR-19)

Document type: Limited pilot prep data scope and import cap
Pilot clinic: Clinic Alpha (pseudonym only)
Date: 2026-05-28
Decision baseline: READY_FOR_LIMITED_PILOT_PREP

---

## 1) Data Mode

Approved prep data modes:
1. Demo.
2. Pseudonymized.
3. Minimal operational sample.

Default for Day 1 prep:
- demo first
- pseudonymized if a realistic workflow sample is required
- minimal operational sample only after explicit owner approval outside repo

---

## 2) Import Cap

Maximum sample size for limited pilot prep:

| Scope | Cap | Notes |
|---|---:|---|
| Demo records | 50 | Synthetic or seeded records only |
| Pseudonymized operational sample | 30 | No direct real identifiers in repo |
| Minimal operational sample | 20 | Requires explicit owner approval and consent basis |
| Full historical import | 0 | Not allowed in PR-19 |
| Medical records | 0 | Not allowed |
| Full chat history | 0 | Not allowed |

If any requested import exceeds the cap, stop and create a separate data review PR.

---

## 3) Allowed Fields

Allowed fields for prep:
1. pseudonym or display label
2. masked channel reference
3. lead source
4. stage or status
5. interest category
6. last contact timestamp
7. no-show marker
8. repeat reminder category
9. staff assignment pseudonym
10. consent status metadata

---

## 4) Disallowed Fields

Not allowed:
1. diagnosis or medical record detail
2. national identity document
3. payment card data
4. insurance data
5. medication, allergy, or condition notes
6. procedure photos or attachments
7. full chat transcript
8. real contact identifiers
9. credential material

Any disallowed field request changes the decision to BLOCKED until reviewed.

---

## 5) Pseudonymization Rules

1. Replace real people with pseudonyms before repo documentation.
2. Store only masked or reference-form channel values in operational sample data.
3. Keep mapping tables outside repo in approved private storage only.
4. Do not paste raw exports into docs, issues, commits, or comments.

---

## 6) Import Approval

Before any minimal operational sample is loaded:
1. Owner-A approves the data mode.
2. FlowBiz-Ops confirms the sample is within cap.
3. FlowBiz-Tech confirms destination is staging only.
4. FlowBiz-Ops records a sanitized import note.

PR-19 performs no data import.

---

## 7) Deletion and Export Path

At pilot close or owner request:
1. Export only approved operational summary data if requested.
2. Delete sample records from staging within the agreed retention window.
3. Preserve safety and approval audit events as required.
4. Record completion using pseudonymized references only.

---

## 8) Decision

Data scope is ready for Day 1 prep if:
1. import cap remains accepted
2. no disallowed field is requested
3. data mode remains demo, pseudonymized, or minimal operational sample
4. no broad import is attempted

Current PR-19 data scope status:
- READY_FOR_DAY_1_PREP
