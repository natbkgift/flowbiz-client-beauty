# PR18B Member Consent Management

Last updated: 2026-06-06

## Goal

Add a member consent management foundation on top of the existing magic-link member portal flow.

Members can view consent settings in the portal session payload and update consent settings through a token-protected public endpoint.

## Table

PR18B adds `clinic_member_consents`.

Key fields:

- `clinic_id`
- `member_id`
- `consent_key`
- `consent_status`
- `consent_source`
- `consent_version`
- `granted_at`
- `revoked_at`
- `last_updated_at`
- `metadata_json`

The table is unique by `(clinic_id, member_id, consent_key)`.

## Consent Keys

Supported keys:

- `communication`
- `marketing`
- `appointment_reminder`
- `data_processing`

## Consent Statuses

Portal display supports:

- `unknown`
- `granted`
- `revoked`

The update endpoint accepts only:

- `granted`
- `revoked`

If no record exists, the portal returns default `unknown` consent objects without creating database rows.

## Public Routes

Existing session routes now include consents:

- `GET /public/clinics/:slug/member-access/session?token=...`
- `GET /public/clinics/:slug/member-portal/session?token=...`

New update route:

- `PATCH /public/clinics/:slug/member-portal/consents`

Supported request shapes:

```json
{
  "token": "...",
  "consent": {
    "key": "marketing",
    "status": "granted",
    "version": "v1"
  }
}
```

```json
{
  "token": "...",
  "consents": [
    {
      "key": "marketing",
      "status": "granted",
      "version": "v1"
    },
    {
      "key": "appointment_reminder",
      "status": "revoked",
      "version": "v1"
    }
  ]
}
```

## Session Payload Changes

The portal payload now includes `portal.consents` and a backward-compatible top-level `consents` mirror:

```json
{
  "success": true,
  "member": {},
  "portal": {
    "profile": {},
    "summary": {},
    "bookingRequests": [],
    "slotOffers": [],
    "confirmedAppointments": [],
    "consents": [
      {
        "key": "marketing",
        "status": "granted",
        "source": "member_portal",
        "version": "v1",
        "grantedAt": "...",
        "revokedAt": null,
        "lastUpdatedAt": "...",
        "updatedAt": "..."
      }
    ]
  },
  "bookingRequests": [],
  "slotOffers": [],
  "confirmedAppointments": [],
  "consents": []
}
```

## Update Behavior

The update endpoint:

- Resolves the clinic from `:slug`.
- Resolves the member from the magic-link token.
- Rejects public `clinicId`, `clinic_id`, `memberId`, `member_id`, `leadId`, and `lead_id` overrides.
- Validates consent keys and statuses.
- Defaults an omitted version to `v1`.
- Upserts tenant/member-scoped consent rows.
- Sets `granted_at` when granting.
- Sets `revoked_at` when revoking.
- Preserves existing `granted_at` when revoking.
- Stores summary metadata with hashed request IP and user agent only.

## Audit And Event Evidence

Updates write:

- `clinic_member_events.event_type = member_consent.updated`
- `audit_logs.action_type = member_consent.updated`

The summary shape is:

```json
{
  "source": "member_portal_consent",
  "memberId": 123,
  "updatedKeys": ["marketing"],
  "statuses": {
    "marketing": "granted"
  },
  "versionProvided": true
}
```

## PII Safety

Public responses do not expose:

- raw email
- raw phone
- raw LINE ID
- raw token
- token hash
- clinic/member/lead IDs
- raw request IP
- raw user agent
- request IP hash
- user agent hash
- raw metadata

Audit and member event summaries may include `memberId` for current internal traceability, but do not include contact PII, raw tokens, raw request metadata, or consent metadata.

## Explicit Out Of Scope

PR18B does not add:

- Legal or PDPA advice engine
- Consent document versioning engine
- Payment
- Package ownership
- Profile editing
- Appointment rescheduling
- Public appointment creation
- Calendar sync
- Provider availability engine
- Capacity rules
- Marketing automation
- Auto-send
- Real email provider messaging
- Real LINE provider messaging
- Real SMS provider messaging
- Deploy
