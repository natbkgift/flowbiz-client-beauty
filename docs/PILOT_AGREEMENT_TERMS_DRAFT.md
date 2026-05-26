# Pilot Agreement Terms Draft - FlowBiz Beauty

Date: 2026-05-27
Scope: Business terms draft for friendly pilot clinics

## Important Disclaimer

This is a business terms draft for discussion. It is not a final legal contract and is not legal advice.

Before signature or customer-facing use, this draft should be reviewed by the clinic owner, FlowBiz owner, and qualified legal counsel.

## Pilot Purpose

The pilot validates whether FlowBiz Beauty can support clinic revenue operations by improving visibility and workflow consistency for:

- new lead follow-up
- uncontacted lead alerts
- lead qualification nurture
- no-show recovery
- review request
- Botox/Filler repeat reminder
- daily marketing reminder
- AI suggestion review through HITL

The pilot is not a production rollout and does not replace medical judgement, EMR, scheduling, inventory, payment, or the clinic's existing legal/compliance responsibilities.

## Pilot Duration

Recommended duration:

- 14-30 days

The pilot may be extended only by written agreement or documented owner approval.

## Pilot Environment

Preferred pilot order:

1. demo/fake data
2. pseudonymized clinic-approved sample data
3. limited real operational data after explicit approval

The pilot should not use production credentials or production database access.

## Data Responsibility

Clinic responsibilities:

- confirm what data may be used
- avoid providing unnecessary sensitive data
- confirm staff authorized to access the pilot
- confirm consent basis or approval for outreach workflows
- review AI-generated customer-facing messages before use

FlowBiz responsibilities:

- process only agreed pilot data
- use role-based access where available
- keep AI suggestions under HITL review
- avoid committing secrets or customer data to the repo
- support deletion/export handling at pilot end according to agreed process

## Data Not Required For Pilot

The pilot should not require:

- full medical records
- diagnosis records
- national ID/passport
- payment card data
- insurance data
- sensitive medical notes
- procedure photos
- full LINE chat history

If the clinic believes any of this is required, pause the pilot setup and request legal/owner review.

## Limitation Of AI

FlowBiz AI is a drafting assistant for staff.

Rules:

- AI does not send customer-facing messages by itself.
- Staff approval is required before outbound.
- AI output is not medical advice.
- Medical-risk content must be reviewed carefully and may require doctor review.
- Staff remains responsible for final wording and customer communication.

## No Promised Financial Return

The pilot measures workflow adoption and revenue opportunity. It does not promise revenue, bookings, conversion rate, or financial return.

Pilot metrics are estimates and should be interpreted with real clinic context.

## No Medical Advice

FlowBiz is not a doctor, clinic practitioner, EMR, diagnosis system, or treatment recommendation engine.

The clinic remains responsible for medical review, clinical decisions, treatment suitability, and patient-facing medical statements.

## Simulated Vs Real Integration Status

Default pilot mode:

- LINE: simulated
- AI provider: mock
- outbound delivery: controlled and approval-gated

Real LINE or real AI provider use requires a separate integration QA plan, approved credentials handling, staging isolation, and confirmation that HITL remains enforced.

## Support Scope

Pilot support may include:

- onboarding walkthrough
- workflow selection
- template tuning
- staff guidance
- weekly review
- issue triage
- final pilot summary

Support does not include:

- legal advice
- medical advice
- full CRM migration
- EMR integration
- payment processing
- inventory workflow
- production SLA unless separately agreed

## Success Metrics

Possible pilot metrics:

- response time trend
- uncontacted lead count
- pending approval count
- AI approval/modification/rejection rate
- no-show recovery attempts
- review request attempts
- repeat reminder opportunities
- staff active days
- qualitative staff feedback
- estimated revenue opportunity

## Termination

Either side may stop the pilot if:

- data handling scope is unclear
- staff adoption is too low
- requested scope exceeds MVP boundaries
- AI/HITL safety rules cannot be followed
- real external send is requested without QA plan
- wrong-tenant or access-control issue is suspected
- legal/compliance owner asks to pause

## End-Of-Pilot Data Handling

At pilot end, choose and document one path:

- delete pilot data
- export pilot data to clinic, then delete working copy
- retain limited data for extended pilot
- convert to paid onboarding after commercial and compliance approval

Deletion/export should follow the checklist in [PILOT_DATA_HANDLING_POLICY.md](PILOT_DATA_HANDLING_POLICY.md).

## Legal Review Required

Before use with a real clinic, review:

- consent language
- AI processing notice
- data responsibility clause
- retention window
- support obligations
- limitation of liability
- data deletion/export handling
- real integration terms if applicable
