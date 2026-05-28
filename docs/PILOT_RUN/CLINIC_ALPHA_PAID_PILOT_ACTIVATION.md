# Clinic Alpha - Paid Pilot Activation (PR-28)

Document type: paid pilot activation record
Pilot clinic: Clinic Alpha (pseudonym only)
Date: 2026-06-05

---

## 1) Activation Objective

Activate first controlled paid pilot under validated scope to measure recurring revenue viability with minimum operational risk.

---

## 2) Scope Lock

Allowed workflows only:
1. Review Request
2. New Lead Welcome
3. Uncontacted Lead Alert
4. No-Show Recovery
5. Botox/Filler Repeat Reminder

Explicitly excluded:
1. Daily Marketing Reminder
2. Lead Qualification Nurture
3. broadcast workflows
4. autonomous AI send
5. multi-clinic rollout

---

## 3) Safe Mode Attestation

1. LINE_REAL_SEND_ENABLED=false
2. AI_REAL_GENERATION_ENABLED=false
3. HITL mandatory for all outbound actions
4. no autonomous outbound send
5. no broad customer import
6. no production deploy

Activation status:
- READY_FOR_ACTIVE_PAID_PILOT
