import React, { createContext, startTransition, useContext, useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import DOMPurify from 'dompurify';

const STORAGE_KEY = 'flowbiz.admin.token';

const AuthContext = createContext(null);
const TenantContext = createContext(null);
const PermissionContext = createContext(null);
const WorkspaceContext = createContext(null);
const ApiContext = createContext(null);
const FlowBuilderContext = createContext(null);
const ExecutionDebuggerContext = createContext(null);

const NAV_ITEMS = [
  { key: 'dashboard', label: 'แดชบอร์ด', caption: 'ภาพรวมกิจกรรมคลินิก' },
  { key: 'unified-inbox', label: 'กล่องแชทรวม', caption: 'แชทโซเชียลและ AI co-pilot' },
  { key: 'roas-analytics', label: 'ROAS และสะสมแต้ม', caption: 'ค่าโฆษณา CAC และแนะนำเพื่อน' },
  { key: 'ai-agent-console', label: 'คอนโซล AI Agent', caption: 'กฎ Agent และคิว HITL' },
  { key: 'blog-manager', label: 'จัดการบทความ', caption: 'สร้าง แก้ไข และเผยแพร่' },
  { key: 'forum-moderator', label: 'ดูแลเว็บบอร์ด', caption: 'ตรวจหัวข้อและคำตอบแพทย์' },
  { key: 'users', label: 'ผู้ใช้งาน', caption: 'สมาชิกและบทบาท' },
  { key: 'workspaces', label: 'เวิร์กสเปซ', caption: 'ตั้งค่าพื้นที่ทำงาน' },
  { key: 'settings', label: 'ตั้งค่า', caption: 'คลินิกและองค์กร' },
  { key: 'automation', label: 'ระบบอัตโนมัติ', caption: 'Flow และประวัติการทำงาน' },
  { key: 'audit', label: 'บันทึกตรวจสอบ', caption: 'ประวัติระบบล่าสุด' },
  { key: 'system-health', label: 'สุขภาพระบบ', caption: 'Worker และ event ops' }
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

function readStoredAdminToken() {
  try {
    const sessionToken = window.sessionStorage.getItem(STORAGE_KEY) || '';
    const legacyToken = window.localStorage.getItem(STORAGE_KEY) || '';

    if (legacyToken) {
      window.localStorage.removeItem(STORAGE_KEY);

      if (!sessionToken) {
        window.sessionStorage.setItem(STORAGE_KEY, legacyToken);
      }
    }

    return sessionToken || legacyToken;
  } catch (_) {
    return '';
  }
}

function storeAdminToken(token) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, token);
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (_) {
    // The in-memory React state remains the source of truth if browser storage is unavailable.
  }
}

function clearStoredAdminToken() {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (_) {
    // Ignore storage cleanup failures so logout and invalid-session handling can still proceed.
  }
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

  return parsed.toLocaleString('th-TH');
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
    throw new Error('ข้อมูล JSON ต้องเป็นอ็อบเจกต์เท่านั้น');
    }

    return parsed;
  } catch (error) {
    throw new Error(`${fieldName} ต้องเป็นข้อความ JSON object ที่ถูกต้อง`);
  }
}

function safeJsonStringify(value) {
  return JSON.stringify(value || {}, null, 2);
}

const ALLOWED_RICH_TAGS = new Set(['P', 'BR', 'STRONG', 'EM', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'A', 'IMG', 'BLOCKQUOTE']);
const ALLOWED_RICH_ATTRS = {
  A: new Set(['href', 'target', 'rel']),
  IMG: new Set(['src', 'alt'])
};
const ALLOWED_RICH_TAG_NAMES = [...ALLOWED_RICH_TAGS].map((tag) => tag.toLowerCase());
const ALLOWED_RICH_ATTR_NAMES = [...new Set(Object.values(ALLOWED_RICH_ATTRS).flatMap((attrs) => [...attrs]))];

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isSafeUrl(url) {
  try {
    const parsed = new URL(String(url || ''), window.location.origin);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch (_) {
    return false;
  }
}

function sanitizeRichHtml(html) {
  const sanitized = DOMPurify.sanitize(String(html || ''), {
    ALLOWED_TAGS: ALLOWED_RICH_TAG_NAMES,
    ALLOWED_ATTR: ALLOWED_RICH_ATTR_NAMES,
    ALLOW_DATA_ATTR: false,
    FORBID_ATTR: ['style', 'srcdoc']
  });
  const doc = document.implementation.createHTMLDocument('sanitizer');
  doc.body.innerHTML = sanitized;

  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        continue;
      }

      if (child.nodeType !== Node.ELEMENT_NODE || !ALLOWED_RICH_TAGS.has(child.tagName)) {
        child.replaceWith(doc.createTextNode(child.textContent || ''));
        continue;
      }

      for (const attr of [...child.attributes]) {
        const allowedAttrs = ALLOWED_RICH_ATTRS[child.tagName] || new Set();
        if (!allowedAttrs.has(attr.name)) {
          child.removeAttribute(attr.name);
        }
      }

      if (child.tagName === 'A') {
        const href = child.getAttribute('href') || '';
        if (!isSafeUrl(href)) {
          child.removeAttribute('href');
        } else {
          child.setAttribute('target', '_blank');
          child.setAttribute('rel', 'noopener noreferrer');
        }
      }

      if (child.tagName === 'IMG') {
        const src = child.getAttribute('src') || '';
        if (!isSafeUrl(src)) {
          child.remove();
          continue;
        }
      }

      walk(child);
    }
  };

  walk(doc.body);
  return doc.body.innerHTML;
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

  return error.message || 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';
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
      throw new ApiError(payload?.error?.message || 'ส่งคำขอไม่สำเร็จ', {
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
    getLoyaltyBalance(session, leadId) {
      return request(`/loyalty/balance?leadId=${leadId}`, session);
    },
    getReferralsList(session, leadId) {
      return request(`/loyalty/referrals?leadId=${leadId}`, session);
    },
    recordPurchase(session, body) {
      return request('/loyalty/record-purchase', { ...session, method: 'POST', body });
    },
    syncAdSpend(session) {
      return request('/loyalty/ad-spend/sync', { ...session, method: 'POST' });
    },
    getRoasReport(session) {
      return request('/loyalty/roas-report', session);
    },
    getApprovalQueue(session) {
      return request('/ai-agent/approval-queue', session);
    },
    approveMessage(session, messageId, body) {
      return request(`/ai-agent/approve/${messageId}`, { ...session, method: 'POST', body });
    },
    getAgentRules(session) {
      return request('/ai-agent/rules', session);
    },
    updateAgentRule(session, body) {
      return request('/ai-agent/rules', { ...session, method: 'POST', body });
    },
    getSystemHealth(session) {
      return request('/ops/health', session);
    },
    retryWorkerJob(session, jobId) {
      return request(`/ops/jobs/${jobId}/retry`, { ...session, method: 'POST' });
    },
    listBlogPosts(session, params = {}) {
      const search = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          search.set(key, value);
        }
      });
      const suffix = search.toString() ? `?${search.toString()}` : '';
      return request(`/blog/posts${suffix}`, session);
    },
    createBlogPost(session, body) {
      return request('/blog/posts', { ...session, method: 'POST', body });
    },
    updateBlogPost(session, postId, body) {
      return request(`/blog/posts/${postId}`, { ...session, method: 'PUT', body });
    },
    deleteBlogPost(session, postId) {
      return request(`/blog/posts/${postId}`, { ...session, method: 'DELETE' });
    },
    listForumTopics(session, params = {}) {
      const search = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          search.set(key, value);
        }
      });
      const suffix = search.toString() ? `?${search.toString()}` : '';
      return request(`/forum/topics${suffix}`, session);
    },
    getForumTopicDetail(session, topicIdOrSlug) {
      return request(`/forum/topics/${topicIdOrSlug}`, session);
    },
    updateForumTopicStatus(session, topicId, body) {
      return request(`/forum/topics/${topicId}/status`, { ...session, method: 'PUT', body });
    },
    verifyForumReply(session, replyId, body) {
      return request(`/forum/replies/${replyId}/verify`, { ...session, method: 'PUT', body });
    },
    createForumReply(session, topicId, body) {
      return request(`/forum/topics/${topicId}/replies`, { ...session, method: 'POST', body });
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
          <p className="brand-subtitle">ศูนย์ควบคุมคลินิกและทีมปฏิบัติการ</p>
        </div>
      </div>
      <nav className="nav-list" aria-label="เมนูหลัก">
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
  const { setToken } = useAuth();
  const workspaceOptions = dedupeMembershipsByWorkspace(session.memberships || []);

  return (
    <header className="top-bar">
      <div>
        <h2 className="section-heading">{session.currentClinic?.name}</h2>
        <p className="section-subheading">
          {session.currentOrganization?.name} / {session.currentWorkspace?.name}
        </p>
        <div className="context-meta">
          <span className="context-chip">คลินิก: {session.currentClinic?.slug}</span>
          <span className="context-chip">บทบาท: {session.currentMembership?.role}</span>
          <span className="context-chip">สิทธิ์: {(session.permissions || []).length}</span>
        </div>
      </div>
      <div className="toolbar top-toolbar-actions">
        <label className="field compact-field">
          <span>เวิร์กสเปซ</span>
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
            clearStoredAdminToken();
            setToken('');
            setSession(null);
          }}
        >
          ออกจากระบบ
        </button>
        {switchWorkspaceState.status === 'loading' ? <span className="pill status-running">กำลังสลับเวิร์กสเปซ</span> : null}
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

function LoadingCard({ label = 'กำลังโหลดข้อมูล...' }) {
  return (
    <div className="notice-card" data-testid="loading-state">
      <p className="muted">{label}</p>
    </div>
  );
}

function ErrorCard({ error }) {
  return (
    <div className="notice-card error-card" data-testid="error-state">
      <h3 className="section-heading">ดำเนินการไม่สำเร็จ</h3>
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
    return <PermissionNotice title="ไม่สามารถเปิดแดชบอร์ดได้" message="ต้องมีสิทธิ์อ่าน analytics, audit หรือ automation" />;
  }

  if (state.status === 'loading' || state.status === 'idle') {
    return <LoadingCard label="กำลังโหลดแดชบอร์ด..." />;
  }

  if (state.status === 'error') {
    return <ErrorCard error={state.error} />;
  }

  const { overview, auditLogs, health } = state.data;

  return (
    <PageShell
      title="แดชบอร์ด"
      intro="ภาพรวมลีด ข้อความระบบอัตโนมัติ และสุขภาพระบบที่ทีมปฏิบัติการต้องเห็นก่อนให้บริการ"
    >
      <div className="metric-grid" data-testid="dashboard-metrics">
        <MetricCard label="ลีดวันนี้" value={formatNumber(overview.daily.leadsCreated)} hint="ลีดที่สร้างในวันนี้" />
        <MetricCard label="ข้อความที่ส่ง" value={formatNumber(overview.daily.messagesSent)} hint="ข้อความ outbound วันนี้" />
        <MetricCard
          label="ระบบอัตโนมัติที่รัน"
          value={formatNumber(overview.daily.automationExecutions)}
          hint="จำนวนรันรายวัน"
        />
      </div>
      <div className="two-column-grid">
        <section className="section-card">
          <div className="split-header compact-gap">
            <div>
              <h3 className="section-heading">กิจกรรมล่าสุด</h3>
              <p className="muted">Audit trail ล่าสุดของคลินิก</p>
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
          <h3 className="section-heading">สุขภาพระบบอัตโนมัติ</h3>
          <div className="stacked-metrics">
            <div className="metric-row">
              <span>งานค้างในคิว</span>
              <strong>{formatNumber(health.worker.queueDepth)}</strong>
            </div>
            <div className="metric-row">
              <span>งานล้มเหลว</span>
              <strong>{formatNumber(health.worker.failedJobs)}</strong>
            </div>
            <div className="metric-row">
              <span>อัตราสำเร็จ</span>
              <strong>{formatPercent(health.automation.successRate)}</strong>
            </div>
            <div className="metric-row">
              <span>Event ต่อชั่วโมง</span>
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
    return <PermissionNotice title="ไม่สามารถเปิดหน้าผู้ใช้งานได้" message="ต้องมีสิทธิ์ user.read หรือ user.manage" />;
  }

  if (!canList) {
    return <PermissionNotice title="ไม่สามารถโหลดรายชื่อผู้ใช้ได้" message="ต้องมีสิทธิ์ user.read เพื่ออ่านข้อมูลสมาชิก" />;
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
      setFlash({ kind: 'success', message: `ส่งคำเชิญไปที่ ${inviteForm.email} แล้ว` });
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
      setFlash({ kind: 'success', message: `อัปเดตบทบาทของ ${member.user?.email || 'สมาชิก'} แล้ว` });
      await refreshMembers();
    } catch (error) {
      setFlash({ kind: 'error', message: describeError(error) });
    }
  }

  async function handleDeactivate(member) {
    try {
      await api.deactivateMember(sessionOptions, session.currentWorkspace.id, member.id);
      setFlash({ kind: 'success', message: `ปิดใช้งาน ${member.user?.email || 'สมาชิก'} แล้ว` });
      await refreshMembers();
    } catch (error) {
      setFlash({ kind: 'error', message: describeError(error) });
    }
  }

  return (
    <PageShell
      title="ผู้ใช้งาน"
      intro="จัดการสมาชิก คำเชิญ บทบาท และการยกเลิกสิทธิ์ของเวิร์กสเปซ"
    >
      <StatusBanner state={flash} />
      {canInvite ? (
        <section className="section-card">
          <h3 className="section-heading">เชิญสมาชิก</h3>
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
              <span>บทบาท</span>
              <select
                value={inviteForm.role}
                onChange={(event) => setInviteForm((current) => ({ ...current, role: event.target.value }))}
                data-testid="invite-role"
              >
                <option value="admin">ผู้ดูแล</option>
                <option value="operator">เจ้าหน้าที่</option>
                <option value="viewer">ผู้ดูอย่างเดียว</option>
              </select>
            </label>
            <div className="inline-actions">
              <button type="submit" className="primary-button" data-testid="invite-submit">
                ส่งคำเชิญ
              </button>
            </div>
          </form>
        </section>
      ) : null}
      {state.status === 'loading' || state.status === 'idle' ? <LoadingCard label="กำลังโหลดสมาชิกเวิร์กสเปซ..." /> : null}
      {state.status === 'error' ? <ErrorCard error={state.error} /> : null}
      {state.status === 'ready' ? (
        <section className="section-card">
          <div className="split-header compact-gap">
            <div>
              <h3 className="section-heading">สมาชิกเวิร์กสเปซ</h3>
              <p className="muted">สมาชิกและผู้ที่ได้รับเชิญของเวิร์กสเปซที่เลือก</p>
            </div>
            <span className="pill">{state.data.items.length} รายการ</span>
          </div>
          <div className="table-shell">
            <table className="data-table" data-testid="members-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>สถานะ</th>
                  <th>บทบาท</th>
                  <th>เข้าร่วมเมื่อ</th>
                  <th>การจัดการ</th>
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
                            <option value="admin">ผู้ดูแล</option>
                            <option value="operator">เจ้าหน้าที่</option>
                            <option value="viewer">ผู้ดูอย่างเดียว</option>
                          </select>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => handleRoleChange(member)}
                            data-testid={`role-save-${member.id}`}
                          >
                            บันทึกบทบาท
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
                          ปิดใช้งาน
                        </button>
                      ) : (
                        <span className="muted">ไม่มีการจัดการ</span>
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
    return <PermissionNotice title="ไม่สามารถเปิดตั้งค่าเวิร์กสเปซได้" message="ต้องมีสิทธิ์ workspace.read หรือ workspace.manage" />;
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
      setFlash({ kind: 'success', message: 'อัปเดตตั้งค่าเวิร์กสเปซเรียบร้อยแล้ว' });
    } catch (error) {
      setFlash({ kind: 'error', message: describeError(error) });
    }
  }

  return (
    <PageShell title="เวิร์กสเปซ" intro="จัดการชื่อ slug timezone และ JSON settings ของเวิร์กสเปซที่ใช้งาน">
      <StatusBanner state={flash} />
      {state.status === 'loading' || state.status === 'idle' ? <LoadingCard label="กำลังโหลดตั้งค่าเวิร์กสเปซ..." /> : null}
      {state.status === 'error' ? <ErrorCard error={state.error} /> : null}
      {state.status === 'ready' ? (
        <section className="section-card">
          <form className="form-grid" onSubmit={handleSubmit} data-testid="workspace-form">
            <label className="field">
              <span>ชื่อ</span>
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
                  บันทึกเวิร์กสเปซ
                </button>
              </div>
            ) : (
              <p className="muted field-span-2">คุณดูการตั้งค่าเวิร์กสเปซได้ แต่ไม่มีสิทธิ์แก้ไข</p>
            )}
          </form>
        </section>
      ) : null}
    </PageShell>
  );
}

function createStarterFlowDefinition(name = 'Visual Flow ใหม่') {
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
      setFlash({ kind: 'success', message: `เผยแพร่เวอร์ชัน ${versionId} แล้ว` });
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
    return <PermissionNotice title="ไม่สามารถเปิดตัวสร้าง Flow ได้" message="ต้องมีสิทธิ์ automation.read หรือ automation.manage" />;
  }

  if (builderState.status === 'loading' || builderState.status === 'idle') {
    return <LoadingCard label="กำลังโหลดตัวสร้างระบบอัตโนมัติ..." />;
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
        title={`ตัวสร้าง Flow #${flowId}`}
        intro="สร้าง flow แบบ node-based, บันทึก draft version, และ publish version ที่ต้องการใช้งานจริง"
        actions={(
          <>
            <button type="button" className="secondary-button" onClick={() => navigateTo('automation')}>กลับ</button>
            {canManage ? <button type="button" className="primary-button" onClick={saveDraft} data-testid="builder-save-draft">บันทึกร่าง</button> : null}
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
                <button type="button" className="secondary-button" onClick={() => addNode('action')}>เพิ่ม Action</button>
                <button type="button" className="secondary-button" onClick={() => addNode('condition')}>เพิ่มเงื่อนไข</button>
                <button type="button" className="secondary-button" onClick={() => addNode('delay')}>เพิ่มเวลาหน่วง</button>
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
                  <span className={`pill status-${version.isPublished ? 'active' : 'draft'}`}>{version.isPublished ? 'เผยแพร่แล้ว' : 'ร่าง'}</span>
                  <div className="inline-actions">
                    <button type="button" className="secondary-button" onClick={() => loadVersion(version.id)}>Open</button>
                    {canManage && !version.isPublished ? <button type="button" className="primary-button" onClick={() => publishVersion(version.id)}>เผยแพร่</button> : null}
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
    return <PermissionNotice title="ไม่สามารถเปิดรายละเอียด Execution ได้" message="ต้องมีสิทธิ์ automation.read หรือ automation.manage" />;
  }

  if (state.status === 'loading' || state.status === 'idle') {
    return <LoadingCard label="กำลังโหลดรายละเอียด Execution..." />;
  }

  if (state.status === 'error') {
    return <ErrorCard error={state.error} />;
  }

  const selectedStep = state.data.steps.find((step) => step.step_execution_id === selectedStepId) || state.data.steps[0] || null;

  return (
    <ExecutionDebuggerContext.Provider value={{ execution: state.data.execution, steps: state.data.steps, selectedStep, setSelectedStepId }}>
      <PageShell
        title={`รายละเอียด Execution #${executionId}`}
        intro="ดู timeline ของ execution, ข้อมูล input/output, error และระยะเวลาของแต่ละ step"
        actions={<button type="button" className="secondary-button" onClick={() => navigateTo('automation')}>กลับ</button>}
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
                  <span>ข้อผิดพลาด</span>
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
    return <PermissionNotice title="ไม่สามารถเปิดหน้าตั้งค่าได้" message="ต้องมีสิทธิ์อ่าน tenant หรือ organization" />;
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
      setFlash({ kind: 'success', message: 'อัปเดตตั้งค่า Tenant เรียบร้อยแล้ว' });
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
      setFlash({ kind: 'success', message: 'อัปเดตตั้งค่าองค์กรเรียบร้อยแล้ว' });
    } catch (error) {
      setFlash({ kind: 'error', message: describeError(error) });
    }
  }

  return (
    <PageShell title="ตั้งค่า" intro="จัดการ branding, locale และการตั้งค่าระดับองค์กร">
      <StatusBanner state={flash} />
      {state.status === 'loading' || state.status === 'idle' ? <LoadingCard label="กำลังโหลดการตั้งค่า..." /> : null}
      {state.status === 'error' ? <ErrorCard error={state.error} /> : null}
      {state.status === 'ready' ? (
        <div className="two-column-grid">
          {state.data.tenant ? (
            <section className="section-card">
              <h3 className="section-heading">ตั้งค่าคลินิก</h3>
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
                      บันทึกตั้งค่าคลินิก
                    </button>
                  </div>
                ) : null}
              </form>
            </section>
          ) : null}
          {state.data.organization ? (
            <section className="section-card">
              <h3 className="section-heading">ตั้งค่าองค์กร</h3>
              <form className="form-grid" onSubmit={handleOrganizationSubmit} data-testid="organization-settings-form">
                <label className="field">
                  <span>ชื่อ</span>
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
                      บันทึกตั้งค่าองค์กร
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
    return <PermissionNotice title="ไม่สามารถเปิดระบบอัตโนมัติได้" message="ต้องมีสิทธิ์ automation.read หรือ automation.manage" />;
  }

  if (state.status === 'loading' || state.status === 'idle') {
    return <LoadingCard label="กำลังโหลดสถานะระบบอัตโนมัติ..." />;
  }

  if (state.status === 'error') {
    return <ErrorCard error={state.error} />;
  }

  const { flows, executions, failedExecutions, tasks } = state.data;

  async function createFlow() {
    try {
      const created = await api.createAutomationBuilderFlow(sessionOptions, createStarterFlowDefinition(`Flow ใหม่ ${Date.now()}`));
      navigateTo(`automation/builder/${created.id}`);
    } catch (error) {
      setFlash({ kind: 'error', message: describeError(error) });
    }
  }

  return (
    <PageShell
      title="ระบบอัตโนมัติ"
      intro="Monitor flows, execution history, and failed automations for the active tenant."
      actions={canManage ? <button type="button" className="primary-button" onClick={createFlow}>สร้าง Flow ใหม่</button> : null}
    >
      <StatusBanner state={flash} />
      <div className="metric-grid">
        <MetricCard label="Flows" value={formatNumber(flows.items.length)} hint="Configured automation flows" />
        <MetricCard label="Recent executions" value={formatNumber(executions.items.length)} hint="Latest execution records" />
        <MetricCard label="Execution ล้มเหลว" value={formatNumber(failedExecutions.items.length)} hint="งานล้มเหลวในมุมมองปัจจุบัน" />
      </div>
      <div className="two-column-grid">
        <section className="section-card">
          <h3 className="section-heading">รายการ Flow</h3>
          <ul className="stack-list" data-testid="flow-list">
            {flows.items.map((flow) => (
              <li key={flow.id} className="stack-item">
                <strong>{flow.name}</strong>
                <span className="muted">{flow.flowType} / {flow.triggerType}</span>
                <span className={`pill status-${flow.status}`}>{flow.status}</span>
                <div className="inline-actions">
                  <button type="button" className="secondary-button" onClick={() => navigateTo(`automation/builder/${flow.id}`)}>
                    เปิดตัวสร้าง
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
        <section className="section-card">
          <h3 className="section-heading">ประวัติการทำงาน</h3>
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
        <h3 className="section-heading">งานระบบอัตโนมัติที่เปิดอยู่</h3>
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
    return <PermissionNotice title="ไม่สามารถเปิดบันทึกตรวจสอบได้" message="ต้องมีสิทธิ์ audit.read" />;
  }

  return (
    <PageShell title="บันทึกตรวจสอบ" intro="กรองกิจกรรมล่าสุดของคลินิกตาม entity, action และช่วงเวลา">
      <section className="section-card">
        <form className="form-grid" data-testid="audit-filter-form">
          <label className="field">
            <span>Entity</span>
            <input value={filters.entityType} onChange={(event) => setFilters((current) => ({ ...current, entityType: event.target.value }))} />
          </label>
          <label className="field">
            <span>การกระทำ</span>
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
      {state.status === 'loading' || state.status === 'idle' ? <LoadingCard label="กำลังโหลด Audit events..." /> : null}
      {state.status === 'error' ? <ErrorCard error={state.error} /> : null}
      {state.status === 'ready' ? (
        <section className="section-card">
          <div className="table-shell">
            <table className="data-table" data-testid="audit-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>การกระทำ</th>
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
    <PageShell title="สุขภาพระบบ" intro="มุมมองสำหรับทีมปฏิบัติการเพื่อตรวจ worker, throughput, งานล้มเหลว และการ retry">
      <StatusBanner state={flash} />
      {state.status === 'loading' || state.status === 'idle' ? <LoadingCard label="กำลังโหลดตัวชี้วัดระบบ..." /> : null}
      {state.status === 'error' ? <ErrorCard error={state.error} /> : null}
      {state.status === 'ready' ? (
        <>
          <div className="metric-grid">
            <MetricCard label="จำนวนคิวค้าง" value={formatNumber(state.data.worker.queueDepth)} hint="จำนวนงาน worker ที่ถึงเวลาแล้วและรอดำเนินการ" />
            <MetricCard label="Execution ต่อชั่วโมง" value={formatNumber(state.data.automation.executionRatePerHour)} hint="ค่าเฉลี่ย throughput ของระบบอัตโนมัติ" />
            <MetricCard label="Event throughput/hr" value={formatNumber(state.data.eventBus.throughputPerHour)} hint="Event bus throughput" />
          </div>
          <section className="section-card">
            <div className="split-header compact-gap">
              <div>
          <h3 className="section-heading">งานล้มเหลวล่าสุด</h3>
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
                    <th>ข้อผิดพลาด</th>
                    <th>การกระทำ</th>
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
          {richContent.imageUrl && isSafeUrl(richContent.imageUrl) && (
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
      title="กล่องแชทรวมและ AI Co-Pilot"
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
              <h3>ยินดีต้อนรับสู่กล่องแชทรวม</h3>
              <p>เลือกบทสนทนาจากคอลัมน์ซ้ายมือเพื่อเริ่มการตอบกลับและใช้ตัวช่วย AI อัจฉริยะ</p>
            </div>
          )}
        </div>

        {/* Right column - AI Co-Pilot */}
        <div className="inbox-copilot-pane">
          <div className="pane-header gold-header">
            <h3>AI ผู้ช่วยฝ่ายขาย ✨</h3>
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

function RoasAnalyticsPage() {
  const api = useApi();
  const sessionOptions = useSessionRequestOptions();
  const permissions = usePermissions();
  const canView = permissions.hasAny(['loyalty.read', 'analytics.read']);
  const canManage = permissions.has('loyalty.manage');
  const [flash, setFlash] = useState(null);
  
  // Lead info queries
  const [leadIdInput, setLeadIdInput] = useState('');
  const [queriedLeadId, setQueriedLeadId] = useState(null);
  const [loyaltyBalance, setLoyaltyBalance] = useState(null);
  const [referrals, setReferrals] = useState([]);
  const [queryingLead, setQueryingLead] = useState(false);

  // Manual purchase entry
  const [purchaseForm, setPurchaseForm] = useState({ leadId: '', amount: '', description: '' });
  const [submittingPurchase, setSubmittingPurchase] = useState(false);

  // Load ROAS report
  const [state, setState] = usePageData(
    () => api.getRoasReport(sessionOptions),
    [api, sessionOptions],
    canView
  );

  async function handleSyncAdSpend() {
    setFlash({ kind: 'info', message: 'กำลังซิงค์ข้อมูลโฆษณาจำลอง...' });
    try {
      await api.syncAdSpend(sessionOptions);
      setFlash({ kind: 'success', message: 'ซิงค์ข้อมูลโฆษณา Facebook และ Google 7 วันย้อนหลังเสร็จสิ้น!' });
      // Reload report
      const updated = await api.getRoasReport(sessionOptions);
      setState({ status: 'ready', data: updated, error: null });
    } catch (err) {
      setFlash({ kind: 'error', message: err.message || 'ซิงค์ล้มเหลว' });
    }
  }

  async function handleQueryLead(event) {
    if (event) event.preventDefault();
    if (!leadIdInput.trim()) return;

    setQueryingLead(true);
    try {
      const lId = Number(leadIdInput);
      const balanceData = await api.getLoyaltyBalance(sessionOptions, lId);
      const referralsData = await api.getReferralsList(sessionOptions, lId);
      setLoyaltyBalance(balanceData.balance);
      setReferrals(referralsData.items || []);
      setQueriedLeadId(lId);
    } catch (err) {
      setFlash({ kind: 'error', message: `ไม่พบข้อมูลคนไข้รหัส #${leadIdInput}` });
      setLoyaltyBalance(null);
      setReferrals([]);
      setQueriedLeadId(null);
    } finally {
      setQueryingLead(false);
    }
  }

  async function handleRecordPurchase(event) {
    event.preventDefault();
    const lId = Number(purchaseForm.leadId);
    const amt = Number(purchaseForm.amount);
    if (!lId || !amt) {
      setFlash({ kind: 'error', message: 'กรุณากรอกรหัสคนไข้และยอดเงินที่ชำระให้ครบถ้วน' });
      return;
    }

    setSubmittingPurchase(true);
    try {
      const res = await api.recordPurchase(sessionOptions, {
        leadId: lId,
        amount: amt,
        description: purchaseForm.description || undefined
      });
      let successMsg = `บันทึกรายการสำเร็จ! คนไข้ได้รับแต้ม ${res.pointsEarned} Points`;
      if (res.referralProcessed) {
        successMsg += ` (และประมวลผลแนะนำเพื่อนรับแต้มโบนัส Referrer +${res.referrerBonus} / Referee +${res.refereeBonus} เรียบร้อย)`;
      }
      setFlash({ kind: 'success', message: successMsg });
      setPurchaseForm({ leadId: '', amount: '', description: '' });
      
      // Reload report since revenue changed
      const updated = await api.getRoasReport(sessionOptions);
      setState({ status: 'ready', data: updated, error: null });

      // Refresh queried lead balance if they were the buyer
      if (queriedLeadId === lId) {
        setLeadIdInput(String(lId));
        const balanceData = await api.getLoyaltyBalance(sessionOptions, lId);
        const referralsData = await api.getReferralsList(sessionOptions, lId);
        setLoyaltyBalance(balanceData.balance);
        setReferrals(referralsData.items || []);
      }
    } catch (err) {
      setFlash({ kind: 'error', message: err.message || 'บันทึกยอดชำระล้มเหลว' });
    } finally {
      setSubmittingPurchase(false);
    }
  }

  if (!canView) {
    return <PermissionNotice title="ไม่สามารถเปิดรายงาน ROAS ได้" message="ต้องมีสิทธิ์ loyalty.read หรือ analytics.read" />;
  }

  if (state.status === 'loading' || state.status === 'idle') {
    return <LoadingCard label="กำลังดึงข้อมูลรายงาน ROAS..." />;
  }

  if (state.status === 'error') {
    return <ErrorCard error={state.error} />;
  }

  const report = state.data;
  const total = report.total || { totalSpend: 0, totalRevenue: 0, totalLeads: 0, totalConverted: 0, costPerLead: 0, customerAcquisitionCost: 0, roas: 0 };
  const fb = report.facebook || { totalSpend: 0, totalRevenue: 0, totalLeads: 0, totalConverted: 0, costPerLead: 0, customerAcquisitionCost: 0, roas: 0 };
  const gg = report.google || { totalSpend: 0, totalRevenue: 0, totalLeads: 0, totalConverted: 0, costPerLead: 0, customerAcquisitionCost: 0, roas: 0 };

  return (
    <PageShell
      title="ROAS และ Loyalty CRM"
      intro="วิเคราะห์ความคุ้มทุนในการซื้อแอดโฆษณา (ROAS, CAC, CPL) และบริการจัดการระบบแนะนำเพื่อน Member-Get-Member สะสมแต้มทุกช่องทาง"
      actions={canManage ? (
        <button type="button" className="primary-button" onClick={handleSyncAdSpend}>
          ซิงค์ข้อมูลโฆษณาจำลอง
        </button>
      ) : null}
    >
      <StatusBanner state={flash} />

      {/* Top metrics summary cards */}
      <div className="metric-grid">
        <MetricCard
          label="Total Ad Spend"
          value={`${formatNumber(total.totalSpend)} บาท`}
          hint="งบโฆษณาที่ใช้จริงสะสม"
        />
        <MetricCard
          label="Total Revenue"
          value={`${formatNumber(total.totalRevenue)} บาท`}
          hint="รายได้จากการซื้อคอร์สที่หน้าร้าน"
        />
        <MetricCard
          label="Overall ROAS"
          value={`${total.roas}x`}
          hint="ประสิทธิภาพผลตอบแทนยอดเงินโฆษณา"
        />
      </div>

      <div className="two-column-grid">
        {/* Marketing Channel Breakdown Card */}
        <section className="section-card">
          <h3 className="section-heading">เปรียบเทียบช่องทางโฆษณา Facebook และ Google</h3>
          <p className="muted">สรุปความคุ้มค่าโฆษณาและอัตราการแปลงของลีด</p>

          <div className="table-shell" style={{ marginTop: '16px' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>ตัวชี้วัด (KPIs)</th>
                  <th>Facebook Ads</th>
                  <th>Google Ads</th>
                  <th>รวมทั้งหมด</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>ค่าโฆษณา (Spend)</strong></td>
                  <td>{formatNumber(fb.totalSpend)} บาท</td>
                  <td>{formatNumber(gg.totalSpend)} บาท</td>
                  <td>{formatNumber(total.totalSpend)} บาท</td>
                </tr>
                <tr>
                  <td><strong>รายได้ที่ได้ (Revenue)</strong></td>
                  <td>{formatNumber(fb.totalRevenue)} บาท</td>
                  <td>{formatNumber(gg.totalRevenue)} บาท</td>
                  <td>{formatNumber(total.totalRevenue)} บาท</td>
                </tr>
                <tr>
                  <td><strong>จำนวนลีด (Leads)</strong></td>
                  <td>{fb.totalLeads} คน</td>
                  <td>{gg.totalLeads} คน</td>
                  <td>{total.totalLeads} คน</td>
                </tr>
                <tr>
                  <td><strong>ปิดการขายได้ (Converted)</strong></td>
                  <td>{fb.totalConverted} คน</td>
                  <td>{gg.totalConverted} คน</td>
                  <td>{total.totalConverted} คน</td>
                </tr>
                <tr>
                  <td><strong>ราคาต่อลีด (CPL)</strong></td>
                  <td><span className="pill compact-pill">{fb.costPerLead} บาท</span></td>
                  <td><span className="pill compact-pill">{gg.costPerLead} บาท</span></td>
                  <td><span className="pill compact-pill">{total.costPerLead} บาท</span></td>
                </tr>
                <tr>
                  <td><strong>ราคาต่อหัวปิดดีล (CAC)</strong></td>
                  <td><span className="pill compact-pill status-healthy">{fb.customerAcquisitionCost} บาท</span></td>
                  <td><span className="pill compact-pill status-healthy">{gg.customerAcquisitionCost} บาท</span></td>
                  <td><span className="pill compact-pill status-healthy">{total.customerAcquisitionCost} บาท</span></td>
                </tr>
                <tr>
                  <td><strong>อัตรา ROAS</strong></td>
                  <td><strong style={{ color: '#0f766e' }}>{fb.roas}x</strong></td>
                  <td><strong style={{ color: '#0f766e' }}>{gg.roas}x</strong></td>
                  <td><strong style={{ color: '#0f766e' }}>{total.roas}x</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Record Treatment Purchase Form */}
        {canManage ? <section className="section-card">
          <h3 className="section-heading">บันทึกคนไข้ชำระเงินที่หน้าร้าน</h3>
          <p className="muted">กรอกยอดชำระจริงของคนไข้เพื่อสะสมแต้มพอยต์และจ่ายค่าคอมมิชชั่นบอกต่อเพื่อน (MGM)</p>
          
          <form className="form-grid" onSubmit={handleRecordPurchase} style={{ marginTop: '16px' }}>
            <label className="field">
              <span>รหัสคนไข้ (Lead ID)</span>
              <input
                type="number"
                value={purchaseForm.leadId}
                onChange={e => setPurchaseForm(curr => ({ ...curr, leadId: e.target.value }))}
                placeholder="เช่น 12"
                required
              />
            </label>
            <label className="field">
              <span>ยอดเงินที่จ่ายจริง (บาท)</span>
              <input
                type="number"
                value={purchaseForm.amount}
                onChange={e => setPurchaseForm(curr => ({ ...curr, amount: e.target.value }))}
                placeholder="เช่น 15000"
                required
              />
            </label>
            <label className="field field-span-2">
              <span>รายละเอียดหัตถการ / บริการ</span>
              <input
                type="text"
                value={purchaseForm.description}
                onChange={e => setPurchaseForm(curr => ({ ...curr, description: e.target.value }))}
                placeholder="เช่น โบท็อกซ์ริ้วรอย 100u / ดริปวิตามินผิวใส"
              />
            </label>
            <div className="inline-actions field-span-2" style={{ marginTop: '8px' }}>
              <button type="submit" className="primary-button" disabled={submittingPurchase}>
                {submittingPurchase ? 'กำลังประมวลผลแต้ม...' : 'ยืนยันยอดสะสมแต้ม'}
              </button>
            </div>
          </form>
        </section> : null}
      </div>

      {/* Query Member Loyalty Points & MGM Referral Connections */}
      <section className="section-card">
        <h3 className="section-heading">ตรวจสอบสถานะแต้มและรายชื่อการบอกต่อเพื่อน (MGM)</h3>
        <p className="muted">ค้นหารหัสคนไข้เพื่อตรวจสอบยอดแต้มคงเหลือและเพื่อนที่ถูกแนะนำเข้ามาลงทะเบียน</p>

        <form onSubmit={handleQueryLead} className="inline-form" style={{ marginTop: '16px', marginBottom: '20px' }}>
          <input
            type="number"
            value={leadIdInput}
            onChange={e => setLeadIdInput(e.target.value)}
            placeholder="ใส่รหัสคนไข้ (Lead ID) เช่น 1"
            style={{ padding: '10px 14px', borderRadius: '12px', border: '1px solid var(--border-strong)', width: '240px' }}
            required
          />
          <button type="submit" className="secondary-button" disabled={queryingLead}>
            {queryingLead ? 'กำลังค้นหา...' : 'ดึงข้อมูลพอยต์ & MGM'}
          </button>
        </form>

        {queriedLeadId !== null && (
          <div className="two-column-grid" style={{ background: 'rgba(255,255,255,0.4)', borderRadius: '18px', padding: '16px', border: '1px solid var(--border)' }}>
            <div>
              <h4 style={{ margin: '0 0 10px' }}>รหัสสมาชิกคนไข้ #{queriedLeadId}</h4>
              <div className="metric-row" style={{ background: '#fff' }}>
                <span>แต้มสะสมปัจจุบัน (Loyalty Points)</span>
                <strong style={{ fontSize: '1.4rem', color: '#b45309' }}>{formatNumber(loyaltyBalance)} Points</strong>
              </div>
              <div style={{ marginTop: '14px' }}>
                <span className="pill">รหัสแนะนำส่งต่อเพื่อน: FB-{queriedLeadId}-GOLD</span>
              </div>
            </div>

            <div>
              <h4 style={{ margin: '0 0 10px' }}>เพื่อนที่แนะนำเข้ารับบริการ (MGM List)</h4>
              {referrals.length === 0 ? (
                <p className="muted" style={{ fontSize: '0.9rem' }}>คนไข้รายนี้ยังไม่มีการแนะนำเพื่อนเข้ามา</p>
              ) : (
                <div className="table-shell">
                  <table className="data-table" style={{ fontSize: '0.85rem' }}>
                    <thead>
                      <tr>
                        <th>ชื่อเพื่อน</th>
                        <th>สถานะดีล</th>
                        <th>แจกโบนัสแล้ว</th>
                        <th>วันที่ลงทะเบียน</th>
                      </tr>
                    </thead>
                    <tbody>
                      {referrals.map(ref => (
                        <tr key={ref.id}>
                          <td>{ref.referred_lead_name}</td>
                          <td>
                            <span className={`pill compact-pill status-${ref.status}`}>
                              {ref.status}
                            </span>
                          </td>
                          <td>{ref.reward_issued ? '✅ ได้รับแล้ว' : '❌ ยังไม่ได้รับ'}</td>
                          <td>{formatDateTime(ref.created_at).split(' ')[0]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </PageShell>
  );
}

function AiAgentConsolePage() {
  const api = useApi();
  const sessionOptions = useSessionRequestOptions();
  const [activeTab, setActiveTab] = useState('hitl'); // 'hitl' or 'rules'
  const [flash, setFlash] = useState(null);

  // HITL Queue State
  const [queue, setQueue] = useState([]);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [editingTexts, setEditingTexts] = useState({}); // messageId -> overridden text
  const [submittingApprovals, setSubmittingApprovals] = useState({}); // messageId -> loading state

  // Rules State
  const [rules, setRules] = useState([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [savingRules, setSavingRules] = useState({}); // agentType -> loading state

  // Fetch HITL Queue
  const fetchQueue = useCallback(async () => {
    setLoadingQueue(true);
    try {
      const data = await api.getApprovalQueue(sessionOptions);
      setQueue(data || []);
    } catch (err) {
      setFlash({ kind: 'error', message: err.message || 'ดึงคิว HITL ล้มเหลว' });
    } finally {
      setLoadingQueue(false);
    }
  }, [api, sessionOptions]);

  // Fetch Rules
  const fetchRules = useCallback(async () => {
    setLoadingRules(true);
    try {
      const data = await api.getAgentRules(sessionOptions);
      setRules(data || []);
    } catch (err) {
      setFlash({ kind: 'error', message: err.message || 'ดึงกฎ AI Agent ล้มเหลว' });
    } finally {
      setLoadingRules(false);
    }
  }, [api, sessionOptions]);

  useEffect(() => {
    if (activeTab === 'hitl') {
      fetchQueue();
    } else {
      fetchRules();
    }
  }, [activeTab, fetchQueue, fetchRules]);

  async function handleApprove(messageId, isOverride) {
    setSubmittingApprovals(prev => ({ ...prev, [messageId]: true }));
    const overrideText = editingTexts[messageId];
    try {
      await api.approveMessage(sessionOptions, messageId, {
        staffOverrideText: isOverride ? overrideText : null
      });
      setFlash({ kind: 'success', message: 'อนุมัติและส่งข้อความเรียบร้อยแล้ว!' });
      // Remove from local queue list
      setQueue(prev => prev.filter(item => item.id !== messageId));
    } catch (err) {
      setFlash({ kind: 'error', message: err.message || 'การอนุมัติล้มเหลว' });
    } finally {
      setSubmittingApprovals(prev => ({ ...prev, [messageId]: false }));
    }
  }

  async function handleSaveRule(agentType, systemPrompt, temperature, rulesConfig = {}) {
    setSavingRules(prev => ({ ...prev, [agentType]: true }));
    try {
      await api.updateAgentRule(sessionOptions, {
        agentType,
        systemPrompt,
        temperature,
        rulesConfig
      });
      setFlash({ kind: 'success', message: `บันทึก Prompts สำหรับบอต ${agentType} สำเร็จ!` });
      await fetchRules(); // reload
    } catch (err) {
      setFlash({ kind: 'error', message: err.message || 'บันทึกกฎล้มเหลว' });
    } finally {
      setSavingRules(prev => ({ ...prev, [agentType]: false }));
    }
  }

  return (
    <PageShell
      title="คอนโซลควบคุม AI Agent และ HITL"
      intro="จัดการคิวการอนุมัติความถูกต้องก่อนส่งถึงคนไข้ (Human-In-The-Loop) และระบบปรับแต่ง System Prompts แยกรายหน้าที่ของ AI Multi-Agent"
    >
      <StatusBanner state={flash} />

      {/* Tabs Menu */}
      <div className="tab-menu" style={{ marginBottom: '24px', display: 'flex', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '12px' }}>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'hitl' ? 'active' : ''}`}
          onClick={() => setActiveTab('hitl')}
          style={{
            background: activeTab === 'hitl' ? 'linear-gradient(135deg, var(--gold-primary), var(--gold-secondary))' : 'rgba(255,255,255,0.05)',
            color: activeTab === 'hitl' ? '#0d1117' : '#e2e8f0',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '4px',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          คิว HITL รอตรวจ ({queue.length})
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'rules' ? 'active' : ''}`}
          onClick={() => setActiveTab('rules')}
          style={{
            background: activeTab === 'rules' ? 'linear-gradient(135deg, var(--gold-primary), var(--gold-secondary))' : 'rgba(255,255,255,0.05)',
            color: activeTab === 'rules' ? '#0d1117' : '#e2e8f0',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '4px',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          Prompt และกฎของ AI Agent
        </button>
      </div>

      {activeTab === 'hitl' ? (
        <section className="section-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3 className="section-heading">คิวตรวจความถูกต้องก่อนตอบลูกค้า</h3>
              <p className="muted">ข้อความที่ AI ประเมินความมั่นใจต่ำกว่า 85% จะถูกกักไว้ที่นี่เพื่อให้เซลส์กดยืนยันหรือแก้ไขก่อนส่งจริง</p>
            </div>
            <button
              type="button"
              className="ghost-button"
              onClick={fetchQueue}
              disabled={loadingQueue}
            >
              {loadingQueue ? 'กำลังรีเฟรช...' : 'รีเฟรชข้อมูล'}
            </button>
          </div>

          {loadingQueue ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.5)' }}>กำลังโหลดข้อความ...</div>
          ) : queue.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '8px', color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.01)' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>🎉</div>
              <div>ยอดเยี่ยม! ไม่มีข้อความค้างในคิว HITL ขณะนี้</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {queue.map(item => {
                const isOverridden = editingTexts[item.id] !== undefined && editingTexts[item.id].trim() !== '';
                const currentText = editingTexts[item.id] !== undefined ? editingTexts[item.id] : item.messageText;

                return (
                  <div
                    key={item.id}
                    className="hitl-queue-card"
                    style={{
                      border: '1px solid rgba(255, 215, 0, 0.2)',
                      background: 'linear-gradient(145deg, rgba(20, 24, 33, 0.9), rgba(13, 17, 23, 0.95))',
                      borderRadius: '8px',
                      padding: '20px',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                      transition: 'all 0.3s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontWeight: 'bold', color: 'var(--gold-primary)', fontSize: '1.1em' }}>
                          {item.leadName} (รหัส #{item.leadId})
                        </span>
                        <span style={{ fontSize: '0.85em', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px', color: 'rgba(255,255,255,0.6)' }}>
                          Thread #{item.threadId}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            fontSize: '0.85em',
                            fontWeight: 'bold',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            background: item.confidenceScore < 0.70 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                            color: item.confidenceScore < 0.70 ? '#ef4444' : '#f59e0b',
                            border: item.confidenceScore < 0.70 ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)'
                          }}
                        >
                          Confidence: {(item.confidenceScore * 100).toFixed(0)}%
                        </span>
                        {item.confidenceScore < 0.70 && (
                          <span style={{ fontSize: '0.85em', padding: '4px 8px', borderRadius: '4px', background: 'rgba(239,68,68,0.2)', color: '#ff7878', fontWeight: 'bold' }}>
                            ⚠️ เฝ้าระวังพิเศษ
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="hitl-body-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '16px' }}>
                      <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px 16px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ fontSize: '0.8em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: '6px', fontWeight: 'bold' }}>
                          คำถามของคนไข้ (Inbound Message)
                        </div>
                        <div style={{ fontSize: '1.05em', color: '#e2e8f0', whiteSpace: 'pre-wrap' }}>
                          {item.messageText}
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ fontSize: '0.8em', color: 'var(--gold-primary)', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
                          <span>ร่างคำตอบของ AI (Draft Response)</span>
                          {isOverridden && <span style={{ color: '#ef4444' }}>(แก้ไขแล้ว)</span>}
                        </div>
                        <textarea
                          rows={3}
                          value={currentText}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditingTexts(prev => ({ ...prev, [item.id]: val }));
                          }}
                          style={{
                            background: 'rgba(0,0,0,0.3)',
                            border: '1px solid rgba(255,215,0,0.3)',
                            borderRadius: '6px',
                            color: '#fff',
                            padding: '10px',
                            fontFamily: 'inherit',
                            fontSize: '0.95em',
                            resize: 'vertical',
                            width: '100%',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => {
                          setEditingTexts(prev => {
                            const copy = { ...prev };
                            delete copy[item.id];
                            return copy;
                          });
                        }}
                        disabled={submittingApprovals[item.id] || !isOverridden}
                      >
                        คืนค่าเดิม
                      </button>
                      <button
                        type="button"
                        className="primary-button gold-btn"
                        onClick={() => handleApprove(item.id, isOverridden)}
                        disabled={submittingApprovals[item.id]}
                        style={{
                          background: isOverridden ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, var(--gold-primary), var(--gold-secondary))',
                          color: isOverridden ? '#0d1117' : '#0d1117'
                        }}
                      >
                        {submittingApprovals[item.id] ? 'กำลังส่ง...' : isOverridden ? 'ส่งข้อความแก้ไข' : 'อนุมัติและส่งทันที'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : (
        <section className="section-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3 className="section-heading">ปรับแต่งคำสั่งระบบ (Agent Prompts & Settings)</h3>
              <p className="muted">กำหนดพฤติกรรม, ความเชี่ยวชาญ และความมั่นใจในคำพูดของ AI Agent รายหัตถการ</p>
            </div>
            <button
              type="button"
              className="ghost-button"
              onClick={fetchRules}
              disabled={loadingRules}
            >
              {loadingRules ? 'กำลังรีเฟรช...' : 'รีเฟรชข้อมูล'}
            </button>
          </div>

          {loadingRules ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.5)' }}>กำลังโหลดรายการกฎ...</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              {rules.map(rule => (
                <div
                  key={rule.id}
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: '8px',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '12px'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px', marginBottom: '12px' }}>
                      <span style={{ fontWeight: 'bold', color: 'var(--gold-primary)', textTransform: 'capitalize', fontSize: '1.1em' }}>
                        {rule.agent_type === 'qualification' ? 'คัดกรองลีด (Qualification)' : rule.agent_type === 'consult' ? 'ที่ปรึกษาแพทย์ (Consult)' : rule.agent_type === 'retention' ? 'ดูแลลูกค้าซ้ำ (Retention)' : 'บอตประสานงาน (Orchestrator)'}
                      </span>
                      <span style={{ fontSize: '0.85em', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px', color: 'rgba(255,255,255,0.6)' }}>
                        Type: {rule.agent_type}
                      </span>
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', fontSize: '0.85em', color: 'rgba(255,255,255,0.5)', marginBottom: '4px', fontWeight: 'bold' }}>
                      คำสั่ง System Prompt
                      </label>
                      <textarea
                        rows={6}
                        defaultValue={rule.system_prompt}
                        id={`prompt-${rule.agent_type}`}
                        style={{
                          background: 'rgba(0,0,0,0.2)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '6px',
                          color: '#fff',
                          padding: '10px',
                          fontFamily: 'inherit',
                          fontSize: '0.9em',
                          resize: 'vertical',
                          width: '100%',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85em', color: 'rgba(255,255,255,0.5)', marginBottom: '4px', fontWeight: 'bold' }}>
                        <span>Creativity / Temperature</span>
                        <span style={{ color: 'var(--gold-primary)', fontWeight: 'bold' }} id={`temp-val-${rule.agent_type}`}>
                          {rule.temperature}
                        </span>
                      </label>
                      <input
                        type="range"
                        min="0.0"
                        max="1.0"
                        step="0.05"
                        defaultValue={rule.temperature}
                        id={`slider-${rule.agent_type}`}
                        onChange={(e) => {
                          const val = e.target.value;
                          const el = document.getElementById(`temp-val-${rule.agent_type}`);
                          if (el) el.textContent = val;
                        }}
                        style={{ width: '100%', cursor: 'pointer' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="primary-button gold-btn"
                      onClick={() => {
                        const promptEl = document.getElementById(`prompt-${rule.agent_type}`);
                        const tempEl = document.getElementById(`slider-${rule.agent_type}`);
                        if (promptEl && tempEl) {
                          handleSaveRule(rule.agent_type, promptEl.value, Number(tempEl.value), rule.rules_config);
                        }
                      }}
                      disabled={savingRules[rule.agent_type]}
                    >
                      {savingRules[rule.agent_type] ? 'กำลังบันทึก...' : 'บันทึก Prompt'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </PageShell>
  );
}

function BlogManagerPage() {
  const api = useApi();
  const { session } = useWorkspace();
  const sessionOptions = useSessionRequestOptions();
  const permissions = usePermissions();
  const canManage = permissions.hasAny(['blog.manage', 'workspace.manage', 'tenant.manage']);
  
  const [flash, setFlash] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [currentPost, setCurrentPost] = useState(null);
  const [activeTab, setActiveTab] = useState('edit'); // 'edit' or 'preview'
  
  const [form, setForm] = useState({
    title: '',
    excerpt: '',
    content: '',
    coverImageUrl: '',
    authorName: '',
    status: 'draft',
    tags: '',
    seoTitle: '',
    seoDescription: '',
    ogImageUrl: ''
  });

  const [state, setState] = usePageData(
    () => api.listBlogPosts(sessionOptions, { status: 'all' }),
    [api, sessionOptions],
    canManage
  );

  async function refreshPosts() {
    setState((current) => ({ ...current, status: 'loading' }));
    try {
      const data = await api.listBlogPosts(sessionOptions, { status: 'all' });
      setState({ status: 'ready', data, error: null });
    } catch (error) {
      setState({ status: 'error', data: null, error });
    }
  }

  function handleCreateNew() {
    setForm({
      title: '',
      excerpt: '',
      content: '',
      coverImageUrl: '',
      authorName: session.user?.name || 'ทีมแพทย์ประจำคลินิก',
      status: 'draft',
      tags: '',
      seoTitle: '',
      seoDescription: '',
      ogImageUrl: ''
    });
    setCurrentPost(null);
    setIsEditing(true);
    setActiveTab('edit');
  }

  function handleEditClick(post) {
    setForm({
      title: post.title || '',
      excerpt: post.excerpt || '',
      content: post.content || '',
      coverImageUrl: post.cover_image_url || '',
      authorName: post.author_name || '',
      status: post.status || 'draft',
      tags: Array.isArray(post.tags) ? post.tags.join(', ') : '',
      seoTitle: post.seo_title || '',
      seoDescription: post.seo_description || '',
      ogImageUrl: post.og_image_url || ''
    });
    setCurrentPost(post);
    setIsEditing(true);
    setActiveTab('edit');
  }

  async function handleFormSubmit(e) {
    e.preventDefault();
    if (!form.title || !form.content || !form.authorName) {
      setFlash({ kind: 'error', message: 'Title, content, and author name are required.' });
      return;
    }

    const payload = {
      ...form,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      ogImageUrl: form.ogImageUrl || form.coverImageUrl
    };

    try {
      if (currentPost) {
        await api.updateBlogPost(sessionOptions, currentPost.id, payload);
      setFlash({ kind: 'success', message: 'อัปเดตบทความเรียบร้อยแล้ว' });
      } else {
        await api.createBlogPost(sessionOptions, payload);
        setFlash({ kind: 'success', message: 'สร้างบทความเรียบร้อยแล้ว' });
      }
      setIsEditing(false);
      setCurrentPost(null);
      await refreshPosts();
    } catch (error) {
      setFlash({ kind: 'error', message: describeError(error) });
    }
  }

  async function handleDelete(postId) {
    if (!window.confirm('Are you sure you want to delete this blog post?')) {
      return;
    }
    try {
      await api.deleteBlogPost(sessionOptions, postId);
      setFlash({ kind: 'success', message: 'ลบบทความเรียบร้อยแล้ว' });
      await refreshPosts();
    } catch (error) {
      setFlash({ kind: 'error', message: describeError(error) });
    }
  }

  if (!canManage) {
    return <PermissionNotice title="ไม่มีสิทธิ์เข้าใช้งาน" message="คุณไม่มีสิทธิ์จัดการบทความ" />;
  }

  // Simple Markdown parser for preview
  function renderMarkdown(text) {
    if (!text) return '';
    let html = escapeHtml(text)
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*)\*/gim, '<em>$1</em>')
      .replace(/!\[(.*?)\]\((.*?)\)/gim, (_, alt, src) => (
        isSafeUrl(src) ? `<img alt="${escapeHtml(alt)}" src="${escapeHtml(src)}" />` : ''
      ))
      .replace(/\[(.*?)\]\((.*?)\)/gim, (_, label, href) => (
        isSafeUrl(href) ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${label}</a>` : label
      ))
      .replace(/\n\n/g, '</p><p>');
    return sanitizeRichHtml('<p>' + html + '</p>');
  }

  return (
    <PageShell 
      title="จัดการบทความ"
      intro="เผยแพร่บทความความงาม ข่าวคลินิก และคำแนะนำสุขภาพผิวอย่างปลอดภัยต่อ SEO"
      actions={
        !isEditing && (
          <button type="button" className="primary-button" onClick={handleCreateNew}>
            + สร้างบทความใหม่
          </button>
        )
      }
    >
      <StatusBanner state={flash} />
      
      {isEditing ? (
        <form onSubmit={handleFormSubmit} className="blog-editor-form">
          <div className="blog-editor-layout">
            <div className="blog-editor-main">
              <label className="field">
                <span>หัวข้อ *</span>
                <input 
                  type="text" 
                  value={form.title} 
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))} 
                  placeholder="เช่น 5 วิธีดูแลผิวให้ฉ่ำวาวอย่างปลอดภัย"
                  required
                />
              </label>

              <label className="field">
                <span>สรุปสั้น</span>
                <textarea 
                  value={form.excerpt} 
                  onChange={e => setForm(f => ({ ...f, excerpt: e.target.value }))} 
                  placeholder="สรุปเนื้อหาสำหรับการ์ดในหน้ารวมบทความ"
                  rows={2}
                />
              </label>

              <div>
                <div className="blog-editor-tabs">
                  <button 
                    type="button" 
                    className={`secondary-button compact-inline-actions ${activeTab === 'edit' ? 'active' : ''}`}
                    style={{ background: activeTab === 'edit' ? 'var(--accent)' : 'transparent', color: activeTab === 'edit' ? '#fff' : 'var(--text)' }}
                    onClick={() => setActiveTab('edit')}
                  >
                    แก้ไข (Markdown)
                  </button>
                  <button 
                    type="button" 
                    className={`secondary-button compact-inline-actions ${activeTab === 'preview' ? 'active' : ''}`}
                    style={{ background: activeTab === 'preview' ? 'var(--accent)' : 'transparent', color: activeTab === 'preview' ? '#fff' : 'var(--text)' }}
                    onClick={() => setActiveTab('preview')}
                  >
                    ตัวอย่าง
                  </button>
                </div>

                {activeTab === 'edit' ? (
                  <label className="field">
                    <span>เนื้อหา *</span>
                    <textarea 
                      value={form.content} 
                      onChange={e => setForm(f => ({ ...f, content: e.target.value }))} 
                      placeholder="เขียนบทความด้วย Markdown..."
                      rows={15}
                      required
                    />
                  </label>
                ) : (
                  <div 
                    className="markdown-preview-card"
                    style={{ 
                      padding: '16px', 
                      background: 'rgba(255,255,255,0.7)', 
                      border: '1px solid var(--border)', 
                      borderRadius: '14px',
                      minHeight: '340px',
                      maxHeight: '500px',
                      overflowY: 'auto'
                    }}
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(form.content) }}
                  />
                )}
              </div>
            </div>

            <div className="blog-settings-panel">
              <h3>ตั้งค่าบทความ</h3>
              
              <label className="field">
                <span>ชื่อผู้เขียน *</span>
                <input 
                  type="text" 
                  value={form.authorName} 
                  onChange={e => setForm(f => ({ ...f, authorName: e.target.value }))} 
                  required
                />
              </label>

              <label className="field">
                <span>สถานะ</span>
                <select 
                  value={form.status} 
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                >
                  <option value="draft">แบบร่าง</option>
                  <option value="published">เผยแพร่</option>
                </select>
              </label>

              <label className="field">
                <span>URL รูปหน้าปก</span>
                <input 
                  type="text" 
                  value={form.coverImageUrl} 
                  onChange={e => setForm(f => ({ ...f, coverImageUrl: e.target.value }))} 
                  placeholder="https://example.com/cover.jpg"
                />
              </label>

              <label className="field">
                <span>แท็ก (คั่นด้วยเครื่องหมายจุลภาค)</span>
                <input 
                  type="text" 
                  value={form.tags} 
                  onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} 
                  placeholder="ดูแลผิว, หัตถการ, โบท็อกซ์"
                />
              </label>

              <h3 className="blog-settings-subheading">ตั้งค่า SEO (ไม่บังคับ)</h3>

              <label className="field">
                <span>หัวข้อ SEO</span>
                <input 
                  type="text" 
                  value={form.seoTitle} 
                  onChange={e => setForm(f => ({ ...f, seoTitle: e.target.value }))} 
                  placeholder="ถ้าเว้นว่าง ระบบจะใช้หัวข้อบทความ"
                />
              </label>

              <label className="field">
                <span>คำอธิบาย SEO</span>
                <textarea 
                  value={form.seoDescription} 
                  onChange={e => setForm(f => ({ ...f, seoDescription: e.target.value }))} 
                  placeholder="คำอธิบายที่แสดงในผลการค้นหา Google"
                  rows={3}
                />
              </label>

              <label className="field">
                <span>URL รูปแชร์โซเชียล</span>
                <input 
                  type="text" 
                  value={form.ogImageUrl} 
                  onChange={e => setForm(f => ({ ...f, ogImageUrl: e.target.value }))} 
                  placeholder="ถ้าเว้นว่าง ระบบจะใช้รูปหน้าปก"
                />
              </label>
            </div>
          </div>

          <div className="blog-editor-actions">
            <button type="button" className="secondary-button" onClick={() => setIsEditing(false)}>
              ยกเลิก
            </button>
            <button type="submit" className="primary-button">
              บันทึกบทความ
            </button>
          </div>
        </form>
      ) : (
        <div>
          {state.status === 'loading' && <LoadingCard label="กำลังโหลดบทความ..." />}
          {state.status === 'error' && <ErrorCard error={state.error} />}
          {state.status === 'ready' && (
            <div>
              {state.data.items.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', background: 'rgba(255,255,255,0.5)', borderRadius: '16px', border: '1px solid var(--border)' }}>
                  <p style={{ color: 'var(--text-muted)' }}>ยังไม่มีบทความ กด "+ สร้างบทความใหม่" เพื่อเริ่มเผยแพร่</p>
                </div>
              ) : (
                <div className="table-shell card">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>หัวข้อ</th>
                        <th>ผู้เขียน</th>
                        <th>สถานะ</th>
                        <th>เผยแพร่เมื่อ</th>
                        <th>อัปเดตเมื่อ</th>
                        <th style={{ textAlign: 'right' }}>การทำงาน</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.data.items.map((post) => (
                        <tr key={post.id}>
                          <td>
                            <strong>{post.title}</strong>
                            {post.excerpt && <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>{post.excerpt}</p>}
                          </td>
                          <td>{post.author_name}</td>
                          <td>
                            <span 
                              className="pill" 
                              style={{ 
                                background: post.status === 'published' ? 'rgba(15,118,110,0.1)' : 'rgba(0,0,0,0.06)',
                                color: post.status === 'published' ? 'var(--accent-strong)' : 'var(--text-muted)'
                              }}
                            >
                              {post.status === 'published' ? 'เผยแพร่' : 'แบบร่าง'}
                            </span>
                          </td>
                          <td>{formatDateTime(post.published_at)}</td>
                          <td>{formatDateTime(post.updated_at)}</td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '8px' }}>
                              <button type="button" className="secondary-button" onClick={() => handleEditClick(post)}>
                                แก้ไข
                              </button>
                              <button type="button" className="ghost-danger-button" onClick={() => handleDelete(post.id)}>
                                ลบ
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}

function ForumModeratorPage() {
  const api = useApi();
  const { session } = useWorkspace();
  const sessionOptions = useSessionRequestOptions();
  const permissions = usePermissions();
  const canManage = permissions.hasAny(['forum.moderate', 'forum.medical_answer', 'workspace.manage', 'tenant.manage']);

  const [flash, setFlash] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('active');
  
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [topicReplies, setTopicReplies] = useState([]);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [postingReply, setPostingReply] = useState(false);

  const [state, setState] = usePageData(
    () => api.listForumTopics(sessionOptions, { category: selectedCategory, status: selectedStatus }),
    [api, sessionOptions, selectedCategory, selectedStatus],
    canManage
  );

  async function refreshTopics() {
    setState((current) => ({ ...current, status: 'loading' }));
    try {
      const data = await api.listForumTopics(sessionOptions, { category: selectedCategory, status: selectedStatus });
      setState({ status: 'ready', data, error: null });
    } catch (error) {
      setState({ status: 'error', data: null, error });
    }
  }

  async function handleSelectTopic(topic) {
    setSelectedTopic(topic);
    setLoadingReplies(true);
    setReplyText('');
    try {
      const detail = await api.getForumTopicDetail(sessionOptions, topic.id);
      setTopicReplies(detail.replies || []);
    } catch (err) {
      setFlash({ kind: 'error', message: 'โหลดคำตอบของหัวข้อไม่สำเร็จ' });
    } finally {
      setLoadingReplies(false);
    }
  }

  async function handleUpdateStatus(topicId, status) {
    try {
      await api.updateForumTopicStatus(sessionOptions, topicId, { status });
      setFlash({ kind: 'success', message: `อัปเดตสถานะหัวข้อเป็น ${status} แล้ว` });
      if (selectedTopic && selectedTopic.id === topicId) {
        setSelectedTopic(null);
        setTopicReplies([]);
      }
      await refreshTopics();
    } catch (err) {
      setFlash({ kind: 'error', message: 'อัปเดตสถานะหัวข้อไม่สำเร็จ' });
    }
  }

  async function handleVerifyReply(replyId, isVerified) {
    try {
      await api.verifyForumReply(sessionOptions, replyId, { isVerified });
      setFlash({ kind: 'success', message: isVerified ? 'ทำเครื่องหมายคำตอบแนะนำแล้ว' : 'ยกเลิกคำตอบแนะนำแล้ว' });
      setTopicReplies(prev => prev.map(r => r.id === replyId ? { ...r, is_verified_answer: isVerified } : r));
      await refreshTopics();
    } catch (err) {
      setFlash({ kind: 'error', message: 'อัปเดตการรับรองคำตอบไม่สำเร็จ' });
    }
  }

  async function handlePostReply(e) {
    e.preventDefault();
    if (!replyText.trim() || !selectedTopic) return;

    setPostingReply(true);
    try {
      const newReply = await api.createForumReply(sessionOptions, selectedTopic.id, {
        content: replyText,
        authorDisplayName: session.user?.name || 'แพทย์ประจำคลินิก',
        isAnonymous: false,
        isDoctorReply: true
      });
      setFlash({ kind: 'success', message: 'โพสต์คำตอบแพทย์เรียบร้อยแล้ว' });
      setTopicReplies(prev => [...prev, newReply]);
      setReplyText('');
      await refreshTopics();
    } catch (err) {
      setFlash({ kind: 'error', message: 'โพสต์คำตอบไม่สำเร็จ' });
    } finally {
      setPostingReply(false);
    }
  }

  const categories = [
    { key: 'all', label: 'ทุกหมวดหมู่' },
    { key: 'skincare', label: 'สุขภาพผิว' },
    { key: 'surgery', label: 'ศัลยกรรม/ปรับรูปหน้า' },
    { key: 'qa', label: 'Q&A' },
    { key: 'general', label: 'ทั่วไป' }
  ];

  const statuses = [
    { key: 'active', label: 'เปิดใช้งาน' },
    { key: 'locked', label: 'ล็อก' },
    { key: 'hidden', label: 'ซ่อน' }
  ];

  return (
    <PageShell 
      title="ดูแลเว็บบอร์ด"
      intro="ตรวจหัวข้อสาธารณะ โพสต์คำตอบแพทย์ และรับรองคำตอบที่เหมาะสม"
    >
      <StatusBanner state={flash} />

      <div className={`forum-moderator-layout ${selectedTopic ? 'with-detail' : ''}`}>
        <div>
          <div className="card forum-filter-card">
            <div className="forum-filter-control">
              <label>หมวดหมู่</label>
              <select value={selectedCategory} onChange={e => { setSelectedCategory(e.target.value); setSelectedTopic(null); }} className="input">
                {categories.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
            <div className="forum-filter-control">
              <label>สถานะ</label>
              <select value={selectedStatus} onChange={e => { setSelectedStatus(e.target.value); setSelectedTopic(null); }} className="input">
                {statuses.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
          </div>

          {state.status === 'loading' && <LoadingCard label="กำลังโหลดหัวข้อถามตอบ..." />}
          {state.status === 'error' && <ErrorCard error={state.error} />}
          {state.status === 'ready' && (
            <div className="table-shell card">
              {state.data.items.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center' }}>
                  <p style={{ color: 'var(--text-muted)' }}>ไม่พบหัวข้อตามเงื่อนไขนี้</p>
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>หัวข้อ</th>
                      <th>หมวดหมู่</th>
                      <th>ผู้เขียน</th>
                      <th>คำตอบ</th>
                      <th style={{ textAlign: 'right' }}>การจัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.data.items.map(topic => (
                      <tr 
                        key={topic.id} 
                        style={{ 
                          cursor: 'pointer',
                          background: selectedTopic?.id === topic.id ? 'var(--surface-muted)' : 'transparent' 
                        }}
                        onClick={() => handleSelectTopic(topic)}
                      >
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <strong>{topic.title}</strong>
                            {topic.is_doctor_verified && <span className="pill" style={{ background: 'rgba(15,118,110,0.1)', color: 'var(--accent-strong)', fontSize: '10px' }}>แพทย์ตอบแล้ว</span>}
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {new Date(topic.created_at).toLocaleString()}
                          </span>
                        </td>
                        <td><span className="pill" style={{ background: 'rgba(0,0,0,0.06)' }}>{topic.category.toUpperCase()}</span></td>
                        <td>
                          {topic.author_display_name}
                          {topic.is_anonymous && <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '4px' }}>(ไม่ระบุตัวตน)</span>}
                        </td>
                        <td>{topic.reply_count}</td>
                        <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'inline-flex', gap: '6px' }}>
                            {topic.status === 'active' ? (
                              <>
                                <button type="button" className="secondary-button" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={() => handleUpdateStatus(topic.id, 'locked')}>
                                  ล็อก
                                </button>
                                <button type="button" className="ghost-danger-button" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={() => handleUpdateStatus(topic.id, 'hidden')}>
                                  ซ่อน
                                </button>
                              </>
                            ) : (
                              <button type="button" className="primary-button" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={() => handleUpdateStatus(topic.id, 'active')}>
                                เปิดใช้งาน
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {selectedTopic && (
          <div className="card forum-topic-detail-card">
            <div className="forum-detail-header">
              <div>
                <span className="pill" style={{ background: 'rgba(0,0,0,0.06)', marginBottom: '8px', display: 'inline-block' }}>{selectedTopic.category.toUpperCase()}</span>
                <h2 style={{ margin: '0 0 6px 0', fontSize: '1.4rem' }}>{selectedTopic.title}</h2>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  โดย {selectedTopic.author_display_name} • {new Date(selectedTopic.created_at).toLocaleString('th-TH')}
                </span>
              </div>
              <button type="button" className="ghost-button" onClick={() => { setSelectedTopic(null); setTopicReplies([]); }}>ปิด</button>
            </div>

            <div style={{ background: 'var(--surface-muted)', padding: '12px 16px', borderRadius: '8px', fontSize: '14px', whiteSpace: 'pre-wrap' }}>
              {selectedTopic.content}
            </div>

            <h3 style={{ margin: '12px 0 0 0', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>คำตอบ</h3>
            
            {loadingReplies ? (
              <p style={{ color: 'var(--text-muted)' }}>กำลังโหลดคำตอบ...</p>
            ) : (
              <div className="forum-replies-scroll">
                {topicReplies.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>ยังไม่มีคำตอบ</p>
                ) : (
                  topicReplies.map(reply => (
                    <div 
                      key={reply.id} 
                      style={{ 
                        padding: '12px', 
                        borderRadius: '8px', 
                        border: reply.is_doctor_reply ? '1px solid var(--accent)' : '1px solid var(--border)',
                        background: reply.is_verified_answer ? 'rgba(15,118,110,0.04)' : 'transparent'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 'bold' }}>
                          {reply.author_display_name} 
                          {reply.is_doctor_reply && <span style={{ color: 'var(--accent)', marginLeft: '4px' }}>(แพทย์)</span>}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {new Date(reply.created_at).toLocaleString('th-TH')}
                        </span>
                      </div>
                      <p style={{ margin: '0 0 8px 0', fontSize: '13px', whiteSpace: 'pre-wrap' }}>{reply.content}</p>
                      
                      <div className="forum-reply-toolbar">
                        {reply.is_verified_answer ? (
                          <button 
                            type="button" 
                            className="secondary-button" 
                            style={{ padding: '2px 6px', fontSize: '11px' }}
                            onClick={() => handleVerifyReply(reply.id, false)}
                          >
                            ยกเลิกคำตอบแนะนำ
                          </button>
                        ) : (
                          <button 
                            type="button" 
                            className="primary-button" 
                            style={{ padding: '2px 6px', fontSize: '11px' }}
                            onClick={() => handleVerifyReply(reply.id, true)}
                          >
                            รับรองคำตอบ
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            <form onSubmit={handlePostReply} className="forum-answer-form">
              <label style={{ fontSize: '13px', fontWeight: 'bold' }}>โพสต์คำตอบแพทย์อย่างเป็นทางการ</label>
              <textarea
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                placeholder="พิมพ์คำตอบจากแพทย์หรือเจ้าหน้าที่ที่ได้รับอนุมัติ..."
                rows={3}
                style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', font: 'inherit', fontSize: '13px' }}
                required
              />
              <button 
                type="submit" 
                className="primary-button" 
                style={{ alignSelf: 'flex-end' }} 
                disabled={postingReply || !replyText.trim()}
              >
                {postingReply ? 'กำลังโพสต์...' : 'โพสต์คำตอบ'}
              </button>
            </form>
          </div>
        )}
      </div>
    </PageShell>
  );
}

function renderPage(route) {
  switch (route?.key) {
    case 'unified-inbox':
      return <UnifiedInboxPage />;
    case 'roas-analytics':
      return <RoasAnalyticsPage />;
    case 'blog-manager':
      return <BlogManagerPage />;
    case 'forum-moderator':
      return <ForumModeratorPage />;
    case 'ai-agent-console':
      return <AiAgentConsolePage />;
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
      storeAdminToken(session.token);
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
        <p className="pill">ศูนย์ควบคุมผู้ดูแล</p>
        <h1 className="page-title">เข้าสู่ระบบ FlowBiz</h1>
        <p className="page-intro">ใช้บัญชีคลินิกเพื่อเปิดแดชบอร์ด เวิร์กสเปซ และเครื่องมือปฏิบัติการ</p>
        <StatusBanner state={state.status === 'error' ? { kind: 'error', message: describeError(state.error) } : null} testId="login-error" />
        <form className="form-grid" onSubmit={handleSubmit} data-testid="login-form">
          <label className="field field-span-2">
            <span>อีเมล</span>
            <input
              type="email"
              autoComplete="username"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              placeholder="owner@example.com"
              data-testid="login-email"
            />
          </label>
          <label className="field field-span-2">
            <span>รหัสผ่าน</span>
            <input
              type="password"
              autoComplete="current-password"
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              data-testid="login-password"
            />
          </label>
          <label className="field field-span-2">
            <span>รหัสคลินิก (ไม่บังคับ)</span>
            <input
              autoComplete="organization"
              value={form.clinicSlug}
              onChange={(event) => setForm((current) => ({ ...current, clinicSlug: event.target.value }))}
              placeholder="demo-clinic"
            />
          </label>
          <div className="inline-actions field-span-2">
            <button type="submit" className="primary-button" data-testid="login-submit" disabled={state.status === 'loading'}>
              {state.status === 'loading' ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
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
  const [token, setToken] = useState(() => readStoredAdminToken());
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
          clearStoredAdminToken();
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
                  <LoadingCard label="กำลังเตรียมเซสชันผู้ดูแล..." />
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
