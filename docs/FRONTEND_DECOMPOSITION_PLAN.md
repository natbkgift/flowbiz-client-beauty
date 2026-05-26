# Frontend Decomposition Plan - Phase 3

Report date: 2026-05-26  
Scope: plan the decomposition of `apps/web/src/app.jsx` and apply one safe first slice without changing routing, API behavior, or page flows.

## Current app.jsx Responsibilities

`apps/web/src/app.jsx` currently owns too many responsibilities in one file:

- Admin app bootstrap and `mountAdminApp()`.
- Auth, tenant, permission, workspace, API, flow builder, and execution debugger React contexts.
- Session token storage and migration from localStorage to sessionStorage.
- Hash routing and route-to-page dispatch.
- API client construction and request helpers.
- Date/number formatting and JSON/rich HTML utilities.
- Layout components such as sidebar, top bar, page shell, notices, cards, and metrics.
- Dashboard, users, workspaces, settings, automation, audit, system health, inbox, ROAS, AI agent, blog manager, forum moderator, and login pages.
- Feature-specific forms, tables, loading/error states, and page-level state management.

This makes the file hard to review safely because unrelated concerns sit next to each other and every edit has a large diff surface.

## Safe First Slice Completed

Created shared UI primitives under `apps/web/src/components/ui/`:

- `Button.jsx`
- `Card.jsx`
- `EmptyState.jsx`
- `LoadingState.jsx`

Used them only in low-risk wrapper components and login/topbar buttons:

- `TopBar` logout button now renders through `Button`.
- `PageShell` hero container now renders through `Card`.
- `PermissionNotice` now renders through `EmptyState`.
- `LoadingCard` now renders through `LoadingState`.
- `ErrorCard` now renders through `Card`.
- `MetricCard` now renders through `Card`.
- Login submit button now renders through `Button`.

No route logic, API client logic, auth logic, tenant switching logic, or page data loaders were changed.

## Proposed Folder Structure

Target structure over several small PRs:

```text
apps/web/src/
  app.jsx
  main.js
  components/
    layout/
      AdminShell.jsx
      Sidebar.jsx
      TopBar.jsx
      PageShell.jsx
    ui/
      Button.jsx
      Badge.jsx
      Card.jsx
      EmptyState.jsx
      LoadingState.jsx
      Modal.jsx
      Table.jsx
      StatusBanner.jsx
    forms/
      Field.jsx
      JsonTextarea.jsx
  contexts/
    ApiContext.jsx
    AuthContext.jsx
    TenantContext.jsx
    PermissionContext.jsx
    WorkspaceContext.jsx
  lib/
    api-client.js
    formatting.js
    routing.js
    rich-html.js
    session-storage.js
  pages/
    DashboardPage.jsx
    UsersPage.jsx
    WorkspacesPage.jsx
    SettingsPage.jsx
    AutomationPage.jsx
    FlowBuilderPage.jsx
    ExecutionDebuggerPage.jsx
    AuditLogsPage.jsx
    SystemHealthPage.jsx
    UnifiedInboxPage.jsx
    RoasAnalyticsPage.jsx
    AiAgentConsolePage.jsx
    BlogManagerPage.jsx
    ForumModeratorPage.jsx
    LoginView.jsx
```

Do not move all pages at once. Keep imports direct instead of broad barrel imports to avoid unnecessary bundle coupling.

## Component Extraction Order

1. UI primitives already started:
   - `Button`
   - `Card`
   - `EmptyState`
   - `LoadingState`

2. Finish low-risk shared UI:
   - `Badge` for `pill`, status pills, channel badges, confidence badges.
   - `StatusBanner`.
   - `Table` shell for `table-shell` and `data-table` pairs.

3. Move layout components:
   - `Sidebar`
   - `TopBar`
   - `PageShell`

4. Move pure utilities:
   - formatting helpers
   - route parser and `navigateTo`
   - session storage helpers
   - rich HTML sanitizer

5. Move contexts one at a time:
   - Auth and tenant contexts first.
   - Permission/workspace contexts after route smoke tests.
   - API context after API client extraction.

6. Move pages from lowest-risk to highest-risk:
   - Audit logs and system health.
   - Users and workspaces.
   - Dashboard.
   - Blog/forum managers.
   - Automation builder and execution debugger.
   - Unified inbox and AI agent console last.

## Risk Ranking

- Low: shared UI wrappers that preserve the same DOM element and class names.
- Low: pure formatting helpers with existing tests or simple snapshots.
- Medium: layout extraction because sidebar/topbar own navigation and workspace switching.
- Medium: API client extraction because every page depends on request helpers.
- Medium-high: context extraction because subtle provider value changes can trigger auth or tenant regressions.
- High: automation builder and execution debugger because they include large nested state and graph editing behavior.
- High: unified inbox and AI agent console because they interact with HITL, chat state, and AI safety workflow.

## Test Strategy

For every extraction PR:

- Run `npm run build:web`.
- Run `npm run validate`.
- Run frontend-relevant tests in `apps/api/tests/admin_app.test.js` if present in the full suite.
- Run `npm test` when extraction touches contexts, routing, API client, or page behavior.
- Smoke check these flows after meaningful UI moves:
  - login form renders and submits
  - dashboard loads
  - workspace selector still changes context
  - nav hash routing still works
  - HITL queue still renders and approval actions remain available

For this first slice, validation should focus on bundle/build and existing tests because rendered DOM classes and test IDs were intentionally preserved.

## Rollback Strategy

- Revert each extraction PR independently.
- Keep each PR limited to one ownership boundary: UI primitives, layout, utilities, contexts, or one page family.
- Do not combine page moves with behavior changes.
- Preserve old component names as thin wrappers during migration where possible.
- If a moved component causes regressions, restore the wrapper in `app.jsx` and leave the new component unused until a follow-up fix.

## Next Slice Recommendation

Next safe slice should extract `StatusBanner`, `Badge`, and a `DataTable` wrapper, then replace only the dashboard/audit/system-health usages first. Avoid the automation builder, unified inbox, and AI agent console until shared primitives and layout wrappers are stable.
