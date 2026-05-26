# MVP Scope Lock - FlowBiz Beauty

Audit date: 2026-05-26  
Document purpose: lock the sellable MVP scope for demo, pilot, and staging preparation. This document is a product and delivery contract, not a runtime implementation change.

## MVP Positioning

FlowBiz Beauty is an AI Marketing and Revenue Automation Layer for aesthetic clinics.

It is not a generic CRM replacement. It sits on top of the clinic's lead, customer, chat, and treatment-cycle workflow to reduce missed revenue opportunities.

The MVP promise:

- Reduce leaked leads by making follow-up work visible and timely.
- Help staff reply faster with AI-drafted suggestions.
- Keep medical and marketing messages safe through Human-In-The-Loop approval.
- Recover no-shows and inactive leads with controlled automation.
- Bring customers back with treatment-cycle reminders.
- Prove operational control through RBAC, audit trail, and approval history.

Core product sentence for sales:

FlowBiz Beauty helps aesthetic clinics turn inquiries, no-shows, reviews, and repeat-treatment cycles into a controlled revenue workflow, with AI helping staff draft messages but never sending medical or marketing content without human approval.

## MVP Use Cases

The MVP is locked to these 8 use cases:

1. New Lead Welcome
   - Trigger: new lead enters from manual entry, website, LINE, Facebook, TikTok, or other supported inbound source.
   - Outcome: staff sees the lead and AI can suggest a welcome/follow-up message.
   - Safety rule: AI suggestion must enter HITL approval before any outbound send.

2. Uncontacted Lead Alert
   - Trigger: lead has no contact activity after the configured time window.
   - Outcome: staff receives a task/reminder to follow up.
   - Safety rule: alert is internal; any customer-facing message still requires approval if AI-generated.

3. Lead Qualification Nurture
   - Trigger: lead is in inquiry/qualification stage and has provided partial interest signals.
   - Outcome: AI suggests a friendly qualification message and next-best action.
   - Safety rule: no diagnosis, no guaranteed result, no medical claim without review.

4. No-Show Recovery
   - Trigger: lead/customer misses consult or treatment appointment status.
   - Outcome: staff can approve a recovery message and schedule a follow-up.
   - Safety rule: message must be empathetic, non-blaming, and manually approved.

5. Review Request
   - Trigger: customer completes a service or aftercare checkpoint.
   - Outcome: staff can send a review request template or approved AI copy.
   - Safety rule: do not pressure for medical claims or before/after guarantees.

6. Botox Cycle Reminder
   - Trigger: customer reaches the configured Botox repeat interval, for demo use 4 months.
   - Outcome: staff sees repeat opportunity and can approve reminder copy.
   - Safety rule: reminder must invite assessment/consultation, not promise outcome.

7. Filler Cycle Reminder
   - Trigger: customer reaches the configured filler repeat interval, for demo use 6 months.
   - Outcome: staff sees repeat opportunity and can approve reminder copy.
   - Safety rule: reminder must avoid treatment guarantees and encourage professional assessment.

8. Daily Marketing Reminder
   - Trigger: daily clinic operation checkpoint.
   - Outcome: staff sees key marketing tasks such as uncontacted leads, no-show follow-ups, pending approvals, repeat reminders, and review requests.
   - Safety rule: this is an internal operations reminder; outbound content still follows HITL.

## Out Of Scope

The following are explicitly out of scope for this MVP round:

- EMR or medical record system.
- Full doctor scheduling system.
- Inventory management.
- Real payment collection or full payment reconciliation.
- Forum/community as the core selling point.
- Advanced BI or data warehouse-style analytics.
- Microservices.
- Full ads spend sync.
- Full CRM replacement positioning.
- Automated AI sending to patients or leads.
- Medical diagnosis, prescription, dosage, or treatment guarantee generation.
- Public medical forum answers as an automation core workflow.
- Production deployment.

## Non-Negotiable Safety Rules

- AI generates suggestions only.
- AI must not auto-send messages.
- Medical-risk content must be classified and routed to approval.
- Staff approval is required before customer-facing AI copy is sent.
- All important actions must write audit logs.
- All sensitive routes must enforce RBAC.
- All tenant data must be scoped by clinic and, where applicable, workspace context.
- Real external integrations must default to simulated mode and require explicit env flags for real mode.
- No secrets are committed to the repo.

## Demo Story

Primary demo story:

Lead enters -> AI suggests message -> Staff approves -> Automation follow-up -> No-show recovery -> Review request -> Repeat reminder

Demo narrative:

1. A new lead arrives from LINE or Facebook and appears in the clinic workspace.
2. FlowBiz shows the lead source, stage, and contact status.
3. AI drafts a welcome or qualification response.
4. The draft enters the HITL queue instead of being sent automatically.
5. Staff reviews, edits if needed, and approves the message.
6. The approved message moves to the outbound workflow.
7. If the lead does not respond or misses the consult, FlowBiz creates a no-show recovery task and message draft.
8. After a completed service, FlowBiz prepares a review request.
9. Later, FlowBiz surfaces Botox and filler repeat reminders.
10. The audit log proves who approved what, when, for which clinic/workspace, and what changed.

## Demo Readiness Checklist

Required before a sales demo:

- Demo clinic tenant exists.
- Demo owner/admin/operator users exist.
- Demo workspace exists.
- Demo leads exist:
  - Lead from Facebook.
  - Lead from LINE.
  - Hot lead.
  - Cold lead.
  - No-show lead.
  - Uncontacted lead.
- Demo customers exist:
  - Botox customer due in 4 months.
  - Filler customer due in 6 months.
  - Aftercare customer.
- Demo treatments or treatment-history-style data exists.
- Demo automation flows exist for the 8 locked MVP use cases.
- Demo message templates exist.
- Demo HITL queue has pending approval items.
- Demo audit trail contains realistic events.
- Demo dashboard shows non-empty metrics.
- Unified inbox has a realistic thread.
- No real external send is enabled during demo unless explicitly requested and safely configured.

## Sales Demo Script Outline

Recommended 15-minute flow:

1. Dashboard overview
   - Show leaked revenue risk: uncontacted leads, pending approvals, no-show recovery, repeat reminders.

2. Unified inbox
   - Open a lead conversation from LINE or Facebook.
   - Show lead context and source.

3. AI suggestion
   - Show AI-drafted response.
   - Explain that AI is not allowed to send by itself.

4. Staff approval
   - Approve or modify the suggestion.
   - Highlight HITL, RBAC, and audit trail.

5. Automation execution
   - Show follow-up/reminder flow and task creation.

6. No-show recovery
   - Show a missed consult lead and recovery message draft.

7. Review request
   - Show customer aftercare/review request workflow.

8. Repeat reminder
   - Show Botox and filler cycle reminders.

9. Audit proof
   - Show who approved/sent/changed what and when.

Close with:

FlowBiz does not ask the clinic to replace its whole CRM on day one. It adds an AI marketing and revenue automation layer that reduces missed follow-up, improves repeat revenue, and keeps customer messaging controlled.

## MVP Acceptance Criteria

MVP demo can be considered ready when:

- The 8 locked use cases are visible in product or demo data.
- Staff can explain the workflow without mentioning future features.
- AI suggestions never bypass HITL.
- Medical-risk text is flagged before customer-facing send.
- At least one approved outbound path is visible in audit logs.
- Demo tenant data is isolated from other clinics/workspaces.
- Simulated integrations are clearly labeled as simulated.
- Any real integration mode is disabled by default.

## PR Breakdown For Next Phases

PR 1 - Phase 0-1 audit and scope lock

- Contains `docs/PHASE0_PROJECT_AUDIT_REPORT.md`.
- Contains this `docs/MVP_SCOPE_LOCK.md`.
- No runtime code changes.

PR 2A - Critical AI/HITL blocker fix

- Disable AI auto-send paths.
- Force AI agent replies into `pending_approval`.
- Prevent AI-generated follow-up actions from sending directly.
- Update tests that currently expect auto-send.
- Add tests proving rejected/unapproved AI suggestions cannot send.

PR 2B - Production stabilization

- RBAC route guard review.
- Audit event coverage.
- Medical safety hard gate.
- Production config and health endpoint hardening.
- Webhook verification documentation and missing provider gaps.

PR 3 - Frontend decomposition first slice

- Add `docs/FRONTEND_DECOMPOSITION_PLAN.md`.
- Extract stable shared UI components only.
- Keep behavior and routing stable.

PR 4 - LINE integration foundation

- Add LINE simulated/real/dry-run adapter.
- Add signature verification and audit attempts.
- Default to simulated, no real send.

PR 5 - LLM provider foundation

- Add `mock|gemini|openai` adapter.
- Default to mock unless explicitly enabled.
- Route all generated suggestions through HITL.

PR 6 - HITL approval hardening

- Implement complete status lifecycle.
- Store approver, clinic, workspace, original text, modified text, risk label, and timestamp.

PR 7 - Demo clinic seed and demo script

- Add demo data and a 15-minute demo script.

PR 8 - Staging deployment readiness

- Add staging runbook, env example coverage, smoke tests, migration/backup/rollback instructions.

PR 9 - CI/CD hardening

- Run local-equivalent validation in CI.
- Add migration check and full or staged test matrix.

PR 10 - Sales package and pilot plan

- Add one-page pitch, pricing, objections, ROI calculator spec, pilot execution plan, and demo video script.

## Residual Scope Risks

- Phase 0 found existing AI auto-send behavior. This blocks production/staging confidence until PR 2A is complete.
- Existing demo data may not match beauty-specific repeat-treatment cycles yet.
- Current LINE and LLM integrations are not real; they must be positioned as simulated until foundation PRs are complete.
- Workspace-level isolation still needs explicit confirmation for customer, messaging, audit, analytics, and public content modules.
- Sales demo should avoid presenting forum/community as the core product.

## Scope Change Rule

Any feature not listed in the 8 MVP use cases is not part of this MVP unless it is required to make those use cases safe, auditable, or demoable.

New feature requests must be captured as later-phase backlog, not inserted into the current MVP stabilization path.
