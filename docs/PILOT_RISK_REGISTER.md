# Pilot Risk Register - FlowBiz Beauty

Date: 2026-05-27
Scope: friendly pilot risk tracking

## Purpose

Use this register to track operational, safety, data, and adoption risks during friendly pilot clinics.

This is a working risk register, not a legal compliance certification.

## Risk Register

| Risk | Severity | Description | Mitigation | Owner | Status |
| --- | --- | --- | --- | --- | --- |
| Infra readiness | High | Staging outage or readiness failure blocks pilot workflow | Monitor `/api/ready`, keep rollback notes, pause pilot if unhealthy | Technical owner | Open |
| Database isolation | Critical | Pilot data could be mixed with wrong environment | Use staging-only DB, env file outside repo, no production-like URL | Technical owner | Monitored |
| AI auto-send | Critical | AI-generated text could reach customers without staff approval | Enforce HITL, review queue, audit approval/outbound events | Product/technical owner | Monitored |
| Real provider mode | High | LINE or AI real mode could be enabled outside QA | Keep simulated/mock defaults, require separate integration gate | Technical owner | Open |
| Tenant isolation | Critical | Wrong clinic/workspace data could be visible | RBAC, workspace context, smoke/manual checks, stop pilot on any concern | Technical owner | Monitored |
| Operator misuse | High | Staff may treat FlowBiz as medical advice or send risky content | Safety briefing, HITL review, messaging guidance | Pilot operator | Open |
| Medical claim wording | High | Draft or edited message may imply outcome or medical guarantee | Medical safety policy, staff edit/reject, conservative templates | Clinic owner + FlowBiz operator | Open |
| Consent and data handling | High | Pilot may collect more data than necessary | Demo first, minimum data, owner approval, PDPA foundation docs | Clinic owner + FlowBiz operator | Open |
| Sensitive data import | Critical | National ID, payment card, EMR, diagnosis, or procedure images enter pilot | Explicit exclusion list, data review before import | Clinic owner | Open |
| Data retention | Medium | Pilot data is not exported/deleted as agreed | End-of-pilot checklist, retention decision recorded | Pilot operator | Open |
| Staff adoption | Medium | Staff uses the tool only during meetings | Weekly adoption metrics, simplify workflows, limit scope | Pilot operator | Open |
| Metric quality | Medium | Baseline or opportunity estimate is unreliable | Mark confidence, separate measured data from estimates | Pilot operator | Open |
| Support coverage | Medium | Clinic does not know who to contact | Support matrix, severity rules, response targets | Pilot operator | Open |
| Staging rollback | High | Previous production-like target cannot be restored automatically | Document current state, avoid destructive rollback, use backup-first process | Technical owner | Open |

## Critical Risk Response

For critical risks:

1. Pause affected workflow.
2. Preserve evidence.
3. Notify FlowBiz technical owner and clinic owner.
4. Confirm whether customer-facing impact occurred.
5. Confirm whether data exposure occurred.
6. Decide resume, scope reduction, or pilot stop.

## Weekly Risk Review

Review each week:

- Any new risk?
- Any risk severity changed?
- Any open high/critical risk?
- Any workflow paused?
- Any support action overdue?
- Any data deletion/export decision needed?

## Paid Conversion Risk Gate

Do not recommend paid conversion if:

- Any critical risk remains open.
- Tenant isolation concern is unresolved.
- AI/HITL bypass is observed.
- Real provider mode is requested but not QA-approved.
- Staff adoption is weak and owner does not see workflow value.
- Data handling scope remains unclear.
