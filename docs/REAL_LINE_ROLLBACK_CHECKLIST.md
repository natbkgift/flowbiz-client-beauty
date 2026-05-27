# Real LINE Rollback Checklist - FlowBiz Beauty

Date: 2026-05-27
Scope: Post-Phase 10 PR 7A - rollback plan only

## Purpose

Use this checklist to return staging to safe LINE simulated mode after a real LINE QA window or after any LINE-related stop condition.

This checklist is not a destructive rollback and does not change production.

## Immediate Disable Target

Set staging LINE runtime back to:

```text
LINE_INTEGRATION_MODE=simulated
LINE_REAL_SEND_ENABLED=false
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=
```

AI settings should remain:

```text
AI_PROVIDER=mock
AI_REAL_GENERATION_ENABLED=false
```

## Rollback Steps

1. Announce rollback start to QA owner and pilot operator.
2. Stop initiating outbound LINE tests.
3. Edit only the staging env file outside the repo.
4. Set LINE integration mode to simulated.
5. Set real-send switch to false.
6. Clear LINE token and secret if the QA window is closed.
7. Restart only the staging API service during the approved window.
8. Verify `/api/ready`.
9. Run staging smoke.
10. Attempt a controlled fail-closed check.
11. Confirm no pending provider job can send.
12. Record rollback evidence.

## Verification Commands

Use sanitized output only:

```text
systemctl restart flowbiz-beauty-api-staging.service
curl -i https://beauty.flowbiz.cloud/api/ready
npm run smoke:staging
```

Do not print token or secret.

## Evidence To Record

| Evidence | Required |
| --- | --- |
| Rollback owner | yes |
| Rollback start/end time | yes |
| Sanitized env after rollback | yes |
| `/api/ready` result | yes |
| Smoke result | yes |
| Audit event IDs for blocked attempts | yes |
| Confirmation that no real send is possible | yes |
| Any provider error or incident note | if applicable |

## Stop Conditions During Rollback

Escalate immediately if:

- Staging API cannot restart.
- `/api/ready` fails after restart.
- Sanitized env still indicates real provider mode.
- A provider send can still be triggered.
- Audit evidence is missing.
- Token or secret was printed in logs.
- Any real customer received a test message.

## Rollback Pass Criteria

Rollback passes when:

- LINE mode is simulated.
- Real-send switch is false.
- Provider token and secret are cleared if the test window is closed.
- `/api/ready` returns 200.
- `npm run smoke:staging` passes.
- A real-mode send attempt is blocked unless the future QA window explicitly reopens.
- Evidence is recorded without secrets.

## Post-Rollback Review

After rollback:

- Review test case results.
- Review audit logs.
- Confirm whether any follow-up bug or doc task is needed.
- Decide whether another QA window is required.
- Keep real provider mode closed until next approved window.
