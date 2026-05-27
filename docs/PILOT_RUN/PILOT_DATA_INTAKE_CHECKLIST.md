# Pilot Data Intake Checklist — FlowBiz Beauty

Date: 2026-05-28
Version: 1.0

---

## Purpose

This checklist must be completed before any data is imported into the pilot environment.
It applies to demo, pseudonymized, and limited-real-operational data modes.

> **Rule**: No data may be imported until this checklist is completed and the clinic owner has approved the data scope.

---

## Step 1 — Confirm Data Mode

Select one and confirm with owner:

- [ ] **Demo mode** — Fake/seeded data only. Run `npm run seed:demo`. No real data needed.
- [ ] **Pseudonymized mode** — Clinic-approved sample with real identifiers replaced or removed.
- [ ] **Limited real operational mode** — Small set of real leads/customers with explicit, documented owner approval.

Owner confirmation of data mode:
- Name: `<OWNER_NAME>`
- Date confirmed: `<DATE>`
- Method of confirmation: `<Written approval / Email / Signed document>`

---

## Step 2 — Allowed Data Fields

Only these fields are permitted. Any additional fields require separate owner approval.

| Field | Allowed | Notes |
|---|---|---|
| Display name or pseudonym | Yes | Not full legal name unless approved |
| Contact channel reference (LINE ID) | Yes | Only if LINE OA is activated for pilot |
| Lead source | Yes | e.g. walk-in, Instagram, referral |
| Interest / inquiry category | Yes | e.g. Botox, filler, facial, hair removal |
| Lead stage / status | Yes | e.g. new, contacted, qualified, closed |
| Last contact date | Yes | Timestamp only |
| No-show marker | Yes | Boolean or count |
| No-show follow-up status | Yes | |
| Repeat reminder category | Yes | e.g. Botox, filler |
| Repeat reminder due date | Yes | |
| Review request status | Yes | |
| Staff assignment | Yes | Staff ID / name |
| Non-sensitive notes | Conditional | Short operational notes only; no clinical details |
| Consent status | Yes if known | Boolean — whether customer has given consent |

> Total record count for first import: `<NUMBER>` (aim for ≤ 50 records for initial pilot test)

---

## Step 3 — Disallowed Data

The following data must **never** be imported. No exceptions.

| Data Type | Why Excluded |
|---|---|
| National ID / citizen ID | Highly sensitive; not needed for pilot workflows |
| Passport number | Highly sensitive; not needed |
| Payment card number / bank account | Financial data; out of scope |
| Full diagnosis | Medical record; out of scope |
| Prescription / medication details | Clinical data; out of scope |
| Allergy / condition details | Clinical data; out of scope |
| Full medical history / EMR export | Out of scope |
| Full LINE/chat history | Not needed; import risk |
| Before/after procedure photos | Sensitive; not needed |
| Sensitive clinical notes | Clinical data; exclude |
| Minor patient data | Special category; requires separate legal review |
| Insurance policy data | Out of scope |

Pre-import check — confirm none of the above are in the import file:
- [ ] Reviewed import file columns — no disallowed fields present
- [ ] Checked notes/free-text columns for sensitive content
- [ ] Confirmed with owner that medical records are excluded

---

## Step 4 — Minimum Fields Verification

For each selected workflow, minimum required fields:

| Workflow | Required Fields |
|---|---|
| New Lead Welcome | Display name, interest category, lead stage, last contact date |
| Uncontacted Lead Alert | Display name, lead stage, last contact date |
| No-Show Recovery | Display name, no-show marker, last contact date |
| Review Request | Display name, service type, last contact date |
| Botox/Filler Repeat Reminder | Display name, repeat reminder category, repeat reminder due date |

Confirm minimum fields present: `[ ]` Yes `[ ]` No — missing: `<LIST>`

---

## Step 5 — Pseudonymization Rules

If using pseudonymized mode:

| Original Field | Replacement Rule |
|---|---|
| Full legal name | Replace with first name or pseudonym (e.g. "Customer A") |
| Phone number | Remove unless needed for LINE reference only |
| LINE ID / user reference | Keep only if LINE OA is activated and owner approves |
| Email | Remove unless needed |
| Address | Remove |
| Date of birth | Replace with age range if needed (e.g. "30s") |
| Notes with names | Scrub or replace |

Pseudonymization completed by: `<STAFF_NAME>`
Date: `<DATE>`
Review confirmed: `[ ]` Yes

---

## Step 6 — Consent Confirmation

Before importing any real customer data for outreach workflows:

- [ ] Clinic owner confirms customers in import have given consent (or legal basis exists) for marketing outreach
- [ ] Consent type: `<e.g. "Opt-in at registration", "Informed verbal consent", "Form at clinic">` 
- [ ] Consent documentation: `<WHERE STORED — not in this repo>`
- [ ] Outreach channels covered by consent: `<LINE / SMS / Email>`
- [ ] Customers who have opted out are excluded from import

> If consent basis cannot be confirmed, use **demo data only** until resolved.

---

## Step 7 — Owner Approval

Before import, owner must confirm:

- [ ] Data fields list reviewed and approved by owner
- [ ] Data mode confirmed
- [ ] Staff who will access data confirmed
- [ ] Retention period agreed: `<e.g. "Delete 30 days after pilot end">`
- [ ] AI/HITL rules explained and understood
- [ ] Owner can request data deletion at any time

Owner sign-off:
- Name: `<OWNER_NAME>`
- Date: `<DATE>`
- Reference: `<Agreement doc / email thread ref>`

---

## Step 8 — Import Method

| Method | Allowed |
|---|---|
| Manual entry via UI | Yes |
| CSV import via admin tool | Yes — if field mapping is verified first |
| Direct database INSERT | Only by technical owner; no production DB |
| API bulk import script | Only if approved and audited |
| Copy-paste from EMR | **No** — risk of pulling disallowed fields |
| Full CRM export file | **No** — use filtered extract only |

Import performed by: `<NAME>`
Method used: `<METHOD>`
Date: `<DATE>`

---

## Step 9 — Verification Before Go-Live

After import but before enabling workflows:

- [ ] Record count matches expected: expected `<N>`, imported `<N>`
- [ ] Spot-check 5 records for disallowed field presence
- [ ] Confirm staging tenant isolation (records visible only to correct workspace)
- [ ] Confirm RBAC — staff see only their assigned leads/customers
- [ ] Confirm audit log shows import event
- [ ] Demo walkthrough completed with imported data

---

## Step 10 — Delete / Export Plan

Agree before any real data import:

| Event | Action |
|---|---|
| Pilot end (successful) | Export summary data → delete full dataset from staging DB within `<N>` days |
| Pilot stop / rollback | Immediate data deletion from staging |
| Owner request | Delete within `<24–72h>` of request |
| Extension | Re-confirm data retention with owner |

Delete/export plan confirmed: `[ ]` Yes
Retention end date: `<DATE>`
Delete process owner: `<NAME>`

---

## Checklist Completion Sign-Off

| Item | Status |
|---|---|
| Data mode confirmed | `[ ]` |
| Allowed fields verified | `[ ]` |
| Disallowed fields excluded | `[ ]` |
| Pseudonymization applied | `[ ]` |
| Consent basis confirmed | `[ ]` |
| Owner approved | `[ ]` |
| Import method approved | `[ ]` |
| Post-import verification done | `[ ]` |
| Delete/export plan agreed | `[ ]` |

**Ready to proceed with data**: `[ ]` Yes `[ ]` No — Blocking issue: `<DESCRIBE>`

---

## References

- [PILOT_SCOPE_AND_BOUNDARIES.md](PILOT_SCOPE_AND_BOUNDARIES.md)
- [../PDPA_CONSENT_FOUNDATION.md](../PDPA_CONSENT_FOUNDATION.md)
- [../PILOT_DATA_HANDLING_POLICY.md](../PILOT_DATA_HANDLING_POLICY.md)
- [../CONSENT_FIELD_SPEC.md](../CONSENT_FIELD_SPEC.md)
