# Real Gemini Rollback Checklist - FlowBiz Beauty

Date: 2026-05-27
Scope: Post-Phase 10 PR 7B - plan only, no real generation

## Purpose

Use this checklist to return staging from a controlled Gemini QA window back to the safe default AI configuration.

Rollback must not delete data automatically, touch production, expose secrets, or bypass HITL.

## Rollback Triggers

Start rollback immediately if any of these occur:

- Generated suggestion bypasses HITL.
- AI output attempts outbound delivery without staff approval.
- Medical-risk content is not routed to review.
- Prohibited claim output is accepted unsafely.
- Gemini key appears in logs, screenshots, shell history, or audit metadata.
- Raw customer PII appears in audit metadata or shared evidence.
- Provider timeout/error causes unstable API behavior.
- Staging readiness becomes unhealthy.
- Any production database, production secret, or real customer data is involved.

## Safe Target Env

The final staging env must return to:

```text
AI_PROVIDER=mock
AI_REAL_GENERATION_ENABLED=false
GEMINI_API_KEY=
LINE_INTEGRATION_MODE=simulated
LINE_REAL_SEND_ENABLED=false
```

If the QA window is closed, clear the Gemini key from staging env or approved secret storage.

## Rollback Steps

1. Pause Gemini QA.
   - Stop creating new provider-generation requests.
   - Record the time and QA owner.

2. Edit the staging env file outside the repo.
   - Set provider back to mock.
   - Disable real generation.
   - Clear the Gemini key if the QA window is closed.
   - Keep LINE simulated and real LINE send disabled.

3. Restart staging API service.

```text
sudo systemctl restart flowbiz-beauty-api-staging
sudo systemctl status flowbiz-beauty-api-staging --no-pager
```

4. Verify readiness.

```text
curl -i https://beauty.flowbiz.cloud/api/ready
```

Expected:

- HTTP 200.
- `APP_ENV` reports staging.
- Database reports connected.

5. Verify provider behavior.

Run a fake suggestion request through the approved QA harness or admin flow.

Expected:

- Provider reports mock.
- Suggestion enters HITL.
- No outbound send occurs.
- Audit records mock provider metadata.

6. Run staging smoke.

```text
npm run smoke:staging
```

Expected:

- Smoke passes.
- External-send flags remain disabled.

7. Record rollback evidence.

Capture only sanitized evidence:

- Rollback start/end time.
- Env summary without secrets.
- `/api/ready` result.
- Smoke result.
- Provider behavior result.
- Audit event IDs.
- Any issue IDs or incident notes.

## Post-Rollback Checks

Confirm:

- No Gemini key remains in repo files.
- No Gemini key appears in logs or docs.
- No real customer data was used.
- No generated message sent outbound without staff approval.
- HITL queue remains intact.
- Audit trail remains available.
- Staging smoke passes after rollback.

## Stop Conditions During Rollback

Stop and escalate if:

- API does not restart.
- `/api/ready` is non-200 after restart.
- Provider remains Gemini when mock is expected.
- Real generation remains enabled.
- A key or raw PII is exposed.
- Smoke fails after rollback.
- Restoring safe behavior would require destructive database action.

## Rollback Evidence Template

```text
Rollback date:
QA owner:
Trigger:
Staging URL:
Provider after rollback:
Real generation disabled:
Gemini key cleared:
/api/ready:
Smoke result:
Mock suggestion verified:
HITL preserved:
Secrets exposed:
Customer data used:
Issues:
Final decision:
```
