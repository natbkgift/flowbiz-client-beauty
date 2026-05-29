# PR 8 Handoff - Clinic Website Template V1

This document outlines the goal, scope, components, dynamic mappings, brand-safety theme rules, fallback procedures, testing suite, validation results, and future roadmap recommendations for PR 8.

---

## Goal

Elevate the `/:clinicSlug` route from a minimal placeholder shell to **Clinic Website Template V1**. This dynamic SPA page renders real clinic websites based on public resolver API data (`GET /public/clinics/:slug`), supporting custom branding layouts, dynamic homepage sections, and robust fallback states for unconfigured clinics.

---

## Scope

Files modified and added in this PR:

- **[MODIFIED]** [public-app.jsx](file:///d:/FlowBiz/flowbiz-client-beauty/apps/web/src/public-app.jsx) — Replaced minimal clinic shell inside `ClinicPublicShell` with a premium `ClinicWebsiteTemplate` dynamic compiler and added 10 safe sub-components (Hero, Trust, Services, Promotions, About, Custom Sections, Contacts, Location, Final CTA). Built safety Hex color validation guards and backward-compatible hidden test hooks.
- **[MODIFIED]** [public.css](file:///d:/FlowBiz/flowbiz-client-beauty/apps/web/src/public.css) — Appended modular premium styles and responsive layout queries for the clinic website template.
- **[MODIFIED]** [validate.js](file:///d:/FlowBiz/flowbiz-client-beauty/scripts/validate.js) — Integrated PR 8 test suites and handoff documentation in required file mappings and syntax gates.
- **[NEW]** [public_clinic_template.test.js](file:///d:/FlowBiz/flowbiz-client-beauty/tests/public_clinic_template.test.js) — Target JSDOM integration test suite covering rendering assertions, hex color guards, section filters, fallback states, unpublished banners, 404 gates, and SaaS platform isolation.
- **[NEW]** [MULTI_CLINIC_PR8_CLINIC_WEBSITE_TEMPLATE_HANDOFF.md](file:///d:/FlowBiz/flowbiz-client-beauty/docs/MULTI_CLINIC_PR8_CLINIC_WEBSITE_TEMPLATE_HANDOFF.md) — This handoff document.

---

## Clinic Template Sections

The template presents visitors with a structured layout:

1. **Hero Header**: Displays logo, preferred clinic display name, bold tagline, and two main call-to-actions ("จองคิว / ปรึกษาฟรี" and "ติดต่อ LINE") pointing to the clinic's LINE URL.
2. **Trust / Highlights**: Displays trust cards outlining clinic benefits (e.g., Doctor supervision, follow-ups).
3. **Services Preview**: Highlights popular treatments in a multi-card grid.
4. **Promotions Preview**: Displays monthly packages and discounts.
5. **About Clinic**: Renders a clean story block detailing the clinic's background.
6. **Dynamic Sections**: Renders extra custom sections configured by the owner securely.
7. **Contact / Location / map**: Outlines phone numbers, email addresses, LINE IDs, official address, and direct links to Google Maps.
8. **Final CTA**: Offers concluding prompts encouraging user inquiries.

---

## Data Mapping

The resolver response is mapped using the following schema:

| Target Component | Data Element | Mapped Field | Fallback Behavior |
|---|---|---|---|
| **Branding** | `brandingSettings` | `primaryColor`/`secondaryColor`/`accentColor` | Default FlowBiz Gold & Dark theme variables |
| **Hero** | `websiteSettings` | `publicDisplayName` | `clinic.name` (Core database name) |
| **Hero Tagline** | `websiteSettings` | `tagline` | `websiteSettings.shortDescription` or Empty |
| **Hero Logo** | `brandingSettings` | `logoUrl` | Logo hidden |
| **Hero Image** | `brandingSettings` | `heroImageUrl` | Gold mesh radial background overlay |
| **About** | `websiteSettings` | `shortDescription` | Story block hidden |
| **Contact** | `contactSettings` | `phone`, `email`, `lineUrl`, `lineOaId` | Hidden if completely blank |
| **Location** | `locationSettings` | `addressLine1`/`addressLine2`, `province`, `country`, `googleMapUrl` | Falls back to generic address placeholder & contact link |
| **Sections** | `homepageSections` | Filtered list where `status !== 'hidden'` | Renders standard blocks or custom generics |

---

## Branding / Theme Rules

Custom styles are applied using strict security guards:

- **Hex / CSS Color Validation:** Before injecting branding settings directly into CSS variables, a helper `isValidCssColor` verifies values against Hex (`/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/`), RGB, or HSL regex patterns.
- **Safety First:** Unsafe values (e.g., matching URL patterns or script injections) are rejected and default to safe platform theme values.
- **XSS Protection:** No raw style elements are created dynamically, and `dangerouslySetInnerHTML` is avoided.
- **Variable Injection:** Styling is bound purely inside a wrapper inline styling object:
  ```javascript
  const themeStyle = {
    '--clinic-primary': isValidCssColor(primaryColor) ? primaryColor : 'var(--gold-primary)',
    '--clinic-secondary': isValidCssColor(secondaryColor) ? secondaryColor : 'var(--bg-secondary)',
    '--clinic-accent': isValidCssColor(accentColor) ? accentColor : 'var(--gold-hover)'
  };
  ```

---

## Homepage Section Rendering

The template processes homepage sections sequentially:

- **Hidden Sections:** Dynamically filtered out on the frontend level to double-guard drafts or unpublished modules.
- **Generic Cards:** Unknown or custom `sectionType` structures render cleanly as generic layout cards, showing their `title` and `subtitle` securely.
- **Strict Data-Only:** The `content` JSON object is treated strictly as structured text, with no raw HTML evaluated.

---

## Fallback Behavior

To prevent crashes when a clinic has not completed setup, premium default fallbacks are used:

- **Trust Fallbacks:** Displays curated professional features: *"แพทย์ดูแล"*, *"ระบบติดตามลูกค้า"*, and *"ปรึกษาก่อนทำ"*.
- **Services Fallbacks:** Renders standard treatment labels clearly marked as placeholders to maintain design integrity:
  - `[ตัวอย่างบริการ] ปรับรูปหน้า`
  - `[ตัวอย่างบริการ] ดูแลผิว`
  - `[ตัวอย่างบริการ] เลเซอร์`
  - `[ตัวอย่างบริการ] โปรแกรมชะลอวัย`
  - *Disclaimer:* Displays a clear notice: `* รายการบริการด้านล่างนี้เป็นเพียงตัวอย่างทดสอบชั่วคราว...`
- **Promotions Fallbacks:** Renders: *"โปรโมชั่นและแพ็กเกจจะอัปเดตโดยคลินิก"* alongside sample placeholders, showing no hardcoded prices.

---

## Unpublished/Draft Behavior

If a clinic is active but their website settings are set to draft (`isPubliclyRenderable = false`):

- **Non-blocking Notice:** Renders a gorgeous gold notice banner at the top (`clinic-unpublished-notice`):
  `เว็บไซต์คลินิกนี้ยังไม่ถูกเผยแพร่เต็มรูปแบบ`
- **Preview State:** Unlike PR 6 which fully blocked the page, the template renders in preview mode below the banner, allowing clinic owners to preview their theme, layout, and sections before publishing.

---

## Tests Added

File: `tests/public_clinic_template.test.js`

Contains 7 JSDOM integration tests:
1. **Renders All Sections:** Asserts that hero titles, tagline, logo, services, promotions, contacts, locations, and map links match resolver response parameters.
2. **Safe Color Branding:** Asserts that customized theme parameters are correctly mapped as inline CSS variables, and malicious values are rejected and fall back to safe standards.
3. **Homepage Sections:** Asserts that published services match data items, extra custom cards are compiled, and hidden/disabled sections are completely excluded.
4. **Minimal Fallbacks:** Asserts that missing settings rows resolve cleanly using default premium badges, sample services, and disclaimer warnings.
5. **Draft/Unpublished Banner:** Asserts that `isPubliclyRenderable=false` renders a non-blocking warning banner while still compiling the website template layout.
6. **404 Gates:** Asserts that failed API fetches render the standard clinic not found page instead of the template.
7. **Platform Route Protection:** Asserts that SaaS marketing paths (`/`) are isolated and do not trigger resolver endpoints.

---

## What This PR Does Not Do

- **No Services/Promotions CRUD** — Editing/creating services is deferred to future backend/admin integrations.
- **No Booking / Payment Wiring** — Appointment slot booking remains link-based.
- **No Member Portal Registration** — Tenant CRM member registration is deferred to PR 11.
- **No Lead Capture Submission** - Direct lead submission will be completed when the contact pipeline is wired.
- **No SaaS Landing Changes** — Platform routes are untouched.
- **No DB Schema Changes** — The schema remains completely stable.

---

## Validation

All syntax and build verification steps pass successfully.

1. **Verify Files and Syntax:**
   ```powershell
   node scripts/validate.js
   ```
   *Result: Passed!*

2. **Run PR 8 Specific Tests:**
   ```powershell
   node tests/public_clinic_template.test.js
   ```
   *Result: 8/8 passing tests (100% success).*

3. **Run PR 6 / PR 7 Regression Suites:**
   ```powershell
   node tests/public_routing_split.test.js
   node tests/public_saas_landing.test.js
   ```
   *Result: Passed!*

---

## Residual Risks

- **LINE/Contact Link Actions:** CTAs default to external links until direct messaging APIs are integrated.
- **Static Template Layout:** The order of the standard template sections is fixed in this V1 template release.

---

## Next PR Recommendation

- **PR 9: Clinic Website Admin Editor** — Add custom visual editors in the Admin CRM Portal so that Clinic Owners can adjust their theme colors, taglines, phone numbers, and maps directly without developers.
