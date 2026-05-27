# Pilot Report Template - FlowBiz Beauty

Date prepared: `<YYYY-MM-DD>`
Prepared by: `<FlowBiz operator>`
Clinic: `<clinic name or pseudonym>`
Pilot period: `<start date> to <end date>`
Pilot length: `<14-30 days>`

## Important Notes

This report is for friendly pilot review. It is not a financial promise, medical advice, legal advice, or production readiness approval.

FlowBiz Beauty is an AI Marketing and Revenue Automation Layer. It is not an EMR, doctor scheduling system, inventory system, payment system, or full CRM replacement.

Default pilot limitation:

- AI drafts only; staff approval is required before customer-facing outbound.
- LINE remains simulated unless a separate integration QA plan is approved.
- AI provider remains mock unless a separate integration QA plan is approved.
- Estimated revenue opportunity is conservative and should be calibrated with the clinic's real operating data.

## 1. Executive Summary

Overall pilot status: `GO / CONDITIONAL / NO-GO`

Recommended next step:

- `Convert to paid plan`
- `Extend pilot with narrower workflow`
- `Pause and document fit gaps`
- `Do not proceed`

Summary:

```text
<3-5 sentence summary of what happened, what improved, and whether staff used the system.>
```

Key evidence:

- Baseline vs pilot response time:
- Baseline vs pilot uncontacted leads:
- HITL approval adoption:
- No-show recovery attempts:
- Review request attempts:
- Repeat reminder opportunities:
- Staff active days:
- Main risk or blocker:

## 2. Pilot Clinic Profile

| Field | Value |
| --- | --- |
| Clinic name or pseudonym | `<value>` |
| Clinic type | `<aesthetic / dermatology / plastic surgery / other>` |
| Branch count in pilot | `<number>` |
| Pilot owner | `<owner/manager name or role>` |
| Staff users in pilot | `<number>` |
| Lead channels in scope | `<Facebook / LINE / website / referral / other>` |
| Workflows selected | `<3-5 workflows>` |
| Data mode | `<demo / pseudonymized / limited real operational data>` |
| Consent/legal review completed | `<yes / no / partial>` |
| Real LINE enabled | `no by default` |
| Real AI provider enabled | `no by default` |

## 3. Pilot Scope

Selected MVP workflows:

- New Lead Welcome: `<in / out>`
- Uncontacted Lead Alert: `<in / out>`
- Lead Qualification Nurture: `<in / out>`
- No-Show Recovery: `<in / out>`
- Review Request: `<in / out>`
- Botox Cycle Reminder: `<in / out>`
- Filler Cycle Reminder: `<in / out>`
- Daily Marketing Reminder: `<in / out>`

Out of scope for this pilot:

- EMR or medical records
- Doctor scheduling
- Inventory
- Payment
- Production deployment
- Real external send unless separately approved
- Medical advice or diagnosis

## 4. Data Handling Summary

Data mode used:

- `demo/fake`
- `pseudonymized sample`
- `limited clinic-approved operational data`

Minimum data fields used:

- display name or pseudonym:
- channel reference:
- lead source:
- lead/customer stage:
- interest category:
- follow-up timestamps:
- no-show marker:
- repeat reminder category/date:
- staff assignment:
- consent status if available:

Sensitive data excluded:

- national ID/passport:
- payment card:
- full EMR:
- diagnosis:
- medication/allergy detail:
- procedure photos:
- full chat history:

Notes:

```text
<Describe any data handling exception, review, or deletion/export commitment.>
```

## 5. Baseline Metrics

Capture baseline before pilot starts.

| Metric | Baseline Value | Source | Confidence |
| --- | ---: | --- | --- |
| Leads per month | `<number>` | `<CRM/LINE/manual estimate>` | `<low/medium/high>` |
| Average first response time | `<minutes/hours>` | `<source>` | `<confidence>` |
| Uncontacted leads per week | `<number>` | `<source>` | `<confidence>` |
| No-show count per month | `<number>` | `<source>` | `<confidence>` |
| Review requests per week | `<number>` | `<source>` | `<confidence>` |
| Botox/Filler repeat pool | `<number>` | `<source>` | `<confidence>` |
| Staff hours spent on follow-up | `<hours/week>` | `<source>` | `<confidence>` |
| Current approval/review process | `<description>` | `<source>` | `<confidence>` |

Baseline notes:

```text
<Where baseline is estimated, say so explicitly.>
```

## 6. Weekly Usage Summary

| Week | Active Staff Days | Leads Reviewed | Uncontacted Leads | HITL Pending | HITL Approved | HITL Rejected | HITL Modified | Issues Opened | Notes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Week 0 | `<number>` | `<number>` | `<number>` | `<number>` | `<number>` | `<number>` | `<number>` | `<number>` | `<notes>` |
| Week 1 | `<number>` | `<number>` | `<number>` | `<number>` | `<number>` | `<number>` | `<number>` | `<number>` | `<notes>` |
| Week 2 | `<number>` | `<number>` | `<number>` | `<number>` | `<number>` | `<number>` | `<number>` | `<number>` | `<notes>` |
| Week 3 | `<number>` | `<number>` | `<number>` | `<number>` | `<number>` | `<number>` | `<number>` | `<number>` | `<notes>` |
| Week 4 | `<number>` | `<number>` | `<number>` | `<number>` | `<number>` | `<number>` | `<number>` | `<number>` | `<notes>` |

## 7. Workflow Metrics

### Response Time

| Metric | Baseline | Pilot Result | Change | Notes |
| --- | ---: | ---: | ---: | --- |
| Average first response time | `<value>` | `<value>` | `<value>` | `<notes>` |
| Median first response time | `<value>` | `<value>` | `<value>` | `<notes>` |
| Same-day response rate | `<%>` | `<%>` | `<percentage points>` | `<notes>` |

### Uncontacted Leads

| Metric | Baseline | Pilot Result | Change | Notes |
| --- | ---: | ---: | ---: | --- |
| Uncontacted leads per week | `<number>` | `<number>` | `<number>` | `<notes>` |
| Oldest uncontacted lead age | `<time>` | `<time>` | `<time>` | `<notes>` |
| Follow-up tasks completed | `<number>` | `<number>` | `<number>` | `<notes>` |

### HITL Queue

| Metric | Value | Notes |
| --- | ---: | --- |
| AI suggestions created | `<number>` | `<notes>` |
| Pending at end of pilot | `<number>` | `<notes>` |
| Approved | `<number>` | `<notes>` |
| Rejected | `<number>` | `<notes>` |
| Modified | `<number>` | `<notes>` |
| Approval rate | `<%>` | `<notes>` |
| Rejection reasons | `<summary>` | `<notes>` |

### No-Show Recovery

| Metric | Value | Notes |
| --- | ---: | --- |
| No-show leads/customers identified | `<number>` | `<notes>` |
| Recovery attempts created | `<number>` | `<notes>` |
| Recovery messages approved | `<number>` | `<notes>` |
| Recovery responses received | `<number>` | `<notes>` |
| Bookings recovered or follow-ups scheduled | `<number>` | `<notes>` |

### Review Request

| Metric | Value | Notes |
| --- | ---: | --- |
| Eligible aftercare/review customers | `<number>` | `<notes>` |
| Review request drafts created | `<number>` | `<notes>` |
| Review requests approved | `<number>` | `<notes>` |
| Review responses reported by clinic | `<number>` | `<notes>` |

### Botox/Filler Repeat Reminder

| Metric | Botox | Filler | Notes |
| --- | ---: | ---: | --- |
| Repeat opportunities identified | `<number>` | `<number>` | `<notes>` |
| Reminder drafts created | `<number>` | `<number>` | `<notes>` |
| Reminders approved | `<number>` | `<number>` | `<notes>` |
| Customer responses reported | `<number>` | `<number>` | `<notes>` |
| Bookings or consults reported | `<number>` | `<number>` | `<notes>` |

## 8. Staff Adoption

| Metric | Value | Notes |
| --- | ---: | --- |
| Staff users invited | `<number>` | `<notes>` |
| Staff users active | `<number>` | `<notes>` |
| Active staff days | `<number>` | `<notes>` |
| Daily queue review rate | `<%>` | `<notes>` |
| Staff-reported time saved | `<hours/week estimate>` | `<notes>` |
| Staff confidence using HITL | `<low/medium/high>` | `<notes>` |

Adoption summary:

```text
<Describe whether the team used FlowBiz as a real operating queue or only during check-ins.>
```

## 9. Issues And Risks

| Severity | Issue | Owner | Status | Resolution / Next Step |
| --- | --- | --- | --- | --- |
| Critical | `<issue>` | `<owner>` | `<open/closed>` | `<next step>` |
| High | `<issue>` | `<owner>` | `<open/closed>` | `<next step>` |
| Medium | `<issue>` | `<owner>` | `<open/closed>` | `<next step>` |
| Low | `<issue>` | `<owner>` | `<open/closed>` | `<next step>` |

Stop-condition review:

- AI sent without approval: `<yes/no>`
- Wrong-tenant data exposure: `<yes/no>`
- Real external send enabled unexpectedly: `<yes/no>`
- Real AI provider enabled unexpectedly: `<yes/no>`
- Medical advice misuse observed: `<yes/no>`
- Consent/data handling concern: `<yes/no>`

If any answer is `yes`, do not recommend paid conversion until resolved.

## 10. Qualitative Feedback

Owner/manager feedback:

```text
<What felt useful, risky, confusing, or worth paying for?>
```

Staff feedback:

```text
<What helped daily work, what slowed them down, what templates needed changes?>
```

Customer-facing language feedback:

```text
<Were AI drafts on tone? Were messages too generic, risky, or off-brand?>
```

## 11. Conservative Revenue Opportunity Estimate

This is an opportunity estimate, not a promised financial result.

Inputs:

| Input | Value | Source | Confidence |
| --- | ---: | --- | --- |
| Missed leads reviewed | `<number>` | `<source>` | `<confidence>` |
| Estimated recovered lead opportunities | `<number>` | `<source>` | `<confidence>` |
| Average treatment value | `<THB>` | `<source>` | `<confidence>` |
| No-show recovery opportunities | `<number>` | `<source>` | `<confidence>` |
| Repeat reminder opportunities | `<number>` | `<source>` | `<confidence>` |
| Staff hours saved per week | `<hours>` | `<source>` | `<confidence>` |
| Staff hourly cost estimate | `<THB>` | `<source>` | `<confidence>` |

Conservative calculation:

```text
Recovered lead opportunity = <number> * <average treatment value>
No-show recovery opportunity = <number> * <average treatment value>
Repeat reminder opportunity = <number> * <Botox/Filler average ticket>
Staff time value = <hours saved per month> * <hourly cost>
Estimated monthly opportunity = sum of the above
```

Notes:

- Use low-end conversion assumptions unless clinic data supports otherwise.
- Separate confirmed bookings from opportunity estimates.
- Do not count the same customer twice.
- Do not include medical outcome claims.

## 12. Paid Conversion Recommendation

Decision: `GO / CONDITIONAL / NO-GO`

Recommended plan:

- Starter
- Growth
- Pro
- Enterprise discovery
- Extend pilot
- Stop

Rationale:

```text
<Explain using adoption, safety, workflow fit, data readiness, and conservative opportunity.>
```

Conditions before paid onboarding:

- live staging smoke passes
- consent/data handling reviewed
- staff roles confirmed
- real integration QA completed if requested
- support process assigned
- pilot data deletion/export decision recorded

## 13. Next Actions

| Action | Owner | Due Date | Status |
| --- | --- | --- | --- |
| `<action>` | `<owner>` | `<date>` | `<status>` |
