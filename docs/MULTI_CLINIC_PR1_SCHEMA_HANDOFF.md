# PR 1 Schema Handoff - Clinic Website Schema Extension

This document outlines the database schema extension introduced in PR 1 to support per-clinic website settings, branding, contact info, location detail, and homepage sections for the Multi-Clinic SaaS migration.

## Goal
Establish a structured, isolated database baseline to support custom clinic websites, allowing each clinic tenant to customize their settings and layout, while maintaining strict tenant isolation.

## Scope
- Database Schema and Migration script: `database/migrations/038_clinic_website_schema.sql`
- Core constants: `apps/api/src/modules/clinic-website/constants.js`
- Core validation helpers: `apps/api/src/modules/clinic-website/validation.js`
- Core integration tests: `tests/clinic_website_schema.test.js`

## Schema Added

```mermaid
erDiagram
    CLINICS ||--|| CLINIC_WEBSITE_SETTINGS : "has"
    CLINICS ||--|| CLINIC_BRANDING_SETTINGS : "has"
    CLINICS ||--|| CLINIC_CONTACT_SETTINGS : "has"
    CLINICS ||--|| CLINIC_LOCATION_SETTINGS : "has"
    CLINICS ||--o{ CLINIC_HOMEPAGE_SECTIONS : "defines"

    CLINICS {
        bigint id PK
        text name
        text slug UQ
    }

    CLINIC_WEBSITE_SETTINGS {
        bigint id PK
        bigint clinic_id FK, UQ
        text website_status
        text public_display_name
        text tagline
        text short_description
        text default_locale
        timestamptz published_at
    }

    CLINIC_BRANDING_SETTINGS {
        bigint id PK
        bigint clinic_id FK, UQ
        text logo_url
        text favicon_url
        text hero_image_url
        text primary_color
        text secondary_color
        text accent_color
        text font_family
    }

    CLINIC_CONTACT_SETTINGS {
        bigint id PK
        bigint clinic_id FK, UQ
        text phone
        text email
        text line_url
        text line_oa_id
        text facebook_url
        text instagram_url
        text tiktok_url
        text website_url
    }

    CLINIC_LOCATION_SETTINGS {
        bigint id PK
        bigint clinic_id FK, UQ
        text address_line1
        text address_line2
        text district
        text province
        text postal_code
        text country
        text google_map_url
        text google_map_embed_url
        numeric latitude
        numeric longitude
        jsonb business_hours_json
    }

    CLINIC_HOMEPAGE_SECTIONS {
        bigint id PK
        bigint clinic_id FK
        text section_key
        text section_type
        text title
        text subtitle
        jsonb content_json
        integer sort_order
        text status
    }
```

## Tables and Relationships

### 1. `clinic_website_settings`
- **Purpose**: Stores general website state (e.g. `draft`, `active`, `inactive`, `suspended`).
- **Isolation**: Unique constraint on `clinic_id` ensures a one-to-one relationship per clinic.

### 2. `clinic_branding_settings`
- **Purpose**: Stores asset URLs (logo, favicon, hero) and visual styling cues (colors, fonts).
- **Isolation**: Unique constraint on `clinic_id`.

### 3. `clinic_contact_settings`
- **Purpose**: Houses contact details and links (phone, email, LINE OA ID, social handles).
- **Isolation**: Unique constraint on `clinic_id`.

### 4. `clinic_location_settings`
- **Purpose**: Stores address line items, geographic coordinates, map links, and weekly operational hours inside `business_hours_json` (defaults to `{}`).
- **Isolation**: Unique constraint on `clinic_id`.

### 5. `clinic_homepage_sections`
- **Purpose**: Enables highly customizable landing pages by sections (e.g., `hero`, `trust_badges`, `services_preview`).
- **Isolation**: Composite unique constraint on `(clinic_id, section_key)` ensures that a clinic has at most one record per section key, but different clinics can define the same section keys.

## Tenant Isolation Notes
- Every table has a mandatory `clinic_id` foreign key referencing `clinics(id) ON DELETE CASCADE`.
- Deleting a clinic automatically purges all related website records to prevent orphan data leakage.
- Indexes have been added on `clinic_id` columns to ensure fast querying and strict filtering by tenant.

## What This PR Does Not Do
- **No Runtime Code Changes**: No modifications to server routing, controller dispatch, or request filters.
- **No Database Seed changes**: Seed adjustments are deferred to later PRs.
- **No UI Changes**: The admin console and public templates remain untouched.
- **No Slug Routing**: Path-based routing using `:clinicSlug` is not yet implemented.

## Validation
- `npm run validate` checks that all files exist and pass syntax checks.
- `node tests/clinic_website_schema.test.js` verified:
  - Table schemas, constraints, foreign keys, and indexes.
  - Rejecting duplicate setup per clinic.
  - Enforcing status enums.
  - Cascade deletes.
  - Pure function validations (status check, section key normalizer).

## Residual Risks
- **Reserved Slugs**: Not yet validated at the schema level. Must be strictly handled in PR 2.
- **API and UI Wiring**: The API endpoint logic and UI editors will be wired in PRs 3, 4, 8, and 9.

## Next PR Recommendation
- **PR 2**: Reserved Slug + Clinic Validation (prevents clinic slug conflicts with core system routes like `/admin`, `/api`, `/auth`, etc.)
- **PR 3**: Super Admin Clinic API (implements CRUD API endpoints for platform operators to provision new clinics)
