# AI Medical Safety Policy

Phase: 5 - LLM real integration foundation
Date: 2026-05-26

## Policy Position

FlowBiz Beauty is an AI Marketing & Revenue Automation Layer for aesthetic clinics. It is not an EMR, doctor consultation system, diagnosis system, or autonomous medical advice system.

AI may draft operational or marketing suggestions, but staff must approve every AI-generated message before it can be sent to a patient, lead, or customer.

## Non-Negotiable Rules

- AI must not auto-send.
- AI-generated outbound text must enter HITL approval first.
- Medical-risk content must be reviewed by staff or a doctor before sending.
- AI must not diagnose, prescribe, or replace clinician judgement.
- AI must not guarantee safety, treatment outcomes, cure, recovery, or visible results.
- AI provider input/output metadata must be auditable without storing unnecessary raw PII.

## Prohibited Claims

AI-generated text must not include:

- `ปลอดภัย 100%`
- `เห็นผลแน่นอน`
- `หายแน่นอน`

Equivalent claims are also disallowed, including:

- guaranteed outcome
- guaranteed cure
- zero risk
- permanently safe
- doctor-level diagnosis without doctor review

## High-Risk Triggers

The classifier flags high-risk content when it references:

- pregnancy or breastfeeding
- chronic illness or underlying medical conditions
- medication, allergies, or anticoagulants
- adverse events such as swelling, bruising, infection, breathing difficulty, severe pain
- legal/complaint/refund/escalation language

High-risk content is not a reason to let AI answer directly. It is a reason to queue conservative staff-review language.

## Medium-Risk Triggers

Medium-risk content includes:

- dosage questions
- treatment necessity
- diagnostic requests
- requests for specific medication guidance

These must still enter HITL and should be reviewed carefully before sending.

## Approved AI Response Pattern

Safe AI drafts should:

- acknowledge the customer politely
- avoid medical certainty
- avoid diagnosis or prescription
- invite staff or doctor review
- suggest consultation or staff follow-up
- keep marketing language factual and conservative

## Unsafe AI Response Pattern

Unsafe AI drafts include:

- promises of results
- guaranteed safety
- claims that symptoms are harmless without assessment
- pressure to book while medical risk is present
- specific treatment/medicine instructions
- strong before/after claims without staff review

## Audit Requirements

Every AI generation attempt must preserve:

- clinic id
- lead or entity context when available
- actor user id when available
- provider and model
- use case
- input/output hashes and lengths
- medical safety labels
- HITL status
- timestamp

Raw PII should not be written into audit logs unless required for a specific operational workflow. HITL review records may contain the generated message because staff must review the actual text before sending.

## Current Enforcement

Implemented in Phase 5:

- default provider is `mock`
- real provider generation requires explicit env enablement
- OpenAI/Gemini missing keys fail closed
- pre/post medical safety checks run for provider suggestions
- prohibited claim output is blocked
- `/ai/generate-message` queues generated text into HITL
- provider audit metadata uses hashes and lengths

## Residual Risk

The current medical safety layer is deterministic. Before production, Phase 6 should harden the HITL contract and add a more complete risk taxonomy, reviewer workflow, and persistence model for before/after approval text.
