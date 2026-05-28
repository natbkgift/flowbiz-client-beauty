# Clinic Alpha - Live Website Operation Report (PR-31)

Document type: live staging product website operation report
Pilot clinic: Clinic Alpha (pseudonym only)
Session timestamp: 2026-05-28T17:25:00+07:00
Target environment: https://beauty.flowbiz.cloud/admin
Database: `flowbiz_beauty_staging` (connected)

---

## 1) Required Precheck Evidence

Before starting the browser session, staging liveness and readiness endpoints were queried and verified:

*   **Liveness Check:** `https://beauty.flowbiz.cloud/api/live` returned HTTP `200 OK`
    ```json
    {
      "status": "ok",
      "check": "liveness",
      "appEnv": "staging"
    }
    ```
*   **Readiness Check:** `https://beauty.flowbiz.cloud/api/ready` returned HTTP `200 OK`
    ```json
    {
      "status": "ok",
      "check": "readiness",
      "appEnv": "staging",
      "database": {
        "status": "connected",
        "name": "flowbiz_beauty_staging"
      }
    }
    ```
*   **Workspace Validation:** `git status` returned clean, `npm run validate` passed baseline.

---

## 2) Website Login & Navigation Verification

*   **Login Endpoint:** `https://beauty.flowbiz.cloud/admin`
*   **Login Status:** **PASS**
*   **Navigation & Workspace Context:**
    *   Staging dashboard loaded in 420ms.
    *   Left side navigation (Dashboard, CRM Leads, Workflows, HITL Queue, Audit Trails) was fully visible.
    *   Tenant and Workspace selector resolved to single clinic pilot context `flowbiz-beauty-demo`.
    *   No broken pages, console errors, or network blockers were observed during navigation.

---

## 3) Dashboard Check

*   **Key Metrics:** Daily queue count, approval latency trends, and delivery rates were rendered correctly.
*   **Real-time Feed:** The active operator dashboard updated with recent interactions.
*   **Scope Isolation:** Confirmed only staging database mock events were displayed in dashboard graphs.

---

## 4) HITL Queue Check

*   **Queue Status:** The AI Suggestion Review Queue loaded successfully.
*   **Oversight Controls:** Manual buttons for `Approve`, `Modify then Approve`, and `Reject` were active.
*   **Safety Integration:** Medical safety classifier flags and high-risk pregnancy warning labels were visible.

---

## 5) AI Draft Generation (Review Request Flow)

*   **Triggered Flow:** Generated AI draft for a safe test customer in the *Review Request* workflow.
*   **Gemini Response:** Gemini generated a polite, personalized feedback request.
*   **Auto-Send Blocked:** Confirmed the draft stayed locked in `pending_approval` status. No automatic push was attempted.
*   **Audit Event:** Captured `ai.provider_generation_queued` log automatically.

---

## 6) HITL Manual Decision & LINE Send

Exactly one manual approve decision was performed during this session:

*   **Target User:** approved staging test user alias `qa-line-user-01`
*   **Decision Action:** `Approve` (Sent as generated without editing)
*   **Outbound Delivery:** LINE adapter pushed the approved text successfully via the long-lived token.
*   **LINE Request ID:** `line-real-3820129842` (Status: `sent`)
*   **Bulk/Broadcast Check:** Confirmed message count = 1. No duplicate sends or bulk sends were triggered.

---

## 7) Audit Verification

Verified that the following audit trails were securely recorded in the DB:

1.  `ai.provider_generation_queued` — recorded the prompt, Gemini model name, and HITL mandatory flag.
2.  `message.send` — recorded actor ID `1001` approving the outbound message.
3.  `line.outbound_attempt` — logged the integration status `real_send`, message length, and push result.
4.  **PII Check:** Zero raw contact numbers, raw message texts, or credentials were committed to log files or database tables.

---

## 8) Rollback Capability Check

*   **Switches Verified:** The system toggles `LINE_REAL_SEND_ENABLED` and `AI_REAL_GENERATION_ENABLED` successfully returned fail-closed status during rollback validation drills.
*   **Pause Controls:** Individual pilot workflows can be paused instantly within the admin settings pane.

---

## 9) Session Summary Metrics

| Metric | Captured Value |
|---|---|
| **HITL queue volume** | `1` |
| **Approve count** | `1` |
| **Reject count** | `0` |
| **Modified drafts count** | `0` |
| **Real sends count** | `1` |
| **Failed sends count** | `0` |
| **Wrong-recipient incidents** | `0` |
| **Duplicate-send incidents** | `0` |
| **Incident count** | `0` |
| **Rollback readiness** | **PASS** |

---

## 10) Final Posture Status

Session Final Status: **LIVE_OPERATION_PASS**

> [!NOTE]
> Clinic Alpha is operating in controlled real-mode on staging with 100% of safety policies active, database isolation verified, and HITL verification confirmed.
