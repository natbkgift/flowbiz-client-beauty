# Phase 0 Project Audit Report - FlowBiz Beauty

Audit date: 2026-05-26  
Scope: read-only repository audit plus this report file only. No runtime code was changed.

## Current architecture

FlowBiz Beauty is currently a Node.js modular monolith with a PostgreSQL database and a React/esbuild frontend.

- Backend: `apps/api/src/server.js` uses Node `http` directly, not Express. Routes are manually matched and delegated to module route handlers.
- Config: `apps/api/src/config.js` loads `.env`, defaults to local development, and fails closed in `APP_ENV=production` for local auth secrets and local database URLs.
- Database: `apps/api/src/db.js` uses `pg.Pool` with a single configured `DATABASE_URL`.
- Frontend: `apps/web/src/server.js` builds and serves admin/public bundles, injects runtime config, and applies CSP/security headers for HTML.
- Admin SPA: `apps/web/src/app.jsx` is a large single-file admin app with auth/session, API client, hash routing, pages, and UI components in one file.
- Public SPA: `apps/web/src/public-app.jsx` serves landing, blog, and forum pages with API fallback to local mock content.
- Persistence: SQL migrations in `database/migrations`; seed data in `database/seeds`.
- Infra: local Docker Compose for PostgreSQL, plus nginx/systemd/deploy/rollback scripts for a Linux host.
- Test runner: Node built-in test runner via `npm test`; validation script does path checks, JS syntax checks, and web bundle build.

## Existing modules

Backend module inventory under `apps/api/src/modules`:

- `auth`: login, signup forwarding to onboarding, bearer token auth, session revocation.
- `tenancy`, `rbac`, `memberships`, `settings`: clinic/org/workspace context, permission checks, invites, roles, tenant settings.
- `leads`: tenant/workspace-aware CRM lead CRUD, pipeline, tags, notes, activity.
- `messaging`: channels, contact identities, templates, outbound message log, simulated provider.
- `automation`, `automation-builder`, `worker-engine`, `event-bus`: flows, versions, execution, delayed jobs, retries, domain events.
- `customers`: customer conversion, notes, profile, timeline, customer messaging.
- `ai`, `ai-engine`, `ai-feedback`, `ai-actions`: deterministic scoring, recommendations, message generation, outcomes, and auto actions.
- `ai-agent`: AI chat threads, deterministic agent replies, HITL queue, medical keyword classifier, agent rules.
- `analytics`, `audit`, `ops`: dashboards, audit log querying, worker/job health and retry.
- `integration-gateway`: Wix, Zonepang, TikTok, and Facebook webhook ingestion with shared-secret/HMAC verification.
- `campaigns`, `loyalty-mgm`, `billing`: broadcast campaign queueing, loyalty/referral/ROAS mock sync, metered usage.
- `blog`, `forum`, `public-content`: public content and admin moderation routes.

## Existing migrations

Current migrations are ordered `001` through `036`, with no `008` file. The missing `008` number is not automatically dangerous because the migration runner sorts existing `.sql` files, but the gap should be confirmed as intentional.

Notable schema areas:

- `001_init.sql`: `schema_migrations`, `app_runtime`.
- `002_multi_tenant_base.sql`: `clinics`, `users`, `clinic_users`.
- `003_auth_sessions.sql`: auth sessions.
- `004_lead_crm_core.sql`: leads, lead interests, notes, tags, entity tags.
- `005_messaging_foundation.sql`: channels, contact identities, message templates, outbound messages.
- `006_automation_engine_v1.sql` and `007_pre_sprint5_stability.sql`: automation flows, steps, executions, tasks, reminders, logs, retry metadata.
- `009_customer_domain.sql`: customers, profiles, events, notes.
- `010_ai_insights.sql`, `015_ai_decision_engine.sql`, `023_ai_agent_layer.sql`, `024_ai_feedback_loop.sql`, `034_phase8_ai_agent_platform.sql`: AI scores, recommendations, feature vectors, predictions, insights, outcomes, action executions, chat threads, HITL queue, agent rules.
- `011_analytics_audit.sql`: analytics tables and `audit_logs`.
- `012_automation_builder.sql`, `021_automation_event_driven_lifecycle_engine.sql`, `022_visual_automation_flow_builder.sql`: automation versions, workspace/event lifecycle, visual builder metadata.
- `013_worker_engine.sql`, `014_event_bus.sql`: worker jobs and event store.
- `016_saas_foundation_rbac.sql`, `017_clinic_user_role_alignment.sql`, `018_workspace_memberships_invites.sql`, `019_settings_api_foundation.sql`, `036_pre_phase10_stabilization_permissions.sql`: organizations, workspaces, roles, permissions, role permissions, memberships, invites, settings permissions.
- `020_crm_lead_pipeline_engine.sql`: workspace-aware lead pipeline additions.
- `026_phase2_marketing_gateway.sql`, `030_phase4_direct_broadcast_custom_text.sql`, `031_phase5_social_inbound_schema.sql`, `033_phase6_leads_google_source.sql`: campaign broadcast, social inbound, extra lead/channel sources.
- `029_phase4_billing_ai_threads.sql`: billing plans/subscriptions/usage and AI chat threads/messages.
- `032_phase6_loyalty_referrals_roas.sql`: loyalty, referrals, ad spend.
- `035_phase9_blog_forum.sql`: blog and forum tables.

Seed inventory:

- `001_runtime_seed.sql`
- `002_multi_tenant_seed.sql`
- `003_lead_crm_seed.sql`
- `004_messaging_foundation_seed.sql`
- `005_automation_engine_seed.sql`
- `008_lifecycle_flow_pack.sql`
- `009_customer_seed.sql`
- `010_ai_seed.sql`
- `011_analytics_seed.sql`

## Current frontend pages

Admin app in `apps/web/src/app.jsx` currently includes:

- Dashboard
- Unified inbox
- ROAS and loyalty analytics
- AI Agent console and HITL queue
- Blog manager
- Forum moderator
- Users
- Workspaces
- Settings
- Automation list
- Automation builder route
- Automation execution debugger route
- Audit logs
- System health
- Login and session bootstrap

Public app in `apps/web/src/public-app.jsx` currently includes:

- Landing page
- Blog list and detail
- Forum list and topic detail/reply posting
- Local mock fallback data for blog/forum when API calls fail

Frontend observations:

- `apps/web/src/app.jsx` is about 3,860 lines and mixes API client, auth/session providers, route parsing, pages, shared UI, business forms, and admin components.
- `apps/web/src/public-app.jsx` is about 958 lines and mixes public API helpers, mock data, routing, pages, sanitization, and forms.
- Rich HTML rendering uses `DOMPurify` in both admin and public apps before `dangerouslySetInnerHTML`.
- The web server applies CSP with a nonce for HTML pages, plus `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy`.

## Current test coverage

Available scripts from `package.json`:

- `npm run dev:api`
- `npm run dev:web`
- `npm run build:web`
- `npm run migrate`
- `npm run seed`
- `npm run validate`
- `npm test`

There is no dedicated `lint` script.

Test files exist in `apps/api/tests` and `tests`. Coverage includes:

- Unit validation for auth, config, automation, leads, messaging.
- Multi-tenant/RBAC tests for SaaS foundation, memberships, settings, leads, automation, AI.
- Integration tests for automation engine/lifecycle/builder, worker engine, event bus, customer domain, analytics/audit, campaign broadcast, social inbound, AI agent, AI engine, AI feedback, public SEO/blog/forum.
- Production-hardening style tests for rate limiting, DLQ, executive analytics.
- Pre-phase safety tests for medical classifier, webhook verifier, public tenant context, production config, Thai error messages.

Important test concern:

- Existing tests explicitly assert the current AI auto-send behavior, for example `tests/advanced_saas_ai.test.js:154` expects a high-confidence AI message status of `sent`. These tests conflict with the new rule that every AI suggestion must enter HITL before send.

CI status:

- `.github/workflows/ci.yml` exists.
- CI uses Node 20 while the README says Node 22+.
- CI runs `npm run validate`, migrations, and only selected tests: `phase5_social_inbound`, `phase6_loyalty_roas`, `phase9_seo_web`.
- Full `npm test` is not currently represented in CI.

## Simulated vs real integrations

Confirmed simulated/mock/local behavior:

- Messaging provider in `apps/api/src/modules/messaging/provider.js` always returns `integrationStatus: 'simulated'` and `status: 'sent'`.
- LINE is represented as a `channel_type` and seed data, but there is no real LINE Messaging API adapter, no LINE env config, and no LINE HMAC validation module.
- AI generation/scoring is deterministic local heuristic code. There is no OpenAI or Gemini provider adapter and no real-provider env gate.
- Ad spend sync in `loyalty-mgm` is mock-generated and audited as simulated.
- Facebook comment auto-reply response is explicitly simulated and returns `autoReplySent: false`.
- Public app has local mock fallback for blog/forum content.

Partially production-oriented integrations:

- Webhook verification exists for Wix, Zonepang, TikTok, and Facebook via `integration-gateway/security.js`.
- Production webhook behavior fails closed unless a valid shared secret or HMAC config is present.
- Replay protection exists but is in-memory only, so it does not survive process restart or multi-instance deployment.
- Raw inbound webhooks are buffered in `inbound_leads_raw` for social sources.

Not real/production-ready yet:

- LINE outbound/inbound real mode.
- LLM provider real mode.
- Payment/subscription real sync.
- Durable webhook replay storage.
- Provider-specific signature runbooks.
- Explicit env flags for simulated vs real send/generation.

## Security gaps

Critical stop conditions found:

1. AI can mark replies as sent without universal HITL approval.
   - `apps/api/src/modules/ai-agent/conversation-service.js:244` initializes `messageStatus = 'sent'`.
   - `apps/api/src/modules/ai-agent/conversation-service.js:284` records `ai.auto_reply_sent`.
   - `apps/api/src/modules/ai-agent/conversation-service.js:298` records metered usage for auto-sent AI.
   - This violates the current rule that every AI suggestion must enter HITL before send.

2. AI auto-action can generate and send a follow-up outbound message without HITL approval.
   - `apps/api/src/modules/ai-actions/service.js:311` sends generated follow-up text through `sendLeadOutboundMessage`.
   - This path uses generated AI text and outbound messaging without an approval state or approver.

High risks:

- HITL schema/state is incomplete for the requested contract.
  - `ai_chat_messages.status` only supports practical use of `pending_approval`, `approved`, `rejected`, `sent`.
  - `ai_hitl_approval_queue.status` supports `pending`, `approved`, `rejected`, `modified`, but `approveOrOverrideMessage` does not set `reviewed_by` in the queue update.
  - There is no explicit `draft`, `failed`, or separate outbound queue state.
- Medical safety classifier is deterministic keyword matching only.
  - It is applied in AI inbound/copilot and campaign custom broadcast text, but not universally before AI-generated outbound sends, manual sends of AI-originated drafts, automation sends, or unified chat sends.
  - Safety decisions are not persisted as first-class records.
- Tenant isolation is mixed between clinic and workspace scopes.
  - Leads and many automation paths are workspace-aware.
  - Customers, channels/templates/outbound listing, audit listing, and several analytics/customer timelines are primarily clinic-scoped.
  - The requested rule requires `clinic_id/workspace context` isolation for every tenant data path, so clinic-only service paths need explicit review.
- Route guard coverage is good in many newer route modules, but public content and invite acceptance routes intentionally allow unauthenticated access. These need documented threat models and rate limiting before staging.
- Webhook verification is present for social/marketing webhooks, but LINE webhook verification is absent because LINE integration does not exist yet.
- API JSON responses include `X-Content-Type-Options`, `X-Frame-Options`, and `Referrer-Policy`, but API-level HSTS/CSP is left to nginx/web layer.
- `infra/systemd/*.service` runs both services as `User=root`, which is not staging/production safe.
- `health` returns HTTP 200 with `status: 'ok'` even when database status is `unavailable`; this can hide a broken DB from load balancer checks.
- `unified_chat_channels.auth_token` schema stores auth tokens as plain text if used.
- Blog/forum public posting accepts medical-looking content from anonymous users; moderation exists, but public medical safety workflow is not yet a hard gate.

Secret scan notes:

- `.env` is ignored by `.gitignore`.
- `.env.example` contains only local-development placeholders.
- `rg` found no obvious real OpenAI/Gemini/LINE API keys. It did find local placeholder secrets and bundled frontend output text.

## Production readiness gaps

- Critical AI/HITL stop conditions block staging readiness until fixed.
- No real LINE integration foundation or env-gated real send mode.
- No real LLM provider adapter or env-gated real generation mode.
- No universal AI suggestion lifecycle contract.
- No central outbound approval gate that distinguishes manual staff text from AI-generated text.
- No consent/PDPA foundation found for marketing consent, AI processing consent, data retention, or data subject requests.
- No staging-specific Docker Compose file or staging runbook.
- No smoke-test script.
- CI does not run the full test suite.
- No lint script.
- README is stale in several places; it says AI integrations are not included, while the code now includes multiple AI modules.
- Deploy script performs `git reset --hard` on the target server and deploys production-oriented services; it should not be used during this stabilization work without explicit instruction.
- Rollback script is interactive and optionally deletes release folders; production rollback should be non-interactive and safer.
- Database migrations include multiple constraint drops/recreates and broad schema evolution; no migration dry-run/check workflow exists.
- Observability/logging is basic stdout/stderr and nginx logs; no structured logger or correlation IDs were found.

## Recommended PR breakdown

Recommended order, with current stop condition accounted for:

1. PR 1 - Phase 0-1 audit and MVP scope lock
   - Add this audit report.
   - Add `docs/MVP_SCOPE_LOCK.md`.
   - No runtime code changes.

2. PR 2A - Critical AI/HITL stop-condition fix
   - Force AI agent inbound replies and AI-generated follow-up actions into `pending_approval`.
   - Remove or disable `ai.auto_reply_sent` behavior.
   - Update tests that currently expect AI auto-send.
   - Add tests proving AI cannot send or enqueue outbound without approval.

3. PR 2B - Production stabilization
   - RBAC route guard review.
   - Audit coverage for critical writes and approvals.
   - Medical classifier hard gate and persistence plan.
   - Health endpoint, headers, tenant/workspace scope review.
   - Webhook verifier documentation and missing provider gaps.

4. PR 3 - Frontend decomposition first slice
   - Add `docs/FRONTEND_DECOMPOSITION_PLAN.md`.
   - Extract only stable shared UI primitives first.
   - No routing rewrite.

5. PR 4 - LINE integration foundation
   - Add simulated/real/dry-run LINE module with fail-closed real mode.
   - Add signature validation and audit outbound attempts.
   - Default to simulated and no real send.

6. PR 5 - LLM provider foundation
   - Add `mock|gemini|openai` provider adapter.
   - Real generation gated by explicit env.
   - Prompt registry, PII-safe audit metadata, medical pre/post checks, HITL queue.

7. PR 6 - HITL approval hardening
   - Implement the full lifecycle contract: `draft`, `pending_approval`, `approved`, `rejected`, `modified`, `sent`, `failed`.
   - Store approver, before/after text, risk label, timestamps, clinic/workspace.

8. PR 7 - Demo clinic seed and demo script
   - Add demo tenant, leads/customers/treatments, flows, templates, HITL items, audit events.

9. PR 8 - Staging deployment readiness
   - Add staging compose/runbook/rollback/smoke test/env coverage.

10. PR 9 - CI/CD hardening
    - Run full local-equivalent validation, migration check, full tests or an explicit gated matrix.

11. PR 10 - Sales package and pilot plan
    - Add sales/pilot docs after the product safety story is coherent.

## High/Critical risks

Critical:

- AI agent reply path can mark messages `sent` without HITL approval.
- AI auto-action can generate and send follow-up outbound messages without HITL approval.

High:

- HITL queue does not yet preserve full before/after/approver/risk metadata.
- Medical safety is not a universal gate.
- Real-vs-simulated integration boundary is not explicit enough for LINE/LLM/outbound messaging.
- Workspace isolation is inconsistent across modules.
- Health endpoint can report HTTP 200 even with DB unavailable.
- Services run as root in systemd samples.
- Full test suite is not enforced by CI.

## Stop conditions

Do not proceed to Phase 1+ implementation or integration work until the following are acknowledged and assigned:

- Block AI auto-send paths in `ai-agent` and `ai-actions`.
- Update tests that currently assert AI auto-send.
- Define the HITL lifecycle contract as the source of truth for AI-generated outbound text.
- Confirm whether workspace isolation is mandatory for customers, messaging, audit, analytics, and public content, or whether clinic-level isolation is acceptable for selected modules.
- Confirm no real external send should be enabled until env-gated LINE/LLM adapters exist.

## Validation performed

Read-only inspection commands used:

- `git status --short --branch`
- `rg --files`
- `Get-Content -Raw package.json`
- `Get-Content -Raw apps/api/src/server.js`
- `Get-Content -Raw apps/api/src/config.js`
- `Get-Content -Raw apps/api/src/db.js`
- `Get-ChildItem apps/api/src/modules -Directory`
- `Get-Content -Raw apps/web/src/app.jsx`
- `Get-Content -Raw apps/web/src/public-app.jsx`
- `Get-ChildItem database/migrations`
- `Get-ChildItem database/seeds`
- `Get-ChildItem tests,apps/api/tests -Filter *.test.js`
- `rg` searches for RBAC, audit, HITL, webhook verification, medical safety, outbound sends, secrets, and frontend XSS rendering.

Commands intentionally not run:

- `npm run validate`, `npm run build:web`, and `npm test` were not run in Phase 0 because this phase was requested as read-only and the repo already had dirty generated bundles in `apps/web/dist/assets/*`. Running validation/build would rewrite generated assets and make it harder to preserve the audit boundary.

Git state at start of audit:

```text
## main
 M apps/web/dist/assets/admin.bundle.js
 M apps/web/dist/assets/public.bundle.js
```

Expected Git state after this report:

- Existing dirty files remain untouched: `apps/web/dist/assets/admin.bundle.js`, `apps/web/dist/assets/public.bundle.js`.
- New untracked report file: `docs/PHASE0_PROJECT_AUDIT_REPORT.md`.
- No runtime source, migration, seed, infra, script, or test file should be changed by Phase 0.
