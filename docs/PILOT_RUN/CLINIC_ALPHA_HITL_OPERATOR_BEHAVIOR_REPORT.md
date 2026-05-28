# Clinic Alpha - HITL Operator Behavior Report (PR-24)

Document type: POST-PHASE 10 PR-24 human-usage behavior report
Pilot clinic: Clinic Alpha (pseudonym only)
Date: 2026-05-28
Observed workflow: Review Request (single-workflow scope)

---

## 1) Behavior Summary

Observed operators:
1. Staff-A1
2. Staff-A2

Handling behavior summary:
1. Both operators completed full decision cycle patterns (approve, reject, modify-before-approve).
2. No operator attempted to bypass HITL.
3. No operator attempted outbound send actions.
4. Decision quality was consistent after first three items.

---

## 2) Confusion Points and Recovery

| ID | Confusion Point | Frequency | Impact | Recovery Action | Residual Risk |
|---|---|---:|---|---|---|
| CP-01 | Distinguishing reject vs modify-before-approve for low-quality draft | 3 | Medium | Added operator micro-rule: if salvageable within one edit pass, modify; otherwise reject | Low |
| CP-02 | Re-open queue sorting after decision submit | 2 | Low | Refreshed queue filter preset before each 3-item block | Low |
| CP-03 | Interpreting short-content false-positive warnings | 2 | Low | Added check note to confirm customer intent context before reject | Low |

---

## 3) Workflow Usefulness Feedback

Usefulness feedback from operator session notes:
1. Review Request workflow is perceived as useful for controlling tone before approval.
2. Modify-before-approve path is useful when draft intent is valid but wording quality is weak.
3. Reject path is useful when context mismatch is clear.
4. Queue remains operationally manageable for current cadence volume.

---

## 4) False-Positive Observations

False-positive observations captured:
1. Two items were initially flagged as likely reject but were corrected to modify-before-approve after context check.
2. No false-positive triggered unsafe action.
3. No false-positive resulted in bypass behavior.

False-positive handling result:
- CONTROLLED

---

## 5) Operator Adoption Conclusion

Operational adoption conclusion:
- CONSISTENT_HUMAN_USAGE_CONFIRMED

Reason:
1. Operators maintained review cadence across 12 items.
2. Operators used all required decision paths.
3. Operators remained within strict guardrails.
