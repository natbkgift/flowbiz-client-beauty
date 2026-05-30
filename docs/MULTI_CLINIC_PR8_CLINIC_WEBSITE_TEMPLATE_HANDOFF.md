# PR 8 Handoff - Clinic Website Template V1

This document details the goal, scope, clinic template sections, data mapping rules, branding/theme rules, homepage section rendering, fallback behavior, unpublished/draft behavior, testing suite, validation results, and future roadmap recommendations for PR 8.

---

## Goal

Elevate the path `/:clinicSlug` from a minimal clinic shell to **Clinic Website Template V1**, dynamically loading and rendering real clinic configurations resolved via the public resolver API from PR 5.

---

## Scope

Files modified and added in this PR:

- **[MODIFIED]** [public-app.jsx](file:///d:/FlowBiz/flowbiz-client-beauty/apps/web/src/public-app.jsx) — Completely replaced the minimal `ClinicPublicShell` with a beautiful modular `ClinicWebsiteTemplate` rendering core sub-components: Hero, Trust Cards, Services, Promotions, About, Contact, Map, and Final CTA.
- **[MODIFIED]** [public.css](file:///d:/FlowBiz/flowbiz-client-beauty/apps/web/src/public.css) — Appended premium responsive styles specifically dedicated to the clinic website template.
- **[MODIFIED]** [validate.js](file:///d:/FlowBiz/flowbiz-client-beauty/scripts/validate.js) — Updated check lists and syntax checks to enforce PR 8 files.
- **[NEW]** [public_clinic_template.test.js](file:///d:/FlowBiz/flowbiz-client-beauty/tests/public_clinic_template.test.js) — Comprehensive JSDOM integration test suite covering correct section rendering, branding/color validation, homepage section states, fallbacks, draft warning behaviors, 404, and platform route split safety.
- **[NEW]** [MULTI_CLINIC_PR8_CLINIC_WEBSITE_TEMPLATE_HANDOFF.md](file:///d:/FlowBiz/flowbiz-company/docs/MULTI_CLINIC_PR8_CLINIC_WEBSITE_TEMPLATE_HANDOFF.md) — This handoff document.

---

## Clinic Template Sections

The template is organized into key visual building blocks:

1. **Hero (`clinic-template-hero`)**: Displays logo, preferred display name, tagline, description, and primary/secondary CTAs linking to LINE. Supports custom brand colors and hero background image.
2. **Trust / Highlights (`clinic-template-trust`)**: Render highlights highlighting clinic credibility (e.g., Doctor supervision, custom CRM follow-ups) from `trust_badges` homepage section or defaults.
3. **Services Preview (`clinic-template-services`)**: Lists key treatments from the `services_preview` homepage section or fallback suggestions.
4. **Promotions Preview (`clinic-template-promotions`)**: Displays current campaign packages or a safe fallback indicating that offers will be updated by the clinic.
5. **About (`clinic-template-about`)**: Focuses on a custom short description about the clinic's specialized aesthetic goals.
6. **Dynamic Sections (`clinic-template-dynamic-sections`)**: Securely renders any custom homepage sections configured by the owner that are not standard sections.
7. **Contact (`clinic-template-contact`)**: Formats phone numbers, email addresses, and LINE Official Account connections.
8. **Location (`clinic-template-location`)**: Lists the clinic's full physical address and provides a deep link (`clinic-template-map-link`) to Google Maps.
9. **Final CTA (`clinic-template-final-cta`)**: Re-emphasizes client conversion through LINE and phone links before reaching the page footer.

---

## Data Mapping

Data from the resolver response `GET /public/clinics/:slug` maps cleanly to UI elements as follows:

| API Source Field | Target UI Location | Fallback Value / Default |
|---|---|---|
| `clinic.name` | Document title fallback | `'FlowBiz Clinic'` |
| `websiteSettings.publicDisplayName` | Main Hero header / Footer | `clinic.name` |
| `websiteSettings.tagline` | Hero tagline subtitle | Empty / Hidden |
| `websiteSettings.shortDescription` | About block content / Hero desc | Empty / Hidden |
| `brandingSettings.logoUrl` | Hero logo image | Golden sparkle emoji placeholder (`✨`) |
| `brandingSettings.heroImageUrl` | Hero background-image overlay | Dark premium radial mesh gradient |
| `brandingSettings.primaryColor` | `--clinic-primary` CSS variable | `'var(--gold-primary)'` |
| `brandingSettings.secondaryColor` | `--clinic-secondary` CSS variable | `'var(--bg-secondary)'` |
| `brandingSettings.accentColor` | `--clinic-accent` CSS variable | `'var(--gold-hover)'` |
| `contactSettings.phone` | Contact phone info / Final phone CTA | Empty / Hidden |
| `contactSettings.email` | Contact email info | Empty / Hidden |
| `contactSettings.lineUrl` | All Hero & Final CTAs / LINE text link | `'https://line.me'` |
| `locationSettings` fields | Location address text | `'ไม่ระบุที่อยู่ของคลินิก'` |
| `locationSettings.googleMapUrl` | Google Map button link | Empty / Hidden |
| `homepageSections` | Dynamic cards & structured grids | Fallback placeholders / Empty |

---

## Branding / Theme Rules

To allow customized coloring while preserving absolute security against injection attacks:
- **Validation Gate:** A robust validator `isValidCssColor()` evaluates hex codes, `rgb`/`rgba` colors, `hsl`/`hsla` colors, and safe color names. Any color containing braces, brackets, or suspicious strings is rejected.
- **Dynamic Variables:** Safe brand colors are injected as inline styles on the overall container (`clinic-template`) via standard CSS custom properties:
  - `--clinic-primary`
  - `--clinic-secondary`
  - `--clinic-accent`
- **Zero Raw HTML Injection:** Never uses `dangerouslySetInnerHTML` or direct raw string interpolation.
- **Vanilla CSS:** Styled beautifully inside `public.css` utilizing custom styling overrides for brand-personalization classes (e.g. `.clinic-btn-primary`, `.clinic-glass-card`, etc.).

---

## Homepage Section Rendering

- **Draft / Published Filtering:** Custom sections are re-filtered on the client side. Any section marked with `status === 'hidden'` is completely bypassed even if sent by the resolver.
- **Type Compatibility:** Unrecognized custom homepage sections are caught by a generic layout renderer that displays titles, subtitles, and key-value attributes securely as plain text, eliminating any HTML injection vectors.

---

## Fallback Behavior

When specific settings or sections are unconfigured:
- **No Crash Guarantee:** Empty fields, missing database rows, or empty lists return safe defaults gracefully.
- **Curated Placeholders:** Sections like Services and Highlights show clean, professional placeholder content to ensure the page remains complete and polished (e.g. `[บริการแนะนำ] ปรับรูปหน้า (ข้อมูลตัวอย่าง)`).
- **Safe Promotions:** If promotions are missing, a safe notice is shown (`[ข้อมูลตัวอย่าง] โปรโมชั่นและแพ็กเกจจะอัปเดตโดยคลินิกในเร็วๆ นี้`). No fake offers or pricing figures are generated.

---

## Unpublished/Draft Behavior

- If `isPubliclyRenderable === false` (clinic active but website status in `draft`/`suspended` state):
  - The clinic website still renders fully (enabling previews/dev testing).
  - A prominent, warning banner (`clinic-unpublished-notice`) is styled beautifully at the top reading: **"เว็บไซต์คลินิกนี้ยังไม่ถูกเผยแพร่เต็มรูปแบบ"**

---

## Tests Added

File: `tests/public_clinic_template.test.js`

Contains 7 comprehensive integration tests evaluating compiled React app bundles under JSDOM virtual browsers:
1. **Clinic template renders from resolver data:** Asserts that all core test IDs are loaded and public values correctly map from active clinic responses.
2. **Branding/theme applied safely:** Asserts that custom primary, secondary, and accent colors populate container CSS variables, while malicious strings are rejected in favor of default fallbacks.
3. **Homepage sections render:** Asserts that services, promotions, and custom text sections render their structured items, and hidden sections are successfully ignored.
4. **Fallback defaults:** Asserts that a clinic with empty configurations still loads, showing default services and placeholder notices without crashing.
5. **Draft/unpublished notice:** Asserts that `isPubliclyRenderable=false` injects the top-level unpublished banner.
6. **404 still works:** Asserts that missing clinic responses present the `clinic-not-found` page.
7. **Platform routes unaffected:** Asserts that routes like `/` and `/pricing` safely load platform landing grids and never load clinic template wrappers.

---

## What This PR Does Not Do

- **No Backend Resolver Contract Changes:** Resolves slugs exactly as designed in PR 5.
- **No services/promotions/packages CRUD:** Storing dynamic treatments inside dedicated tables belongs to the future editor/CRUD milestones.
- **No member portal / signup:** Deferred to PR 11/12.
- **No booking/payment engine:** Deferred to PR 14.
- **No demo lead backend submission:** Handled locally within the SaaS page.
- **No Admin SPA modifications:** Admin portal is kept untouched.

---

## Validation

All syntax and build verification steps are automated and pass successfully.

1. **Verify Files and Syntax:**
   ```powershell
   node scripts/validate.js
   ```
   *Output: Validation baseline passed.*

2. **Run PR 8 Clinic Template Tests:**
   ```powershell
   node tests/public_clinic_template.test.js
   ```
   *Output: All tests passing.*

3. **Run PR 6 & 7 Tests (Regression checks):**
   ```powershell
   node tests/public_routing_split.test.js
   node tests/public_saas_landing.test.js
   ```
   *Output: All tests passing.*

4. **Verify Bundle Diff Integrity:**
   `git diff main -- apps/web/dist/assets/` yields empty differences when cleaned, confirming that generated bundles are not committed.

---

## Residual Risks

- **Offline Lead Capture:** CTAs map to LINE Official Account links or phone prompts. Connecting outbound submissions to a database or LINE hook is reserved for future integration sprints.
- **Placeholder Prices:** Core services fall back to placeholder labels to avoid conveying fake commercial prices before editor settings are customized.

---

## Next PR Recommendation

- **PR 9: Clinic Website Admin Editor** — Construct the Admin SPA visual customizer so clinic owners can update their display names, contact info, brand colors, and configure their homepage section contents directly from the back-office dashboard.
