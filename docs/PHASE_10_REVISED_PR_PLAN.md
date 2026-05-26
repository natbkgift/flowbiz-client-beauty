# Phase 10 Revised PR Plan

วันที่จัดทำ: 2026-05-26
สถานะล่าสุด: แผนนี้ถูกใช้เป็นแนวทางสำหรับ branch `stabilization/pre-phase-10-thai-hardening` แล้ว เพื่อทำ Pre-Phase 10 stabilization เฉพาะจุด. Local regression gate ผ่านแล้ว แต่ยังไม่ merge, ยังไม่ deploy และ CI ต้องยืนยันซ้ำบน fresh database ก่อนเปิด merge gate.

## Pre-Phase 10 Implementation Snapshot

สิ่งที่เริ่มทำแล้วใน branch stabilization:

- Route guard hardening สำหรับ AI/HITL, Unified Chat, Loyalty, Campaign/Broadcast, Blog admin, Forum moderation/doctor answer และ Analytics
- Audit event เพิ่มสำหรับ AI/HITL, broadcast lifecycle, billing simulated sync/usage, blog/forum moderation, webhook accept/reject และ patient-message send
- Integration status matrix ถูกสะท้อนใน code path สำคัญ: messaging provider เป็น `simulated`, ad spend เป็น `mock_generated`, sandbox/test secret เป็น `sandbox_like`
- Medical safety classifier บังคับ HITL สำหรับข้อความเสี่ยงก่อน AI auto-reply และ campaign broadcast enqueue
- Thai API/user-facing UX และ XSS-safe rendering สำหรับ blog/forum rich content ด้วย DOMPurify + allowlist
- Web hardening เพิ่ม CSP nonce/security headers และ production bundle minify/no inline source map เป็นค่าเริ่มต้น
- Post-review fix เพิ่มเติม: route-dispatch helper return handled marker, dev-only CORS allowlist, dev API host ตาม request host, public empty states, production config fail-closed เมื่อ secret/database ยังเป็น local default และ deploy script รับ DB secrets จาก environment เท่านั้น
- Production webhook guard เพิ่ม HMAC/shared-secret fail-closed, raw-body verification, timestamp/replay check และ test ว่า arbitrary signature ถูกปฏิเสธใน production
- Public blog/forum API ตัด default `clinicId=1001`; frontend inject `PUBLIC_CLINIC_ID` สำหรับ public routes และ API return Thai error เมื่อไม่มี explicit clinic context
- `POST /ai-agent/inbound` ถูกปิดใน production runtime จนกว่าจะมี service-account ingress ที่ auditable
- Worker queue ไม่ถูก drain จาก request/event subscriber path แล้ว; tests ใช้ scoped worker filters เพื่อลด race และลด latency risk
- Public signup ถูกปิดเป็นค่าเริ่มต้นใน production และต้องเปิดด้วย `PUBLIC_SIGNUP_ENABLED=true` แบบ explicit เท่านั้น
- Thai slug/path params ถูก decode ใน route matcher; draft blog และ hidden/locked forum direct URL ถูกบล็อกสำหรับ public/viewer

ยังเป็น stop condition ก่อน merge/deploy:

- ต้อง self-review diff migration/permissions/audit coverage อีกครั้งก่อนเปิด PR
- ถ้าเปิด PR แล้ว CI ต้องยืนยัน `npm test`, `npm run validate`, `npm run build:web` ซ้ำบน fresh database
- ยังไม่เริ่ม Phase 10B Executive BI, 10C Outcome Tracking หรือ 10D Research Export

Validation ล่าสุดใน local stabilization gate:

- Docker PostgreSQL local พร้อมใช้งานและ apply migration 036 แล้ว
- `npm test` ผ่าน 136/136
- `npm run validate` ผ่าน
- `npm run build:web` ผ่าน
- `npm audit --audit-level=moderate` ผ่าน 0 vulnerabilities
- Browser smoke public landing/admin ผ่านทั้ง desktop/mobile; รอบ web-only smoke มีเฉพาะ API fallback warning เพราะไม่ได้เปิด API local เพื่อหลีกเลี่ยง data mutation ระหว่างตรวจ

## Phase Split

Phase 10 ต้องแยกเป็น 4 ช่วงเพื่อไม่ให้ Advanced BI หรือ Clinical Research วิ่งก่อน production foundation พร้อม

| Phase | Goal | Allowed scope | Not allowed |
|---|---|---|---|
| 10A Production Data Foundation | RBAC, audit, consent, retention, integration truth, medical safety gate | Schema non-destructive, route guards, tests, internal services, safety gating | New BI dashboard, research export, production deploy |
| 10B Executive BI Dashboard | Read-only executive BI from governed aggregate data | Aggregate analytics, franchise/org role guard, no raw PII | Patient-level drilldown, research export, mock ad spend shown as real |
| 10C Treatment Outcome Tracking | Track treatment outcomes safely | Consent-aware clinical outcome records, clinician/staff review, audit | AI diagnosis, autonomous clinical recommendation |
| 10D Anonymized Research Export | Governed anonymized export | Cohort export with approval, k-anonymity threshold, artifact expiry | Raw PII export, free-text chat export, bypassing consent/legal basis |

## Global Rules For All Phase 10 PRs

- Documentation and tests must distinguish mock/simulated integrations from real integrations.
- No production deploy in stabilization PRs unless explicitly approved later.
- No production data mutation.
- No bypass of HITL, approval gates, broadcast safety, consent checks, or medical safety constraints.
- Every state-changing route must have RBAC and audit tests.
- Every migration must be forward-only and non-destructive unless a separate backup/rollback plan is approved.

## 10A Production Data Foundation

### PR 10A.1 - Permission Taxonomy And Route Guard Hardening

Risk: Critical

Files likely touched:

- `database/migrations/036_phase10_permissions.sql`
- `apps/api/src/modules/rbac/service.js`
- `apps/api/src/modules/ai-agent/routes.js`
- `apps/api/src/modules/unified-chat/routes.js`
- `apps/api/src/modules/loyalty-mgm/routes.js`
- `apps/api/src/modules/blog/routes.js`
- `apps/api/src/modules/forum/routes.js`
- `apps/api/src/modules/analytics/routes.js`
- `tests/phase10_rbac_routes.test.js`

Required work:

- Add permissions: `broadcast.read/manage/approve`, `blog.manage`, `forum.moderate`, `forum.medical_answer`, `billing.read/manage`, `consent.manage`, `patient.export`, `clinical.outcome.write`, `research.export`, `ai.approve`.
- Replace `authenticateRequest(...)` on sensitive state-changing routes with permission guard.
- Replace forum owner/admin string checks with permission checks.
- Restrict executive analytics to Owner/Admin/FranchiseAdmin or explicit `analytics.executive`.

Tests required:

- Anonymous/viewer/operator/admin/owner matrix for every sensitive route group.
- Regression tests for public routes that must remain public: published blog read, forum read/post, invite accept, webhooks.

Stop conditions:

- Any state-changing route remains guarded only by `authenticateRequest(...)`.
- Viewer can modify AI rules, blog posts, loyalty purchase, forum verification, chat send, or HITL approval.

### PR 10A.2 - Audit Coverage Completion

Risk: Critical

Files likely touched:

- `apps/api/src/modules/audit/service.js`
- `apps/api/src/modules/ai-agent/conversation-service.js`
- `apps/api/src/modules/ai-actions/service.js`
- `apps/api/src/modules/campaigns/service.js`
- `apps/api/src/modules/messaging/service.js`
- `apps/api/src/modules/billing/service.js`
- `apps/api/src/modules/loyalty-mgm/service.js`
- `apps/api/src/modules/blog/service.js`
- `apps/api/src/modules/forum/service.js`
- `apps/api/src/modules/integration-gateway/*.js`
- `tests/phase10_audit_coverage.test.js`

Required work:

- Add actor type support: `user`, `system`, `worker`, `webhook`, `service_account`.
- Add redaction/hash helper for message bodies, raw webhook payloads, secrets and free text.
- Log AI Agent generation, HITL queue, approve/modify/reject, rules update, copilot suggestion.
- Log broadcast lifecycle and delivery status.
- Log billing usage calculation/sync attempts.
- Log forum/blog moderation and medical answer verification.
- Log high-risk patient data reads only when bulk, timeline, transcript, or export.

Tests required:

- Assert audit row for each state-changing route.
- Assert audit context does not include raw tokens, webhook secrets, full auth headers, or raw provider tokens.

Stop conditions:

- Audit log stores secrets or full unredacted sensitive free text unnecessarily.
- Any AI/broadcast/forum/billing/consent/patient write lacks audit.

### PR 10A.3 - Integration Status Matrix And Webhook Verification

Risk: Critical

Files likely touched:

- `database/migrations/037_phase10_integration_status.sql`
- `apps/api/src/config.js`
- `apps/api/src/modules/integration-gateway/routes.js`
- `apps/api/src/modules/integration-gateway/facebook-handler.js`
- `apps/api/src/modules/integration-gateway/tiktok-handler.js`
- `apps/api/src/modules/integration-gateway/wix-handler.js`
- `apps/api/src/modules/integration-gateway/zonepang-handler.js`
- `apps/api/src/modules/messaging/provider.js`
- `apps/api/src/modules/billing/service.js`
- `tests/phase10_integration_status.test.js`

Required work:

- Add integration status registry: `mock`, `sandbox`, `live`, `disabled`, with `verified_at`, `provider`, `capabilities_json`.
- Disable production sends for mock providers unless `ALLOW_MOCK_PROVIDER_IN_PROD=false` is explicitly enforced.
- Finalize provider-specific webhook signature contracts on top of the production fail-closed HMAC/shared-secret guard.
- Persist replay protection durably and add raw event storage for Wix/Zonepang or a generic `inbound_webhook_events` table.
- Make API/UI label Stripe/Omise/ad-spend/messaging as simulated until real adapters exist.

Tests required:

- Missing signature rejected.
- Literal random signature rejected.
- Stale timestamp rejected.
- Replay event rejected.
- Mock provider cannot be marked live without required config.

Stop conditions:

- Any production webhook accepts missing, random, stale or replayed signature input.
- Any mock integration is shown as live/fully active.

### PR 10A.4 - PDPA Consent And Retention Foundation

Risk: Critical

Files likely touched:

- `database/migrations/038_phase10_pdpa_consent_retention.sql`
- `apps/api/src/modules/consent/service.js`
- `apps/api/src/modules/consent/routes.js`
- `apps/api/src/modules/retention/service.js`
- `apps/api/src/server.js`
- `tests/phase10_pdpa_consent_retention.test.js`

Required work:

- Add consent, consent event, communication preferences, retention policy/job and data subject request tables.
- Add consent check service used by broadcast, AI auto-reply and research export later.
- Add dry-run-only retention jobs first.
- Add data subject request workflow without automatic deletion in first PR.

Tests required:

- Consent grant/withdraw history is immutable.
- Marketing broadcast consent check blocks missing/withdrawn consent.
- AI auto-reply consent check blocks missing/withdrawn consent.
- Retention dry-run reports candidates without deleting data.

Stop conditions:

- Any retention job deletes/anonymizes data in this PR.
- Broadcast/AI paths can ignore consent result.

### PR 10A.5 - Medical Safety Classifier Gate

Risk: Critical

Files likely touched:

- `database/migrations/039_phase10_medical_safety.sql`
- `apps/api/src/modules/medical-safety/classifier.js`
- `apps/api/src/modules/medical-safety/service.js`
- `apps/api/src/modules/ai-agent/conversation-service.js`
- `apps/api/src/modules/ai-agent/routes.js`
- `apps/api/src/modules/ai/service.js`
- `apps/api/src/modules/messaging/service.js`
- `apps/api/src/modules/campaigns/service.js`
- `tests/phase10_medical_safety_classifier.test.js`

Required work:

- Implement deterministic v1 classifier first, with versioned labels and risk tiers.
- Persist every classifier decision.
- Enforce classifier before AI auto-send, HITL release, AI-generated outbound, campaign broadcast and forum verified medical answers.
- Block auto-send for P0/P1/P2; route to HITL or doctor review.
- Add fallback behavior: classifier unavailable means auto-send disabled.

Tests required:

- Thai golden corpus for pregnancy, allergy, chronic disease, medication, complication, complaint/legal, pricing/admin safe cases.
- Prompt injection cannot downgrade safety tier.
- Staff override is reclassified before release.
- Broadcast with medical-risk copy cannot send without approval.

Stop conditions:

- Any AI-generated reply can be sent without classifier decision.
- Any P0/P1 message can be auto-sent.

### PR 10A.6 - Public Content Safety And Forum Moderation

Risk: High

Files likely touched:

- `apps/web/src/public-app.jsx`
- `apps/web/src/app.jsx`
- `apps/api/src/modules/blog/service.js`
- `apps/api/src/modules/forum/service.js`
- `apps/api/src/modules/forum/routes.js`
- `database/migrations/040_phase10_forum_moderation.sql`
- `tests/phase10_public_content_safety.test.js`

Required work:

- Sanitize blog HTML/markdown output or render structured markdown without raw HTML.
- Add moderation state for public forum posts/replies if needed: `pending`, `active`, `hidden`, `rejected`.
- Separate doctor/clinical verified identity from generic owner/admin.
- Add audit for verify/hide/lock/doctor reply.

Tests required:

- Stored XSS payload in blog/forum does not execute/render as HTML script.
- Public cannot create doctor reply by setting `isDoctorReply`.
- Hidden/locked content visibility rules hold.

Stop conditions:

- `dangerouslySetInnerHTML` receives unsanitized public content.
- Public user can influence doctor badge or verified answer.

### PR 10A.7 - Production Gate Verification Suite

Risk: High

Files likely touched:

- `tests/phase10_production_gate.test.js`
- `.github/workflows/ci.yml`
- `scripts/validate.js`
- `docs/PHASE_10_0_PRODUCTION_STABILIZATION_REVIEW.md`

Required work:

- Add test grouping for RBAC, audit, consent, classifier, integration mock/live truth.
- Add static guard test that finds sensitive route files using `authenticateRequest` without permission guard and fails unless whitelisted.
- Add production config check for default secrets and mock provider flags.

Tests required:

- Full `npm test` with no production credentials.
- CI must not deploy.

Stop conditions:

- Production gate suite cannot run locally/CI.
- Gate requires production data or live external provider.

## 10B Executive BI Dashboard

Risk: High until 10A passes, Medium after 10A

Files likely touched:

- `apps/api/src/modules/analytics/executive-service.js`
- `apps/api/src/modules/analytics/routes.js`
- `apps/web/src/app.jsx`
- `apps/web/src/styles.css`
- `tests/phase10b_executive_bi.test.js`

Required work:

- Use aggregate-only metrics.
- Show integration provenance: real vs mock ad spend, real vs simulated billing.
- Restrict to Owner/Admin/FranchiseAdmin.
- Add minimum aggregation threshold for any cohort breakdown.

Tests required:

- Viewer/operator cannot access executive summary.
- Cross-org access only for FranchiseAdmin.
- Response contains no phone/email/line id/raw message/free-text note.

Stop conditions:

- BI reads raw patient-level data into response.
- Mock ad spend is shown as real production ROAS.

## 10C Treatment Outcome Tracking

Risk: Critical

Files likely touched:

- `database/migrations/041_phase10c_treatment_outcomes.sql`
- `apps/api/src/modules/treatment-outcomes/service.js`
- `apps/api/src/modules/treatment-outcomes/routes.js`
- `apps/web/src/app.jsx`
- `tests/phase10c_treatment_outcomes.test.js`

Required work:

- Add treatment outcome records with consent, clinician/staff actor, status and audit.
- Store outcome as structured data where possible; avoid unbounded clinical free text in analytics.
- Add medical safety classifier for any AI summary or follow-up suggestion.
- No diagnosis or autonomous clinical recommendation.

Tests required:

- Only authorized clinical/admin roles can create/update outcome.
- Every outcome change audits old/new metadata.
- Missing consent blocks research/analytics reuse.

Stop conditions:

- Outcome tracking is used to recommend treatment automatically.
- Outcome data can be exported or used in research without 10D gate.

## 10D Anonymized Research Export

Risk: Critical

Files likely touched:

- `database/migrations/042_phase10d_research_export.sql`
- `apps/api/src/modules/research/service.js`
- `apps/api/src/modules/research/routes.js`
- `apps/api/src/modules/research/anonymizer.js`
- `tests/phase10d_research_export.test.js`

Required work:

- Export only anonymized, approved, consent/lawful-basis-checked cohorts.
- Enforce k-anonymity threshold and suppress small cells.
- Exclude direct identifiers: name, phone, email, line id, social IDs, raw chat messages, raw forum author names.
- Add approval workflow, artifact expiry and download audit.

Tests required:

- Export fails below k-anonymity threshold.
- Export schema contains no direct identifier columns.
- Free-text fields are excluded or redacted by approved policy.
- Download requires `research.export` and active approval.

Stop conditions:

- Any research export includes raw PII or raw clinical free text.
- Research export can be generated by a single actor without approval.
- Consent/lawful basis check can be bypassed.

## Recommended PR Order

1. 10A.1 Permission taxonomy and route guards.
2. 10A.2 Audit coverage.
3. 10A.3 Integration status and webhook verification.
4. 10A.4 PDPA consent and retention foundation.
5. 10A.5 Medical safety classifier.
6. 10A.6 Public content safety and forum moderation.
7. 10A.7 Production gate verification suite.
8. 10B Executive BI Dashboard.
9. 10C Treatment Outcome Tracking.
10. 10D Anonymized Research Export.

## Final Production Gate Checklist

Phase 10B cannot start until all 10A items are true:

- Sensitive routes have explicit permission guards.
- Audit logs exist for AI, HITL, broadcast, forum, billing, consent and patient data actions.
- Mock integrations are clearly marked and cannot be treated as live in production.
- Webhook signatures reject missing/random/stale/replayed requests.
- Broadcast requires consent, opt-out filtering, approval and audit.
- AI auto-reply requires consent, classifier and HITL/doctor review where needed.
- Public content rendering is sanitized.
- Research export code does not exist yet or is disabled until 10D.
