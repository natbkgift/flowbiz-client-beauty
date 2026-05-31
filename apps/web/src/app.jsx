import React, { createContext, startTransition, useContext, useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import DOMPurify from 'dompurify';
import { Button } from './components/ui/Button.jsx';
import { Card } from './components/ui/Card.jsx';
import { EmptyState } from './components/ui/EmptyState.jsx';
import { LoadingState } from './components/ui/LoadingState.jsx';

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
  { key: 'clinics', label: 'จัดการคลินิก', caption: 'เพิ่ม แก้ไข และควบคุมคลินิก' },
  { key: 'clinic-website', label: 'เว็บไซต์คลินิก', caption: 'ตั้งค่าเว็บ โลโก้ สี และหน้าแรก' },
  { key: 'clinic-offerings', label: 'บริการและแพ็กเกจ', caption: 'จัดการบริการ โปรโมชั่น และแพ็กเกจ' },
  { key: 'booking-requests', label: 'คำขอนัดหมาย', caption: 'ติดตามคำขอนัดหมายจากหน้าเว็บ' },
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
    },
    listAdminClinics(session, params = {}) {
      const search = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          search.set(key, value);
        }
      });
      const suffix = search.toString() ? `?${search.toString()}` : '';
      return request(`/admin/clinics${suffix}`, session);
    },
    getAdminClinic(session, clinicId) {
      return request(`/admin/clinics/${clinicId}`, session);
    },
    createAdminClinic(session, body) {
      return request('/admin/clinics', { ...session, method: 'POST', body });
    },
    updateAdminClinic(session, clinicId, body) {
      return request(`/admin/clinics/${clinicId}`, { ...session, method: 'PATCH', body });
    },
    updateAdminClinicStatus(session, clinicId, body) {
      return request(`/admin/clinics/${clinicId}/status`, { ...session, method: 'PATCH', body });
    },
    getClinicWebsite(session) {
      return request('/admin/clinic-website', session);
    },
    updateClinicWebsiteSettings(session, body) {
      return request('/admin/clinic-website/settings', { ...session, method: 'PATCH', body });
    },
    updateClinicWebsiteBranding(session, body) {
      return request('/admin/clinic-website/branding', { ...session, method: 'PATCH', body });
    },
    updateClinicWebsiteContact(session, body) {
      return request('/admin/clinic-website/contact', { ...session, method: 'PATCH', body });
    },
    updateClinicWebsiteLocation(session, body) {
      return request('/admin/clinic-website/location', { ...session, method: 'PATCH', body });
    },
    createClinicHomepageSection(session, body) {
      return request('/admin/clinic-website/sections', { ...session, method: 'POST', body });
    },
    updateClinicHomepageSection(session, sectionId, body) {
      return request(`/admin/clinic-website/sections/${sectionId}`, { ...session, method: 'PATCH', body });
    },
    deleteClinicHomepageSection(session, sectionId) {
      return request(`/admin/clinic-website/sections/${sectionId}`, { ...session, method: 'DELETE' });
    },
    reorderClinicHomepageSections(session, body) {
      return request('/admin/clinic-website/sections/reorder', { ...session, method: 'PATCH', body });
    },
    listClinicServices(session) {
      return request('/admin/clinic-offerings/services', session);
    },
    createClinicService(session, body) {
      return request('/admin/clinic-offerings/services', { ...session, method: 'POST', body });
    },
    updateClinicService(session, serviceId, body) {
      return request(`/admin/clinic-offerings/services/${serviceId}`, { ...session, method: 'PATCH', body });
    },
    deleteClinicService(session, serviceId) {
      return request(`/admin/clinic-offerings/services/${serviceId}`, { ...session, method: 'DELETE' });
    },
    reorderClinicServices(session, body) {
      return request('/admin/clinic-offerings/services/reorder', { ...session, method: 'PATCH', body });
    },
    listClinicPromotions(session) {
      return request('/admin/clinic-offerings/promotions', session);
    },
    createClinicPromotion(session, body) {
      return request('/admin/clinic-offerings/promotions', { ...session, method: 'POST', body });
    },
    updateClinicPromotion(session, promotionId, body) {
      return request(`/admin/clinic-offerings/promotions/${promotionId}`, { ...session, method: 'PATCH', body });
    },
    deleteClinicPromotion(session, promotionId) {
      return request(`/admin/clinic-offerings/promotions/${promotionId}`, { ...session, method: 'DELETE' });
    },
    reorderClinicPromotions(session, body) {
      return request('/admin/clinic-offerings/promotions/reorder', { ...session, method: 'PATCH', body });
    },
    listClinicPackages(session) {
      return request('/admin/clinic-offerings/packages', session);
    },
    createClinicPackage(session, body) {
      return request('/admin/clinic-offerings/packages', { ...session, method: 'POST', body });
    },
    updateClinicPackage(session, packageId, body) {
      return request(`/admin/clinic-offerings/packages/${packageId}`, { ...session, method: 'PATCH', body });
    },
    deleteClinicPackage(session, packageId) {
      return request(`/admin/clinic-offerings/packages/${packageId}`, { ...session, method: 'DELETE' });
    },
    reorderClinicPackages(session, body) {
      return request('/admin/clinic-offerings/packages/reorder', { ...session, method: 'PATCH', body });
    },
    addClinicPackageService(session, packageId, body) {
      return request(`/admin/clinic-offerings/packages/${packageId}/services`, { ...session, method: 'POST', body });
    },
    removeClinicPackageService(session, packageId, serviceId) {
      return request(`/admin/clinic-offerings/packages/${packageId}/services/${serviceId}`, { ...session, method: 'DELETE' });
    },
    reorderClinicPackageServices(session, packageId, body) {
      return request(`/admin/clinic-offerings/packages/${packageId}/services/reorder`, { ...session, method: 'PATCH', body });
    },
    listBookingRequests(session, params = {}) {
      const search = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          search.set(key, value);
        }
      });
      const suffix = search.toString() ? `?${search.toString()}` : '';
      return request(`/admin/booking-requests${suffix}`, session);
    },
    getBookingRequest(session, requestId) {
      return request(`/admin/booking-requests/${requestId}`, session);
    },
    updateBookingRequestStatus(session, requestId, body) {
      return request(`/admin/booking-requests/${requestId}/status`, { ...session, method: 'PATCH', body });
    },
    addBookingRequestNote(session, requestId, body) {
      return request(`/admin/booking-requests/${requestId}/notes`, { ...session, method: 'POST', body });
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
        <Button
          variant="secondary"
          onClick={() => {
            clearStoredAdminToken();
            setToken('');
            setSession(null);
          }}
        >
          ออกจากระบบ
        </Button>
        {switchWorkspaceState.status === 'loading' ? <span className="pill status-running">กำลังสลับเวิร์กสเปซ</span> : null}
      </div>
    </header>
  );
}

function PageShell({ title, intro, actions, children }) {
  return (
    <section className="page-shell">
      <Card variant="hero">
        <div className="split-header">
          <div>
            <h1 className="page-title">{title}</h1>
            <p className="page-intro">{intro}</p>
          </div>
          {actions ? <div className="toolbar">{actions}</div> : null}
        </div>
      </Card>
      {children}
    </section>
  );
}

function PermissionNotice({ title, message }) {
  return <EmptyState title={title} message={message} testId="permission-notice" />;
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
  return <LoadingState label={label} />;
}

function ErrorCard({ error }) {
  return (
    <Card variant="notice" className="error-card" data-testid="error-state">
      <h3 className="section-heading">ดำเนินการไม่สำเร็จ</h3>
      <p className="muted">{describeError(error)}</p>
    </Card>
  );
}

function MetricCard({ label, value, hint }) {
  return (
    <Card as="article" variant="metric">
      <span className="metric-label">{label}</span>
      <p className="metric-value">{value}</p>
      <span className="metric-hint">{hint}</span>
    </Card>
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
      setFlash({ kind: 'success', message: 'อนุมัติข้อความแล้ว ยังไม่ส่งออกจนกว่าจะสั่งส่งจากคิว outbound' });
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
                        {submittingApprovals[item.id] ? 'กำลังบันทึก...' : isOverridden ? 'อนุมัติข้อความแก้ไข' : 'อนุมัติรอส่ง'}
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

function ClinicsPage() {
  const api = useApi();
  const sessionOptions = useSessionRequestOptions();
  
  const [flash, setFlash] = useState(null);
  const [searchVal, setSearchVal] = useState('');
  const [statusVal, setStatusVal] = useState('');
  
  // Create Form State
  const [createForm, setCreateForm] = useState({
    name: '',
    slug: '',
    plan: 'starter',
    status: 'active',
    timezone: 'Asia/Bangkok',
    publicDisplayName: '',
    tagline: '',
    shortDescription: ''
  });

  // Edit State
  const [editingClinicId, setEditingClinicId] = useState(null);
  const [editForm, setEditForm] = useState({
    name: '',
    slug: '',
    plan: 'starter',
    timezone: 'Asia/Bangkok',
    publicDisplayName: '',
    tagline: '',
    shortDescription: ''
  });
  const [loadingEditDetail, setLoadingEditDetail] = useState(false);

  // Fetch list
  const [state, setState] = usePageData(
    () => api.listAdminClinics(sessionOptions, { search: searchVal, status: statusVal }),
    [api, sessionOptions, searchVal, statusVal]
  );

  async function refreshList() {
    setState((current) => ({ ...current, status: 'loading' }));
    try {
      const data = await api.listAdminClinics(sessionOptions, { search: searchVal, status: statusVal });
      setState({ status: 'ready', data, error: null });
    } catch (error) {
      setState({ status: 'error', data: null, error });
    }
  }

  // Create Clinic Submit
  async function handleCreateSubmit(e) {
    e.preventDefault();
    setFlash(null);
    if (!createForm.name.trim()) {
      setFlash({ kind: 'error', message: 'ชื่อคลินิกเป็นฟิลด์ที่จำเป็น' });
      return;
    }
    try {
      const body = {
        name: createForm.name,
        slug: createForm.slug.trim() || undefined,
        plan: createForm.plan,
        status: createForm.status,
        timezone: createForm.timezone,
        publicDisplayName: createForm.publicDisplayName.trim() || undefined,
        tagline: createForm.tagline.trim() || undefined,
        shortDescription: createForm.shortDescription.trim() || undefined
      };
      
      await api.createAdminClinic(sessionOptions, body);
      setFlash({ kind: 'success', message: 'เพิ่มคลินิกใหม่เรียบร้อยแล้ว' });
      // Reset form
      setCreateForm({
        name: '',
        slug: '',
        plan: 'starter',
        status: 'active',
        timezone: 'Asia/Bangkok',
        publicDisplayName: '',
        tagline: '',
        shortDescription: ''
      });
      // Reload
      await refreshList();
    } catch (error) {
      setFlash({ kind: 'error', message: describeError(error) });
    }
  }

  // Edit Click
  async function handleEditClick(clinicId) {
    setEditingClinicId(clinicId);
    setLoadingEditDetail(true);
    setFlash(null);
    try {
      const detail = await api.getAdminClinic(sessionOptions, clinicId);
      setEditForm({
        name: detail.name || '',
        slug: detail.slug || '',
        plan: detail.plan || 'starter',
        timezone: detail.timezone || 'Asia/Bangkok',
        publicDisplayName: detail.websiteSettings?.publicDisplayName || detail.websiteSettings?.public_display_name || '',
        tagline: detail.websiteSettings?.tagline || '',
        shortDescription: detail.websiteSettings?.shortDescription || detail.websiteSettings?.short_description || ''
      });
    } catch (error) {
      setFlash({ kind: 'error', message: describeError(error) });
    } finally {
      setLoadingEditDetail(false);
    }
  }

  // Edit Submit
  async function handleEditSubmit(e) {
    e.preventDefault();
    setFlash(null);
    if (!editForm.name.trim()) {
      setFlash({ kind: 'error', message: 'ชื่อคลินิกเป็นฟิลด์ที่จำเป็น' });
      return;
    }
    try {
      const body = {
        name: editForm.name,
        slug: editForm.slug.trim(),
        plan: editForm.plan,
        timezone: editForm.timezone,
        publicDisplayName: editForm.publicDisplayName.trim() || null,
        tagline: editForm.tagline.trim() || null,
        shortDescription: editForm.shortDescription.trim() || null
      };
      
      await api.updateAdminClinic(sessionOptions, editingClinicId, body);
      setFlash({ kind: 'success', message: 'แก้ไขข้อมูลคลินิกเรียบร้อยแล้ว' });
      setEditingClinicId(null);
      await refreshList();
    } catch (error) {
      setFlash({ kind: 'error', message: describeError(error) });
    }
  }

  // Toggle status
  async function handleToggleStatus(clinicId, currentStatus) {
    setFlash(null);
    const nextStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
      await api.updateAdminClinicStatus(sessionOptions, clinicId, { status: nextStatus });
      setFlash({ kind: 'success', message: `เปลี่ยนสถานะเป็น ${nextStatus} เรียบร้อยแล้ว` });
      if (editingClinicId === clinicId) {
        setEditingClinicId(null);
      }
      await refreshList();
    } catch (error) {
      setFlash({ kind: 'error', message: describeError(error) });
    }
  }

  // Permission/Error 403 checks
  if (state.status === 'error' && (state.error?.status === 403 || state.error?.code === 'PLATFORM_ADMIN_REQUIRED')) {
    return (
      <section className="page-shell" data-testid="clinics-page">
        <Card variant="notice" className="error-card" data-testid="clinic-platform-permission-notice">
          <h3 className="section-heading" style={{ color: 'var(--danger)' }}>ไม่สามารถเปิดหน้าจัดการคลินิกได้</h3>
          <p className="muted" style={{ fontWeight: 'bold' }}>
            ต้องเปิด ADMIN_CLINIC_API_ENABLED, เพิ่มอีเมลใน PLATFORM_ADMIN_EMAILS และตั้ง is_franchise_admin=true
          </p>
        </Card>
      </section>
    );
  }

  return (
    <PageShell
      title="จัดการคลินิก"
      intro="Platform Admin console สำหรับเพิ่ม แก้ไข และควบคุมสถานะคลินิกทั้งหมดในระบบ"
    >
      <div className="alert-banner warning" style={{ marginBottom: '10px' }}>
        <strong>คำเตือนความปลอดภัย:</strong> ต้องเปิด <code>ADMIN_CLINIC_API_ENABLED</code> ในสภาพแวดล้อม และระบุอีเมลผู้ดูแลใน <code>PLATFORM_ADMIN_EMAILS</code> เพื่อเข้าถึง API ชุดนี้
      </div>

      <StatusBanner state={flash} />

      <div className="card forum-filter-card" style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', padding: '16px' }}>
        <label className="field" style={{ flex: 1 }}>
          <span>ค้นหาคลินิก (ชื่อ หรือ slug)</span>
          <input
            type="text"
            value={searchVal}
            onChange={(e) => setSearchVal(e.target.value)}
            placeholder="ค้นหาชื่อหรือสลัก..."
            data-testid="clinics-search"
          />
        </label>
        <label className="field" style={{ width: '200px' }}>
          <span>สถานะ</span>
          <select
            value={statusVal}
            onChange={(e) => setStatusVal(e.target.value)}
            data-testid="clinics-status-filter"
          >
            <option value="">ทั้งหมด (all)</option>
            <option value="active">เปิดใช้งาน (active)</option>
            <option value="inactive">ปิดใช้งาน (inactive)</option>
          </select>
        </label>
        <Button
          variant="secondary"
          onClick={refreshList}
          data-testid="clinics-refresh"
          style={{ height: '48px' }}
        >
          รีเฟรช
        </Button>
      </div>

      <div className="blog-editor-layout" data-testid="clinics-page">
        <div className="blog-editor-main">
          {state.status === 'loading' && <LoadingCard label="กำลังโหลดข้อมูลคลินิก..." />}
          {state.status === 'error' && <ErrorCard error={state.error} />}
          {state.status === 'ready' && (
            <div className="table-shell card" style={{ padding: '0px' }}>
              <table className="data-table" data-testid="clinics-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>ชื่อคลินิก</th>
                    <th>Slug</th>
                    <th>แพ็กเกจ</th>
                    <th>สถานะ</th>
                    <th>สถานะเว็บไซต์</th>
                    <th>Timezone</th>
                    <th>สร้างเมื่อ</th>
                    <th style={{ textAlign: 'right' }}>การจัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {state.data.items.length === 0 ? (
                    <tr>
                      <td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                        ไม่พบข้อมูลคลินิกตามตัวกรองที่กำหนด
                      </td>
                    </tr>
                  ) : (
                    state.data.items.map((clinic) => (
                      <tr key={clinic.id} data-testid={`clinic-row-${clinic.id}`}>
                        <td>{clinic.id}</td>
                        <td><strong>{clinic.name}</strong></td>
                        <td><code>{clinic.slug}</code></td>
                        <td><span className="pill" style={{ background: 'rgba(15, 118, 110, 0.08)' }}>{clinic.plan}</span></td>
                        <td>
                          <span className={`pill status-${clinic.status}`}>
                            {clinic.status === 'active' ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                          </span>
                        </td>
                        <td>
                          <span className="pill" style={{ background: clinic.websiteStatus === 'active' ? 'rgba(15,118,110,0.1)' : 'rgba(0,0,0,0.06)' }}>
                            {clinic.websiteStatus || 'draft'}
                          </span>
                        </td>
                        <td>{clinic.timezone}</td>
                        <td>{formatDateTime(clinic.createdAt)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '8px' }}>
                            <button
                              type="button"
                              className="secondary-button"
                              style={{ padding: '6px 12px', fontSize: '13px' }}
                              onClick={() => handleEditClick(clinic.id)}
                              data-testid={`clinic-edit-button-${clinic.id}`}
                            >
                              แก้ไข
                            </button>
                            <button
                              type="button"
                              className={clinic.status === 'active' ? 'ghost-danger-button' : 'primary-button'}
                              style={{ padding: '6px 12px', fontSize: '13px' }}
                              onClick={() => handleToggleStatus(clinic.id, clinic.status)}
                              data-testid={`clinic-status-toggle-${clinic.id}`}
                            >
                              {clinic.status === 'active' ? 'Deactivate' : 'Activate'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="blog-settings-panel">
          {editingClinicId ? (
            <form onSubmit={handleEditSubmit} className="form-grid" data-testid="clinic-edit-form" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 className="section-heading">แก้ไขคลินิก #{editingClinicId}</h3>
              {loadingEditDetail ? (
                <p className="muted">กำลังโหลดรายละเอียด...</p>
              ) : (
                <>
                  <label className="field">
                    <span>ชื่อคลินิก <span style={{ color: 'var(--danger)' }}>*</span></span>
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>สลักคลินิก (slug)</span>
                    <input
                      type="text"
                      value={editForm.slug}
                      onChange={(e) => setEditForm({ ...editForm, slug: e.target.value })}
                      placeholder="e.g. skin-clinic"
                    />
                  </label>
                  <label className="field">
                    <span>แพ็กเกจหลัก</span>
                    <select
                      value={editForm.plan}
                      onChange={(e) => setEditForm({ ...editForm, plan: e.target.value })}
                    >
                      <option value="starter">Starter</option>
                      <option value="pro">Pro</option>
                      <option value="premium">Premium</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Timezone</span>
                    <input
                      type="text"
                      value={editForm.timezone}
                      onChange={(e) => setEditForm({ ...editForm, timezone: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>ชื่อหน้าเว็บสาธารณะ (Branding)</span>
                    <input
                      type="text"
                      value={editForm.publicDisplayName}
                      onChange={(e) => setEditForm({ ...editForm, publicDisplayName: e.target.value })}
                      placeholder="ชื่อที่จะแสดงให้สมาชิกลูกค้าเห็น"
                    />
                  </label>
                  <label className="field">
                    <span>คำโปรย (Tagline)</span>
                    <input
                      type="text"
                      value={editForm.tagline}
                      onChange={(e) => setEditForm({ ...editForm, tagline: e.target.value })}
                      placeholder="e.g. Skin care experts"
                    />
                  </label>
                  <label className="field">
                    <span>คำอธิบายย่อ (Short Description)</span>
                    <textarea
                      value={editForm.shortDescription}
                      onChange={(e) => setEditForm({ ...editForm, shortDescription: e.target.value })}
                      placeholder="คำอธิบายโดยย่อของคลินิกความงาม..."
                      rows="3"
                      style={{ minHeight: '80px' }}
                    />
                  </label>
                  <div className="blog-editor-actions" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '10px' }}>
                    <Button
                      variant="ghost"
                      onClick={() => setEditingClinicId(null)}
                      style={{ padding: '8px 16px' }}
                    >
                      ยกเลิก
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      data-testid="clinic-edit-submit"
                      style={{ padding: '8px 16px' }}
                    >
                      บันทึกข้อมูล
                    </Button>
                  </div>
                </>
              )}
            </form>
          ) : (
            <form onSubmit={handleCreateSubmit} className="form-grid" data-testid="clinic-create-form" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 className="section-heading">เพิ่มคลินิกใหม่</h3>
              <label className="field">
                <span>ชื่อคลินิก <span style={{ color: 'var(--danger)' }}>*</span></span>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="e.g. FlowBiz Beauty Center"
                  data-testid="clinic-name-input"
                  required
                />
              </label>
              <label className="field">
                <span>สลักคลินิก (slug - เว้นว่างเพื่อใช้ชื่อแปลงอัตโนมัติ)</span>
                <input
                  type="text"
                  value={createForm.slug}
                  onChange={(e) => setCreateForm({ ...createForm, slug: e.target.value })}
                  placeholder="e.g. beauty-center"
                  data-testid="clinic-slug-input"
                />
              </label>
              <label className="field">
                <span>แพ็กเกจหลัก</span>
                <select
                  value={createForm.plan}
                  onChange={(e) => setCreateForm({ ...createForm, plan: e.target.value })}
                  data-testid="clinic-plan-select"
                >
                  <option value="starter">Starter</option>
                  <option value="pro">Pro</option>
                  <option value="premium">Premium</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </label>
              <label className="field">
                <span>สถานะตั้งต้น</span>
                <select
                  value={createForm.status}
                  onChange={(e) => setCreateForm({ ...createForm, status: e.target.value })}
                  data-testid="clinic-status-select"
                >
                  <option value="active">เปิดใช้งาน (active)</option>
                  <option value="inactive">ปิดใช้งาน (inactive)</option>
                </select>
              </label>
              <label className="field">
                <span>Timezone</span>
                <input
                  type="text"
                  value={createForm.timezone}
                  onChange={(e) => setCreateForm({ ...createForm, timezone: e.target.value })}
                />
              </label>
              <label className="field">
                <span>ชื่อหน้าเว็บสาธารณะ (Branding)</span>
                <input
                  type="text"
                  value={createForm.publicDisplayName}
                  onChange={(e) => setCreateForm({ ...createForm, publicDisplayName: e.target.value })}
                  placeholder="ชื่อที่จะแสดงให้สมาชิกลูกค้าเห็น"
                />
              </label>
              <label className="field">
                <span>คำโปรย (Tagline)</span>
                <input
                  type="text"
                  value={createForm.tagline}
                  onChange={(e) => setCreateForm({ ...createForm, tagline: e.target.value })}
                  placeholder="e.g. Skin care experts"
                />
              </label>
              <label className="field">
                <span>คำอธิบายย่อ (Short Description)</span>
                <textarea
                  value={createForm.shortDescription}
                  onChange={(e) => setCreateForm({ ...createForm, shortDescription: e.target.value })}
                  placeholder="คำอธิบายโดยย่อของคลินิกความงาม..."
                  rows="3"
                  style={{ minHeight: '80px' }}
                />
              </label>
              <Button
                type="submit"
                variant="primary"
                data-testid="clinic-create-submit"
                style={{ padding: '10px 16px', marginTop: '10px' }}
              >
                เพิ่มคลินิก
              </Button>
            </form>
          )}
        </div>
      </div>
    </PageShell>
  );
}

const OFFERING_STATUS_OPTIONS = [
  { value: 'draft', label: 'ร่าง' },
  { value: 'active', label: 'เผยแพร่' },
  { value: 'inactive', label: 'ปิดใช้งาน' },
  { value: 'archived', label: 'เก็บถาวร' }
];

function emptyServiceForm() {
  return {
    id: null,
    name: '',
    category: '',
    shortDescription: '',
    durationMinutes: '',
    priceMin: '',
    priceMax: '',
    currency: 'THB',
    status: 'draft',
    isFeatured: false,
    sortOrder: '',
    imageUrl: ''
  };
}

function emptyPromotionForm() {
  return {
    id: null,
    title: '',
    subtitle: '',
    badgeLabel: '',
    startsAt: '',
    endsAt: '',
    status: 'draft',
    isFeatured: false,
    sortOrder: '',
    imageUrl: '',
    ctaLabel: '',
    ctaUrl: ''
  };
}

function emptyPackageForm() {
  return {
    id: null,
    name: '',
    summary: '',
    price: '',
    currency: 'THB',
    status: 'draft',
    isFeatured: false,
    sortOrder: '',
    imageUrl: ''
  };
}

function compactPayload(payload, options = {}) {
  const keepNull = Boolean(options.keepNull);
  const next = {};

  Object.entries(payload).forEach(([key, value]) => {
    if (value === '' || value === undefined || (value === null && !keepNull)) {
      return;
    }

    next[key] = value;
  });

  return next;
}

function parseOptionalNumber(value) {
  if (value === '' || value === null || value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isHttpUrlOrBlank(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return true;
  }

  try {
    const parsed = new URL(trimmed);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch (_) {
    return false;
  }
}

function optionalTextPayloadValue(value, allowClears = false) {
  const trimmed = String(value || '').trim();
  return trimmed || (allowClears ? null : undefined);
}

function optionalNumberPayloadValue(value, allowClears = false) {
  if (value === '' || value === null || value === undefined) {
    return allowClears ? null : undefined;
  }

  const parsed = parseOptionalNumber(value);
  return parsed === undefined ? undefined : parsed;
}

function hasInvalidOptionalNumber(value) {
  return value !== '' && value !== null && value !== undefined && parseOptionalNumber(value) === undefined;
}

function formatAdminOfferingPrice(item, kind) {
  const currency = item.currency || 'THB';
  const money = (value) => `${currency} ${formatNumber(value)}`;

  if (kind === 'service') {
    if (item.priceMin != null && item.priceMax != null && Number(item.priceMax) !== Number(item.priceMin)) {
      return `${money(item.priceMin)} - ${money(item.priceMax)}`;
    }
    if (item.priceMin != null) {
      return `เริ่มต้น ${money(item.priceMin)}`;
    }
    if (item.priceMax != null) {
      return money(item.priceMax);
    }
    return 'สอบถามราคา';
  }

  if (item.price != null) {
    return money(item.price);
  }

  return 'สอบถามราคา';
}

function buildServicePayload(form, options = {}) {
  const allowClears = Boolean(options.allowClears);
  return compactPayload({
    name: form.name.trim(),
    category: optionalTextPayloadValue(form.category, allowClears),
    shortDescription: optionalTextPayloadValue(form.shortDescription, allowClears),
    durationMinutes: optionalNumberPayloadValue(form.durationMinutes, allowClears),
    priceMin: optionalNumberPayloadValue(form.priceMin, allowClears),
    priceMax: optionalNumberPayloadValue(form.priceMax, allowClears),
    currency: form.currency.trim() || 'THB',
    status: form.status,
    isFeatured: Boolean(form.isFeatured),
    sortOrder: parseOptionalNumber(form.sortOrder),
    imageUrl: optionalTextPayloadValue(form.imageUrl, allowClears)
  }, { keepNull: allowClears });
}

function buildPromotionPayload(form, options = {}) {
  const allowClears = Boolean(options.allowClears);
  return compactPayload({
    title: form.title.trim(),
    subtitle: optionalTextPayloadValue(form.subtitle, allowClears),
    badgeLabel: optionalTextPayloadValue(form.badgeLabel, allowClears),
    startsAt: optionalTextPayloadValue(form.startsAt, allowClears),
    endsAt: optionalTextPayloadValue(form.endsAt, allowClears),
    status: form.status,
    isFeatured: Boolean(form.isFeatured),
    sortOrder: parseOptionalNumber(form.sortOrder),
    imageUrl: optionalTextPayloadValue(form.imageUrl, allowClears),
    ctaLabel: optionalTextPayloadValue(form.ctaLabel, allowClears),
    ctaUrl: optionalTextPayloadValue(form.ctaUrl, allowClears)
  }, { keepNull: allowClears });
}

function buildPackagePayload(form, options = {}) {
  const allowClears = Boolean(options.allowClears);
  return compactPayload({
    name: form.name.trim(),
    summary: optionalTextPayloadValue(form.summary, allowClears),
    price: optionalNumberPayloadValue(form.price, allowClears),
    currency: form.currency.trim() || 'THB',
    status: form.status,
    isFeatured: Boolean(form.isFeatured),
    sortOrder: parseOptionalNumber(form.sortOrder),
    imageUrl: optionalTextPayloadValue(form.imageUrl, allowClears)
  }, { keepNull: allowClears });
}

function ClinicOfferingsAdminPage() {
  const api = useApi();
  const sessionOptions = useSessionRequestOptions();
  const { session } = useTenant();
  const role = session?.currentMembership?.role || '';
  const canWrite = ['owner', 'manager', 'marketing'].includes(role);
  const [activeTab, setActiveTab] = useState('services');
  const [refreshToken, setRefreshToken] = useState(0);
  const [message, setMessage] = useState(null);
  const [services, setServices] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [packages, setPackages] = useState([]);
  const [serviceForm, setServiceForm] = useState(emptyServiceForm);
  const [promotionForm, setPromotionForm] = useState(emptyPromotionForm);
  const [packageForm, setPackageForm] = useState(emptyPackageForm);
  const [selectedPackageId, setSelectedPackageId] = useState('');
  const [serviceLinkForm, setServiceLinkForm] = useState({ serviceId: '', quantity: '1' });
  const [linkedServices, setLinkedServices] = useState({});

  const [state] = usePageData(async () => {
    const [servicesResult, promotionsResult, packagesResult] = await Promise.all([
      api.listClinicServices(sessionOptions),
      api.listClinicPromotions(sessionOptions),
      api.listClinicPackages(sessionOptions)
    ]);

    return {
      services: servicesResult.items || [],
      promotions: promotionsResult.items || [],
      packages: packagesResult.items || []
    };
  }, [api, sessionOptions, refreshToken]);

  useEffect(() => {
    if (state.status === 'ready' && state.data) {
      setServices(state.data.services || []);
      setPromotions(state.data.promotions || []);
      setPackages(state.data.packages || []);

      if (!selectedPackageId && state.data.packages?.length) {
        setSelectedPackageId(String(state.data.packages[0].id));
      }
    }
  }, [state.status, state.data, selectedPackageId]);

  function refreshOfferings() {
    setRefreshToken((value) => value + 1);
  }

  function handleError(error) {
    setMessage({ kind: 'error', message: describeError(error) });
  }

  async function handleSaveService(event) {
    event.preventDefault();
    setMessage(null);

    if (!canWrite) {
      setMessage({ kind: 'error', message: 'คุณไม่มีสิทธิ์แก้ไขบริการ โปรโมชั่น หรือแพ็กเกจของคลินิกนี้' });
      return;
    }

    if (!serviceForm.name.trim()) {
      setMessage({ kind: 'error', message: 'กรุณาระบุชื่อบริการ' });
      return;
    }

    const priceMin = parseOptionalNumber(serviceForm.priceMin);
    const priceMax = parseOptionalNumber(serviceForm.priceMax);
    const durationMinutes = parseOptionalNumber(serviceForm.durationMinutes);

    if (
      hasInvalidOptionalNumber(serviceForm.priceMin)
      || hasInvalidOptionalNumber(serviceForm.priceMax)
      || hasInvalidOptionalNumber(serviceForm.durationMinutes)
    ) {
      setMessage({ kind: 'error', message: 'กรุณาระบุตัวเลขของราคาและระยะเวลาให้ถูกต้อง' });
      return;
    }

    if (priceMin != null && priceMin < 0) {
      setMessage({ kind: 'error', message: 'ราคาต่ำสุดต้องไม่น้อยกว่า 0' });
      return;
    }

    if (priceMax != null && priceMax < 0) {
      setMessage({ kind: 'error', message: 'ราคาสูงสุดต้องไม่น้อยกว่า 0' });
      return;
    }

    if (priceMin != null && priceMax != null && priceMax < priceMin) {
      setMessage({ kind: 'error', message: 'ราคาสูงสุดต้องมากกว่าหรือเท่ากับราคาต่ำสุด' });
      return;
    }

    if (durationMinutes != null && durationMinutes < 0) {
      setMessage({ kind: 'error', message: 'ระยะเวลาต้องไม่น้อยกว่า 0' });
      return;
    }

    if (!isHttpUrlOrBlank(serviceForm.imageUrl)) {
      setMessage({ kind: 'error', message: 'Image URL ต้องขึ้นต้นด้วย http:// หรือ https://' });
      return;
    }

    const payload = buildServicePayload(serviceForm, { allowClears: Boolean(serviceForm.id) });

    try {
      if (serviceForm.id) {
        await api.updateClinicService(sessionOptions, serviceForm.id, payload);
        setMessage({ kind: 'success', message: 'บันทึกบริการสำเร็จ' });
      } else {
        await api.createClinicService(sessionOptions, payload);
        setMessage({ kind: 'success', message: 'เพิ่มบริการสำเร็จ' });
      }
      setServiceForm(emptyServiceForm());
      refreshOfferings();
    } catch (error) {
      handleError(error);
    }
  }

  async function handleSavePromotion(event) {
    event.preventDefault();
    setMessage(null);

    if (!canWrite) {
      setMessage({ kind: 'error', message: 'คุณไม่มีสิทธิ์แก้ไขบริการ โปรโมชั่น หรือแพ็กเกจของคลินิกนี้' });
      return;
    }

    if (!promotionForm.title.trim()) {
      setMessage({ kind: 'error', message: 'กรุณาระบุชื่อโปรโมชั่น' });
      return;
    }

    if (!isHttpUrlOrBlank(promotionForm.imageUrl) || !isHttpUrlOrBlank(promotionForm.ctaUrl)) {
      setMessage({ kind: 'error', message: 'URL ต้องขึ้นต้นด้วย http:// หรือ https://' });
      return;
    }

    if (promotionForm.startsAt && promotionForm.endsAt && new Date(promotionForm.endsAt) < new Date(promotionForm.startsAt)) {
      setMessage({ kind: 'error', message: 'วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น' });
      return;
    }

    const payload = buildPromotionPayload(promotionForm, { allowClears: Boolean(promotionForm.id) });

    try {
      if (promotionForm.id) {
        await api.updateClinicPromotion(sessionOptions, promotionForm.id, payload);
        setMessage({ kind: 'success', message: 'บันทึกโปรโมชั่นสำเร็จ' });
      } else {
        await api.createClinicPromotion(sessionOptions, payload);
        setMessage({ kind: 'success', message: 'เพิ่มโปรโมชั่นสำเร็จ' });
      }
      setPromotionForm(emptyPromotionForm());
      refreshOfferings();
    } catch (error) {
      handleError(error);
    }
  }

  async function handleSavePackage(event) {
    event.preventDefault();
    setMessage(null);

    if (!canWrite) {
      setMessage({ kind: 'error', message: 'คุณไม่มีสิทธิ์แก้ไขบริการ โปรโมชั่น หรือแพ็กเกจของคลินิกนี้' });
      return;
    }

    if (!packageForm.name.trim()) {
      setMessage({ kind: 'error', message: 'กรุณาระบุชื่อแพ็กเกจ' });
      return;
    }

    const price = parseOptionalNumber(packageForm.price);
    if (hasInvalidOptionalNumber(packageForm.price)) {
      setMessage({ kind: 'error', message: 'กรุณาระบุตัวเลขของราคาให้ถูกต้อง' });
      return;
    }

    if (price != null && price < 0) {
      setMessage({ kind: 'error', message: 'ราคาต้องไม่น้อยกว่า 0' });
      return;
    }

    if (!isHttpUrlOrBlank(packageForm.imageUrl)) {
      setMessage({ kind: 'error', message: 'Image URL ต้องขึ้นต้นด้วย http:// หรือ https://' });
      return;
    }

    const payload = buildPackagePayload(packageForm, { allowClears: Boolean(packageForm.id) });

    try {
      if (packageForm.id) {
        await api.updateClinicPackage(sessionOptions, packageForm.id, payload);
        setMessage({ kind: 'success', message: 'บันทึกแพ็กเกจสำเร็จ' });
      } else {
        await api.createClinicPackage(sessionOptions, payload);
        setMessage({ kind: 'success', message: 'เพิ่มแพ็กเกจสำเร็จ' });
      }
      setPackageForm(emptyPackageForm());
      refreshOfferings();
    } catch (error) {
      handleError(error);
    }
  }

  async function handleDelete(kind, id) {
    if (!canWrite || !window.confirm('ยืนยันการลบรายการนี้?')) {
      return;
    }

    setMessage(null);

    try {
      if (kind === 'service') {
        await api.deleteClinicService(sessionOptions, id);
      } else if (kind === 'promotion') {
        await api.deleteClinicPromotion(sessionOptions, id);
      } else {
        await api.deleteClinicPackage(sessionOptions, id);
      }
      setMessage({ kind: 'success', message: 'ลบรายการสำเร็จ' });
      refreshOfferings();
    } catch (error) {
      handleError(error);
    }
  }

  async function handleMove(kind, index, direction) {
    if (!canWrite) return;

    const list = kind === 'service' ? services : kind === 'promotion' ? promotions : packages;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= list.length) return;

    const reordered = [...list];
    [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
    const payload = { items: reordered.map((item, sortOrder) => ({ id: item.id, sortOrder })) };

    try {
      if (kind === 'service') {
        setServices(reordered);
        await api.reorderClinicServices(sessionOptions, payload);
      } else if (kind === 'promotion') {
        setPromotions(reordered);
        await api.reorderClinicPromotions(sessionOptions, payload);
      } else {
        setPackages(reordered);
        await api.reorderClinicPackages(sessionOptions, payload);
      }
      setMessage({ kind: 'success', message: 'จัดเรียงรายการสำเร็จ' });
      refreshOfferings();
    } catch (error) {
      handleError(error);
      refreshOfferings();
    }
  }

  async function handleAddServiceToPackage(event) {
    event.preventDefault();
    setMessage(null);

    if (!canWrite) {
      setMessage({ kind: 'error', message: 'คุณไม่มีสิทธิ์แก้ไขบริการ โปรโมชั่น หรือแพ็กเกจของคลินิกนี้' });
      return;
    }

    if (!selectedPackageId || !serviceLinkForm.serviceId) {
      setMessage({ kind: 'error', message: 'กรุณาเลือกแพ็กเกจและบริการ' });
      return;
    }

    const quantity = parseInt(serviceLinkForm.quantity, 10);
    const payload = {
      serviceId: Number(serviceLinkForm.serviceId),
      quantity: Number.isNaN(quantity) ? 1 : Math.max(1, quantity),
      sortOrder: (linkedServices[selectedPackageId] || []).length
    };

    try {
      const link = await api.addClinicPackageService(sessionOptions, selectedPackageId, payload);
      setLinkedServices((current) => ({
        ...current,
        [selectedPackageId]: [
          ...(current[selectedPackageId] || []).filter((item) => String(item.serviceId) !== String(link.serviceId)),
          link
        ]
      }));
      setServiceLinkForm({ serviceId: '', quantity: '1' });
      setMessage({ kind: 'success', message: 'เพิ่มบริการในแพ็กเกจสำเร็จ' });
    } catch (error) {
      handleError(error);
    }
  }

  async function handleRemoveServiceFromPackage(serviceId) {
    if (!canWrite || !selectedPackageId) return;

    try {
      await api.removeClinicPackageService(sessionOptions, selectedPackageId, serviceId);
      setLinkedServices((current) => ({
        ...current,
        [selectedPackageId]: (current[selectedPackageId] || []).filter((item) => String(item.serviceId) !== String(serviceId))
      }));
      setMessage({ kind: 'success', message: 'นำบริการออกจากแพ็กเกจแล้ว' });
    } catch (error) {
      handleError(error);
    }
  }

  function renderStatusSelect(value, onChange, testId, disabled = false) {
    return (
      <select value={value} onChange={(event) => onChange(event.target.value)} data-testid={testId} disabled={disabled}>
        {OFFERING_STATUS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    );
  }

  if (state.status === 'loading' || state.status === 'idle') {
    return <LoadingCard label="กำลังโหลดบริการ โปรโมชั่น และแพ็กเกจ..." />;
  }

  if (state.status === 'error') {
    if (state.error?.status === 403) {
      return (
        <Card variant="notice" className="error-card" data-testid="clinic-offerings-permission-error">
          <h3 className="section-heading">ไม่มีสิทธิ์แก้ไข</h3>
          <p className="muted">คุณไม่มีสิทธิ์แก้ไขบริการ โปรโมชั่น หรือแพ็กเกจของคลินิกนี้</p>
          <p className="muted">กรุณาใช้บัญชี Clinic Owner, Manager หรือ Marketing</p>
        </Card>
      );
    }
    return <ErrorCard error={state.error} />;
  }

  const selectedPackageLinks = linkedServices[selectedPackageId] || [];

  return (
    <PageShell
      title="บริการ โปรโมชั่น และแพ็กเกจ"
      intro="จัดการ offerings ของคลินิกเพื่อใช้แสดงบนเว็บไซต์สาธารณะและเตรียมต่อยอด workflow การขาย"
    >
      <div className="clinic-offerings-page" data-testid="clinic-offerings-page">
        <StatusBanner state={message} testId="clinic-offerings-status" />
        {!canWrite ? (
          <Card variant="notice" className="notice-card" data-testid="clinic-offerings-readonly-notice">
            <h3 className="section-heading">โหมดอ่านอย่างเดียว</h3>
            <p className="muted">คุณไม่มีสิทธิ์แก้ไขบริการ โปรโมชั่น หรือแพ็กเกจของคลินิกนี้</p>
            <p className="muted">กรุณาใช้บัญชี Clinic Owner, Manager หรือ Marketing</p>
          </Card>
        ) : null}

        <div className="blog-editor-tabs" data-testid="clinic-offerings-tabs">
          <button type="button" className={`primary-button ${activeTab === 'services' ? '' : 'ghost-button'}`} onClick={() => setActiveTab('services')} data-testid="clinic-offerings-tab-services">บริการ</button>
          <button type="button" className={`primary-button ${activeTab === 'promotions' ? '' : 'ghost-button'}`} onClick={() => setActiveTab('promotions')} data-testid="clinic-offerings-tab-promotions">โปรโมชั่น</button>
          <button type="button" className={`primary-button ${activeTab === 'packages' ? '' : 'ghost-button'}`} onClick={() => setActiveTab('packages')} data-testid="clinic-offerings-tab-packages">แพ็กเกจ</button>
        </div>

        {activeTab === 'services' ? (
          <div className="blog-editor-layout">
            <Card variant="section" className="section-card">
              <div className="split-header compact-gap">
                <div>
                  <h2 className="section-heading">รายการบริการ</h2>
                  <p className="muted">เรียงตามลำดับที่จะแสดงในหน้า public</p>
                </div>
                <button type="button" className="secondary-button" onClick={refreshOfferings} data-testid="clinic-offerings-refresh">รีเฟรช</button>
              </div>
              <div className="table-shell">
                <table className="data-table" data-testid="clinic-offerings-services-table">
                  <thead>
                    <tr>
                      <th>ชื่อ</th>
                      <th>หมวดหมู่</th>
                      <th>ราคา</th>
                      <th>สถานะ</th>
                      <th>จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.map((service, index) => (
                      <tr key={service.id} data-testid={`clinic-offerings-service-row-${service.id}`}>
                        <td>
                          <strong>{service.name}</strong>
                          {service.isFeatured ? <span className="pill">Featured</span> : null}
                        </td>
                        <td>{service.category || '-'}</td>
                        <td>{formatAdminOfferingPrice(service, 'service')}</td>
                        <td><span className={`pill status-${service.status}`}>{service.status}</span></td>
                        <td>
                          <div className="inline-actions">
                            <button type="button" className="secondary-button" onClick={() => setServiceForm({ ...emptyServiceForm(), ...service, durationMinutes: service.durationMinutes ?? '', priceMin: service.priceMin ?? '', priceMax: service.priceMax ?? '', imageUrl: service.imageUrl || '' })} data-testid={`clinic-offerings-service-edit-${service.id}`}>แก้ไข</button>
                            <button type="button" className="secondary-button" onClick={() => handleMove('service', index, -1)} disabled={!canWrite || index === 0} data-testid={`clinic-offerings-service-up-${service.id}`}>ขึ้น</button>
                            <button type="button" className="secondary-button" onClick={() => handleMove('service', index, 1)} disabled={!canWrite || index === services.length - 1} data-testid={`clinic-offerings-service-down-${service.id}`}>ลง</button>
                            <button type="button" className="danger-button" onClick={() => handleDelete('service', service.id)} disabled={!canWrite} data-testid={`clinic-offerings-service-delete-${service.id}`}>ลบ</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card variant="section" className="section-card">
              <h2 className="section-heading">{serviceForm.id ? 'แก้ไขบริการ' : 'เพิ่มบริการ'}</h2>
              <form className="form-grid" onSubmit={handleSaveService} data-testid="clinic-offerings-service-form">
                <label className="field">
                  <span>ชื่อบริการ</span>
                  <input value={serviceForm.name} onChange={(event) => setServiceForm({ ...serviceForm, name: event.target.value })} data-testid="clinic-offerings-service-name" disabled={!canWrite} />
                </label>
                <label className="field">
                  <span>หมวดหมู่</span>
                  <input value={serviceForm.category || ''} onChange={(event) => setServiceForm({ ...serviceForm, category: event.target.value })} data-testid="clinic-offerings-service-category" disabled={!canWrite} />
                </label>
                <label className="field field-span-2">
                  <span>คำอธิบายสั้น</span>
                  <textarea value={serviceForm.shortDescription || ''} onChange={(event) => setServiceForm({ ...serviceForm, shortDescription: event.target.value })} data-testid="clinic-offerings-service-short-description" disabled={!canWrite} />
                </label>
                <label className="field">
                  <span>ระยะเวลา (นาที)</span>
                  <input type="number" min="0" value={serviceForm.durationMinutes ?? ''} onChange={(event) => setServiceForm({ ...serviceForm, durationMinutes: event.target.value })} data-testid="clinic-offerings-service-duration" disabled={!canWrite} />
                </label>
                <label className="field">
                  <span>สถานะ</span>
                  {renderStatusSelect(serviceForm.status, (value) => setServiceForm({ ...serviceForm, status: value }), 'clinic-offerings-service-status', !canWrite)}
                </label>
                <label className="field">
                  <span>ราคาต่ำสุด</span>
                  <input type="number" min="0" value={serviceForm.priceMin ?? ''} onChange={(event) => setServiceForm({ ...serviceForm, priceMin: event.target.value })} data-testid="clinic-offerings-service-price-min" disabled={!canWrite} />
                </label>
                <label className="field">
                  <span>ราคาสูงสุด</span>
                  <input type="number" min="0" value={serviceForm.priceMax ?? ''} onChange={(event) => setServiceForm({ ...serviceForm, priceMax: event.target.value })} data-testid="clinic-offerings-service-price-max" disabled={!canWrite} />
                </label>
                <label className="field">
                  <span>Image URL</span>
                  <input value={serviceForm.imageUrl || ''} onChange={(event) => setServiceForm({ ...serviceForm, imageUrl: event.target.value })} data-testid="clinic-offerings-service-image-url" disabled={!canWrite} />
                </label>
                <label className="field">
                  <span>ลำดับ</span>
                  <input type="number" value={serviceForm.sortOrder ?? ''} onChange={(event) => setServiceForm({ ...serviceForm, sortOrder: event.target.value })} data-testid="clinic-offerings-service-sort-order" disabled={!canWrite} />
                </label>
                <label className="field">
                  <span>Featured</span>
                  <input type="checkbox" checked={Boolean(serviceForm.isFeatured)} onChange={(event) => setServiceForm({ ...serviceForm, isFeatured: event.target.checked })} data-testid="clinic-offerings-service-featured" disabled={!canWrite} />
                </label>
                <div className="inline-actions field-span-2">
                  <Button type="submit" data-testid="clinic-offerings-service-save" disabled={!canWrite}>{serviceForm.id ? 'บันทึกบริการ' : 'เพิ่มบริการ'}</Button>
                  <button type="button" className="secondary-button" onClick={() => setServiceForm(emptyServiceForm())}>ล้างฟอร์ม</button>
                </div>
              </form>
            </Card>
          </div>
        ) : null}

        {activeTab === 'promotions' ? (
          <div className="blog-editor-layout">
            <Card variant="section" className="section-card">
              <h2 className="section-heading">รายการโปรโมชั่น</h2>
              <div className="table-shell">
                <table className="data-table" data-testid="clinic-offerings-promotions-table">
                  <thead>
                    <tr>
                      <th>ชื่อ</th>
                      <th>ช่วงเวลา</th>
                      <th>สถานะ</th>
                      <th>จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {promotions.map((promotion, index) => (
                      <tr key={promotion.id} data-testid={`clinic-offerings-promotion-row-${promotion.id}`}>
                        <td>
                          <strong>{promotion.title}</strong>
                          {promotion.badgeLabel ? <span className="pill">{promotion.badgeLabel}</span> : null}
                        </td>
                        <td>{promotion.startsAt ? formatDateTime(promotion.startsAt) : '-'} / {promotion.endsAt ? formatDateTime(promotion.endsAt) : '-'}</td>
                        <td><span className={`pill status-${promotion.status}`}>{promotion.status}</span></td>
                        <td>
                          <div className="inline-actions">
                            <button type="button" className="secondary-button" onClick={() => setPromotionForm({ ...emptyPromotionForm(), ...promotion, imageUrl: promotion.imageUrl || '', ctaUrl: promotion.ctaUrl || '', startsAt: promotion.startsAt ? promotion.startsAt.slice(0, 10) : '', endsAt: promotion.endsAt ? promotion.endsAt.slice(0, 10) : '' })} data-testid={`clinic-offerings-promotion-edit-${promotion.id}`}>แก้ไข</button>
                            <button type="button" className="secondary-button" onClick={() => handleMove('promotion', index, -1)} disabled={!canWrite || index === 0}>ขึ้น</button>
                            <button type="button" className="secondary-button" onClick={() => handleMove('promotion', index, 1)} disabled={!canWrite || index === promotions.length - 1}>ลง</button>
                            <button type="button" className="danger-button" onClick={() => handleDelete('promotion', promotion.id)} disabled={!canWrite}>ลบ</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card variant="section" className="section-card">
              <h2 className="section-heading">{promotionForm.id ? 'แก้ไขโปรโมชั่น' : 'เพิ่มโปรโมชั่น'}</h2>
              <form className="form-grid" onSubmit={handleSavePromotion} data-testid="clinic-offerings-promotion-form">
                <label className="field">
                  <span>ชื่อโปรโมชั่น</span>
                  <input value={promotionForm.title} onChange={(event) => setPromotionForm({ ...promotionForm, title: event.target.value })} data-testid="clinic-offerings-promotion-title" disabled={!canWrite} />
                </label>
                <label className="field">
                  <span>ป้ายกำกับ</span>
                  <input value={promotionForm.badgeLabel || ''} onChange={(event) => setPromotionForm({ ...promotionForm, badgeLabel: event.target.value })} data-testid="clinic-offerings-promotion-badge" disabled={!canWrite} />
                </label>
                <label className="field field-span-2">
                  <span>คำอธิบายย่อย</span>
                  <textarea value={promotionForm.subtitle || ''} onChange={(event) => setPromotionForm({ ...promotionForm, subtitle: event.target.value })} data-testid="clinic-offerings-promotion-subtitle" disabled={!canWrite} />
                </label>
                <label className="field">
                  <span>วันเริ่มต้น</span>
                  <input type="date" value={promotionForm.startsAt || ''} onChange={(event) => setPromotionForm({ ...promotionForm, startsAt: event.target.value })} data-testid="clinic-offerings-promotion-starts-at" disabled={!canWrite} />
                </label>
                <label className="field">
                  <span>วันสิ้นสุด</span>
                  <input type="date" value={promotionForm.endsAt || ''} onChange={(event) => setPromotionForm({ ...promotionForm, endsAt: event.target.value })} data-testid="clinic-offerings-promotion-ends-at" disabled={!canWrite} />
                </label>
                <label className="field">
                  <span>สถานะ</span>
                  {renderStatusSelect(promotionForm.status, (value) => setPromotionForm({ ...promotionForm, status: value }), 'clinic-offerings-promotion-status', !canWrite)}
                </label>
                <label className="field">
                  <span>ลำดับ</span>
                  <input type="number" value={promotionForm.sortOrder ?? ''} onChange={(event) => setPromotionForm({ ...promotionForm, sortOrder: event.target.value })} data-testid="clinic-offerings-promotion-sort-order" disabled={!canWrite} />
                </label>
                <label className="field">
                  <span>CTA Label</span>
                  <input value={promotionForm.ctaLabel || ''} onChange={(event) => setPromotionForm({ ...promotionForm, ctaLabel: event.target.value })} data-testid="clinic-offerings-promotion-cta-label" disabled={!canWrite} />
                </label>
                <label className="field">
                  <span>CTA URL</span>
                  <input value={promotionForm.ctaUrl || ''} onChange={(event) => setPromotionForm({ ...promotionForm, ctaUrl: event.target.value })} data-testid="clinic-offerings-promotion-cta-url" disabled={!canWrite} />
                </label>
                <label className="field">
                  <span>Image URL</span>
                  <input value={promotionForm.imageUrl || ''} onChange={(event) => setPromotionForm({ ...promotionForm, imageUrl: event.target.value })} data-testid="clinic-offerings-promotion-image-url" disabled={!canWrite} />
                </label>
                <label className="field">
                  <span>Featured</span>
                  <input type="checkbox" checked={Boolean(promotionForm.isFeatured)} onChange={(event) => setPromotionForm({ ...promotionForm, isFeatured: event.target.checked })} data-testid="clinic-offerings-promotion-featured" disabled={!canWrite} />
                </label>
                <div className="inline-actions field-span-2">
                  <Button type="submit" data-testid="clinic-offerings-promotion-save" disabled={!canWrite}>{promotionForm.id ? 'บันทึกโปรโมชั่น' : 'เพิ่มโปรโมชั่น'}</Button>
                  <button type="button" className="secondary-button" onClick={() => setPromotionForm(emptyPromotionForm())}>ล้างฟอร์ม</button>
                </div>
              </form>
            </Card>
          </div>
        ) : null}

        {activeTab === 'packages' ? (
          <div className="blog-editor-layout">
            <Card variant="section" className="section-card">
              <h2 className="section-heading">รายการแพ็กเกจ</h2>
              <div className="table-shell">
                <table className="data-table" data-testid="clinic-offerings-packages-table">
                  <thead>
                    <tr>
                      <th>ชื่อ</th>
                      <th>ราคา</th>
                      <th>สถานะ</th>
                      <th>จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {packages.map((pkg, index) => (
                      <tr key={pkg.id} data-testid={`clinic-offerings-package-row-${pkg.id}`}>
                        <td>
                          <strong>{pkg.name}</strong>
                          {pkg.summary ? <p className="muted">{pkg.summary}</p> : null}
                        </td>
                        <td>{formatAdminOfferingPrice(pkg, 'package')}</td>
                        <td><span className={`pill status-${pkg.status}`}>{pkg.status}</span></td>
                        <td>
                          <div className="inline-actions">
                            <button type="button" className="secondary-button" onClick={() => { setPackageForm({ ...emptyPackageForm(), ...pkg, price: pkg.price ?? '', imageUrl: pkg.imageUrl || '' }); setSelectedPackageId(String(pkg.id)); }} data-testid={`clinic-offerings-package-edit-${pkg.id}`}>แก้ไข</button>
                            <button type="button" className="secondary-button" onClick={() => handleMove('package', index, -1)} disabled={!canWrite || index === 0}>ขึ้น</button>
                            <button type="button" className="secondary-button" onClick={() => handleMove('package', index, 1)} disabled={!canWrite || index === packages.length - 1}>ลง</button>
                            <button type="button" className="danger-button" onClick={() => handleDelete('package', pkg.id)} disabled={!canWrite}>ลบ</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="blog-editor-main">
              <Card variant="section" className="section-card">
                <h2 className="section-heading">{packageForm.id ? 'แก้ไขแพ็กเกจ' : 'เพิ่มแพ็กเกจ'}</h2>
                <form className="form-grid" onSubmit={handleSavePackage} data-testid="clinic-offerings-package-form">
                  <label className="field">
                    <span>ชื่อแพ็กเกจ</span>
                    <input value={packageForm.name} onChange={(event) => setPackageForm({ ...packageForm, name: event.target.value })} data-testid="clinic-offerings-package-name" disabled={!canWrite} />
                  </label>
                  <label className="field">
                    <span>ราคา</span>
                    <input type="number" min="0" value={packageForm.price ?? ''} onChange={(event) => setPackageForm({ ...packageForm, price: event.target.value })} data-testid="clinic-offerings-package-price" disabled={!canWrite} />
                  </label>
                  <label className="field field-span-2">
                    <span>สรุปแพ็กเกจ</span>
                    <textarea value={packageForm.summary || ''} onChange={(event) => setPackageForm({ ...packageForm, summary: event.target.value })} data-testid="clinic-offerings-package-summary" disabled={!canWrite} />
                  </label>
                  <label className="field">
                    <span>สถานะ</span>
                    {renderStatusSelect(packageForm.status, (value) => setPackageForm({ ...packageForm, status: value }), 'clinic-offerings-package-status', !canWrite)}
                  </label>
                  <label className="field">
                    <span>ลำดับ</span>
                    <input type="number" value={packageForm.sortOrder ?? ''} onChange={(event) => setPackageForm({ ...packageForm, sortOrder: event.target.value })} data-testid="clinic-offerings-package-sort-order" disabled={!canWrite} />
                  </label>
                  <label className="field">
                    <span>Image URL</span>
                    <input value={packageForm.imageUrl || ''} onChange={(event) => setPackageForm({ ...packageForm, imageUrl: event.target.value })} data-testid="clinic-offerings-package-image-url" disabled={!canWrite} />
                  </label>
                  <label className="field">
                    <span>Featured</span>
                    <input type="checkbox" checked={Boolean(packageForm.isFeatured)} onChange={(event) => setPackageForm({ ...packageForm, isFeatured: event.target.checked })} data-testid="clinic-offerings-package-featured" disabled={!canWrite} />
                  </label>
                  <div className="inline-actions field-span-2">
                    <Button type="submit" data-testid="clinic-offerings-package-save" disabled={!canWrite}>{packageForm.id ? 'บันทึกแพ็กเกจ' : 'เพิ่มแพ็กเกจ'}</Button>
                    <button type="button" className="secondary-button" onClick={() => setPackageForm(emptyPackageForm())}>ล้างฟอร์ม</button>
                  </div>
                </form>
              </Card>

              <Card variant="section" className="section-card" data-testid="clinic-offerings-package-services-panel">
                <h2 className="section-heading">บริการในแพ็กเกจ</h2>
                <form className="form-grid" onSubmit={handleAddServiceToPackage} data-testid="clinic-offerings-package-service-form">
                  <label className="field">
                    <span>แพ็กเกจ</span>
                    <select value={selectedPackageId} onChange={(event) => setSelectedPackageId(event.target.value)} data-testid="clinic-offerings-package-service-package" disabled={!canWrite}>
                      <option value="">เลือกแพ็กเกจ</option>
                      {packages.map((pkg) => <option key={pkg.id} value={pkg.id}>{pkg.name}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    <span>บริการ</span>
                    <select value={serviceLinkForm.serviceId} onChange={(event) => setServiceLinkForm({ ...serviceLinkForm, serviceId: event.target.value })} data-testid="clinic-offerings-package-service-service" disabled={!canWrite}>
                      <option value="">เลือกบริการ</option>
                      {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    <span>จำนวน</span>
                    <input type="number" min="1" value={serviceLinkForm.quantity} onChange={(event) => setServiceLinkForm({ ...serviceLinkForm, quantity: event.target.value })} data-testid="clinic-offerings-package-service-quantity" disabled={!canWrite} />
                  </label>
                  <div className="inline-actions">
                    <Button type="submit" data-testid="clinic-offerings-package-service-add" disabled={!canWrite}>เพิ่มบริการในแพ็กเกจ</Button>
                  </div>
                </form>
                <ul className="stack-list" data-testid="clinic-offerings-package-service-list">
                  {selectedPackageLinks.map((link) => {
                    const service = services.find((item) => String(item.id) === String(link.serviceId));
                    return (
                      <li key={link.serviceId} className="stack-item" data-testid={`clinic-offerings-package-service-row-${link.serviceId}`}>
                        <div className="split-header">
                          <span>{service?.name || `Service #${link.serviceId}`} x {link.quantity}</span>
                          <button type="button" className="danger-button" onClick={() => handleRemoveServiceFromPackage(link.serviceId)} disabled={!canWrite} data-testid={`clinic-offerings-package-service-remove-${link.serviceId}`}>นำออก</button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </div>
          </div>
        ) : null}
      </div>
    </PageShell>
  );
}

function ClinicWebsiteEditorPage() {
  const api = useApi();
  const sessionOptions = useSessionRequestOptions();
  const [activeTab, setActiveTab] = useState('general');
  const [message, setMessage] = useState(null);
  const [clinic, setClinic] = useState(null);

  const [generalForm, setGeneralForm] = useState({
    publicDisplayName: '',
    tagline: '',
    shortDescription: '',
    websiteStatus: 'draft',
    defaultLocale: 'th-TH'
  });

  const [brandingForm, setBrandingForm] = useState({
    logoUrl: '',
    faviconUrl: '',
    heroImageUrl: '',
    primaryColor: '',
    secondaryColor: '',
    accentColor: '',
    fontFamily: ''
  });

  const [colorErrors, setColorErrors] = useState({
    primaryColor: '',
    secondaryColor: '',
    accentColor: ''
  });

  const [contactForm, setContactForm] = useState({
    phone: '',
    email: '',
    lineUrl: '',
    lineOaId: '',
    facebookUrl: '',
    instagramUrl: '',
    tiktokUrl: '',
    websiteUrl: ''
  });

  const [locationForm, setLocationForm] = useState({
    addressLine1: '',
    addressLine2: '',
    district: '',
    province: '',
    postalCode: '',
    country: 'Thailand',
    googleMapUrl: '',
    googleMapEmbedUrl: '',
    latitude: '',
    longitude: '',
    businessHoursStr: '{}'
  });

  const [sections, setSections] = useState([]);
  const [newSection, setNewSection] = useState({
    sectionKey: '',
    sectionType: 'hero',
    title: '',
    subtitle: '',
    contentStr: '{}',
    status: 'draft'
  });

  const [state, setState] = usePageData(async () => {
    return await api.getClinicWebsite(sessionOptions);
  }, [api, sessionOptions]);

  useEffect(() => {
    if (state.status === 'ready' && state.data) {
      const data = state.data;
      setClinic(data.clinic);
      setGeneralForm(data.websiteSettings || {});
      setBrandingForm(data.brandingSettings || {});
      setContactForm(data.contactSettings || {});
      
      const loc = data.locationSettings || {};
      setLocationForm({
        ...loc,
        businessHoursStr: JSON.stringify(loc.businessHours || {}, null, 2)
      });

      setSections((data.homepageSections || []).map(s => ({
        ...s,
        contentStr: JSON.stringify(s.content || {}, null, 2)
      })));
    }
  }, [state]);

  if (state.status === 'loading' || state.status === 'idle') {
    return <LoadingCard label="กำลังโหลดข้อมูลเว็บไซต์คลินิก..." />;
  }

  if (state.status === 'error') {
    if (state.error?.status === 403) {
      return (
        <Card variant="notice" className="error-card" data-testid="clinic-website-permission-error" id="clinic-website-permission-error">
          <h3 className="section-heading">ไม่มีสิทธิ์เข้าถึง</h3>
          <p className="muted">คุณไม่มีสิทธิ์แก้ไขเว็บไซต์คลินิกนี้ กรุณาใช้บัญชี Clinic Owner หรือ Manager ของคลินิก</p>
        </Card>
      );
    }
    return <ErrorCard error={state.error} />;
  }

  const hexRegex = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
  function validateHex(val) {
    if (!val) return true;
    return hexRegex.test(val);
  }

  const handleSaveGeneral = async (e) => {
    e.preventDefault();
    setMessage(null);
    try {
      const result = await api.updateClinicWebsiteSettings(sessionOptions, generalForm);
      setGeneralForm(result);
      setMessage({ message: 'บันทึกข้อมูลทั่วไปสำเร็จ!', kind: 'success' });
    } catch (err) {
      setMessage({ message: err.message, kind: 'error' });
    }
  };

  const handleSaveBranding = async (e) => {
    e.preventDefault();
    setMessage(null);

    const isPrimaryValid = validateHex(brandingForm.primaryColor);
    const isSecondaryValid = validateHex(brandingForm.secondaryColor);
    const isAccentValid = validateHex(brandingForm.accentColor);

    if (!isPrimaryValid || !isSecondaryValid || !isAccentValid) {
      setColorErrors({
        primaryColor: isPrimaryValid ? '' : 'รหัสสีต้องเป็น HEX เท่านั้น เช่น #0F766E',
        secondaryColor: isSecondaryValid ? '' : 'รหัสสีต้องเป็น HEX เท่านั้น เช่น #E2E8F0',
        accentColor: isAccentValid ? '' : 'รหัสสีต้องเป็น HEX เท่านั้น เช่น #F59E0B'
      });
      setMessage({ message: 'กรุณาแก้ไขรหัสสีให้ถูกต้องก่อนบันทึก', kind: 'error' });
      return;
    }

    try {
      const result = await api.updateClinicWebsiteBranding(sessionOptions, brandingForm);
      setBrandingForm(result);
      setMessage({ message: 'บันทึกข้อมูลการออกแบบสำเร็จ!', kind: 'success' });
    } catch (err) {
      setMessage({ message: err.message, kind: 'error' });
    }
  };

  const handleSaveContact = async (e) => {
    e.preventDefault();
    setMessage(null);
    try {
      const result = await api.updateClinicWebsiteContact(sessionOptions, contactForm);
      setContactForm(result);
      setMessage({ message: 'บันทึกข้อมูลการติดต่อสำเร็จ!', kind: 'success' });
    } catch (err) {
      setMessage({ message: err.message, kind: 'error' });
    }
  };

  const handleSaveLocation = async (e) => {
    e.preventDefault();
    setMessage(null);

    let parsedHours = {};
    try {
      parsedHours = JSON.parse(locationForm.businessHoursStr);
    } catch (e) {
      setMessage({ message: 'รูปแบบเวลาทำการ JSON ไม่ถูกต้อง', kind: 'error' });
      return;
    }

    try {
      const result = await api.updateClinicWebsiteLocation(sessionOptions, {
        ...locationForm,
        businessHours: parsedHours
      });
      setLocationForm({
        ...result,
        businessHoursStr: JSON.stringify(result.businessHours, null, 2)
      });
      setMessage({ message: 'บันทึกข้อมูลที่ตั้งสำเร็จ!', kind: 'success' });
    } catch (err) {
      setMessage({ message: err.message, kind: 'error' });
    }
  };

  const handleAddSection = async (e) => {
    e.preventDefault();
    setMessage(null);

    let parsedContent = {};
    try {
      parsedContent = JSON.parse(newSection.contentStr);
    } catch (e) {
      setMessage({ message: 'รูปแบบ JSON ของเนื้อหาไม่ถูกต้อง', kind: 'error' });
      return;
    }

    if (parsedContent === null || typeof parsedContent !== 'object' || Array.isArray(parsedContent)) {
      alert('เนื้อหา Section ต้องเป็น JSON object เท่านั้น');
      return;
    }

    try {
      await api.createClinicHomepageSection(sessionOptions, {
        sectionKey: newSection.sectionKey,
        sectionType: newSection.sectionType,
        title: newSection.title,
        subtitle: newSection.subtitle,
        content: parsedContent,
        status: newSection.status,
        sortOrder: sections.length
      });

      const updated = await api.getClinicWebsite(sessionOptions);
      setSections(updated.homepageSections.map(s => ({
        ...s,
        contentStr: JSON.stringify(s.content || {}, null, 2)
      })));

      setNewSection({
        sectionKey: '',
        sectionType: 'hero',
        title: '',
        subtitle: '',
        contentStr: '{}',
        status: 'draft'
      });

      setMessage({ message: 'เพิ่ม Section ใหม่สำเร็จ!', kind: 'success' });
    } catch (err) {
      setMessage({ message: err.message, kind: 'error' });
    }
  };

  const handleSaveSection = async (section) => {
    setMessage(null);

    let parsedContent = {};
    try {
      parsedContent = JSON.parse(section.contentStr);
    } catch (e) {
      alert('รูปแบบ JSON ของเนื้อหาไม่ถูกต้อง');
      return;
    }

    if (parsedContent === null || typeof parsedContent !== 'object' || Array.isArray(parsedContent)) {
      alert('เนื้อหา Section ต้องเป็น JSON object เท่านั้น');
      return;
    }

    try {
      await api.updateClinicHomepageSection(sessionOptions, section.id, {
        sectionKey: section.sectionKey,
        sectionType: section.sectionType,
        title: section.title,
        subtitle: section.subtitle,
        content: parsedContent,
        sortOrder: section.sortOrder,
        status: section.status
      });

      setMessage({ message: `บันทึก Section '${section.sectionKey}' สำเร็จ!`, kind: 'success' });
    } catch (err) {
      setMessage({ message: err.message, kind: 'error' });
    }
  };

  const handleDeleteSection = async (sectionId) => {
    if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการลบ Section นี้?')) return;
    setMessage(null);

    try {
      await api.deleteClinicHomepageSection(sessionOptions, sectionId);

      const updated = await api.getClinicWebsite(sessionOptions);
      setSections(updated.homepageSections.map(s => ({
        ...s,
        contentStr: JSON.stringify(s.content || {}, null, 2)
      })));

      setMessage({ message: 'ลบ Section สำเร็จ!', kind: 'success' });
    } catch (err) {
      setMessage({ message: err.message, kind: 'error' });
    }
  };

  const handleMoveUp = async (index) => {
    if (index === 0) return;
    setMessage(null);

    const reordered = [...sections];
    const temp = reordered[index];
    reordered[index] = reordered[index - 1];
    reordered[index - 1] = temp;

    const payload = reordered.map((s, idx) => ({
      id: s.id,
      sortOrder: idx
    }));

    try {
      await api.reorderClinicHomepageSections(sessionOptions, { sections: payload });
      
      const updated = await api.getClinicWebsite(sessionOptions);
      setSections(updated.homepageSections.map(s => ({
        ...s,
        contentStr: JSON.stringify(s.content || {}, null, 2)
      })));

      setMessage({ message: 'จัดเรียง Section สำเร็จ!', kind: 'success' });
    } catch (err) {
      setMessage({ message: err.message, kind: 'error' });
    }
  };

  const handleMoveDown = async (index) => {
    if (index === sections.length - 1) return;
    setMessage(null);

    const reordered = [...sections];
    const temp = reordered[index];
    reordered[index] = reordered[index + 1];
    reordered[index + 1] = temp;

    const payload = reordered.map((s, idx) => ({
      id: s.id,
      sortOrder: idx
    }));

    try {
      await api.reorderClinicHomepageSections(sessionOptions, { sections: payload });
      
      const updated = await api.getClinicWebsite(sessionOptions);
      setSections(updated.homepageSections.map(s => ({
        ...s,
        contentStr: JSON.stringify(s.content || {}, null, 2)
      })));

      setMessage({ message: 'จัดเรียง Section สำเร็จ!', kind: 'success' });
    } catch (err) {
      setMessage({ message: err.message, kind: 'error' });
    }
  };

  return (
    <PageShell
      title="ตั้งค่าเว็บไซต์คลินิก"
      intro="จัดการหน้าตา โลโก้ สีแบรนด์ ข้อมูลติดต่อ สถานที่ตั้ง และโครงสร้างหน้าแรกของคลินิก"
      actions={
        clinic?.slug ? (
          <a
            href={`/${clinic.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="secondary-button"
            id="clinic-website-preview-link"
            data-testid="clinic-website-preview-link"
            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
          >
            ดูหน้าเว็บคลินิก
          </a>
        ) : null
      }
    >
      <div className="clinic-website-page" id="clinic-website-page" data-testid="clinic-website-page">
        <StatusBanner state={message} />

        <div className="blog-editor-tabs" style={{ marginBottom: '20px' }}>
          <button
            type="button"
            className={`primary-button ${activeTab === 'general' ? '' : 'ghost-button'}`}
            onClick={() => setActiveTab('general')}
          >
            ทั่วไป
          </button>
          <button
            type="button"
            className={`primary-button ${activeTab === 'branding' ? '' : 'ghost-button'}`}
            onClick={() => setActiveTab('branding')}
          >
            การออกแบบ (Branding)
          </button>
          <button
            type="button"
            className={`primary-button ${activeTab === 'contact' ? '' : 'ghost-button'}`}
            onClick={() => setActiveTab('contact')}
          >
            การติดต่อ (Contact)
          </button>
          <button
            type="button"
            className={`primary-button ${activeTab === 'location' ? '' : 'ghost-button'}`}
            onClick={() => setActiveTab('location')}
          >
            สถานที่และเวลาทำการ
          </button>
          <button
            type="button"
            className={`primary-button ${activeTab === 'sections' ? '' : 'ghost-button'}`}
            onClick={() => setActiveTab('sections')}
          >
            ส่วนของหน้าแรก (Homepage Sections)
          </button>
        </div>

        <Card variant="section" className="section-card">
          {activeTab === 'general' && (
            <form id="clinic-website-general-form" data-testid="clinic-website-general-form" onSubmit={handleSaveGeneral}>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="clinic-website-display-name">ชื่อที่ใช้แสดงบนหน้าเว็บ (Public Display Name)</label>
                  <input
                    type="text"
                    id="clinic-website-display-name"
                    data-testid="clinic-website-display-name"
                    value={generalForm.publicDisplayName || ''}
                    onChange={(e) => setGeneralForm({ ...generalForm, publicDisplayName: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="clinic-website-tagline">สโลแกน (Tagline)</label>
                  <input
                    type="text"
                    id="clinic-website-tagline"
                    data-testid="clinic-website-tagline"
                    value={generalForm.tagline || ''}
                    onChange={(e) => setGeneralForm({ ...generalForm, tagline: e.target.value })}
                  />
                </div>
                <div className="field field-span-2">
                  <label htmlFor="clinic-website-short-description">คำอธิบายคลินิกแบบย่อ (Short Description)</label>
                  <textarea
                    id="clinic-website-short-description"
                    data-testid="clinic-website-short-description"
                    value={generalForm.shortDescription || ''}
                    onChange={(e) => setGeneralForm({ ...generalForm, shortDescription: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="clinic-website-status">สถานะเว็บไซต์ (Website Status)</label>
                  <select
                    id="clinic-website-status"
                    data-testid="clinic-website-status"
                    value={generalForm.websiteStatus || 'draft'}
                    onChange={(e) => setGeneralForm({ ...generalForm, websiteStatus: e.target.value })}
                  >
                    <option value="draft">ร่าง (Draft)</option>
                    <option value="active">เผยแพร่สด (Active)</option>
                    <option value="inactive">ปิดใช้งานชั่วคราว (Inactive)</option>
                    <option value="suspended">ระงับ (Suspended)</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="clinic-website-locale">ภาษาเริ่มต้น (Default Locale)</label>
                  <select
                    id="clinic-website-locale"
                    data-testid="clinic-website-locale"
                    value={generalForm.defaultLocale || 'th-TH'}
                    onChange={(e) => setGeneralForm({ ...generalForm, defaultLocale: e.target.value })}
                  >
                    <option value="th-TH">ไทย (th-TH)</option>
                    <option value="en-US">English (en-US)</option>
                  </select>
                </div>
              </div>
              <div style={{ marginTop: '20px' }}>
                <Button type="submit" id="clinic-website-save-general" data-testid="clinic-website-save-general">
                  บันทึกข้อมูลทั่วไป
                </Button>
              </div>
            </form>
          )}

          {activeTab === 'branding' && (
            <form id="clinic-website-branding-form" data-testid="clinic-website-branding-form" onSubmit={handleSaveBranding}>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="clinic-website-logo-url">Logo URL</label>
                  <input
                    type="text"
                    id="clinic-website-logo-url"
                    data-testid="clinic-website-logo-url"
                    value={brandingForm.logoUrl || ''}
                    onChange={(e) => setBrandingForm({ ...brandingForm, logoUrl: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Favicon URL</label>
                  <input
                    type="text"
                    value={brandingForm.faviconUrl || ''}
                    onChange={(e) => setBrandingForm({ ...brandingForm, faviconUrl: e.target.value })}
                  />
                </div>
                <div className="field field-span-2">
                  <label htmlFor="clinic-website-hero-image-url">Hero Image URL</label>
                  <input
                    type="text"
                    id="clinic-website-hero-image-url"
                    data-testid="clinic-website-hero-image-url"
                    value={brandingForm.heroImageUrl || ''}
                    onChange={(e) => setBrandingForm({ ...brandingForm, heroImageUrl: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="clinic-website-primary-color">สีหลัก (Primary Color - HEX เท่านั้น)</label>
                  <input
                    type="text"
                    id="clinic-website-primary-color"
                    data-testid="clinic-website-primary-color"
                    value={brandingForm.primaryColor || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setBrandingForm({ ...brandingForm, primaryColor: val });
                      setColorErrors(prev => ({ ...prev, primaryColor: validateHex(val) ? '' : 'รหัสสีต้องเป็น HEX เท่านั้น เช่น #0F766E' }));
                    }}
                  />
                  {colorErrors.primaryColor && (
                    <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }} id="clinic-website-primary-color-error" data-testid="clinic-website-primary-color-error">
                      {colorErrors.primaryColor}
                    </span>
                  )}
                </div>
                <div className="field">
                  <label htmlFor="clinic-website-secondary-color">สีรอง (Secondary Color - HEX เท่านั้น)</label>
                  <input
                    type="text"
                    id="clinic-website-secondary-color"
                    data-testid="clinic-website-secondary-color"
                    value={brandingForm.secondaryColor || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setBrandingForm({ ...brandingForm, secondaryColor: val });
                      setColorErrors(prev => ({ ...prev, secondaryColor: validateHex(val) ? '' : 'รหัสสีต้องเป็น HEX เท่านั้น เช่น #E2E8F0' }));
                    }}
                  />
                  {colorErrors.secondaryColor && (
                    <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }} id="clinic-website-secondary-color-error" data-testid="clinic-website-secondary-color-error">
                      {colorErrors.secondaryColor}
                    </span>
                  )}
                </div>
                <div className="field">
                  <label htmlFor="clinic-website-accent-color">สีเน้น (Accent Color - HEX เท่านั้น)</label>
                  <input
                    type="text"
                    id="clinic-website-accent-color"
                    data-testid="clinic-website-accent-color"
                    value={brandingForm.accentColor || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setBrandingForm({ ...brandingForm, accentColor: val });
                      setColorErrors(prev => ({ ...prev, accentColor: validateHex(val) ? '' : 'รหัสสีต้องเป็น HEX เท่านั้น เช่น #F59E0B' }));
                    }}
                  />
                  {colorErrors.accentColor && (
                    <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }} id="clinic-website-accent-color-error" data-testid="clinic-website-accent-color-error">
                      {colorErrors.accentColor}
                    </span>
                  )}
                </div>
                <div className="field">
                  <label>Font Family</label>
                  <input
                    type="text"
                    value={brandingForm.fontFamily || ''}
                    onChange={(e) => setBrandingForm({ ...brandingForm, fontFamily: e.target.value })}
                  />
                </div>
              </div>
              <div style={{ marginTop: '20px' }}>
                <Button
                  type="submit"
                  id="clinic-website-save-branding"
                  data-testid="clinic-website-save-branding"
                  disabled={!!(colorErrors.primaryColor || colorErrors.secondaryColor || colorErrors.accentColor)}
                >
                  บันทึกการออกแบบ
                </Button>
              </div>
            </form>
          )}

          {activeTab === 'contact' && (
            <form id="clinic-website-contact-form" data-testid="clinic-website-contact-form" onSubmit={handleSaveContact}>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="clinic-website-phone">เบอร์โทรศัพท์ (Phone)</label>
                  <input
                    type="text"
                    id="clinic-website-phone"
                    data-testid="clinic-website-phone"
                    value={contactForm.phone || ''}
                    onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="clinic-website-email">อีเมล (Email)</label>
                  <input
                    type="email"
                    id="clinic-website-email"
                    data-testid="clinic-website-email"
                    value={contactForm.email || ''}
                    onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="clinic-website-line-url">LINE URL</label>
                  <input
                    type="text"
                    id="clinic-website-line-url"
                    data-testid="clinic-website-line-url"
                    value={contactForm.lineUrl || ''}
                    onChange={(e) => setContactForm({ ...contactForm, lineUrl: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>LINE OA ID</label>
                  <input
                    type="text"
                    value={contactForm.lineOaId || ''}
                    onChange={(e) => setContactForm({ ...contactForm, lineOaId: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Facebook URL</label>
                  <input
                    type="text"
                    value={contactForm.facebookUrl || ''}
                    onChange={(e) => setContactForm({ ...contactForm, facebookUrl: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Instagram URL</label>
                  <input
                    type="text"
                    value={contactForm.instagramUrl || ''}
                    onChange={(e) => setContactForm({ ...contactForm, instagramUrl: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>TikTok URL</label>
                  <input
                    type="text"
                    value={contactForm.tiktokUrl || ''}
                    onChange={(e) => setContactForm({ ...contactForm, tiktokUrl: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Website URL</label>
                  <input
                    type="text"
                    value={contactForm.websiteUrl || ''}
                    onChange={(e) => setContactForm({ ...contactForm, websiteUrl: e.target.value })}
                  />
                </div>
              </div>
              <div style={{ marginTop: '20px' }}>
                <Button type="submit" id="clinic-website-save-contact" data-testid="clinic-website-save-contact">
                  บันทึกข้อมูลการติดต่อ
                </Button>
              </div>
            </form>
          )}

          {activeTab === 'location' && (
            <form id="clinic-website-location-form" data-testid="clinic-website-location-form" onSubmit={handleSaveLocation}>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="clinic-website-address-line1">ที่อยู่ บรรทัด 1 (Address Line 1)</label>
                  <input
                    type="text"
                    id="clinic-website-address-line1"
                    data-testid="clinic-website-address-line1"
                    value={locationForm.addressLine1 || ''}
                    onChange={(e) => setLocationForm({ ...locationForm, addressLine1: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>ที่อยู่ บรรทัด 2 (Address Line 2)</label>
                  <input
                    type="text"
                    value={locationForm.addressLine2 || ''}
                    onChange={(e) => setLocationForm({ ...locationForm, addressLine2: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>เขต/อำเภอ (District)</label>
                  <input
                    type="text"
                    value={locationForm.district || ''}
                    onChange={(e) => setLocationForm({ ...locationForm, district: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="clinic-website-province">จังหวัด (Province)</label>
                  <input
                    type="text"
                    id="clinic-website-province"
                    data-testid="clinic-website-province"
                    value={locationForm.province || ''}
                    onChange={(e) => setLocationForm({ ...locationForm, province: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>รหัสไปรษณีย์ (Postal Code)</label>
                  <input
                    type="text"
                    value={locationForm.postalCode || ''}
                    onChange={(e) => setLocationForm({ ...locationForm, postalCode: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>ประเทศ (Country)</label>
                  <input
                    type="text"
                    value={locationForm.country || 'Thailand'}
                    onChange={(e) => setLocationForm({ ...locationForm, country: e.target.value })}
                  />
                </div>
                <div className="field field-span-2">
                  <label htmlFor="clinic-website-google-map-url">Google Map Link URL</label>
                  <input
                    type="text"
                    id="clinic-website-google-map-url"
                    data-testid="clinic-website-google-map-url"
                    value={locationForm.googleMapUrl || ''}
                    onChange={(e) => setLocationForm({ ...locationForm, googleMapUrl: e.target.value })}
                  />
                </div>
                <div className="field field-span-2">
                  <label>Google Map Embed URL</label>
                  <input
                    type="text"
                    value={locationForm.googleMapEmbedUrl || ''}
                    onChange={(e) => setLocationForm({ ...locationForm, googleMapEmbedUrl: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Latitude</label>
                  <input
                    type="number"
                    step="any"
                    value={locationForm.latitude != null ? locationForm.latitude : ''}
                    onChange={(e) => setLocationForm({ ...locationForm, latitude: e.target.value === '' ? '' : Number(e.target.value) })}
                  />
                </div>
                <div className="field">
                  <label>Longitude</label>
                  <input
                    type="number"
                    step="any"
                    value={locationForm.longitude != null ? locationForm.longitude : ''}
                    onChange={(e) => setLocationForm({ ...locationForm, longitude: e.target.value === '' ? '' : Number(e.target.value) })}
                  />
                </div>
                <div className="field field-span-2">
                  <label>เวลาทำการ (Business Hours JSON)</label>
                  <textarea
                    style={{ fontFamily: 'monospace', minHeight: '120px' }}
                    value={locationForm.businessHoursStr || '{}'}
                    onChange={(e) => setLocationForm({ ...locationForm, businessHoursStr: e.target.value })}
                  />
                </div>
              </div>
              <div style={{ marginTop: '20px' }}>
                <Button type="submit" id="clinic-website-save-location" data-testid="clinic-website-save-location">
                  บันทึกที่ตั้งและเวลา
                </Button>
              </div>
            </form>
          )}

          {activeTab === 'sections' && (
            <div className="clinic-website-sections" id="clinic-website-sections" data-testid="clinic-website-sections">
              <h3 className="section-heading compact-gap">เพิ่ม Section ใหม่</h3>
              <form id="clinic-website-add-section" data-testid="clinic-website-add-section" onSubmit={handleAddSection} style={{ marginBottom: '30px', borderBottom: '1px solid var(--border)', paddingBottom: '20px' }}>
                <div className="form-grid">
                  <div className="field">
                    <label>คีย์ระบุ (Section Key - ภาษาอังกฤษ เช่น my_hero)</label>
                    <input
                      type="text"
                      value={newSection.sectionKey}
                      onChange={(e) => setNewSection({ ...newSection, sectionKey: e.target.value })}
                      required
                    />
                  </div>
                  <div className="field">
                    <label>ประเภท (Section Type)</label>
                    <select
                      value={newSection.sectionType}
                      onChange={(e) => setNewSection({ ...newSection, sectionType: e.target.value })}
                    >
                      <option value="hero">Hero</option>
                      <option value="trust_badges">Trust Badges</option>
                      <option value="services_preview">Services Preview</option>
                      <option value="promotions_preview">Promotions Preview</option>
                      <option value="about">About</option>
                      <option value="location">Location</option>
                      <option value="final_cta">Final CTA</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>หัวข้อหลัก (Title)</label>
                    <input
                      type="text"
                      value={newSection.title}
                      onChange={(e) => setNewSection({ ...newSection, title: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>หัวข้อย่อย (Subtitle)</label>
                    <input
                      type="text"
                      value={newSection.subtitle}
                      onChange={(e) => setNewSection({ ...newSection, subtitle: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>สถานะ (Status)</label>
                    <select
                      value={newSection.status}
                      onChange={(e) => setNewSection({ ...newSection, status: e.target.value })}
                    >
                      <option value="draft">ร่าง (Draft)</option>
                      <option value="published">เผยแพร่ (Published)</option>
                      <option value="hidden">ซ่อน (Hidden)</option>
                    </select>
                  </div>
                  <div className="field field-span-2">
                    <label>เนื้อหาโครงสร้างข้อมูล (Content JSON - ต้องเป็น Object เท่านั้น)</label>
                    <textarea
                      style={{ fontFamily: 'monospace', minHeight: '100px' }}
                      value={newSection.contentStr}
                      onChange={(e) => setNewSection({ ...newSection, contentStr: e.target.value })}
                    />
                  </div>
                </div>
                <div style={{ marginTop: '16px' }}>
                  <Button type="submit">เพิ่ม Section</Button>
                </div>
              </form>

              <h3 className="section-heading compact-gap">จัดการและจัดเรียง Section ล่าสุด</h3>
              {sections.length === 0 ? (
                <EmptyState title="ไม่มี Section หน้าแรก" message="เริ่มสร้าง Section ด้านบนเพื่อปรับแต่งโครงสร้างหน้าแรกของคุณ" />
              ) : (
                <div className="timeline-list">
                  {sections.map((section, idx) => (
                    <div
                      key={section.id}
                      className="timeline-item"
                      data-testid={`clinic-website-section-row-${section.id}`}
                      style={{ background: 'rgba(0, 0, 0, 0.01)', padding: '16px', borderRadius: '16px', border: '1px solid var(--border)', marginBottom: '14px' }}
                    >
                      <div className="split-header" style={{ marginBottom: '10px' }}>
                        <div>
                          <strong>{section.sectionKey}</strong> <span className="pill">{section.sectionType}</span>
                        </div>
                        <div className="inline-actions" style={{ display: 'inline-flex', gap: '6px' }}>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => handleMoveUp(idx)}
                            disabled={idx === 0}
                            style={{ padding: '4px 8px', borderRadius: '8px' }}
                          >
                            ขึ้น
                          </button>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => handleMoveDown(idx)}
                            disabled={idx === sections.length - 1}
                            style={{ padding: '4px 8px', borderRadius: '8px' }}
                          >
                            ลง
                          </button>
                          <button
                            type="button"
                            className="danger-button"
                            onClick={() => handleDeleteSection(section.id)}
                            style={{ padding: '4px 8px', borderRadius: '8px' }}
                          >
                            ลบ
                          </button>
                        </div>
                      </div>

                      <div className="form-grid">
                        <div className="field">
                          <label>หัวข้อหลัก (Title)</label>
                          <input
                            type="text"
                            id={`clinic-website-section-title-${section.id}`}
                            data-testid={`clinic-website-section-title-${section.id}`}
                            value={section.title || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSections(sections.map(s => s.id === section.id ? { ...s, title: val } : s));
                            }}
                          />
                        </div>
                        <div className="field">
                          <label>หัวข้อย่อย (Subtitle)</label>
                          <input
                            type="text"
                            value={section.subtitle || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSections(sections.map(s => s.id === section.id ? { ...s, subtitle: val } : s));
                            }}
                          />
                        </div>
                        <div className="field">
                          <label>สถานะ (Status)</label>
                          <select
                            id={`clinic-website-section-status-${section.id}`}
                            data-testid={`clinic-website-section-status-${section.id}`}
                            value={section.status}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSections(sections.map(s => s.id === section.id ? { ...s, status: val } : s));
                            }}
                          >
                            <option value="draft">ร่าง (Draft)</option>
                            <option value="published">เผยแพร่ (Published)</option>
                            <option value="hidden">ซ่อน (Hidden)</option>
                          </select>
                        </div>
                        <div className="field field-span-2">
                          <label>เนื้อหาโครงสร้างข้อมูล (Content JSON)</label>
                          <textarea
                            style={{ fontFamily: 'monospace', minHeight: '120px' }}
                            id={`clinic-website-section-content-${section.id}`}
                            data-testid={`clinic-website-section-content-${section.id}`}
                            value={section.contentStr}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSections(sections.map(s => s.id === section.id ? { ...s, contentStr: val } : s));
                            }}
                          />
                        </div>
                      </div>

                      <div style={{ marginTop: '12px' }}>
                        <Button
                          type="button"
                          id={`clinic-website-section-save-${section.id}`}
                          data-testid={`clinic-website-section-save-${section.id}`}
                          onClick={() => handleSaveSection(section)}
                        >
                          บันทึกการเปลี่ยนแปลงของ Section
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </PageShell>
  );
}

const BOOKING_REQUEST_STATUS_OPTIONS = [
  { value: '', label: 'ทุกสถานะ' },
  { value: 'new', label: 'ใหม่' },
  { value: 'contacted', label: 'ติดต่อแล้ว' },
  { value: 'confirmed', label: 'ยืนยันแล้ว' },
  { value: 'cancelled', label: 'ยกเลิก' },
  { value: 'closed', label: 'ปิดงาน' }
];

const BOOKING_REQUEST_TYPE_OPTIONS = [
  { value: '', label: 'ทุกประเภทคำขอ' },
  { value: 'consultation', label: 'ปรึกษา' },
  { value: 'booking_request', label: 'ขอนัดหมาย' },
  { value: 'follow_up', label: 'ติดตามผล' }
];

const BOOKING_INTEREST_TYPE_OPTIONS = [
  { value: '', label: 'ทุกความสนใจ' },
  { value: 'general', label: 'ทั่วไป' },
  { value: 'service', label: 'บริการ' },
  { value: 'promotion', label: 'โปรโมชั่น' },
  { value: 'package', label: 'แพ็กเกจ' }
];

function bookingStatusLabel(status) {
  return BOOKING_REQUEST_STATUS_OPTIONS.find((option) => option.value === status)?.label || status || '-';
}

function bookingRequestTypeLabel(requestType) {
  return BOOKING_REQUEST_TYPE_OPTIONS.find((option) => option.value === requestType)?.label || requestType || '-';
}

function bookingInterestTypeLabel(interestType) {
  return BOOKING_INTEREST_TYPE_OPTIONS.find((option) => option.value === interestType)?.label || interestType || '-';
}

function BookingRequestsPage() {
  const api = useApi();
  const sessionOptions = useSessionRequestOptions();
  const { session } = useTenant();
  const normalizedRole = session?.currentMembership?.role || '';
  const role = session?.currentMembership?.legacyRole || normalizedRole;
  const canManage = ['owner', 'manager', 'marketing', 'sales', 'admin'].includes(role) || normalizedRole === 'admin';
  const [filterDraft, setFilterDraft] = useState({
    status: '',
    requestType: '',
    interestType: '',
    dateFrom: '',
    dateTo: ''
  });
  const [appliedFilters, setAppliedFilters] = useState(filterDraft);
  const [refreshToken, setRefreshToken] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [detailState, setDetailState] = useState({ status: 'idle', data: null, error: null });
  const [selectedStatus, setSelectedStatus] = useState('new');
  const [noteText, setNoteText] = useState('');
  const [notice, setNotice] = useState(null);
  const [permissionError, setPermissionError] = useState(null);

  const [listState] = usePageData(
    () => api.listBookingRequests(sessionOptions, { ...appliedFilters, limit: 50, offset: 0 }),
    [
      api,
      sessionOptions,
      appliedFilters.status,
      appliedFilters.requestType,
      appliedFilters.interestType,
      appliedFilters.dateFrom,
      appliedFilters.dateTo,
      refreshToken
    ]
  );

  async function loadDetail(requestId, options = {}) {
    setSelectedId(requestId);
    setPermissionError(null);
    if (!options.keepNotice) {
      setNotice(null);
    }
    setDetailState({ status: 'loading', data: null, error: null });

    try {
      const data = await api.getBookingRequest(sessionOptions, requestId);
      setDetailState({ status: 'ready', data, error: null });
      setSelectedStatus(data.status || 'new');
      setNoteText('');
    } catch (error) {
      if (error.status === 403) {
        setPermissionError('คุณไม่มีสิทธิ์จัดการคำขอนัดหมายนี้');
      }
      setDetailState({ status: 'error', data: null, error });
    }
  }

  function applyFilters(event) {
    event.preventDefault();
    setSelectedId(null);
    setDetailState({ status: 'idle', data: null, error: null });
    setAppliedFilters({ ...filterDraft });
  }

  function updateDraftField(fieldName, value) {
    setFilterDraft((current) => ({ ...current, [fieldName]: value }));
  }

  function renderPermissionError() {
    if (!permissionError) return null;
    return (
      <Card variant="notice" className="error-card" data-testid="booking-request-permission-error">
        <h3 className="section-heading">คุณไม่มีสิทธิ์จัดการคำขอนัดหมายนี้</h3>
        <p className="muted">กรุณาใช้บัญชี Owner, Manager, Marketing หรือ Sales</p>
      </Card>
    );
  }

  function handleActionError(error) {
    if (error.status === 403) {
      setPermissionError('คุณไม่มีสิทธิ์จัดการคำขอนัดหมายนี้');
      setNotice({ kind: 'error', message: 'คุณไม่มีสิทธิ์จัดการคำขอนัดหมายนี้' });
      return;
    }

    setNotice({ kind: 'error', message: describeError(error) });
  }

  async function saveStatus() {
    if (!selectedId || !detailState.data) return;
    setPermissionError(null);
    setNotice(null);

    if (!canManage) {
      setPermissionError('คุณไม่มีสิทธิ์จัดการคำขอนัดหมายนี้');
      setNotice({ kind: 'error', message: 'บัญชีนี้ดูคำขอนัดหมายได้ แต่ไม่สามารถเปลี่ยนสถานะได้' });
      return;
    }

    try {
      await api.updateBookingRequestStatus(sessionOptions, selectedId, { status: selectedStatus });
      setNotice({ kind: 'success', message: 'อัปเดตสถานะคำขอนัดหมายแล้ว' });
      setRefreshToken((value) => value + 1);
      await loadDetail(selectedId, { keepNotice: true });
    } catch (error) {
      handleActionError(error);
    }
  }

  async function saveNote(event) {
    event.preventDefault();
    if (!selectedId || !detailState.data) return;
    setPermissionError(null);
    setNotice(null);

    if (!canManage) {
      setPermissionError('คุณไม่มีสิทธิ์จัดการคำขอนัดหมายนี้');
      setNotice({ kind: 'error', message: 'บัญชีนี้ดูคำขอนัดหมายได้ แต่ไม่สามารถเปลี่ยนสถานะได้' });
      return;
    }

    const note = noteText.trim();
    if (!note) {
      setNotice({ kind: 'error', message: 'กรุณาระบุ note ก่อนบันทึก' });
      return;
    }

    try {
      await api.addBookingRequestNote(sessionOptions, selectedId, { note });
      setNotice({ kind: 'success', message: 'บันทึก note แล้ว' });
      setNoteText('');
      await loadDetail(selectedId, { keepNotice: true });
    } catch (error) {
      handleActionError(error);
    }
  }

  if (listState.status === 'loading' || listState.status === 'idle') {
    return <LoadingCard label="กำลังโหลดคำขอนัดหมาย..." />;
  }

  if (listState.status === 'error') {
    if (listState.error?.status === 403) {
      return (
        <PageShell title="คำขอนัดหมาย" intro="ติดตามคำขอนัดหมายจากหน้าเว็บคลินิก">
          <Card variant="notice" className="error-card" data-testid="booking-request-permission-error">
            <h3 className="section-heading">คุณไม่มีสิทธิ์จัดการคำขอนัดหมายนี้</h3>
            <p className="muted">กรุณาใช้บัญชี Owner, Manager, Marketing หรือ Sales</p>
          </Card>
        </PageShell>
      );
    }
    return <ErrorCard error={listState.error} />;
  }

  const items = listState.data?.items || [];
  const detail = detailState.data;

  return (
    <PageShell
      title="คำขอนัดหมาย"
      intro="ดูคำขอจากหน้าเว็บคลินิก กรองรายการ เปิดรายละเอียด และอัปเดตสถานะการติดตาม"
    >
      <div className="booking-requests-page" data-testid="booking-requests-page">
        {notice?.kind === 'success' ? (
          <div className="alert-banner success" data-testid="booking-request-success">{notice.message}</div>
        ) : null}
        {notice?.kind === 'error' ? (
          <div className="alert-banner error" data-testid="booking-request-error">{notice.message}</div>
        ) : null}
        {renderPermissionError()}

        {!canManage ? (
          <Card variant="notice" className="notice-card" data-testid="booking-request-readonly-notice">
            <h3 className="section-heading">โหมดอ่านอย่างเดียว</h3>
            <p className="muted">บัญชีนี้ดูคำขอนัดหมายได้ แต่ไม่สามารถเปลี่ยนสถานะได้</p>
          </Card>
        ) : null}

        <Card variant="section" className="section-card">
          <form className="booking-requests-filters" data-testid="booking-requests-filters" onSubmit={applyFilters}>
            <label className="field">
              <span>สถานะ</span>
              <select
                value={filterDraft.status}
                onChange={(event) => updateDraftField('status', event.target.value)}
                data-testid="booking-requests-status-filter"
              >
                {BOOKING_REQUEST_STATUS_OPTIONS.map((option) => (
                  <option key={option.value || 'all-status'} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>ประเภทคำขอ</span>
              <select
                value={filterDraft.requestType}
                onChange={(event) => updateDraftField('requestType', event.target.value)}
                data-testid="booking-requests-request-type-filter"
              >
                {BOOKING_REQUEST_TYPE_OPTIONS.map((option) => (
                  <option key={option.value || 'all-request-type'} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>ความสนใจ</span>
              <select
                value={filterDraft.interestType}
                onChange={(event) => updateDraftField('interestType', event.target.value)}
                data-testid="booking-requests-interest-type-filter"
              >
                {BOOKING_INTEREST_TYPE_OPTIONS.map((option) => (
                  <option key={option.value || 'all-interest-type'} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>สร้างตั้งแต่วันที่</span>
              <input
                type="date"
                value={filterDraft.dateFrom}
                onChange={(event) => updateDraftField('dateFrom', event.target.value)}
                data-testid="booking-requests-date-from"
              />
            </label>
            <label className="field">
              <span>สร้างถึงวันที่</span>
              <input
                type="date"
                value={filterDraft.dateTo}
                onChange={(event) => updateDraftField('dateTo', event.target.value)}
                data-testid="booking-requests-date-to"
              />
            </label>
            <div className="booking-filter-actions">
              <Button type="submit" data-testid="booking-requests-filter-submit">ค้นหา</Button>
            </div>
          </form>
        </Card>

        <div className="booking-requests-layout">
          <Card variant="section" className="section-card">
            <div className="split-header compact-gap">
              <div>
                <h3 className="section-heading">รายการคำขอ</h3>
                <p className="muted">ทั้งหมด {listState.data?.total || 0} รายการ</p>
              </div>
              <button type="button" className="secondary-button" onClick={() => setRefreshToken((value) => value + 1)}>
                รีเฟรช
              </button>
            </div>
            {items.length === 0 ? (
              <EmptyState title="ยังไม่มีคำขอนัดหมาย" message="เมื่อมีลูกค้าส่งคำขอจากหน้าเว็บ รายการจะปรากฏที่นี่" />
            ) : (
              <div className="table-shell">
                <table className="data-table" data-testid="booking-requests-list">
                  <thead>
                    <tr>
                      <th>ลูกค้า</th>
                      <th>ประเภท</th>
                      <th>วันที่ต้องการ</th>
                      <th>ช่องทาง</th>
                      <th>สถานะ</th>
                      <th>สร้างเมื่อ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr
                        key={item.id}
                        className={String(selectedId) === String(item.id) ? 'selected-row' : ''}
                        onClick={() => loadDetail(item.id)}
                        data-testid={`booking-request-row-${item.id}`}
                      >
                        <td>
                          <strong>{item.customerName || item.lead?.name || 'ไม่ระบุชื่อ'}</strong>
                          <div className="muted">{item.phone || item.email || item.lineId || '-'}</div>
                        </td>
                        <td>
                          {bookingRequestTypeLabel(item.requestType)}
                          <div className="muted">{bookingInterestTypeLabel(item.interestType)}</div>
                        </td>
                        <td>{item.preferredDate || '-'}</td>
                        <td>{item.preferredContactMethod || '-'}</td>
                        <td><span className={`pill status-${item.status}`}>{bookingStatusLabel(item.status)}</span></td>
                        <td>{formatDateTime(item.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card variant="section" className="section-card" data-testid="booking-request-detail">
            {detailState.status === 'idle' ? (
              <EmptyState title="เลือกรายการเพื่อดูรายละเอียด" message="คลิกคำขอนัดหมายจากตารางด้านซ้าย" />
            ) : null}
            {detailState.status === 'loading' ? <LoadingState label="กำลังโหลดรายละเอียดคำขอ..." /> : null}
            {detailState.status === 'error' ? <ErrorCard error={detailState.error} /> : null}
            {detailState.status === 'ready' && detail ? (
              <div className="booking-request-detail-panel">
                <div>
                  <h3 className="section-heading">{detail.customerName || detail.lead?.name || 'ไม่ระบุชื่อ'}</h3>
                  <p className="muted">คำขอ #{detail.id} / Lead #{detail.leadId || '-'}</p>
                </div>
                <dl className="booking-detail-grid">
                  <div>
                    <dt>โทรศัพท์</dt>
                    <dd>{detail.phone || '-'}</dd>
                  </div>
                  <div>
                    <dt>อีเมล</dt>
                    <dd>{detail.email || '-'}</dd>
                  </div>
                  <div>
                    <dt>LINE ID</dt>
                    <dd>{detail.lineId || '-'}</dd>
                  </div>
                  <div>
                    <dt>ประเภทคำขอ</dt>
                    <dd>{bookingRequestTypeLabel(detail.requestType)}</dd>
                  </div>
                  <div>
                    <dt>ความสนใจ</dt>
                    <dd>{bookingInterestTypeLabel(detail.interestType)} {detail.interestId ? `#${detail.interestId}` : ''}</dd>
                  </div>
                  <div>
                    <dt>เวลาที่ต้องการ</dt>
                    <dd>{detail.preferredDate || '-'} / {detail.preferredTimeWindow || '-'}</dd>
                  </div>
                </dl>
                {detail.message ? (
                  <div className="booking-message-box">
                    <h4 className="section-heading">ข้อความจากลูกค้า</h4>
                    <p>{detail.message}</p>
                  </div>
                ) : null}

                <div className="booking-status-editor">
                  <label className="field">
                    <span>สถานะคำขอ</span>
                    <select
                      value={selectedStatus}
                      onChange={(event) => setSelectedStatus(event.target.value)}
                      data-testid="booking-request-status-select"
                      disabled={!canManage}
                    >
                      {BOOKING_REQUEST_STATUS_OPTIONS.filter((option) => option.value).map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <Button
                    type="button"
                    onClick={saveStatus}
                    data-testid="booking-request-status-save"
                    disabled={!canManage}
                  >
                    บันทึกสถานะ
                  </Button>
                </div>

                <form className="booking-note-form" onSubmit={saveNote}>
                  <label className="field">
                    <span>Internal note / follow-up note</span>
                    <textarea
                      value={noteText}
                      maxLength={1000}
                      onChange={(event) => setNoteText(event.target.value)}
                      data-testid="booking-request-note"
                      disabled={!canManage}
                    />
                  </label>
                  <Button type="submit" data-testid="booking-request-note-save" disabled={!canManage}>
                    บันทึก note
                  </Button>
                </form>

                {detail.notes?.length ? (
                  <ul className="stack-list">
                    {detail.notes.map((note) => (
                      <li key={note.id} className="stack-item">
                        <strong>{note.authorName || 'ทีมคลินิก'}</strong>
                        <span>{note.content}</span>
                        <span className="muted">{formatDateTime(note.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </Card>
        </div>
      </div>
    </PageShell>
  );
}

function renderPage(route) {
  switch (route?.key) {
    case 'clinics':
      return <ClinicsPage />;
    case 'clinic-website':
      return <ClinicWebsiteEditorPage />;
    case 'clinic-offerings':
      return <ClinicOfferingsAdminPage />;
    case 'booking-requests':
      return <BookingRequestsPage />;
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
            <Button type="submit" variant="primary" data-testid="login-submit" disabled={state.status === 'loading'}>
              {state.status === 'loading' ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
            </Button>
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
