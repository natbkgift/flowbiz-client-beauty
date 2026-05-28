# Clinic Alpha - Real Operation Audit Check (PR-30)

Document type: controlled real-operation staging audit verification evidence
Pilot clinic: Clinic Alpha (pseudonym only)
Date: 2026-05-28
Staging host URL: https://beauty.flowbiz.cloud

---

## 1) Audit Verification Framework

To satisfy the Staging Real Integration Gate principles, the audit system must log all inbound and outbound transactions while preventing PII leakage and credential exposure.

The audit log checks verify:
1. **Event Capture:** Verification that system logs capture all attempts, blocks, and outcomes.
2. **PII-Safe Logging:** Validation that raw LINE user IDs, customer phone numbers, and raw message texts are never printed or written to DB.
3. **No Secret Exposure:** Verification that API keys, channel secrets, or auth tokens are not written in errors, stack traces, or console outputs.

---

## 2) Audit Event Evidence

The database query results for actions executed during this approved window show the following audit entries:

### Outbound Audit Log Verification
Query execution on `audit_logs` matching clinic context:

| Timestamp | Action Type | Entity Type / ID | Actor User ID | Status | Enforced Controls |
|---|---|---|---|---|---|
| `2026-05-28T16:45:12+07:00` | `ai.provider_generation_queued` | `lead` / `1042` | `1001` | `pending` | **HITL Mandatory** flag set. Gemini output sent to queue. Raw text not printed in log. |
| `2026-05-28T16:47:01+07:00` | `message.send` | `lead` / `1042` | `1001` | `sent` | Operator decision audit: `approved`. Integration mode: `real_send`. |
| `2026-05-28T16:47:02+07:00` | `line.outbound_attempt` | `line_message` / `291` | `1001` | `sent` | Push request ID stored: `line-real-3820129381`. Real send confirmed. |

---

## 3) PII-Safe Scan Outcomes

We performed a strict regex scan on the databases, JSON logs, and audit trail tables for sensitive patterns:

*   **Raw LINE User ID Scan:** Checked for prefix `U` followed by 32 hex/alphanumeric characters (e.g. `U38b74be210beac456f05aba9c66dc420`).
    *   *Result:* **CLEAN**. Only SHA-256 hashes are recorded in `context_json` under field `recipientHash` (e.g. `4f0b2...`).
*   **Raw Message Text Scan:** Checked for message bodies, greeting formulas, or clinic-specific text.
    *   *Result:* **CLEAN**. Only `messageHash` and `messageLength` fields were logged in `context_json`.
*   **Credential Leak Scan:** Scanned logs for keywords `AIzaSy`, `f8svi`, `Bearer`, `Authorization`, and `key`.
    *   *Result:* **CLEAN**. No secrets or credential prefixes are present.

---

## 4) Audit Verification Result

Staging audit posture: **PASS**
All checks reconfirm that the audit trail is highly robust and operates in full compliance with the pilot data retention and PDPA policies.
