# Pilot Exit and Conversion Criteria — FlowBiz Beauty

Date: 2026-05-28
Version: 1.0

---

## Purpose

This document defines the criteria for pilot exit decisions:
- Success → convert to paid
- Partial success → extend pilot
- Failure → end pilot gracefully
- No-go → immediate stop

> **Disclaimer**: FlowBiz does not guarantee revenue outcomes or ROI.
> Conversion criteria are based on operational value and safety signals, not financial guarantees.

---

## Pilot Exit Scorecard Reference

Use `docs/PILOT_SUCCESS_METRICS_SCORECARD.md` for the full scoring rubric.

| Total Score | Recommendation |
|---|---|
| 24–30 / 30 | **GO to paid conversion** (if safety and staging conditions met) |
| 18–23 / 30 | **CONDITIONAL** — convert with written conditions |
| 10–17 / 30 | **EXTEND pilot** or narrow scope further |
| < 10 / 30 | **NO-GO** — end pilot |

---

## Success Criteria

Pilot is considered successful when **all** of the following are true:

| Criterion | Threshold | Evidence Required |
|---|---|---|
| Lead follow-up visibility improved | Staff can identify uncontacted leads without manual search | Screenshot or usage log |
| HITL workflow adopted | ≥ 80% of AI suggestions reviewed within 48h | Audit trail stats |
| AI suggestion quality acceptable | ≤ 20% rejection rate for AI suggestions | HITL log |
| No prohibited content in sent messages | Zero incidents | Audit trail |
| No HITL bypass observed | Zero incidents | Audit trail |
| No real data misuse | No disallowed fields imported or exposed | Data intake checklist + audit |
| No critical risks open | All critical risks resolved or mitigated | Risk register |
| Staff adoption | At least 1 operator actively using HITL queue daily in Week 2+ | Usage metrics |
| Owner satisfaction | Owner reports workflow as useful or valuable | Verbal/written confirmation |
| Staging stability | No sustained outage > 4h during pilot period | Uptime log |

---

## Failure Criteria

Pilot is considered failed (end pilot) when **any** of the following occur:

| Criterion | Description |
|---|---|
| HITL bypass | AI-generated content sent to customers without approval |
| Real data misuse | Disallowed data imported or exposed to unauthorized users |
| Tenant isolation breach | Another clinic's data visible in pilot clinic workspace |
| Repeated prohibited content | AI suggestions contain medical guarantees / prohibited phrases after correction |
| Sustained staging outage | Outage > 8h that FlowBiz cannot resolve |
| Owner withdrawal | Clinic owner withdraws consent or requests pilot stop |
| Staff refusal | Clinic staff refuse to use HITL review for > 1 week |
| Critical security incident | Unauthorized access or credential exposure |

---

## Extend Pilot Criteria

Pilot extension (additional 7–14 days) is appropriate when:

- Score is 10–17 / 30 AND owner wants to continue
- Staff adoption is improving but not yet consistent
- Technical issue was resolved mid-pilot and disrupted usage
- Owner requested specific workflow that wasn't tested yet
- More time needed to collect meaningful baseline comparison data

Extension requires:
- [ ] Written owner confirmation of extension
- [ ] Updated weekly check-in schedule
- [ ] Specific goal for extension period
- [ ] No critical risks open

---

## Convert to Paid Criteria

Recommend paid conversion when **all** of the following are met:

| Condition | Status |
|---|---|
| Pilot score ≥ 18/30 | `[ ]` |
| No critical risks open | `[ ]` |
| Owner/manager value confirmed | `[ ]` |
| HITL workflow adopted by staff | `[ ]` |
| No HITL bypass incidents | `[ ]` |
| Data handling confirmed clean | `[ ]` |
| Staging stability confirmed | `[ ]` |
| Owner has reviewed pilot exit report | `[ ]` |
| Pricing discussion scheduled | `[ ]` |

---

## No-Go Criteria (Immediate Stop)

Do not convert or extend if **any** of the following:

- AI auto-send to real customers occurred
- Critical data exposure (national ID, payment, diagnosis)
- Tenant isolation breach
- Owner explicitly withdraws consent
- FlowBiz technical team identifies unresolvable blocking issue
- Any regulatory or legal concern raised by clinic legal counsel

If no-go:
1. Disable real LINE and Gemini immediately
2. Disable all clinic staff accounts
3. Notify clinic owner with explanation
4. Initiate data deletion per data intake checklist
5. File incident report

---

## Support Readiness for Conversion

Before converting to paid, confirm:

- [ ] Support SLA for paid tier is defined
- [ ] Escalation contact is clearly communicated to owner
- [ ] Staff training is sufficient for paid-tier workflows
- [ ] Onboarding for any new workflows is planned
- [ ] Data migration plan from staging to production (if applicable) is scoped separately

---

## Data Handling Closeout

At pilot end (success or failure):

- [ ] Export pilot summary data if requested by clinic
- [ ] Delete all real customer data from staging within agreed retention window
- [ ] Confirm deletion with FlowBiz technical owner
- [ ] Notify clinic owner of deletion
- [ ] Disable all clinic accounts on staging
- [ ] Archive audit trail (non-editable)
- [ ] Document closeout in pilot exit report

---

## Pricing Discussion Trigger

Raise pricing discussion when:

- Pilot score ≥ 18/30
- Owner has confirmed workflow value in weekly check-in
- At least 1 full week of active HITL usage observed

Pricing discussion:
- Initiated by: FlowBiz operator
- Format: Scheduled call with clinic owner
- Documents: Pilot exit report + pricing overview
- Timeline: Within 7 days of pilot end

> **Note**: Do not present pricing during pilot — wait for exit report conversation.

---

## Final Decision Template

Use at end of pilot:

```
Pilot Exit Decision — FlowBiz Beauty
Clinic: <CLINIC_PSEUDONYM>
Date: <DATE>
Pilot duration: <START> to <END>
Pilot score: <SCORE>/30

Decision: [ ] GO — Convert to paid
           [ ] CONDITIONAL — Convert with conditions: <LIST>
           [ ] EXTEND — Extend by <N> days, goal: <GOAL>
           [ ] NO-GO — End pilot. Reason: <REASON>

Safety gate: [ ] Pass  [ ] Fail — Issue: <DESCRIBE>
Data closeout: [ ] Complete
Owner notified: [ ] Yes — Date: <DATE>

Signed off by:
FlowBiz operator: <NAME> — <DATE>
Clinic owner acknowledgement: <NAME> — <DATE>
```

---

## References

- [PILOT_BASELINE_METRICS.md](PILOT_BASELINE_METRICS.md)
- [PILOT_WEEKLY_OPERATING_CADENCE.md](PILOT_WEEKLY_OPERATING_CADENCE.md)
- [PILOT_ROLLBACK_AND_DISABLE_PLAN.md](PILOT_ROLLBACK_AND_DISABLE_PLAN.md)
- [../PILOT_SUCCESS_METRICS_SCORECARD.md](../PILOT_SUCCESS_METRICS_SCORECARD.md)
- [../PILOT_REPORT_TEMPLATE.md](../PILOT_REPORT_TEMPLATE.md)
- [../PILOT_RISK_REGISTER.md](../PILOT_RISK_REGISTER.md)
