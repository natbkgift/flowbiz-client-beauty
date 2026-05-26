# Production Stabilization Report - Phase 2

Report date: 2026-05-26  
Scope: minimal safe hardening patch for Phase 2, focused on critical AI/HITL stop conditions found in Phase 0. This phase did not add real external integrations or deploy anything.

## Checks Performed

- RBAC route guard coverage across admin/API modules.
- Audit event coverage for AI reply generation, HITL approval, and AI auto actions.
- Medical safety classifier usage around AI-generated message paths.
- XSS-safe rendering in admin/public frontend rich HTML views.
- Production config fail-closed behavior.
- Webhook shared-secret/HMAC verification.
- CSP and security header coverage.
- Tenant/workspace isolation around the changed AI action path.
- Error handling and logging posture.

## Changes Made

- Forced every AI agent reply from `handleInboundMessage()` into `pending_approval`.
- Removed the prior high-confidence auto-send path for AI agent replies.
- Added `createPendingAiApprovalMessage()` as a shared helper for AI-generated outbound suggestions.
- Changed AI auto-action follow-up from direct outbound send to HITL queue creation.
- Added audit metadata showing HITL is required and auto-send was blocked.
- Updated HITL approval queue updates to mark only the matching AI response instead of every pending queue item for the same lead.
- Stored `reviewed_by` on HITL queue review updates when an actor is available.
- Updated tests that previously expected high-confidence AI auto-send.
- Added regression coverage proving AI follow-up auto action creates no `outbound_messages` record before approval.

## Protected Routes Confirmed

The following route families use `authenticateAndAuthorize` or equivalent permission checks for privileged paths:

- `audit`: `audit.read`
- `analytics`: `analytics.read`
- `ai`: `ai.read`, `ai.manage`
- `ai-agent`: `ai.read`, `ai.manage`
- `automation-builder`: `automation.read`, `automation.manage`
- `campaigns`: `broadcast.manage`
- `customers`: `contact.read`, `contact.write`, `message.write`
- `leads`: `lead.read`, `lead.write`
- `loyalty-mgm`: `loyalty.read`, `loyalty.manage`
- `memberships`: `user.read`, `user.manage`, `role.manage`
- `ops`: automation/system management permissions
- `settings`: tenant/organization/workspace read/manage permissions
- `unified-chat`: `message.read`, `message.write`
- Blog/forum admin and moderation paths use manage/moderation permissions.

## Routes Still Risky Or Intentionally Public

- Public blog and forum read routes are intentionally unauthenticated and need rate limiting/threat-model documentation before staging.
- Public forum posting/reply paths are intentionally unauthenticated or partially authenticated and still need a stronger moderation/medical-safety gate.
- Auth, signup/onboarding, and invite acceptance are intentionally public entry points and should be rate-limited before staging.
- Webhook ingestion is public by design and relies on signature/shared-secret verification; LINE webhook verification is still absent because LINE integration does not exist yet.
- Health check behavior still needs review because Phase 0 found it may return HTTP 200 even when DB status is unavailable.

## Audit Events Added Or Confirmed

Added/confirmed in this patch:

- `ai.auto_reply_requires_hitl`
- `ai.auto_action_requires_hitl`
- `ai.auto_action_queued_for_approval`
- `ai.hitl_approved`
- `ai.hitl_modified`

Important behavior change:

- `ai.auto_reply_sent` is no longer emitted by `handleInboundMessage()`.
- AI-generated follow-up text from `send_followup_message` is recorded as pending approval, not as an outbound send.

## Security Headers Confirmed

- API JSON helper sets:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
- Web server sets:
  - nonce-based `Content-Security-Policy` for HTML
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: SAMEORIGIN`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- Nginx sample additionally includes HSTS.

## Stabilization Notes

- XSS: Admin/public rich HTML rendering continues to sanitize through `DOMPurify` before `dangerouslySetInnerHTML`.
- Production config: existing production fail-closed tests pass for local default secrets and local DB URLs.
- Webhooks: existing HMAC/shared-secret tests pass, including invalid signature and replay protection checks.
- Tenant isolation: the patched AI auto-action path remains workspace-scoped through `loadLeadForActions()` and creates approval messages against the same clinic/lead context.
- Logging: critical AI decision points are auditable, but structured application logging/correlation IDs remain future work.

## Validation Commands

Executed successfully:

```text
node -r ./teardown-hook.js --test --test-force-exit --test-concurrency=1 tests/phase8_ai_agent_orchestrator.test.js tests/advanced_saas_ai.test.js tests/ai_feedback_loop.test.js tests/pre_phase10_safety_unit.test.js
```

Result: 26 tests passed, 0 failed.

```text
npm run validate
```

Result: `Validation baseline passed.`

```text
npm test
```

Result: 139 tests passed, 0 failed.

```text
npm run build:web
```

Result: admin and public bundles built successfully.

No lint command was run because `package.json` does not define a `lint` script.

## Residual Risks

- HITL lifecycle is still incomplete for the full requested contract: `draft`, `pending_approval`, `approved`, `rejected`, `modified`, `sent`, `failed`.
- The database schema does not yet preserve full before/after approval metadata in first-class columns.
- There is still no central outbound send gate proving every AI-originated message is approved before provider send across future integrations.
- Manual staff sends and non-AI automation sends were not changed in this phase.
- Medical safety remains keyword-based and is not persisted as a dedicated risk decision record.
- LINE real integration, LINE webhook verification, and env-gated real send mode are not implemented yet.
- LLM real provider integration and env-gated real generation mode are not implemented yet.
- Some modules remain clinic-scoped rather than workspace-scoped and need explicit tenant-isolation policy decisions.
- Health endpoint DB-unavailable behavior remains a staging readiness gap.
- Systemd samples still run services as root.
- Webhook replay protection is in-memory only.

## Phase 2 Decision

Go for MVP demo continuation with the critical AI auto-send paths blocked.

No-go for production. Staging readiness still needs the residual risks above to be addressed or accepted explicitly.

## Recommended Next PRs

- PR 2B: complete remaining production hardening items that were not part of this minimal safety patch.
- PR 3: frontend decomposition first slice, if the team accepts the Phase 2 residual risks for demo-only work.
- PR 4 and PR 5 must keep real LINE/LLM modes fail-closed and preserve HITL as a hard requirement.
