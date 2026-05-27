# Pilot Scope and Boundaries — FlowBiz Beauty

Date: 2026-05-28
Version: 1.0

---

## Purpose

This document defines exactly what is and is not included in the first friendly pilot.
All participants — clinic owner, staff, and FlowBiz operators — must read and accept this document before the pilot begins.

---

## In Scope

| Item | Detail |
|---|---|
| Platform | FlowBiz Beauty on **staging environment** only |
| Clinic count | **1 clinic** |
| Branch count | **1 branch** per clinic |
| Duration | 14–30 days |
| Data mode | Demo / Pseudonymized / Limited real operational (owner-confirmed) |
| Workflows enabled | See section below |
| AI usage | Gemini for suggestion drafts only — all output enters HITL queue |
| LINE usage | Staging-safe by default; real LINE only if approved and QA-gated |
| Audit | Full audit trail for all AI, HITL, and outbound events |
| Staff roles | Operator and viewer roles only (least privilege) |
| Reporting | Weekly check-in metrics and pilot exit report |

---

## Out of Scope

The following are **explicitly excluded** from this pilot:

| Excluded Item | Reason |
|---|---|
| Production environment | Not production-ready; staging only |
| Production database | Risk of real data exposure |
| Multiple clinics simultaneously | Scope too large for first pilot |
| Mass / scheduled broadcast | Safety and compliance risk |
| AI auto-send | Violates HITL contract |
| Gemini output → LINE direct send | Requires HITL gate |
| EMR / medical record integration | Out of product scope |
| Doctor scheduling | Out of product scope |
| Inventory management | Out of product scope |
| Payment / invoicing | Out of product scope |
| Full CRM analytics rollup | Post-pilot feature |
| Lead Qualification Nurture workflow | Complex multi-step — deferred |
| Daily Marketing Reminder workflow | Broadcast risk — excluded |
| National ID / passport data | Not allowed by policy |
| Payment card data | Not allowed by policy |
| Diagnosis / prescription data | Not allowed by policy |
| Full chat history import | Not allowed by policy |
| Before/after procedure photos | Not allowed by policy |

---

## Workflows Enabled

Only these 5 workflows may be activated. Each must be enabled explicitly:

| # | Workflow | Default State | Enabled By |
|---|---|---|---|
| 1 | New Lead Welcome | Disabled | FlowBiz operator, with owner approval |
| 2 | Uncontacted Lead Alert | Disabled | FlowBiz operator, with owner approval |
| 3 | No-Show Recovery | Disabled | FlowBiz operator, with owner approval |
| 4 | Review Request | Disabled | FlowBiz operator, with owner approval |
| 5 | Botox/Filler Repeat Reminder | Disabled | FlowBiz operator, with owner approval |

> If clinic staff is not ready for all 5, start with fewer (e.g., 2–3) and expand only after 1 week of successful operation.

---

## LINE Usage Boundary

| Rule | Detail |
|---|---|
| Default mode | **Simulated** — no real LINE messages sent |
| Real LINE mode | Allowed **only** if: clinic has LINE OA configured, staff understands outbound rules, QA-gated workflow, and FlowBiz technical owner confirms readiness |
| Who approves real LINE | FlowBiz technical owner + clinic operator |
| Broadcast | **Never** — zero tolerance |
| Auto-send from AI | **Never** — all AI outbound requires HITL approval |
| Rollback | Real LINE can be disabled immediately via env flag `LINE_REAL_SEND_ENABLED=false` |
| ENV variable | `LINE_INTEGRATION_MODE=real` and `LINE_REAL_SEND_ENABLED=true` — only if approved |

---

## Gemini Usage Boundary

| Rule | Detail |
|---|---|
| Default mode | **Mock / simulated** — no real Gemini API calls |
| Real Gemini mode | Allowed **only** if: QA-gated integration test passed, FlowBiz technical owner confirms, operating window defined |
| Output usage | Gemini output → HITL queue **only** — never directly to outbound |
| Prohibited content | No medical diagnosis, no cure/outcome guarantee, no medical advice |
| Rollback | Real Gemini disabled via `AI_REAL_GENERATION_ENABLED=false` |
| ENV variable | `AI_PROVIDER=gemini` and `AI_REAL_GENERATION_ENABLED=true` — only if approved |

---

## AI / HITL Rule

This rule is **non-negotiable**:

1. Gemini (or any AI provider) may generate a **draft suggestion only**.
2. Every AI-generated message enters the **HITL review queue** automatically.
3. Staff must **approve, modify, or reject** before any message can move to outbound.
4. **Rejected** messages cannot be sent.
5. **Approved** messages are queued for outbound — a separate send action is required.
6. AI-generated content sent without HITL approval is a **critical violation** requiring immediate pilot pause.

---

## Medical Safety Boundary

| Rule | Detail |
|---|---|
| FlowBiz role | AI Marketing & Revenue Automation Layer only |
| Not a medical system | Not EMR, not diagnosis, not prescription, not treatment advice |
| Prohibited AI claims | "ปลอดภัย 100%", "เห็นผลแน่นอน", "หายแน่นอน", guaranteed outcomes, medical cure |
| High-risk content | Must be reviewed by staff before sending — AI may draft a conservative deferral only |
| Staff responsibility | Staff must not use FlowBiz to replace clinical or legal judgement |

---

## Data Boundary

| Rule | Detail |
|---|---|
| Default data mode | Demo / fake data |
| Minimum necessary | Only fields needed for selected workflows |
| Sensitive data | National ID, passport, payment card, diagnosis, full EMR — excluded |
| Import process | Owner-approved field list before any import |
| Retention | End-of-pilot export/delete plan agreed before import |
| PDPA baseline | Per `docs/PDPA_CONSENT_FOUNDATION.md` |

---

## Support Boundary

| Scope | Covered |
|---|---|
| Workflow questions | Yes — via pilot operator |
| Staff onboarding | Yes — Day 0 walkthrough |
| Technical issues (staging) | Yes — FlowBiz technical owner |
| Medical/legal advice | **No** — clinic must use own qualified resources |
| EMR or scheduling support | **No** — out of product scope |
| Guaranteed outcomes | **No** — not provided |

---

## Escalation Boundary

| Level | When | Who |
|---|---|---|
| Normal support | Workflow/usage questions | Pilot operator (chat/email) |
| Urgent | System down, outbound incorrect | Pilot operator urgent line |
| Critical | AI sent without HITL, data exposure, tenant leak | FlowBiz technical owner immediately |
| Clinic decision | Scope change, data mode change, pilot stop | Clinic owner approval required |

---

## Paid Conversion Boundary

| Rule | Detail |
|---|---|
| Conversion trigger | After successful pilot with scorecard ≥ 18/30 |
| Pricing discussion | Only after pilot exit report is delivered |
| No guaranteed ROI | FlowBiz does not guarantee specific revenue increases |
| No ROI claim | All opportunity estimates are estimates only — not commitments |
| Conversion conditions | Safety gates must pass, no critical open risks |

---

## References

- [FIRST_FRIENDLY_PILOT_SETUP.md](FIRST_FRIENDLY_PILOT_SETUP.md)
- [PILOT_LINE_GEMINI_OPERATING_MODE.md](PILOT_LINE_GEMINI_OPERATING_MODE.md)
- [PILOT_ROLLBACK_AND_DISABLE_PLAN.md](PILOT_ROLLBACK_AND_DISABLE_PLAN.md)
- [../HITL_APPROVAL_CONTRACT.md](../HITL_APPROVAL_CONTRACT.md)
- [../AI_MEDICAL_SAFETY_POLICY.md](../AI_MEDICAL_SAFETY_POLICY.md)
- [../PDPA_CONSENT_FOUNDATION.md](../PDPA_CONSENT_FOUNDATION.md)
- [../PILOT_DATA_HANDLING_POLICY.md](../PILOT_DATA_HANDLING_POLICY.md)
