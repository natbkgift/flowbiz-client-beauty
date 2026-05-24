import React, { createContext, startTransition, useContext, useEffect, useMemo, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';

const STORAGE_KEY = 'flowbiz.admin.token';

const AuthContext = createContext(null);
const TenantContext = createContext(null);
const PermissionContext = createContext(null);
const WorkspaceContext = createContext(null);
const ApiContext = createContext(null);
const FlowBuilderContext = createContext(null);
const ExecutionDebuggerContext = createContext(null);

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', caption: 'Tenant activity overview' },
  { key: 'unified-inbox', label: 'Omnichannel Inbox', caption: 'Social chat and AI co-pilot' },
  { key: 'users', label: 'Users', caption: 'Memberships and roles' },
  { key: 'workspaces', label: 'Workspaces', caption: 'Workspace configuration' },
  { key: 'settings', label: 'Settings', caption: 'Tenant and org settings' },
  { key: 'automation', label: 'Automation', caption: 'Flows and executions' },
  { key: 'audit', label: 'Audit Logs', caption: 'Recent system activity' },
  { key: 'system-health', label: 'System Health', caption: 'Worker and event ops' }
];

class ApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status || 500;
    this.code = options.code || 'UNKNOWN_ERROR';
    this.details = options.details || null;
  }
}

function getConfig(configOverride) {
  return configOverride || window.__FLOWBIZ_WEB_CONFIG__ || { apiBaseUrl: 'http://localhost:3001' };
}

function parseRouteFromHash() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const normalized = raw || 'dashboard';
  const parts = normalized.split('/');

  if (parts[0] === 'automation' && parts[1] === 'builder' && parts[2]) {
    return {
      key: 'automation-builder',
      flowId: Number(parts[2]),
      path: `automation/builder/${parts[2]}`
    };
  }

  if (parts[0] === 'automation' && parts[1] === 'executions' && parts[2]) {
    return {
      key: 'automation-execution',
      executionId: Number(parts[2]),
      path: `automation/executions/${parts[2]}`
    };
  }

  return NAV_ITEMS.some((item) => item.key === normalized)
    ? { key: normalized, path: normalized }
    : { key: 'dashboard', path: 'dashboard' };
}

function navigateTo(routeKey) {
  const routePath = typeof routeKey === 'string' ? routeKey.replace(/^#\/?/, '') : routeKey?.path || 'dashboard';
  const nextHash = `#/${routePath}`;
  if (window.location.hash !== nextHash) {
    window.location.hash = nextHash;
  }
}

function formatDateTime(value) {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return parsed.toLocaleString();
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(Number(value || 0));
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function normalizeJsonInput(value, fieldName) {
  if (!value.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('JSON payload must be an object.');
    }

    return parsed;
  } catch (error) {
    throw new Error(`${fieldName} must be valid JSON object text.`);
  }
}

function safeJsonStringify(value) {
  return JSON.stringify(value || {}, null, 2);
}

function dedupeMembershipsByWorkspace(memberships) {
  const seen = new Set();

  return memberships.filter((membership) => {
    const key = `${membership.clinic?.slug || membership.clinicId}:${membership.workspace?.slug || membership.workspaceId}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function describeError(error) {
  if (!error) {
    return null;
  }

  if (error instanceof ApiError) {
    return `${error.status} ${error.code}: ${error.message}`;
  }

  return error.message || 'Unknown error.';
}

function createApiClient(apiBaseUrl) {
  async function request(path, options = {}) {
    const headers = {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.clinicSlug ? { 'x-clinic-slug': options.clinicSlug } : {}),
      ...(options.workspaceSlug ? { 'x-workspace-slug': options.workspaceSlug } : {}),
      ...(options.headers || {})
    };
    const response = await fetch(`${apiBaseUrl}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;

    if (!response.ok) {
      throw new ApiError(payload?.error?.message || 'Request failed.', {
        status: response.status,
        code: payload?.error?.code || 'REQUEST_FAILED',
        details: payload?.error?.details || null
      });
    }

    return payload;
  }

  return {
    login(body) {
      return request('/auth/login', { method: 'POST', body });
    },
    getAuthMe(session) {
      return request('/auth/me', session);
    },
    getTenantContext(session) {
      return request('/tenant-context', session);
    },
    listMembers(session, workspaceId) {
      return request(`/workspace/${workspaceId}/members`, session);
    },
    inviteMember(session, workspaceId, body) {
      return request(`/workspace/${workspaceId}/invite`, { ...session, method: 'POST', body });
    },
    changeRole(session, workspaceId, membershipId, body) {
      return request(`/workspace/${workspaceId}/members/${membershipId}/role`, { ...session, method: 'PATCH', body });
    },
    deactivateMember(session, workspaceId, membershipId) {
      return request(`/workspace/${workspaceId}/members/${membershipId}/deactivate`, { ...session, method: 'PATCH' });
    },
    getWorkspace(session, workspaceId) {
      return request(`/workspace/${workspaceId}`, session);
    },
    updateWorkspace(session, workspaceId, body) {
      return request(`/workspace/${workspaceId}`, { ...session, method: 'PATCH', body });
    },
    getTenantSettings(session) {
      return request('/tenant/settings', session);
    },
    updateTenantSettings(session, body) {
      return request('/tenant/settings', { ...session, method: 'PATCH', body });
    },
    getOrganization(session, organizationId) {
      return request(`/organization/${organizationId}`, session);
    },
    updateOrganization(session, organizationId, body) {
      return request(`/organization/${organizationId}`, { ...session, method: 'PATCH', body });
    },
    getAnalyticsOverview(session) {
      return request('/analytics/overview', session);
    },
    listAuditLogs(session, params = {}) {
      const search = new URLSearchParams();

      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          search.set(key, value);
        }
      });

      const suffix = search.toString() ? `?${search.toString()}` : '';
      return request(`/audit/logs${suffix}`, session);
    },
    listAutomationFlows(session) {
      return request('/automation/flows', session);
    },
    createAutomationBuilderFlow(session, body) {
      return request('/automation/flows', { ...session, method: 'POST', body: { ...body, mode: 'builder' } });
    },
    listAutomationFlowVersions(session, flowId) {
      return request(`/automation/flows/${flowId}/versions`, session);
    },
    getAutomationFlowVersion(session, flowId, versionId) {
      return request(`/automation/flows/${flowId}/versions/${versionId}`, session);
    },
    saveAutomationFlowVersion(session, flowId, body) {
      return request(`/automation/flows/${flowId}/versions`, { ...session, method: 'POST', body });
    },
    publishAutomationFlowVersion(session, flowId, versionId) {
      return request(`/automation/flows/${flowId}/versions/${versionId}/publish`, { ...session, method: 'POST' });
    },
    listAutomationExecutions(session, params = {}) {
      const search = new URLSearchParams();

      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          search.set(key, value);
        }
      });

      const suffix = search.toString() ? `?${search.toString()}` : '';
      return request(`/automation/executions${suffix}`, session);
    },
    getAutomationExecution(session, executionId) {
      return request(`/automation/executions/${executionId}`, session);
    },
    getAutomationExecutionSteps(session, executionId) {
      return request(`/automation/executions/${executionId}/steps`, session);
    },
    listAutomationTasks(session, params = {}) {
      const search = new URLSearchParams();

      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          search.set(key, value);
        }
      });

      const suffix = search.toString() ? `?${search.toString()}` : '';
      return request(`/automation/tasks${suffix}`, session);
    },
    listChats(session) {
      return request('/chats', session);
    },
    getChatMessages(session, threadId) {
      return request(`/chats/${threadId}/messages`, session);
    },
    sendChatMessage(session, threadId, body) {
      return request(`/chats/${threadId}/send`, { ...session, method: 'POST', body });
    },
    getAiCopilotSuggestion(session, leadId, messageText) {
      return request(`/ai-agent/copilot/suggest?leadId=${leadId}&messageText=${encodeURIComponent(messageText)}`, session);
    },
    getSystemHealth(session) {
      return request('/ops/health', session);
    },
    retryWorkerJob(session, jobId) {
      return request(`/ops/jobs/${jobId}/retry`, { ...session, method: 'POST' });
    }
  };
}

function useApi() {
  return useContext(ApiContext);
}

function useAuth() {
  return useContext(AuthContext);
}

function useTenant() {
  return useContext(TenantContext);
}

function usePermissions() {
  return useContext(PermissionContext);
}

function useWorkspace() {
  return useContext(WorkspaceContext);
}

function useFlowBuilder() {
  return useContext(FlowBuilderContext);
}

function useExecutionDebugger() {
  return useContext(ExecutionDebuggerContext);
}

function useSessionRequestOptions() {
  const { token } = useAuth();
  const { session } = useTenant();

  return useMemo(
    () => ({
      token,
      clinicSlug: session?.currentClinic?.slug,
      workspaceSlug: session?.currentWorkspace?.slug
    }),
    [session?.currentClinic?.slug, session?.currentWorkspace?.slug, token]
  );
}

function usePageData(loader, dependencies, enabled = true) {
  const [state, setState] = useState({ status: 'idle', data: null, error: null });

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    let active = true;

    async function run() {
      setState((current) => ({ ...current, status: 'loading', error: null }));

      try {
        const data = await loader();

        if (!active) {
          return;
        }

        setState({ status: 'ready', data, error: null });
      } catch (error) {
        if (!active) {
          return;
        }

        setState({ status: 'error', data: null, error });
      }
    }

    run();

    return () => {
      active = false;
    };
  }, [enabled, ...dependencies]);

  return [state, setState];
}

function PermissionProvider({ session, children }) {
  const value = useMemo(() => {
    const permissions = new Set(session?.permissions || []);

    return {
      permissions,
      has(permissionKey) {
        return permissions.has(permissionKey);
      },
      hasAny(permissionKeys) {
        return permissionKeys.some((permissionKey) => permissions.has(permissionKey));
      }
    };
  }, [session?.permissions]);

  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

function Sidebar({ route, onNavigate }) {
  return (
    <aside className="sidebar">
      <div className="brand-mark">
        <div className="brand-badge">FB</div>
        <div>
          <h1 className="brand-title">FlowBiz Admin</h1>
          <p className="brand-subtitle">Control center and operator cockpit</p>
        </div>
      </div>
      <nav className="nav-list" aria-label="Primary">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`nav-button${route?.key === item.key ? ' active' : ''}`}
            onClick={() => onNavigate(item.key)}
            data-testid={`nav-${item.key}`}
          >
            <span className="nav-label">{item.label}</span>
            <span className="nav-caption">{item.caption}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

function TopBar() {
  const { session, setSession, switchWorkspaceState, switchWorkspace } = useWorkspace();
  const workspaceOptions = dedupeMembershipsByWorkspace(session.memberships || []);

  return (
    <header className="top-bar">
      <div>
        <h2 className="section-heading">{session.currentClinic?.name}</h2>
        <p className="section-subheading">
          {session.currentOrganization?.name} / {session.currentWorkspace?.name}
        </p>
        <div className="context-meta">
          <span className="context-chip">Tenant: {session.currentClinic?.slug}</span>
          <span className="context-chip">Role: {session.currentMembership?.role}</span>
          <span className="context-chip">Permissions: {(session.permissions || []).length}</span>
        </div>
      </div>
      <div className="toolbar top-toolbar-actions">
        <label className="field compact-field">
          <span>Workspace</span>
          <select
            value={String(session.currentWorkspace?.id || '')}
            onChange={(event) => {
              const nextMembership = workspaceOptions.find(
                (membership) => String(membership.workspace?.id) === event.target.value
              );

              if (nextMembership) {
                switchWorkspace(nextMembership);
              }
            }}
            data-testid="workspace-selector"
          >
            {workspaceOptions.map((membership) => (
              <option key={membership.workspace.id} value={membership.workspace.id}>
                {membership.workspace.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            window.localStorage.removeItem(STORAGE_KEY);
            setSession(null);
          }}
        >
          Sign out
        </button>
        {switchWorkspaceState.status === 'loading' ? <span className="pill status-running">Switching workspace</span> : null}
      </div>
    </header>
  );
}

function PageShell({ title, intro, actions, children }) {
  return (
    <section className="page-shell">
      <div className="hero-card">
        <div className="split-header">
          <div>
            <h1 className="page-title">{title}</h1>
            <p className="page-intro">{intro}</p>
          </div>
          {actions ? <div className="toolbar">{actions}</div> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function PermissionNotice({ title, message }) {
  return (
    <div className="notice-card" data-testid="permission-notice">
      <h3 className="section-heading">{title}</h3>
      <p className="muted">{message}</p>
    </div>
  );
}

function StatusBanner({ state, testId = 'status-banner' }) {
  if (!state?.message) {
    return null;
  }

  return (
    <div className={`alert-banner ${state.kind || 'info'}`} data-testid={testId}>
      {state.message}
    </div>
  );
}

function LoadingCard({ label = 'Loading…' }) {
  return (
    <div className="notice-card" data-testid="loading-state">
      <p className="muted">{label}</p>
    </div>
  );
}

function ErrorCard({ error }) {
  return (
    <div className="notice-card error-card" data-testid="error-state">
      <h3 className="section-heading">Request failed</h3>
      <p className="muted">{describeError(error)}</p>
    </div>
  );
}

function MetricCard({ label, value, hint }) {
  return (
    <article className="metric-card">
      <span className="metric-label">{label}</span>
      <p className="metric-value">{value}</p>
      <span className="metric-hint">{hint}</span>
    </article>
  );
}

function DashboardPage() {
  const api = useApi();
  const sessionOptions = useSessionRequestOptions();
  const permissions = usePermissions();
  const canView = permissions.hasAny(['analytics.read', 'automation.read', 'audit.read']);
  const canViewAnalytics = permissions.has('analytics.read');
  const canViewAudit = permissions.has('audit.read');
  const canViewOps = permissions.hasAny(['automation.read', 'automation.manage', 'audit.read']);
  const [state] = usePageData(async () => {
    const [overview, auditLogs, health] = await Promise.all([
      canViewAnalytics
        ? api.getAnalyticsOverview(sessionOptions)
        : Promise.resolve({ daily: { leadsCreated: 0, messagesSent: 0, automationExecutions: 0 } }),
      canViewAudit ? api.listAuditLogs(sessionOptions, { limit: 6 }) : Promise.resolve({ items: [] }),
      canViewOps
        ? api.getSystemHealth(sessionOptions)
        : Promise.resolve({
            systemStatus: 'healthy',
            worker: { queueDepth: 0, failedJobs: 0 },
            automation: { successRate: 0 },
            eventBus: { throughputPerHour: 0 }
          })
    ]);

    return { overview, auditLogs, health };
  }, [api, canViewAnalytics, canViewAudit, canViewOps, sessionOptions], canView);

  if (!canView) {
    return <PermissionNotice title="Dashboard unavailable" message="Dashboard requires analytics, audit, or automation read permission." />;
  }

  if (state.status === 'loading' || state.status === 'idle') {
    return <LoadingCard label="Loading dashboard…" />;
  }

  if (state.status === 'error') {
    return <ErrorCard error={state.error} />;
  }

  const { overview, auditLogs, health } = state.data;

  return (
    <PageShell
      title="Dashboard"
      intro="Tenant overview for leads, messaging, automation activity, and operator-visible system state."
    >
      <div className="metric-grid" data-testid="dashboard-metrics">
        <MetricCard label="Leads Today" value={formatNumber(overview.daily.leadsCreated)} hint="Daily leads created" />
        <MetricCard label="Messages Sent" value={formatNumber(overview.daily.messagesSent)} hint="Outbound messages today" />
        <MetricCard
          label="Automation Executions"
          value={formatNumber(overview.daily.automationExecutions)}
          hint="Daily automation runs"
        />
      </div>
      <div className="two-column-grid">
        <section className="section-card">
          <div className="split-header compact-gap">
            <div>
              <h3 className="section-heading">Recent activity</h3>
              <p className="muted">Latest audit trail for tenant activity.</p>
            </div>
            <span className={`pill status-${health.systemStatus}`}>{health.systemStatus}</span>
          </div>
          <ul className="timeline-list" data-testid="dashboard-activity-feed">
            {auditLogs.items.map((item) => (
              <li key={item.id} className="timeline-item">
                <strong>{item.actionType}</strong>
                <span className="muted">{item.entityType} #{item.entityId}</span>
                <span className="muted">{formatDateTime(item.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="section-card">
          <h3 className="section-heading">Automation health</h3>
          <div className="stacked-metrics">
            <div className="metric-row">
              <span>Queue depth</span>
              <strong>{formatNumber(health.worker.queueDepth)}</strong>
            </div>
            <div className="metric-row">
              <span>Failed jobs</span>
              <strong>{formatNumber(health.worker.failedJobs)}</strong>
            </div>
            <div className="metric-row">
              <span>Execution success</span>
              <strong>{formatPercent(health.automation.successRate)}</strong>
            </div>
            <div className="metric-row">
              <span>Event throughput/hr</span>
              <strong>{formatNumber(health.eventBus.throughputPerHour)}</strong>
            </div>
          </div>
        </section>
      </div>
    </PageShell>
  );
}

function UsersPage() {
  const api = useApi();
  const { session } = useTenant();
  const sessionOptions = useSessionRequestOptions();
  const permissions = usePermissions();
  const canView = permissions.hasAny(['user.read', 'user.manage']);
  const canList = permissions.has('user.read');
  const canInvite = permissions.hasAny(['user.manage', 'invite.manage']);
  const canChangeRole = permissions.has('role.manage');
  const canDeactivate = permissions.has('user.manage');
  const [flash, setFlash] = useState(null);
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'viewer' });
  const [roleDrafts, setRoleDrafts] = useState({});
  const [state, setState] = usePageData(
    () => api.listMembers(sessionOptions, session.currentWorkspace.id),
    [api, session.currentWorkspace?.id, sessionOptions],
    canList
  );

  if (!canView) {
    return <PermissionNotice title="Users unavailable" message="Users page requires user.read or user.manage permission." />;
  }

  if (!canList) {
    return <PermissionNotice title="Users list unavailable" message="This view needs user.read to load membership records from the API." />;
  }

  async function refreshMembers() {
    setState((current) => ({ ...current, status: 'loading' }));

    try {
      const data = await api.listMembers(sessionOptions, session.currentWorkspace.id);
      setState({ status: 'ready', data, error: null });
    } catch (error) {
      setState({ status: 'error', data: null, error });
    }
  }

  async function handleInviteSubmit(event) {
    event.preventDefault();

    try {
      await api.inviteMember(sessionOptions, session.currentWorkspace.id, inviteForm);
      setFlash({ kind: 'success', message: `Invitation sent to ${inviteForm.email}.` });
      setInviteForm({ email: '', role: 'viewer' });
      await refreshMembers();
    } catch (error) {
      setFlash({ kind: 'error', message: describeError(error) });
    }
  }

  async function handleRoleChange(member) {
    try {
      const nextRole = roleDrafts[member.id] || member.role;
      await api.changeRole(sessionOptions, session.currentWorkspace.id, member.id, { role: nextRole });
      setFlash({ kind: 'success', message: `Updated role for ${member.user?.email || 'member'}.` });
      await refreshMembers();
    } catch (error) {
      setFlash({ kind: 'error', message: describeError(error) });
    }
  }

  async function handleDeactivate(member) {
    try {
      await api.deactivateMember(sessionOptions, session.currentWorkspace.id, member.id);
      setFlash({ kind: 'success', message: `Deactivated ${member.user?.email || 'member'}.` });
      await refreshMembers();
    } catch (error) {
      setFlash({ kind: 'error', message: describeError(error) });
    }
  }

  return (
    <PageShell
      title="Users"
      intro="Manage workspace memberships, invitations, role assignments, and access removal."
    >
      <StatusBanner state={flash} />
      {canInvite ? (
        <section className="section-card">
          <h3 className="section-heading">Invite member</h3>
          <form className="form-grid" onSubmit={handleInviteSubmit} data-testid="invite-form">
            <label className="field">
              <span>Email</span>
              <input
                value={inviteForm.email}
                onChange={(event) => setInviteForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="member@example.com"
                data-testid="invite-email"
              />
            </label>
            <label className="field">
              <span>Role</span>
              <select
                value={inviteForm.role}
                onChange={(event) => setInviteForm((current) => ({ ...current, role: event.target.value }))}
                data-testid="invite-role"
              >
                <option value="admin">Admin</option>
                <option value="operator">Operator</option>
                <option value="viewer">Viewer</option>
              </select>
            </label>
            <div className="inline-actions">
              <button type="submit" className="primary-button" data-testid="invite-submit">
                Send invite
              </button>
            </div>
          </form>
        </section>
      ) : null}
      {state.status === 'loading' || state.status === 'idle' ? <LoadingCard label="Loading workspace members…" /> : null}
      {state.status === 'error' ? <ErrorCard error={state.error} /> : null}
      {state.status === 'ready' ? (
        <section className="section-card">
          <div className="split-header compact-gap">
            <div>
              <h3 className="section-heading">Workspace members</h3>
              <p className="muted">Current members and invited users for the selected workspace.</p>
            </div>
            <span className="pill">{state.data.items.length} records</span>
          </div>
          <div className="table-shell">
            <table className="data-table" data-testid="members-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Role</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {state.data.items.map((member) => (
                  <tr key={member.id} data-testid={`member-row-${member.id}`}>
                    <td>{member.user?.email || '-'}</td>
                    <td>
                      <span className={`pill status-${member.status}`}>{member.status}</span>
                    </td>
                    <td>
                      {canChangeRole ? (
                        <div className="inline-actions compact-inline-actions">
                          <select
                            value={roleDrafts[member.id] || member.role}
                            onChange={(event) => setRoleDrafts((current) => ({ ...current, [member.id]: event.target.value }))}
                            data-testid={`role-select-${member.id}`}
                          >
                            <option value="admin">Admin</option>
                            <option value="operator">Operator</option>
                            <option value="viewer">Viewer</option>
                          </select>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => handleRoleChange(member)}
                            data-testid={`role-save-${member.id}`}
                          >
                            Save role
                          </button>
                        </div>
                      ) : (
                        member.role
                      )}
                    </td>
                    <td>{formatDateTime(member.joinedAt || member.invitedAt)}</td>
                    <td>
                      {canDeactivate ? (
                        <button
                          type="button"
                          className="ghost-danger-button"
                          onClick={() => handleDeactivate(member)}
                          data-testid={`deactivate-${member.id}`}
                        >
                          Deactivate
                        </button>
                      ) : (
                        <span className="muted">No actions</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </PageShell>
  );
}

function WorkspacesPage() {
  const api = useApi();
  const { session, updateSessionEntity } = useWorkspace();
  const sessionOptions = useSessionRequestOptions();
  const permissions = usePermissions();
  const canView = permissions.hasAny(['workspace.read', 'workspace.manage']);
  const canEdit = permissions.has('workspace.manage');
  const [flash, setFlash] = useState(null);
  const [form, setForm] = useState({ name: '', slug: '', timezone: '', settingsJsonText: '{}' });
  const [state] = usePageData(async () => {
    const workspace = await api.getWorkspace(sessionOptions, session.currentWorkspace.id);
    setForm({
      name: workspace.name || '',
      slug: workspace.slug || '',
      timezone: workspace.timezone || 'Asia/Bangkok',
      settingsJsonText: safeJsonStringify(workspace.settingsJson)
    });
    return workspace;
  }, [api, session.currentWorkspace?.id, sessionOptions], canView);

  if (!canView) {
    return <PermissionNotice title="Workspace settings unavailable" message="Workspace page requires workspace.read or workspace.manage." />;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    try {
      const updated = await api.updateWorkspace(sessionOptions, session.currentWorkspace.id, {
        name: form.name,
        slug: form.slug,
        timezone: form.timezone,
        settings_json: normalizeJsonInput(form.settingsJsonText, 'settings_json')
      });
      updateSessionEntity('currentWorkspace', updated);
      setFlash({ kind: 'success', message: 'Workspace settings updated.' });
    } catch (error) {
      setFlash({ kind: 'error', message: describeError(error) });
    }
  }

  return (
    <PageShell title="Workspaces" intro="Manage metadata and JSON settings for the active workspace.">
      <StatusBanner state={flash} />
      {state.status === 'loading' || state.status === 'idle' ? <LoadingCard label="Loading workspace settings…" /> : null}
      {state.status === 'error' ? <ErrorCard error={state.error} /> : null}
      {state.status === 'ready' ? (
        <section className="section-card">
          <form className="form-grid" onSubmit={handleSubmit} data-testid="workspace-form">
            <label className="field">
              <span>Name</span>
              <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label className="field">
              <span>Slug</span>
              <input value={form.slug} onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))} />
            </label>
            <label className="field">
              <span>Timezone</span>
              <input value={form.timezone} onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))} />
            </label>
            <label className="field field-span-2">
              <span>settings_json</span>
              <textarea
                rows="10"
                value={form.settingsJsonText}
                onChange={(event) => setForm((current) => ({ ...current, settingsJsonText: event.target.value }))}
              />
            </label>
            {canEdit ? (
              <div className="inline-actions field-span-2">
                <button type="submit" className="primary-button" data-testid="workspace-save">
                  Save workspace
                </button>
              </div>
            ) : (
              <p className="muted field-span-2">You can view workspace configuration but cannot edit it.</p>
            )}
          </form>
        </section>
      ) : null}
    </PageShell>
  );
}

function createStarterFlowDefinition(name = 'New Visual Flow') {
  return {
    name,
    flowType: 'visual_builder',
    status: 'draft',
    nodes: [
      {
        id: 'trigger-1',
        type: 'trigger',
        position: { x: 60, y: 160 },
        config: { eventName: 'lead.created', entityType: 'lead' }
      },
      {
        id: 'action-1',
        type: 'action',
        position: { x: 340, y: 160 },
        config: { actionType: 'create_task', title: 'Follow up new lead' }
      }
    ],
    edges: [
      {
        id: 'edge-1',
        source: 'trigger-1',
        target: 'action-1'
      }
    ]
  };
}

function validateVisualFlow(definition) {
  const nodes = Array.isArray(definition?.nodes) ? definition.nodes : [];
  const edges = Array.isArray(definition?.edges) ? definition.edges : [];
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const outgoing = new Map(nodes.map((node) => [node.id, []]));
  const incoming = new Map(nodes.map((node) => [node.id, 0]));
  const errors = [];

  edges.forEach((edge) => {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) {
      errors.push('ทุก edge ต้องชี้ไปยัง node ที่มีอยู่จริง');
      return;
    }

    outgoing.get(edge.source).push(edge.target);
    incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1);
  });

  const triggerNodes = nodes.filter((node) => node.type === 'trigger');
  const actionNodes = nodes.filter((node) => node.type === 'action');

  if (triggerNodes.length !== 1) {
    errors.push('Flow ต้องมี trigger node เท่ากับ 1 ตัว');
  }

  if (actionNodes.length < 1) {
    errors.push('Flow ต้องมี action node อย่างน้อย 1 ตัว');
  }

  if (triggerNodes.length === 1) {
    const visited = new Set();
    const stack = [triggerNodes[0].id];

    while (stack.length > 0) {
      const current = stack.pop();

      if (visited.has(current)) {
        continue;
      }

      visited.add(current);
      (outgoing.get(current) || []).forEach((target) => {
        if (!visited.has(target)) {
          stack.push(target);
        }
      });
    }

    if (visited.size !== nodes.length) {
      errors.push('Flow ต้องไม่มี node ที่ disconnected');
    }

    const queue = [];
    const indegree = new Map(incoming);
    nodes.forEach((node) => {
      if ((indegree.get(node.id) || 0) === 0) {
        queue.push(node.id);
      }
    });

    let processed = 0;
    while (queue.length > 0) {
      const current = queue.shift();
      processed += 1;
      (outgoing.get(current) || []).forEach((target) => {
        const nextValue = (indegree.get(target) || 0) - 1;
        indegree.set(target, nextValue);
        if (nextValue === 0) {
          queue.push(target);
        }
      });
    }

    if (processed !== nodes.length) {
      errors.push('Flow ต้องไม่มี circular loop');
    }
  }

  return errors;
}

function buildNodeLabel(node) {
  if (node.type === 'trigger') {
    return node.config?.eventName || 'Trigger';
  }

  if (node.type === 'action') {
    return node.config?.actionType || 'Action';
  }

  if (node.type === 'delay') {
    return `${node.config?.delayMinutes || 1} min`;
  }

  return `${node.config?.field || 'Condition'} ${node.config?.operator || ''}`.trim();
}

function BuilderNodeCard({ node, selected, onSelect }) {
  return (
    <button
      type="button"
      className={`builder-node builder-node-${node.type}${selected ? ' selected' : ''}`}
      style={{ left: `${node.position.x}px`, top: `${node.position.y}px` }}
      onClick={() => onSelect(node.id)}
      data-testid={`builder-node-${node.id}`}
    >
      <span className="builder-node-type">{node.type}</span>
      <strong>{buildNodeLabel(node)}</strong>
    </button>
  );
}

function FlowBuilderPage({ flowId }) {
  const api = useApi();
  const sessionOptions = useSessionRequestOptions();
  const permissions = usePermissions();
  const canManage = permissions.has('automation.manage');
  const canView = permissions.hasAny(['automation.read', 'automation.manage']);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [flash, setFlash] = useState(null);
  const [builderState, setBuilderState] = useState({ status: 'idle', flow: null, versions: [], definition: null, activeVersionId: null, error: null });
  const [edgeDraft, setEdgeDraft] = useState({ source: '', target: '' });

  useEffect(() => {
    if (!canView) {
      return undefined;
    }

    let active = true;

    async function load() {
      setBuilderState((current) => ({ ...current, status: 'loading', error: null }));

      try {
        const [flow, versions] = await Promise.all([
          api.listAutomationFlows(sessionOptions).then((payload) => payload.items.find((item) => item.id === flowId) || null),
          api.listAutomationFlowVersions(sessionOptions, flowId)
        ]);
        const latestVersion = versions.items[0] || null;
        const definition = latestVersion
          ? (await api.getAutomationFlowVersion(sessionOptions, flowId, latestVersion.id)).definitionJson
          : createStarterFlowDefinition(flow?.name || `Flow ${flowId}`);

        if (!active) {
          return;
        }

        setBuilderState({
          status: 'ready',
          flow,
          versions: versions.items,
          definition,
          activeVersionId: latestVersion?.id || null,
          error: null
        });
        setSelectedNodeId(definition.nodes?.[0]?.id || null);
      } catch (error) {
        if (active) {
          setBuilderState({ status: 'error', flow: null, versions: [], definition: null, activeVersionId: null, error });
        }
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [api, canView, flowId, sessionOptions]);

  const selectedNode = builderState.definition?.nodes?.find((node) => node.id === selectedNodeId) || null;
  const validationErrors = builderState.definition ? validateVisualFlow(builderState.definition) : [];

  function updateDefinition(mutator) {
    setBuilderState((current) => {
      if (!current.definition) {
        return current;
      }

      return {
        ...current,
        definition: mutator(current.definition)
      };
    });
  }

  function addNode(type) {
    const nextId = `${type}-${Date.now()}`;
    updateDefinition((definition) => {
      const nextNode = {
        id: nextId,
        type,
        position: { x: 120 + definition.nodes.length * 110, y: 120 + (definition.nodes.length % 3) * 90 },
        config: type === 'trigger'
          ? { eventName: 'lead.created', entityType: 'lead' }
          : type === 'action'
            ? { actionType: 'create_task', title: 'New action' }
            : type === 'delay'
              ? { delayMinutes: 5 }
              : { field: 'stage', operator: 'equals', value: 'inquiry' }
      };

      return {
        ...definition,
        nodes: [...definition.nodes, nextNode]
      };
    });
    setSelectedNodeId(nextId);
  }

  async function saveDraft() {
    if (!canManage) {
      return;
    }

    if (validationErrors.length > 0) {
      setFlash({ kind: 'error', message: validationErrors.join(', ') });
      return;
    }

    try {
      const version = await api.saveAutomationFlowVersion(sessionOptions, flowId, builderState.definition);
      const versions = await api.listAutomationFlowVersions(sessionOptions, flowId);
      setBuilderState((current) => ({
        ...current,
        versions: versions.items,
        activeVersionId: version.id
      }));
      setFlash({ kind: 'success', message: `บันทึก draft v${version.versionNumber} แล้ว` });
    } catch (error) {
      setFlash({ kind: 'error', message: describeError(error) });
    }
  }

  async function publishVersion(versionId) {
    if (!canManage) {
      return;
    }

    try {
      const flow = await api.publishAutomationFlowVersion(sessionOptions, flowId, versionId);
      const versions = await api.listAutomationFlowVersions(sessionOptions, flowId);
      setBuilderState((current) => ({
        ...current,
        flow,
        versions: versions.items
      }));
      setFlash({ kind: 'success', message: `Publish version ${versionId} แล้ว` });
    } catch (error) {
      setFlash({ kind: 'error', message: describeError(error) });
    }
  }

  async function loadVersion(versionId) {
    try {
      const version = await api.getAutomationFlowVersion(sessionOptions, flowId, versionId);
      setBuilderState((current) => ({
        ...current,
        definition: version.definitionJson,
        activeVersionId: versionId
      }));
      setSelectedNodeId(version.definitionJson.nodes?.[0]?.id || null);
    } catch (error) {
      setFlash({ kind: 'error', message: describeError(error) });
    }
  }

  if (!canView) {
    return <PermissionNotice title="Builder unavailable" message="Automation builder requires automation.read or automation.manage." />;
  }

  if (builderState.status === 'loading' || builderState.status === 'idle') {
    return <LoadingCard label="Loading flow builder…" />;
  }

  if (builderState.status === 'error') {
    return <ErrorCard error={builderState.error} />;
  }

  const contextValue = {
    definition: builderState.definition,
    selectedNode,
    setSelectedNodeId,
    updateDefinition
  };

  return (
    <FlowBuilderContext.Provider value={contextValue}>
      <PageShell
        title={`Flow Builder #${flowId}`}
        intro="สร้าง flow แบบ node-based, บันทึก draft version, และ publish version ที่ต้องการใช้งานจริง"
        actions={(
          <>
            <button type="button" className="secondary-button" onClick={() => navigateTo('automation')}>Back</button>
            {canManage ? <button type="button" className="primary-button" onClick={saveDraft} data-testid="builder-save-draft">Save draft</button> : null}
          </>
        )}
      >
        <StatusBanner state={flash} />
        <div className="three-column-layout">
          <section className="section-card">
            <div className="split-header compact-gap">
              <div>
                <h3 className="section-heading">Canvas</h3>
                <p className="muted">Node editor สำหรับ trigger, condition, action, และ delay</p>
              </div>
              <div className="toolbar">
                <button type="button" className="secondary-button" onClick={() => addNode('action')}>Add action</button>
                <button type="button" className="secondary-button" onClick={() => addNode('condition')}>Add condition</button>
                <button type="button" className="secondary-button" onClick={() => addNode('delay')}>Add delay</button>
              </div>
            </div>
            <div className="builder-canvas" data-testid="builder-canvas">
              {builderState.definition.edges.map((edge) => (
                <div key={edge.id} className="builder-edge-label">{edge.source} {'->'} {edge.target}</div>
              ))}
              {builderState.definition.nodes.map((node) => (
                <BuilderNodeCard key={node.id} node={node} selected={selectedNodeId === node.id} onSelect={setSelectedNodeId} />
              ))}
            </div>
            <div className="inline-form">
              <select value={edgeDraft.source} onChange={(event) => setEdgeDraft((current) => ({ ...current, source: event.target.value }))}>
                <option value="">From node</option>
                {builderState.definition.nodes.map((node) => <option key={node.id} value={node.id}>{node.id}</option>)}
              </select>
              <select value={edgeDraft.target} onChange={(event) => setEdgeDraft((current) => ({ ...current, target: event.target.value }))}>
                <option value="">To node</option>
                {builderState.definition.nodes.map((node) => <option key={node.id} value={node.id}>{node.id}</option>)}
              </select>
              <button
                type="button"
                className="secondary-button"
                onClick={() => updateDefinition((definition) => ({
                  ...definition,
                  edges: [...definition.edges, { id: `edge-${Date.now()}`, source: edgeDraft.source, target: edgeDraft.target }]
                }))}
              >
                Connect
              </button>
            </div>
          </section>
          <section className="section-card">
            <h3 className="section-heading">Node Config</h3>
            {selectedNode ? (
              <div className="form-grid">
                <label className="field">
                  <span>Label</span>
                  <input value={buildNodeLabel(selectedNode)} readOnly />
                </label>
                <label className="field">
                  <span>X</span>
                  <input
                    value={selectedNode.position.x}
                    onChange={(event) => updateDefinition((definition) => ({
                      ...definition,
                      nodes: definition.nodes.map((node) => node.id === selectedNode.id ? { ...node, position: { ...node.position, x: Number(event.target.value || 0) } } : node)
                    }))}
                  />
                </label>
                <label className="field">
                  <span>Y</span>
                  <input
                    value={selectedNode.position.y}
                    onChange={(event) => updateDefinition((definition) => ({
                      ...definition,
                      nodes: definition.nodes.map((node) => node.id === selectedNode.id ? { ...node, position: { ...node.position, y: Number(event.target.value || 0) } } : node)
                    }))}
                  />
                </label>
                <label className="field field-span-2">
                  <span>config JSON</span>
                  <textarea
                    rows="12"
                    value={safeJsonStringify(selectedNode.config)}
                    onChange={(event) => {
                      try {
                        const nextConfig = normalizeJsonInput(event.target.value, 'config JSON');
                        updateDefinition((definition) => ({
                          ...definition,
                          nodes: definition.nodes.map((node) => node.id === selectedNode.id ? { ...node, config: nextConfig } : node)
                        }));
                      } catch (error) {
                        setFlash({ kind: 'error', message: error.message });
                      }
                    }}
                  />
                </label>
                <div className="inline-actions field-span-2">
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => updateDefinition((definition) => ({
                      ...definition,
                      nodes: definition.nodes.filter((node) => node.id !== selectedNode.id),
                      edges: definition.edges.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id)
                    }))}
                  >
                    Delete node
                  </button>
                </div>
              </div>
            ) : <p className="muted">เลือก node จาก canvas เพื่อแก้ config</p>}
            {validationErrors.length > 0 ? (
              <div className="notice-card error-card" data-testid="builder-validation-errors">
                {validationErrors.map((error) => <p key={error} className="muted">{error}</p>)}
              </div>
            ) : (
              <div className="notice-card"><p className="muted">Validation ผ่าน</p></div>
            )}
          </section>
          <section className="section-card">
            <h3 className="section-heading">Version History</h3>
            <ul className="stack-list" data-testid="version-history">
              {builderState.versions.map((version) => (
                <li key={version.id} className="stack-item">
                  <strong>v{version.versionNumber}</strong>
                  <span className="muted">{formatDateTime(version.createdAt)}</span>
                  <span className={`pill status-${version.isPublished ? 'active' : 'draft'}`}>{version.isPublished ? 'published' : 'draft'}</span>
                  <div className="inline-actions">
                    <button type="button" className="secondary-button" onClick={() => loadVersion(version.id)}>Open</button>
                    {canManage && !version.isPublished ? <button type="button" className="primary-button" onClick={() => publishVersion(version.id)}>Publish</button> : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </PageShell>
    </FlowBuilderContext.Provider>
  );
}

function ExecutionDebuggerPage({ executionId }) {
  const api = useApi();
  const sessionOptions = useSessionRequestOptions();
  const permissions = usePermissions();
  const canView = permissions.hasAny(['automation.read', 'automation.manage']);
  const [selectedStepId, setSelectedStepId] = useState(null);
  const [state] = usePageData(async () => {
    const [execution, steps] = await Promise.all([
      api.getAutomationExecution(sessionOptions, executionId),
      api.getAutomationExecutionSteps(sessionOptions, executionId)
    ]);

    return { execution, steps: steps.items };
  }, [api, executionId, sessionOptions], canView);

  if (!canView) {
    return <PermissionNotice title="Execution debugger unavailable" message="Execution debugger requires automation.read or automation.manage." />;
  }

  if (state.status === 'loading' || state.status === 'idle') {
    return <LoadingCard label="Loading execution debugger…" />;
  }

  if (state.status === 'error') {
    return <ErrorCard error={state.error} />;
  }

  const selectedStep = state.data.steps.find((step) => step.step_execution_id === selectedStepId) || state.data.steps[0] || null;

  return (
    <ExecutionDebuggerContext.Provider value={{ execution: state.data.execution, steps: state.data.steps, selectedStep, setSelectedStepId }}>
      <PageShell
        title={`Execution Debugger #${executionId}`}
        intro="ดู timeline ของ execution, ข้อมูล input/output, error และระยะเวลาของแต่ละ step"
        actions={<button type="button" className="secondary-button" onClick={() => navigateTo('automation')}>Back</button>}
      >
        <div className="two-column-grid">
          <section className="section-card">
            <h3 className="section-heading">Step Timeline</h3>
            <ul className="timeline-list" data-testid="execution-step-timeline">
              {state.data.steps.map((step) => (
                <li
                  key={step.step_execution_id}
                  className={`timeline-item${selectedStep?.step_execution_id === step.step_execution_id ? ' active' : ''}`}
                  onClick={() => setSelectedStepId(step.step_execution_id)}
                >
                  <strong>{step.step_type}</strong>
                  <span className={`pill status-${step.status}`}>{step.status}</span>
                  <span className="muted">{step.duration === null ? '-' : `${step.duration} ms`}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="section-card">
            <h3 className="section-heading">Step Details</h3>
            {selectedStep ? (
              <div className="detail-panel" data-testid="execution-step-details">
                <p><strong>Step ID:</strong> {selectedStep.step_id}</p>
                <p><strong>Status:</strong> {selectedStep.status}</p>
                <p><strong>Duration:</strong> {selectedStep.duration === null ? '-' : `${selectedStep.duration} ms`}</p>
                <label className="field">
                  <span>Input</span>
                  <textarea rows="8" readOnly value={safeJsonStringify(selectedStep.input_data)} />
                </label>
                <label className="field">
                  <span>Output</span>
                  <textarea rows="8" readOnly value={safeJsonStringify(selectedStep.output_data)} />
                </label>
                <label className="field">
                  <span>Error</span>
                  <textarea rows="6" readOnly value={selectedStep.error ? JSON.stringify(selectedStep.error, null, 2) : ''} />
                </label>
              </div>
            ) : <p className="muted">ไม่มี step execution สำหรับ execution นี้</p>}
          </section>
        </div>
      </PageShell>
    </ExecutionDebuggerContext.Provider>
  );
}

function SettingsPage() {
  const api = useApi();
  const { session, updateSessionEntity } = useWorkspace();
  const sessionOptions = useSessionRequestOptions();
  const permissions = usePermissions();
  const canReadTenant = permissions.hasAny(['tenant.read', 'tenant.manage']);
  const canManageTenant = permissions.has('tenant.manage');
  const canReadOrganization = permissions.hasAny(['organization.read', 'organization.manage']);
  const canManageOrganization = permissions.has('organization.manage');
  const canView = canReadTenant || canReadOrganization;
  const [flash, setFlash] = useState(null);
  const [tenantForm, setTenantForm] = useState({ timezone: '', locale: '', brandingJsonText: '{}', settingsJsonText: '{}' });
  const [organizationForm, setOrganizationForm] = useState({ name: '', slug: '', timezone: '', settingsJsonText: '{}' });
  const [state] = usePageData(async () => {
    const [tenant, organization] = await Promise.all([
      canReadTenant ? api.getTenantSettings(sessionOptions) : Promise.resolve(null),
      canReadOrganization ? api.getOrganization(sessionOptions, session.currentOrganization.id) : Promise.resolve(null)
    ]);

    if (tenant) {
      setTenantForm({
        timezone: tenant.timezone || 'Asia/Bangkok',
        locale: tenant.locale || 'th-TH',
        brandingJsonText: safeJsonStringify(tenant.brandingJson),
        settingsJsonText: safeJsonStringify(tenant.settingsJson)
      });
    }

    if (organization) {
      setOrganizationForm({
        name: organization.name || '',
        slug: organization.slug || '',
        timezone: organization.timezone || 'Asia/Bangkok',
        settingsJsonText: safeJsonStringify(organization.settingsJson)
      });
    }

    return { tenant, organization };
  }, [api, canReadOrganization, canReadTenant, session.currentOrganization?.id, sessionOptions], canView);

  if (!canView) {
    return <PermissionNotice title="Settings unavailable" message="Settings require tenant or organization read access." />;
  }

  async function handleTenantSubmit(event) {
    event.preventDefault();

    try {
      const updated = await api.updateTenantSettings(sessionOptions, {
        timezone: tenantForm.timezone,
        locale: tenantForm.locale,
        branding_json: normalizeJsonInput(tenantForm.brandingJsonText, 'branding_json'),
        settings_json: normalizeJsonInput(tenantForm.settingsJsonText, 'settings_json')
      });
      updateSessionEntity('currentClinic', updated);
      setFlash({ kind: 'success', message: 'Tenant settings updated.' });
    } catch (error) {
      setFlash({ kind: 'error', message: describeError(error) });
    }
  }

  async function handleOrganizationSubmit(event) {
    event.preventDefault();

    try {
      const updated = await api.updateOrganization(sessionOptions, session.currentOrganization.id, {
        name: organizationForm.name,
        slug: organizationForm.slug,
        timezone: organizationForm.timezone,
        settings_json: normalizeJsonInput(organizationForm.settingsJsonText, 'settings_json')
      });
      updateSessionEntity('currentOrganization', updated);
      setFlash({ kind: 'success', message: 'Organization settings updated.' });
    } catch (error) {
      setFlash({ kind: 'error', message: describeError(error) });
    }
  }

  return (
    <PageShell title="Settings" intro="Manage tenant branding, locale, and organization-level configuration.">
      <StatusBanner state={flash} />
      {state.status === 'loading' || state.status === 'idle' ? <LoadingCard label="Loading settings…" /> : null}
      {state.status === 'error' ? <ErrorCard error={state.error} /> : null}
      {state.status === 'ready' ? (
        <div className="two-column-grid">
          {state.data.tenant ? (
            <section className="section-card">
              <h3 className="section-heading">Tenant settings</h3>
              <form className="form-grid" onSubmit={handleTenantSubmit} data-testid="tenant-settings-form">
                <label className="field">
                  <span>Timezone</span>
                  <input
                    value={tenantForm.timezone}
                    onChange={(event) => setTenantForm((current) => ({ ...current, timezone: event.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Locale</span>
                  <input
                    value={tenantForm.locale}
                    onChange={(event) => setTenantForm((current) => ({ ...current, locale: event.target.value }))}
                  />
                </label>
                <label className="field field-span-2">
                  <span>branding_json</span>
                  <textarea
                    rows="7"
                    value={tenantForm.brandingJsonText}
                    onChange={(event) => setTenantForm((current) => ({ ...current, brandingJsonText: event.target.value }))}
                    data-testid="tenant-branding-json"
                  />
                </label>
                <label className="field field-span-2">
                  <span>settings_json</span>
                  <textarea
                    rows="7"
                    value={tenantForm.settingsJsonText}
                    onChange={(event) => setTenantForm((current) => ({ ...current, settingsJsonText: event.target.value }))}
                  />
                </label>
                {canManageTenant ? (
                  <div className="inline-actions field-span-2">
                    <button type="submit" className="primary-button" data-testid="tenant-settings-save">
                      Save tenant settings
                    </button>
                  </div>
                ) : null}
              </form>
            </section>
          ) : null}
          {state.data.organization ? (
            <section className="section-card">
              <h3 className="section-heading">Organization settings</h3>
              <form className="form-grid" onSubmit={handleOrganizationSubmit} data-testid="organization-settings-form">
                <label className="field">
                  <span>Name</span>
                  <input
                    value={organizationForm.name}
                    onChange={(event) => setOrganizationForm((current) => ({ ...current, name: event.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Slug</span>
                  <input
                    value={organizationForm.slug}
                    onChange={(event) => setOrganizationForm((current) => ({ ...current, slug: event.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Timezone</span>
                  <input
                    value={organizationForm.timezone}
                    onChange={(event) => setOrganizationForm((current) => ({ ...current, timezone: event.target.value }))}
                  />
                </label>
                <label className="field field-span-2">
                  <span>settings_json</span>
                  <textarea
                    rows="8"
                    value={organizationForm.settingsJsonText}
                    onChange={(event) => setOrganizationForm((current) => ({ ...current, settingsJsonText: event.target.value }))}
                  />
                </label>
                {canManageOrganization ? (
                  <div className="inline-actions field-span-2">
                    <button type="submit" className="primary-button">
                      Save organization settings
                    </button>
                  </div>
                ) : null}
              </form>
            </section>
          ) : null}
        </div>
      ) : null}
    </PageShell>
  );
}

function AutomationPage() {
  const api = useApi();
  const sessionOptions = useSessionRequestOptions();
  const permissions = usePermissions();
  const canView = permissions.hasAny(['automation.read', 'automation.manage']);
  const canManage = permissions.has('automation.manage');
  const [flash, setFlash] = useState(null);
  const [state] = usePageData(async () => {
    const [flows, executions, failedExecutions, tasks] = await Promise.all([
      api.listAutomationFlows(sessionOptions),
      api.listAutomationExecutions(sessionOptions, { limit: 10 }),
      api.listAutomationExecutions(sessionOptions, { status: 'failed', limit: 10 }),
      api.listAutomationTasks(sessionOptions, { limit: 10 })
    ]);

    return { flows, executions, failedExecutions, tasks };
  }, [api, sessionOptions], canView);

  if (!canView) {
    return <PermissionNotice title="Automation unavailable" message="Automation page requires automation.read or automation.manage." />;
  }

  if (state.status === 'loading' || state.status === 'idle') {
    return <LoadingCard label="Loading automation status…" />;
  }

  if (state.status === 'error') {
    return <ErrorCard error={state.error} />;
  }

  const { flows, executions, failedExecutions, tasks } = state.data;

  async function createFlow() {
    try {
      const created = await api.createAutomationBuilderFlow(sessionOptions, createStarterFlowDefinition(`Visual Flow ${Date.now()}`));
      navigateTo(`automation/builder/${created.id}`);
    } catch (error) {
      setFlash({ kind: 'error', message: describeError(error) });
    }
  }

  return (
    <PageShell
      title="Automation"
      intro="Monitor flows, execution history, and failed automations for the active tenant."
      actions={canManage ? <button type="button" className="primary-button" onClick={createFlow}>New visual flow</button> : null}
    >
      <StatusBanner state={flash} />
      <div className="metric-grid">
        <MetricCard label="Flows" value={formatNumber(flows.items.length)} hint="Configured automation flows" />
        <MetricCard label="Recent executions" value={formatNumber(executions.items.length)} hint="Latest execution records" />
        <MetricCard label="Failed executions" value={formatNumber(failedExecutions.items.length)} hint="Failures in current view" />
      </div>
      <div className="two-column-grid">
        <section className="section-card">
          <h3 className="section-heading">Flow list</h3>
          <ul className="stack-list" data-testid="flow-list">
            {flows.items.map((flow) => (
              <li key={flow.id} className="stack-item">
                <strong>{flow.name}</strong>
                <span className="muted">{flow.flowType} / {flow.triggerType}</span>
                <span className={`pill status-${flow.status}`}>{flow.status}</span>
                <div className="inline-actions">
                  <button type="button" className="secondary-button" onClick={() => navigateTo(`automation/builder/${flow.id}`)}>
                    Open builder
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
        <section className="section-card">
          <h3 className="section-heading">Execution history</h3>
          <ul className="stack-list" data-testid="execution-history">
            {executions.items.map((execution) => (
              <li key={execution.id} className="stack-item">
                <strong>{execution.flowName}</strong>
                <span className={`pill status-${execution.status}`}>{execution.status}</span>
                <span className="muted">{formatDateTime(execution.createdAt)}</span>
                <div className="inline-actions">
                  <button type="button" className="secondary-button" onClick={() => navigateTo(`automation/executions/${execution.id}`)}>
                    Debug
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <section className="section-card">
        <h3 className="section-heading">Open automation tasks</h3>
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Last error</th>
              </tr>
            </thead>
            <tbody>
              {tasks.items.map((task) => (
                <tr key={task.id}>
                  <td>{task.title}</td>
                  <td>{task.status}</td>
                  <td>{task.attemptCount} / {task.maxAttempts}</td>
                  <td>{task.lastError || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </PageShell>
  );
}

function AuditLogsPage() {
  const api = useApi();
  const sessionOptions = useSessionRequestOptions();
  const permissions = usePermissions();
  const canView = permissions.has('audit.read');
  const [filters, setFilters] = useState({ entityType: '', actionType: '', from: '', to: '', limit: '50' });
  const [state, setState] = useState({ status: 'idle', data: null, error: null });

  useEffect(() => {
    if (!canView) {
      return undefined;
    }

    let active = true;

    async function load() {
      setState({ status: 'loading', data: null, error: null });

      try {
        const data = await api.listAuditLogs(sessionOptions, filters);

        if (active) {
          setState({ status: 'ready', data, error: null });
        }
      } catch (error) {
        if (active) {
          setState({ status: 'error', data: null, error });
        }
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [api, canView, filters, sessionOptions]);

  if (!canView) {
    return <PermissionNotice title="Audit logs unavailable" message="Audit log viewer requires audit.read permission." />;
  }

  return (
    <PageShell title="Audit Logs" intro="Filter recent tenant activity by entity, action, and time range.">
      <section className="section-card">
        <form className="form-grid" data-testid="audit-filter-form">
          <label className="field">
            <span>Entity</span>
            <input value={filters.entityType} onChange={(event) => setFilters((current) => ({ ...current, entityType: event.target.value }))} />
          </label>
          <label className="field">
            <span>Action</span>
            <input value={filters.actionType} onChange={(event) => setFilters((current) => ({ ...current, actionType: event.target.value }))} />
          </label>
          <label className="field">
            <span>From</span>
            <input type="datetime-local" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} />
          </label>
          <label className="field">
            <span>To</span>
            <input type="datetime-local" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} />
          </label>
        </form>
      </section>
      {state.status === 'loading' || state.status === 'idle' ? <LoadingCard label="Loading audit events…" /> : null}
      {state.status === 'error' ? <ErrorCard error={state.error} /> : null}
      {state.status === 'ready' ? (
        <section className="section-card">
          <div className="table-shell">
            <table className="data-table" data-testid="audit-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Actor</th>
                </tr>
              </thead>
              <tbody>
                {state.data.items.map((item) => (
                  <tr key={item.id}>
                    <td>{formatDateTime(item.createdAt)}</td>
                    <td>{item.actionType}</td>
                    <td>{item.entityType} #{item.entityId}</td>
                    <td>{item.actorUserId || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </PageShell>
  );
}

function SystemHealthPage() {
  const api = useApi();
  const sessionOptions = useSessionRequestOptions();
  const permissions = usePermissions();
  const canView = permissions.hasAny(['automation.read', 'automation.manage', 'audit.read']);
  const canRetry = permissions.has('automation.manage');
  const [flash, setFlash] = useState(null);
  const [state, setState] = usePageData(() => api.getSystemHealth(sessionOptions), [api, sessionOptions], canView);

  if (!canView) {
    return <PermissionNotice title="System health unavailable" message="System health requires automation or audit visibility." />;
  }

  async function retryJob(jobId) {
    try {
      await api.retryWorkerJob(sessionOptions, jobId);
      setFlash({ kind: 'success', message: `Queued retry for worker job ${jobId}.` });
      const data = await api.getSystemHealth(sessionOptions);
      setState({ status: 'ready', data, error: null });
    } catch (error) {
      setFlash({ kind: 'error', message: describeError(error) });
    }
  }

  return (
    <PageShell title="System Health" intro="Operator view of workers, throughput, failed jobs, and retry controls.">
      <StatusBanner state={flash} />
      {state.status === 'loading' || state.status === 'idle' ? <LoadingCard label="Loading operational metrics…" /> : null}
      {state.status === 'error' ? <ErrorCard error={state.error} /> : null}
      {state.status === 'ready' ? (
        <>
          <div className="metric-grid">
            <MetricCard label="Queue depth" value={formatNumber(state.data.worker.queueDepth)} hint="Pending due worker jobs" />
            <MetricCard label="Execution rate/hr" value={formatNumber(state.data.automation.executionRatePerHour)} hint="Avg automation throughput" />
            <MetricCard label="Event throughput/hr" value={formatNumber(state.data.eventBus.throughputPerHour)} hint="Event bus throughput" />
          </div>
          <section className="section-card">
            <div className="split-header compact-gap">
              <div>
                <h3 className="section-heading">Recent failures</h3>
                <p className="muted">Most recent failed worker jobs for the active tenant.</p>
              </div>
              <span className={`pill status-${state.data.systemStatus}`}>{state.data.systemStatus}</span>
            </div>
            <div className="table-shell">
              <table className="data-table" data-testid="recent-failures-table">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Status</th>
                    <th>Attempts</th>
                    <th>Error</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {state.data.recentFailures.map((failure) => (
                    <tr key={failure.id}>
                      <td>{failure.jobType}</td>
                      <td>{failure.status}</td>
                      <td>{failure.attempts} / {failure.maxAttempts}</td>
                      <td>{failure.lastError || '-'}</td>
                      <td>
                        {canRetry ? (
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => retryJob(failure.id)}
                            data-testid={`retry-job-${failure.id}`}
                          >
                            Retry
                          </button>
                        ) : (
                          <span className="muted">Read only</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </PageShell>
  );
}

function UnifiedInboxPage() {
  const api = useApi();
  const sessionOptions = useSessionRequestOptions();
  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [channelType, setChannelType] = useState('line');
  const [inputText, setInputText] = useState('');
  const [suggestion, setSuggestion] = useState(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [flash, setFlash] = useState(null);
  const messageEndRef = useRef(null);

  // Poll threads and active messages
  useEffect(() => {
    let active = true;
    async function fetchThreads() {
      if (!active) return;
      try {
        const payload = await api.listChats(sessionOptions);
        setThreads(payload.items || []);
      } catch (err) {
        console.error("Error fetching threads:", err);
      }
    }
    
    setLoadingThreads(true);
    fetchThreads().finally(() => setLoadingThreads(false));

    const interval = setInterval(fetchThreads, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [api, sessionOptions]);

  // Fetch messages when activeThreadId changes
  useEffect(() => {
    if (!activeThreadId) {
      setMessages([]);
      return;
    }

    let active = true;
    async function fetchMessages() {
      try {
        const payload = await api.getChatMessages(sessionOptions, activeThreadId);
        if (active) {
          setMessages(payload.messages || []);
          setChannelType(payload.channelType || 'line');
        }
      } catch (err) {
        console.error("Error fetching messages:", err);
      }
    }

    setLoadingMessages(true);
    fetchMessages().finally(() => setLoadingMessages(false));

    const interval = setInterval(fetchMessages, 4000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [activeThreadId, api, sessionOptions]);

  // Fetch AI suggestion when last lead message changes or when new lead is selected
  useEffect(() => {
    if (!activeThreadId || messages.length === 0) {
      setSuggestion(null);
      return;
    }

    // Find last message from lead
    const leadMessages = messages.filter(m => m.senderType === 'lead');
    if (leadMessages.length === 0) {
      setSuggestion(null);
      return;
    }
    const lastLeadMsg = leadMessages[leadMessages.length - 1];
    
    // Find the thread details to get leadId
    const thread = threads.find(t => t.id === activeThreadId);
    if (!thread || !thread.leadId) return;

    let active = true;
    async function getSuggestion() {
      setLoadingSuggestion(true);
      try {
        const payload = await api.getAiCopilotSuggestion(sessionOptions, thread.leadId, lastLeadMsg.messageText);
        if (active) {
          setSuggestion(payload);
        }
      } catch (err) {
        console.error("Error fetching AI suggestion:", err);
        if (active) setSuggestion(null);
      } finally {
        if (active) setLoadingSuggestion(false);
      }
    }

    getSuggestion();
    return () => {
      active = false;
    };
  }, [activeThreadId, messages, threads, api, sessionOptions]);

  // Scroll to bottom of messages
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendOverride = async (textToSend) => {
    const text = textToSend || inputText;
    if (!text.trim() || !activeThreadId) return;

    try {
      await api.sendChatMessage(sessionOptions, activeThreadId, { messageText: text });
      setInputText('');
      
      // Instantly refresh messages
      const payload = await api.getChatMessages(sessionOptions, activeThreadId);
      setMessages(payload.messages || []);
    } catch (err) {
      setFlash({ kind: 'error', message: err.message || 'Failed to send message' });
    }
  };

  const activeThread = threads.find(t => t.id === activeThreadId);

  // Render elements in rich content standard formatting
  const renderRichContent = (richContent) => {
    if (!richContent) return null;
    if (richContent.type === 'text') {
      return <p className="msg-text">{richContent.text}</p>;
    }
    if (richContent.type === 'flex' || richContent.type === 'generic_template') {
      return (
        <div className="rich-card">
          {richContent.imageUrl && (
            <img src={richContent.imageUrl} alt="Promo" className="rich-card-img" />
          )}
          <h4 className="rich-card-title">{richContent.text || 'Special Offer'}</h4>
          {richContent.elements && richContent.elements.map((el, i) => (
            <div key={i} className="rich-card-element">
              {el.type === 'text' ? (
                <p className="rich-card-el-text">{el.text}</p>
              ) : el.type === 'button' ? (
                <button type="button" className="rich-card-el-btn" disabled>
                  {el.text || el.label}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      );
    }
    return <p className="msg-text">{JSON.stringify(richContent)}</p>;
  };

  return (
    <PageShell 
      title="Omnichannel Inbox & AI Co-Pilot" 
      intro="แชทรวมศูนย์ความงามจากช่องทาง LINE, Facebook, และ Instagram พร้อมผู้ช่วย AI แนะนำโปรโมชั่นปิดการขายแบบเรียลไทม์"
    >
      <StatusBanner state={flash} />
      <div className="inbox-layout">
        
        {/* Left column - Threads list */}
        <div className="inbox-threads-pane">
          <div className="pane-header">
            <h3>บทสนทนาทั้งหมด</h3>
            <span className="pill compact-pill">{threads.length} Threads</span>
          </div>
          {loadingThreads && threads.length === 0 ? (
            <div className="loading-inside">กำลังโหลดรายการแชท...</div>
          ) : threads.length === 0 ? (
            <div className="empty-inside">ไม่มีบทสนทนาที่รอการตอบกลับ</div>
          ) : (
            <div className="threads-scrollable">
              {threads.map(thread => {
                const isActive = thread.id === activeThreadId;
                const sourceUpper = (thread.lead?.source || 'line').toUpperCase();
                return (
                  <button
                    key={thread.id}
                    type="button"
                    className={`thread-item-btn ${isActive ? 'active' : ''}`}
                    onClick={() => setActiveThreadId(thread.id)}
                  >
                    <div className="thread-item-meta">
                      <span className={`channel-badge ${thread.lead?.source || 'line'}`}>
                        {sourceUpper}
                      </span>
                      <span className="thread-time">{formatDateTime(thread.updated_at).split(' ')[1] || ''}</span>
                    </div>
                    <h4 className="thread-lead-name">{thread.lead?.fullName || 'คนไข้ใหม่'}</h4>
                    <p className="thread-preview">{thread.contextSummary || 'สอบถามรายละเอียดบริการ...'}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Middle column - Chat thread */}
        <div className="inbox-chat-pane">
          {activeThread ? (
            <>
              <div className="pane-header chat-header">
                <div>
                  <h3>{activeThread.lead?.fullName || 'คนไข้ใหม่'}</h3>
                  <div className="chat-subtitle">
                    <span className={`channel-badge compact-badge ${activeThread.lead?.source || 'line'}`}>
                      {(activeThread.lead?.source || 'line').toUpperCase()}
                    </span>
                    <span className="subtitle-meta">
                      {activeThread.lead?.phone ? `📞 ${activeThread.lead.phone}` : ''}
                      {activeThread.lead?.email ? ` | ✉️ ${activeThread.lead.email}` : ''}
                      {activeThread.lead?.stage ? ` | Stage: ${activeThread.lead.stage}` : ''}
                    </span>
                  </div>
                </div>
              </div>

              <div className="chat-messages-container">
                {loadingMessages && messages.length === 0 ? (
                  <div className="loading-inside">กำลังโหลดข้อความ...</div>
                ) : (
                  <div className="messages-flow">
                    {messages.map(msg => {
                      const isLead = msg.senderType === 'lead';
                      const isAi = msg.senderType === 'ai_agent';
                      const senderLabel = isLead ? 'คนไข้' : isAi ? 'AI Co-Pilot ✨' : 'พนักงาน 👤';
                      return (
                        <div key={msg.id} className={`message-wrapper ${msg.senderType}`}>
                          <span className="msg-sender-label">{senderLabel}</span>
                          <div className={`message-bubble ${msg.senderType}`}>
                            {msg.richContent ? renderRichContent(msg.richContent) : <p className="msg-text">{msg.messageText}</p>}
                            {isAi && msg.confidenceScore && (
                              <span className="ai-confidence-badge">
                                Confidence: {Math.round(msg.confidenceScore * 100)}%
                              </span>
                            )}
                            <span className="msg-time">{formatDateTime(msg.createdAt).split(' ')[1] || ''}</span>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messageEndRef} />
                  </div>
                )}
              </div>

              <div className="chat-input-area">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="พิมพ์ข้อความตอบกลับเพื่อส่งในนามพนักงาน (Staff Override)..."
                  rows={2}
                />
                <button
                  type="button"
                  className="primary-button send-btn"
                  onClick={() => handleSendOverride()}
                  disabled={!inputText.trim()}
                >
                  ส่งข้อความ
                </button>
              </div>
            </>
          ) : (
            <div className="chat-empty-state">
              <div className="empty-bubble">💬</div>
              <h3>ยินดีต้อนรับสู่ Omnichannel Inbox</h3>
              <p>เลือกบทสนทนาจากคอลัมน์ซ้ายมือเพื่อเริ่มการตอบกลับและใช้ตัวช่วย AI อัจฉริยะ</p>
            </div>
          )}
        </div>

        {/* Right column - AI Co-Pilot */}
        <div className="inbox-copilot-pane">
          <div className="pane-header gold-header">
            <h3>AI Sales Co-Pilot ✨</h3>
            <span className="pill gold-pill">Smart Agent</span>
          </div>

          {!activeThreadId ? (
            <div className="copilot-empty">
              <p className="muted">กรุณาเลือกห้องแชทเพื่อรับข้อเสนอแนะโปรโมชั่นอัจฉริยะ</p>
            </div>
          ) : loadingSuggestion ? (
            <div className="copilot-loading">
              <div className="spinner" />
              <p className="muted">AI กำลังวิเคราะห์ข้อมูลความต้องการของคนไข้...</p>
            </div>
          ) : suggestion && suggestion.success ? (
            <div className="copilot-suggestion-card">
              <div className="gold-glowing-card">
                <div className="copilot-card-header">
                  <span className="copilot-intent-badge">ตรวจพบความต้องการจองโปรแกรมความงาม</span>
                  <span className="copilot-confidence-score">
                    Confidence: {Math.round(suggestion.confidenceScore * 100)}%
                  </span>
                </div>
                
                {suggestion.promotion && (
                  <div className="copilot-promo-box">
                    <div className="promo-main-details">
                      <h4 className="promo-name">{suggestion.promotion.name}</h4>
                      <span className="promo-price">{formatNumber(suggestion.promotion.price)} บาท</span>
                    </div>
                    <p className="promo-description">{suggestion.promotion.description}</p>
                    <span className="promo-code">Code: {suggestion.promotion.code}</span>
                  </div>
                )}

                <div className="copilot-response-box">
                  <h5>สคริปต์แนะนำสำหรับส่งตอบลูกค้า:</h5>
                  <p className="suggested-response-text">{suggestion.suggestedResponse}</p>
                </div>

                <div className="copilot-actions">
                  <button
                    type="button"
                    className="ghost-button copilot-btn"
                    onClick={() => setInputText(suggestion.suggestedResponse)}
                  >
                    วางลงช่องพิมพ์คำตอบ
                  </button>
                  <button
                    type="button"
                    className="primary-button gold-btn copilot-btn"
                    onClick={() => handleSendOverride(suggestion.suggestedResponse)}
                  >
                    ส่งโปรโมชั่นทันที
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="copilot-no-intent">
              <div className="info-icon">💡</div>
              <h4>ยังไม่ตรวจพบโปรโมชั่นหัตถการ</h4>
              <p className="muted">
                เมื่อคนไข้พิมพ์สอบถามหัตถการพิเศษ เช่น โบท็อกซ์ (Botox), เมโซออร่า (Meso Aura), ไฮฟู (Hifu) หรือรักษาสิว (Acne Clear) 
                ระบบ AI Co-Pilot จะนำเสนอคูปองราคาพิเศษและชุดคำตอบปิดดีลขึ้นแนะนำพนักงานทันที
              </p>
            </div>
          )}
        </div>

      </div>
    </PageShell>
  );
}

function renderPage(route) {
  switch (route?.key) {
    case 'unified-inbox':
      return <UnifiedInboxPage />;
    case 'users':
      return <UsersPage />;
    case 'workspaces':
      return <WorkspacesPage />;
    case 'settings':
      return <SettingsPage />;
    case 'automation':
      return <AutomationPage />;
    case 'automation-builder':
      return <FlowBuilderPage flowId={route.flowId} />;
    case 'automation-execution':
      return <ExecutionDebuggerPage executionId={route.executionId} />;
    case 'audit':
      return <AuditLogsPage />;
    case 'system-health':
      return <SystemHealthPage />;
    case 'dashboard':
    default:
      return <DashboardPage />;
  }
}

function LoginView() {
  const api = useApi();
  const { setToken, setSession } = useAuth();
  const [form, setForm] = useState({ email: '', password: '', clinicSlug: '' });
  const [state, setState] = useState({ status: 'idle', error: null });

  async function handleSubmit(event) {
    event.preventDefault();
    setState({ status: 'loading', error: null });

    try {
      const session = await api.login({
        email: form.email,
        password: form.password,
        clinicSlug: form.clinicSlug || undefined
      });
      window.localStorage.setItem(STORAGE_KEY, session.token);
      setToken(session.token);
      setSession(session);
      navigateTo('dashboard');
      setState({ status: 'ready', error: null });
    } catch (error) {
      setState({ status: 'error', error });
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card" data-testid="login-card">
        <p className="pill">Admin Control Center</p>
        <h1 className="page-title">Sign in to FlowBiz</h1>
        <p className="page-intro">Use a tenant account to load dashboard context, workspaces, and operator tools.</p>
        <StatusBanner state={state.status === 'error' ? { kind: 'error', message: describeError(state.error) } : null} testId="login-error" />
        <form className="form-grid" onSubmit={handleSubmit} data-testid="login-form">
          <label className="field field-span-2">
            <span>Email</span>
            <input
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              placeholder="owner@example.com"
              data-testid="login-email"
            />
          </label>
          <label className="field field-span-2">
            <span>Password</span>
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              data-testid="login-password"
            />
          </label>
          <label className="field field-span-2">
            <span>Clinic slug (optional)</span>
            <input
              value={form.clinicSlug}
              onChange={(event) => setForm((current) => ({ ...current, clinicSlug: event.target.value }))}
              placeholder="demo-clinic"
            />
          </label>
          <div className="inline-actions field-span-2">
            <button type="submit" className="primary-button" data-testid="login-submit" disabled={state.status === 'loading'}>
              {state.status === 'loading' ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

function AdminShell() {
  const { session, setSession } = useTenant();
  const { token } = useAuth();
  const api = useApi();
  const [route, setRoute] = useState(parseRouteFromHash());
  const [switchWorkspaceState, setSwitchWorkspaceState] = useState({ status: 'idle', error: null });

  useEffect(() => {
    function handleHashChange() {
      setRoute(parseRouteFromHash());
    }

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  async function switchWorkspace(nextMembership) {
    setSwitchWorkspaceState({ status: 'loading', error: null });

    try {
      const nextContext = await api.getTenantContext({
        token,
        clinicSlug: nextMembership.clinic.slug,
        workspaceSlug: nextMembership.workspace.slug
      });

      startTransition(() => {
        setSession((current) => ({
          ...current,
          ...nextContext,
          memberships: current.memberships
        }));
      });

      setSwitchWorkspaceState({ status: 'ready', error: null });
    } catch (error) {
      setSwitchWorkspaceState({ status: 'error', error });
    }
  }

  const workspaceValue = useMemo(
    () => ({
      session,
      setSession,
      switchWorkspace,
      switchWorkspaceState,
      updateSessionEntity(entityKey, entityValue) {
        setSession((current) => ({
          ...current,
          [entityKey]: entityValue,
          memberships: (current.memberships || []).map((membership) => ({
            ...membership,
            clinic: entityKey === 'currentClinic' && membership.clinic?.id === entityValue.id ? entityValue : membership.clinic,
            organization:
              entityKey === 'currentOrganization' && membership.organization?.id === entityValue.id
                ? entityValue
                : membership.organization,
            workspace: entityKey === 'currentWorkspace' && membership.workspace?.id === entityValue.id ? entityValue : membership.workspace
          }))
        }));
      }
    }),
    [session, setSession, switchWorkspaceState]
  );

  return (
    <WorkspaceContext.Provider value={workspaceValue}>
      <div className="app-shell" data-testid="admin-shell">
        <Sidebar
          route={route}
          onNavigate={(routeKey) => {
            navigateTo(routeKey);
            setRoute(parseRouteFromHash());
          }}
        />
        <main className="main-panel">
          <TopBar />
          {switchWorkspaceState.status === 'error' ? (
            <StatusBanner state={{ kind: 'error', message: describeError(switchWorkspaceState.error) }} />
          ) : null}
          {renderPage(route)}
        </main>
      </div>
    </WorkspaceContext.Provider>
  );
}

function AdminApp({ config }) {
  const api = useMemo(() => createApiClient(getConfig(config).apiBaseUrl), [config]);
  const [token, setToken] = useState(() => window.localStorage.getItem(STORAGE_KEY) || '');
  const [session, setSession] = useState(null);
  const [bootstrap, setBootstrap] = useState({ status: token ? 'loading' : 'idle', error: null });

  useEffect(() => {
    if (!token) {
      setBootstrap({ status: 'idle', error: null });
      return undefined;
    }

    let active = true;

    async function bootstrapSession() {
      setBootstrap({ status: 'loading', error: null });

      try {
        const nextSession = await api.getAuthMe({ token });

        if (active) {
          setSession((current) => ({ ...current, ...nextSession }));
          setBootstrap({ status: 'ready', error: null });
          if (!window.location.hash) {
            navigateTo('dashboard');
          }
        }
      } catch (error) {
        if (active) {
          window.localStorage.removeItem(STORAGE_KEY);
          setToken('');
          setSession(null);
          setBootstrap({ status: 'error', error });
        }
      }
    }

    bootstrapSession();

    return () => {
      active = false;
    };
  }, [api, token]);

  const authValue = useMemo(() => ({ token, setToken, setSession }), [token]);
  const tenantValue = useMemo(() => ({ session, setSession }), [session]);

  return (
    <ApiContext.Provider value={api}>
      <AuthContext.Provider value={authValue}>
        <TenantContext.Provider value={tenantValue}>
          <PermissionProvider session={session}>
            {token ? (
              bootstrap.status === 'loading' ? (
                <main className="login-shell">
                  <LoadingCard label="Bootstrapping admin session…" />
                </main>
              ) : session ? (
                <AdminShell />
              ) : (
                <main className="login-shell">
                  <ErrorCard error={bootstrap.error} />
                  <LoginView />
                </main>
              )
            ) : (
              <LoginView />
            )}
          </PermissionProvider>
        </TenantContext.Provider>
      </AuthContext.Provider>
    </ApiContext.Provider>
  );
}

export function mountAdminApp(configOverride) {
  const rootElement = document.getElementById('app');

  if (!rootElement) {
    throw new Error('Missing #app root element.');
  }

  const root = createRoot(rootElement);
  root.render(<AdminApp config={configOverride} />);
  return root;
}
