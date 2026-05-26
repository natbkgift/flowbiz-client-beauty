# ROI Calculator Spec - FlowBiz Beauty

Phase: 10 - Sales package

## Purpose

This calculator estimates monthly revenue opportunity from better lead follow-up, no-show recovery, repeat treatment reminders, and staff time savings.

It is an opportunity estimate, not a promised return. It is not financial advice and must be calibrated with real clinic data.

## Input Fields

| Input | Type | Example | Notes |
| --- | --- | ---: | --- |
| Leads per month | Number | 300 | Total new leads across Facebook, LINE, website, referral |
| Average consult value | THB | 500 | Use 0 if consult is free |
| Average treatment value | THB | 8,000 | Conservative average actual ticket |
| Current response time | Minutes/hours | 4 hours | Used for narrative and benchmark |
| Estimated missed lead rate | Percent | 15% | Leads that are not contacted or not followed up enough |
| Lead recovery conversion rate | Percent | 5% | Conservative portion of missed leads recovered |
| No-show rate | Percent | 12% | Missed consult/booking rate |
| No-show recovery rate | Percent | 10% | Portion recovered through follow-up |
| Repeat customer count | Number | 500 | Customers in Botox/Filler repeat pool |
| Botox/Filler average ticket | THB | 7,500 | Conservative average repeat ticket |
| Repeat reminder response rate | Percent | 3% | Portion likely to engage/book |
| Staff hourly cost | THB | 150 | Fully loaded or estimated hourly cost |
| Hours saved per week | Hours | 5 | Time saved from templates/queueing/follow-up consistency |
| Monthly FlowBiz plan | THB | 19,900 | Selected plan fee |

## Calculations

### Recovered Lead Opportunity

```text
missed_leads = leads_per_month * estimated_missed_lead_rate
recovered_leads = missed_leads * lead_recovery_conversion_rate
recovered_lead_opportunity = recovered_leads * average_treatment_value
```

### No-Show Recovery Opportunity

```text
estimated_no_shows = leads_per_month * no_show_rate
recovered_no_shows = estimated_no_shows * no_show_recovery_rate
no_show_recovery_opportunity = recovered_no_shows * average_treatment_value
```

### Repeat Treatment Opportunity

```text
repeat_bookings = repeat_customer_count * repeat_reminder_response_rate
repeat_treatment_opportunity = repeat_bookings * botox_filler_average_ticket
```

### Staff Time Saved

```text
monthly_hours_saved = hours_saved_per_week * 4.33
staff_time_saved_value = monthly_hours_saved * staff_hourly_cost
```

### Estimated Monthly Opportunity

```text
estimated_monthly_opportunity =
  recovered_lead_opportunity
  + no_show_recovery_opportunity
  + repeat_treatment_opportunity
  + staff_time_saved_value
```

### Payback Estimate

```text
net_opportunity_after_plan = estimated_monthly_opportunity - monthly_flowbiz_plan
payback_ratio = estimated_monthly_opportunity / monthly_flowbiz_plan
```

## Output Fields

- Recovered lead opportunity
- No-show recovery opportunity
- Repeat treatment opportunity
- Staff time saved
- Estimated monthly opportunity
- Monthly plan cost
- Net opportunity after plan
- Payback estimate
- Sensitivity view: conservative, base, optimistic

## Conservative Defaults

Recommended default assumptions for first sales conversation:

- Missed lead rate: 10-15%
- Lead recovery conversion: 3-5%
- No-show recovery: 5-10%
- Repeat reminder response: 2-3%
- Staff time saved: 3-5 hours/week

Avoid presenting aggressive assumptions unless the clinic provides supporting historical data.

## Required Warnings

Use these notes in the calculator UI or spreadsheet:

- This is an opportunity estimate, not a promised ROI.
- Results depend on lead quality, staff adoption, clinic offer, pricing, response time, and actual customer behavior.
- This is not financial advice.
- The model should be calibrated with actual clinic data during pilot.
- FlowBiz supports workflow execution and auditability; it does not replace medical judgement or staff responsibility.

## Pilot Calibration Plan

During pilot, replace estimates with measured values:

- Actual new leads
- Actual uncontacted lead count
- Actual approval queue count
- Actual follow-up attempts
- Actual no-show recovery attempts
- Actual repeat reminder opportunities
- Staff usage frequency
- Qualitative staff feedback
