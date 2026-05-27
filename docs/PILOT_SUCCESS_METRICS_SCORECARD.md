# Pilot Success Metrics Scorecard - FlowBiz Beauty

Date prepared: `<YYYY-MM-DD>`
Clinic: `<clinic name or pseudonym>`
Pilot period: `<start date> to <end date>`
Prepared by: `<FlowBiz operator>`

## Purpose

This scorecard converts a friendly pilot into a clear paid-conversion recommendation.

It is a product and operations tool. It is not medical advice, legal advice, production readiness approval, or a promised financial outcome.

Default limitation:

- AI drafts require staff approval.
- Real LINE usage requires separate QA.
- Real Gemini/OpenAI usage requires separate QA.
- Revenue opportunity must be conservative and evidence-based.

## Scoring Method

Score each category from `0` to `3`.

| Score | Meaning |
| ---: | --- |
| 0 | Not demonstrated or unsafe |
| 1 | Weak signal; needs more pilot work |
| 2 | Useful signal; acceptable with conditions |
| 3 | Strong signal; ready for paid workflow scope |

Recommended decision:

- `24-30`: GO to paid conversion, if safety and staging conditions are met
- `18-23`: CONDITIONAL, convert only with written conditions
- `10-17`: extend pilot or narrow scope
- `<10`: NO-GO

Safety override:

- Any critical safety breach changes recommendation to NO-GO until resolved.

## Category Scorecard

| Category | Score | Evidence | Notes |
| --- | ---: | --- | --- |
| Lead follow-up visibility | `<0-3>` | `<metric/evidence>` | `<notes>` |
| Response time improvement | `<0-3>` | `<metric/evidence>` | `<notes>` |
| Uncontacted lead reduction | `<0-3>` | `<metric/evidence>` | `<notes>` |
| HITL adoption | `<0-3>` | `<metric/evidence>` | `<notes>` |
| AI suggestion quality | `<0-3>` | `<metric/evidence>` | `<notes>` |
| No-show recovery workflow | `<0-3>` | `<metric/evidence>` | `<notes>` |
| Review request workflow | `<0-3>` | `<metric/evidence>` | `<notes>` |
| Botox/Filler repeat reminder workflow | `<0-3>` | `<metric/evidence>` | `<notes>` |
| Staff adoption | `<0-3>` | `<metric/evidence>` | `<notes>` |
| Owner/manager value perception | `<0-3>` | `<metric/evidence>` | `<notes>` |

Total score: `<number>/30`

## Safety Gate

These must be `pass` before paid conversion:

| Gate | Result | Evidence |
| --- | --- | --- |
| AI did not send without approval | `<pass/fail>` | `<evidence>` |
| Rejected AI suggestions were not sent | `<pass/fail>` | `<evidence>` |
| Medical-risk text was reviewed | `<pass/fail>` | `<evidence>` |
| Tenant/workspace isolation concern absent | `<pass/fail>` | `<evidence>` |
| Staff access was role-appropriate | `<pass/fail>` | `<evidence>` |
| Data handling scope was approved | `<pass/fail>` | `<evidence>` |
| Real LINE send was not enabled by default | `<pass/fail>` | `<evidence>` |
| Real AI provider generation was not enabled by default | `<pass/fail>` | `<evidence>` |
| No prohibited data imported by default | `<pass/fail>` | `<evidence>` |

If any safety gate fails, record the issue and do not recommend paid onboarding until remediated.

## Metric Definitions

### Response Time

Measure:

- average first response time
- median first response time
- same-day response rate

Score guide:

- 0: no baseline or no usage
- 1: measured but no improvement
- 2: modest improvement or better visibility
- 3: clear improvement with staff adoption

### Uncontacted Leads

Measure:

- count at week start and week end
- oldest uncontacted lead age
- completed follow-up tasks

Score guide:

- 0: untracked
- 1: tracked but not reduced
- 2: reduced for selected workflow
- 3: consistently reviewed and reduced

### HITL Adoption

Measure:

- pending count
- approved count
- rejected count
- modified count
- approval rate
- staff confidence

Score guide:

- 0: staff bypasses or avoids HITL
- 1: staff uses only during check-in
- 2: staff uses for selected workflows
- 3: staff uses as daily operating process

### No-Show Recovery

Measure:

- no-show leads/customers identified
- recovery attempts created
- messages approved
- responses or bookings reported

Score guide:

- 0: not used
- 1: used manually once
- 2: useful but needs tuning
- 3: repeatable workflow with owner confidence

### Review Request

Measure:

- eligible customers identified
- review request drafts
- approved requests
- reported review outcomes if clinic tracks them

Score guide:

- 0: not used
- 1: low usage
- 2: usable with timing/template changes
- 3: adopted as regular follow-up workflow

### Botox/Filler Repeat Reminder

Measure:

- repeat opportunities surfaced
- reminder drafts
- approved reminders
- customer responses or bookings reported

Score guide:

- 0: no repeat data available
- 1: opportunities visible but not acted on
- 2: reminders used with tuning
- 3: repeat reminder workflow accepted by staff/owner

### Staff Adoption

Measure:

- active staff users
- active staff days
- queue reviews
- feedback
- time saved estimate

Score guide:

- 0: staff did not use it
- 1: one champion used it, team did not
- 2: some staff adoption with training needs
- 3: regular team usage

## Conservative Revenue Opportunity

Use only conservative, clearly labelled estimates.

Inputs:

| Input | Value | Confidence |
| --- | ---: | --- |
| Recovered lead opportunities | `<number>` | `<low/medium/high>` |
| Average treatment value | `<THB>` | `<confidence>` |
| No-show recovery opportunities | `<number>` | `<confidence>` |
| Repeat reminder opportunities | `<number>` | `<confidence>` |
| Staff hours saved/month | `<hours>` | `<confidence>` |
| Staff hourly cost | `<THB>` | `<confidence>` |

Calculation:

```text
Lead opportunity = recovered lead opportunities * average treatment value
No-show opportunity = no-show recovery opportunities * average treatment value
Repeat opportunity = repeat reminder opportunities * Botox/Filler average ticket
Staff time value = staff hours saved/month * staff hourly cost
Estimated monthly opportunity = sum of the above
```

Rules:

- Mark each number as measured or estimated.
- Use low-end assumptions.
- Do not double-count the same lead/customer.
- Do not treat opportunity as booked revenue unless clinic confirms booking.
- Do not make medical outcome claims.

## Go/No-Go Decision

Final recommendation:

- `GO`
- `CONDITIONAL`
- `NO-GO`

Decision rationale:

```text
<Use score, safety gate, adoption, and opportunity evidence.>
```

Paid conversion conditions:

- live staging smoke passes
- data handling and consent review complete
- staff roles confirmed
- support owner assigned
- real integration QA complete if requested
- pilot data deletion/export path agreed

## Conversion Notes

Recommended plan:

- Starter
- Growth
- Pro
- Enterprise discovery

Primary paid workflow:

```text
<Start with the workflow that produced strongest adoption and value evidence.>
```

Risks to address before contract:

```text
<List blockers and owners.>
```
