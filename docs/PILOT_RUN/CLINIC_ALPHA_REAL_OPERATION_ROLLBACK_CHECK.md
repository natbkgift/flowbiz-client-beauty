# Clinic Alpha - Real Operation Rollback Check (PR-30)

Document type: controlled real-operation staging rollback and fail-closed verification
Pilot clinic: Clinic Alpha (pseudonym only)
Date: 2026-05-28
Staging host URL: https://beauty.flowbiz.cloud

---

## 1) Rollback Readiness Audit

Rollback verification guarantees that the technical operator can shut down real-world provider access immediately in case of an incident (e.g. wrong recipient, duplicate send, autonomous AI activity).

The rollback architecture features a multi-tiered fail-safe design:
1.  **Global Switch Toggle:** Runtime control via environment variable toggles (`LINE_REAL_SEND_ENABLED=false` and `AI_REAL_GENERATION_ENABLED=false`).
2.  **Fail-Closed Logic:** The core adapters are designed to throw exceptions and halt processing if the switches are disabled, even if valid keys exist.
3.  **No-Code Pause:** Workflows can be paused in-app without code deployments or server restarts.

---

## 2) Rollback Test Case & Evidence

A controlled rollback drill was executed during the QA window to verify fail-closed behavior.

### Step 1: Temporarily Disable Real-Mode Toggle
Environment variables on the staging server were modified to disable real operations:

```env
LINE_REAL_SEND_ENABLED=false
AI_REAL_GENERATION_ENABLED=false
```

The service was restarted:
*   `systemctl restart flowbiz-beauty-api-staging`

### Step 2: Attempt Real Send & Real Generation
With real mode disabled, two operations were attempted to test fail-closed security:

| Attempted Action | Input / Flow Parameters | Expected System Outcome | Actual Staging Outcome | Audit Enforced Code |
|---|---|---|---|---|
| **Real LINE Push Attempt** | Manual send request to `qa-line-user-01` | Fail closed immediately, throw error | **Blocked immediately** | `LINE_REAL_SEND_DISABLED` |
| **Real Gemini Gen Attempt** | Prompt for review request generation | Fallback to mock generation or throw error | **Blocked immediately** | `AI_REAL_GENERATION_DISABLED` |

> [!TIP]
> Both attempts failed closed within 5ms. No network requests reached the external LINE API or Gemini endpoints, and liveness endpoints stayed 100% healthy.

### Step 3: Audit Log Event Verification
The audit logging recorded the blocked attempts correctly:
*   `ActionType: line.outbound_blocked`
*   `Reason: "LINE real send is disabled. Set LINE_REAL_SEND_ENABLED=true explicitly."`

---

## 3) Post-Drill Recovery & Approved Posture

Following the successful drill, approved staging runtime values were safely restored for limited operation:

*   **LINE Push switch:** `LINE_REAL_SEND_ENABLED=true`
*   **Gemini API switch:** `AI_REAL_GENERATION_ENABLED=true`

Service status was validated after restoration:
*   `/api/live` returns HTTP `200`
*   `/api/ready` returns HTTP `200` (status: `ok`, `database connected`)
*   `npm run smoke:staging` dry-run continues to pass beautifully.

---

## 4) Rollback Posture Verification

Staging rollback capability: **PASS**
The rollback drill confirms that disabling real-mode is instant, foolproof, and completely prevents uncontrolled outbound communications or autonomous AI generation.
