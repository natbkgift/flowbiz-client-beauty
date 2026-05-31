import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import DOMPurify from 'dompurify';

// Config & API Helpers
const CONFIG = window.__FLOWBIZ_WEB_CONFIG__ || { apiBaseUrl: 'http://localhost:3001' };
const API_BASE = CONFIG.apiBaseUrl || '/api';
const PUBLIC_CLINIC_ID = Number.isInteger(Number(CONFIG.publicClinicId)) && Number(CONFIG.publicClinicId) > 0
  ? Number(CONFIG.publicClinicId)
  : null;

function withPublicClinicContext(path) {
  if (!PUBLIC_CLINIC_ID) {
    return path;
  }

  const parsed = new URL(path, window.location.origin);
  if ((parsed.pathname.startsWith('/blog/') || parsed.pathname.startsWith('/forum/')) && !parsed.searchParams.has('clinicId')) {
    parsed.searchParams.set('clinicId', String(PUBLIC_CLINIC_ID));
  }

  return `${parsed.pathname}${parsed.search}`;
}

const PLATFORM_PUBLIC_PATHS = new Set([
  '',
  '/',
  '/blog',
  '/forum',
  '/admin',
  '/api',
  '/public',
  '/health',
  '/healthz',
  '/live',
  '/ready',
  '/assets',
  '/static',
  '/pricing',
  '/demo',
  '/contact',
  '/support',
  '/terms',
  '/privacy'
]);

const PLATFORM_PREFIXES = [
  '/blog/',
  '/forum/',
  '/admin/',
  '/api/',
  '/public/',
  '/health/',
  '/healthz/',
  '/live/',
  '/ready/',
  '/assets/',
  '/static/',
  '/pricing/',
  '/demo/',
  '/contact/',
  '/support/',
  '/terms/',
  '/privacy/'
];

function getPublicPathname() {
  return window.location.pathname || '/';
}

function normalizePathname(pathname) {
  let p = pathname || '/';
  if (!p.startsWith('/')) {
    p = '/' + p;
  }
  if (p.length > 1 && p.endsWith('/')) {
    p = p.slice(0, -1);
  }
  return p;
}

function extractClinicSlugFromPathname(pathname) {
  const normalized = normalizePathname(pathname);
  if (PLATFORM_PUBLIC_PATHS.has(normalized)) {
    return null;
  }
  for (const prefix of PLATFORM_PREFIXES) {
    if (normalized.startsWith(prefix)) {
      return null;
    }
  }
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length === 0) {
    return null;
  }
  return segments[0];
}

async function getPublicClinicBySlug(slug) {
  const url = `${API_BASE}/public/clinics/${encodeURIComponent(slug)}`;
  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    if (response.status === 404) {
      return { status: 404, data: null };
    }
    if (!response.ok) {
      return { status: response.status, data: null, error: true };
    }
    const data = await response.json();
    return { status: 200, data };
  } catch (err) {
    console.warn(`Fetch to ${url} failed:`, err.message);
    return { status: 500, data: null, error: true };
  }
}

async function getPublicClinicServices(slug) {
  const url = `${API_BASE}/public/clinics/${encodeURIComponent(slug)}/services`;
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
  if (!response.ok) {
    throw new Error('โหลดบริการไม่สำเร็จ');
  }
  const payload = await response.json();
  return Array.isArray(payload.items) ? payload.items : [];
}

async function getPublicClinicPromotions(slug) {
  const url = `${API_BASE}/public/clinics/${encodeURIComponent(slug)}/promotions`;
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
  if (!response.ok) {
    throw new Error('โหลดโปรโมชั่นไม่สำเร็จ');
  }
  const payload = await response.json();
  return Array.isArray(payload.items) ? payload.items : [];
}

async function getPublicClinicPackages(slug) {
  const url = `${API_BASE}/public/clinics/${encodeURIComponent(slug)}/packages`;
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
  if (!response.ok) {
    throw new Error('โหลดแพ็กเกจไม่สำเร็จ');
  }
  const payload = await response.json();
  return Array.isArray(payload.items) ? payload.items : [];
}

async function submitPublicClinicLead(slug, payload) {
  const response = await fetch(`${API_BASE}/public/clinics/${encodeURIComponent(slug)}/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = data?.error?.code || 'PUBLIC_LEAD_SUBMIT_FAILED';
    const message = data?.error?.message || 'ส่งข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
    throw new Error(`${code}: ${message}`);
  }
  return data;
}

async function submitPublicClinicBookingRequest(slug, payload) {
  const response = await fetch(`${API_BASE}/public/clinics/${encodeURIComponent(slug)}/booking-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = data?.error?.code || 'BOOKING_REQUEST_SUBMIT_FAILED';
    const message = data?.error?.message || 'ส่งคำขอนัดหมายไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
    throw new Error(`${code}: ${message}`);
  }
  return data;
}

async function requestMemberAccessLink(slug, payload) {
  const response = await fetch(`${API_BASE}/public/clinics/${encodeURIComponent(slug)}/member-access/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = data?.error?.code || 'MEMBER_ACCESS_REQUEST_FAILED';
    const message = data?.error?.message || 'ขอลิงก์เข้าใช้งานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
    throw new Error(`${code}: ${message}`);
  }
  return data;
}

async function verifyMemberAccessToken(slug, token) {
  const response = await fetch(`${API_BASE}/public/clinics/${encodeURIComponent(slug)}/member-access/session?token=${encodeURIComponent(token)}`, {
    headers: { 'Content-Type': 'application/json' }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = data?.error?.code || 'INVALID_MEMBER_ACCESS_TOKEN';
    const message = data?.error?.message || 'ลิงก์เข้าใช้งานไม่ถูกต้องหรือหมดอายุ';
    throw new Error(`${code}: ${message}`);
  }
  return data;
}

async function apiFetch(path, options = {}) {
  const pathWithContext = withPublicClinicContext(path);
  try {
    const response = await fetch(`${API_BASE}${pathWithContext}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });
    if (!response.ok) throw new Error('เรียก API ไม่สำเร็จ');
    return await response.json();
  } catch (err) {
    console.warn(`API call to ${pathWithContext} failed, using local fallback state:`, err.message);
    return null;
  }
}

// Mock Data for fallback & SEO rendering
const MOCK_BLOG_POSTS = [
  {
    id: 1,
    title: '5 เคล็ดลับกู้ผิวโทรมให้ฉ่ำวาวเร่งด่วน สไตล์สาวเกาหลี',
    slug: '5-tips-glowing-skin-quick',
    excerpt: 'ผิวหมองคล้ำ นอนน้อย แต่งหน้าไม่ติดทน? มาดูเคล็ดลับบำรุงผิวเร่งด่วนใน 3 วันด้วยสกินแคร์และการทำหัตถการทางการแพทย์ร่วมกัน...',
    content: `<h2>ผิวโกลว์สวยไม่ใช่เรื่องยาก หากดูแลถูกวิธี</h2>
<p>ปัญหาผิวโทรม หมองคล้ำ ส่วนใหญ่เกิดจากการพักผ่อนไม่เพียงพอ ดื่มน้ำน้อย และการสะสมของเซลล์ผิวเก่าที่เสื่อมสภาพ วันนี้หมอมีเคล็ดลับง่ายๆ 5 ข้อมาแนะนำที่จะช่วยกู้ผิวโทรมให้กลับมาเปล่งปลั่งในเวลาอันรวดเร็วครับ</p>

<h3>1. การเติมความชุ่มชื้นแบบ Double Hydration</h3>
<p>เน้นการใช้สกินแคร์กลุ่ม Hyaluronic Acid ทั้งเช้าและเย็นเพื่อดักจับโมเลกุลน้ำไว้ใต้ผิว ควบคู่กับการดื่มน้ำสะอาดให้ได้อย่างน้อยวันละ 2-3 ลิตร</p>

<h3>2. ขัดเซลล์ผิวอย่างอ่อนโยน</h3>
<p>หลีกเลี่ยงการสครับที่รุนแรง แต่เลือกใช้สารผลัดเซลล์ผิวกลุ่ม AHA หรือ BHA สัปดาห์ละ 1-2 ครั้งเพื่อขจัดสิ่งสกปรกที่อุดตันสะสม</p>

<h3>3. ทำ Meso Glow เติมสารอาหารผิวโดยตรง</h3>
<p>หากต้องการผลลัพธ์ที่รวดเร็วทันใจ การทำหัตถการ Meso Glow ที่คลินิกเป็นตัวเลือกยอดนิยม เพราะเป็นการฉีดวิตามินและกรดอะมิโนจำเป็นเข้าสู่ผิวชั้นเมโซเดิร์มโดยตรง ทำให้ผิวดูกระจ่างใสขึ้นทันทีใน 1-2 วัน</p>

<h3>4. พักผ่อนและลดความเครียด</h3>
<p>Growth Hormone จะหลั่งออกมาฟื้นฟูผิวในช่วงเวลาที่เรานอนหลับสนิท โดยเฉพาะช่วงเวลา 22.00 - 02.00 น.</p>`,
    cover_image_url: '',
    author_name: 'นพ. วิรุจน์ สมบูรณ์สุข (หมอโอ๊ต)',
    published_at: '2026-05-20T08:00:00Z',
    tags: ['สกินแคร์', 'ฟื้นฟูผิว', 'หัตถการ']
  },
  {
    id: 2,
    title: 'เจาะลึก: ฉีด Botox ลดริ้วรอยจุดไหนเห็นผลดีที่สุด และกี่วันเห็นผล?',
    slug: 'deep-dive-botox-wrinkles-timeline',
    excerpt: 'คัมภีร์ฉีดโบต็อกสำหรับมือใหม่ ไขข้อข้องใจเรื่องริ้วรอยหน้าผาก หางตา รอยย่นระหว่างคิ้ว เลือกกี่ยูนิต และวิธีดูแลตัวเองให้ผลลัพธ์อยู่ได้นานที่สุด...',
    content: `<h2>ฉีดโบท็อกซ์ปรับรูปหน้าและลดริ้วรอย</h2>
<p>โบท็อกซ์ (Botulinum Toxin A) เป็นหัตถการยอดฮิตอันดับหนึ่งที่ช่วยผ่อนคลายกล้ามเนื้อที่หดตัวซึ่งเป็นสาเหตุของการเกิดริ้วรอยบนใบหน้า</p>

<h3>จุดยอดนิยมในการฉีดลดริ้วรอย</h3>
<ul>
  <li><strong>หน้าผาก (Forehead Lines):</strong> แก้ปัญหารอยย่นแนวขวางเวลาเลิกคิ้ว</li>
  <li><strong>ระหว่างคิ้ว (Grown Lines):</strong> รอยย่นลึกเวลาหน้านิ่วคิ้วขมวด</li>
  <li><strong>หางตา (Crow's Feet):</strong> ริ้วรอยเวลายิ้มหรือหัวเราะ</li>
</ul>

<h3>ฉีดโบกี่วันเห็นผล?</h3>
<p>สำหรับริ้วรอยจะเริ่มตึงขึ้นใน 3-5 วัน และเห็นผลลัพธ์ชัดเจนที่สุดใน 14 วัน ส่วนโบท็อกซ์ลดกรามปรับรูปหน้าจะใช้เวลาประมาณ 4 สัปดาห์ในการเห็นผลกล้ามเนื้อกรามที่ลีบลงครับ</p>`,
    cover_image_url: '',
    author_name: 'พญ. ปาริชาติ ศักดิ์เจริญ (หมอนิ่ม)',
    published_at: '2026-05-18T10:00:00Z',
    tags: ['โบท็อกซ์', 'ลดริ้วรอย', 'ความงาม']
  }
];

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

function openExternalUrl(url) {
  if (!isSafeUrl(url)) {
    return;
  }

  const popup = window.open(url, '_blank', 'noopener,noreferrer');
  if (popup) {
    popup.opener = null;
  }
}

function parseHashRoute(route) {
  const raw = route || '#/';
  const withoutHash = raw.startsWith('#') ? raw.slice(1) : raw;
  const [rawPathname = '/', query = ''] = withoutHash.split('?');
  const pathname = rawPathname && rawPathname.startsWith('/') ? rawPathname : `/${rawPathname || ''}`;
  return {
    pathname: pathname || '/',
    searchParams: new URLSearchParams(query)
  };
}

function formatThaiMoney(value, currency = 'THB') {
  const prefix = currency === 'THB' ? '฿' : `${currency} `;
  return `${prefix}${new Intl.NumberFormat('th-TH').format(Number(value || 0))}`;
}

function formatPublicServicePrice(service) {
  if (service.priceMin != null && service.priceMax != null && Number(service.priceMax) !== Number(service.priceMin)) {
    return `${formatThaiMoney(service.priceMin, service.currency)} - ${formatThaiMoney(service.priceMax, service.currency)}`;
  }

  if (service.priceMin != null) {
    return `เริ่มต้น ${formatThaiMoney(service.priceMin, service.currency)}`;
  }

  if (service.priceMax != null) {
    return formatThaiMoney(service.priceMax, service.currency);
  }

  return 'สอบถามราคา';
}

function formatPublicPackagePrice(pkg) {
  if (pkg.price != null) {
    return formatThaiMoney(pkg.price, pkg.currency);
  }

  return 'สอบถามราคา';
}

function plainOfferingText(value) {
  return String(value || '').replace(/<[^>]*>/g, '').trim();
}

const MOCK_FORUM_TOPICS = [
  {
    id: 1,
    title: 'ฉีดฟิลเลอร์ใต้ตามาแล้วเป็นก้อน บวมๆ แก้ยังไงดีคะ?',
    slug: 'filler-under-eye-lump-solution',
    content: 'สวัสดีค่ะเพื่อนๆ พอดีหนูไปฉีดฟิลเลอร์ใต้ตามาได้ประมาณ 2 อาทิตย์แล้วค่ะ แต่รู้สึกว่ามันเป็นลำ เป็นก้อนนูนขึ้นมาเวลายิ้ม ดูไม่เป็นธรรมชาติเลยค่ะ แบบนี้มันจะค่อยๆ ยุบไปเองไหมคะ หรือหนูต้องไปฉีดสลายออกอย่างเดียวเลย?',
    author_display_name: 'กราบงามๆ3ที',
    is_anonymous: true,
    category: 'surgery',
    reply_count: 2,
    created_at: '2026-05-24T06:00:00Z',
    replies: [
      {
        id: 101,
        content: 'ฟิลเลอร์แท้กลุ่ม Hyaluronic Acid ปกติจะใช้เวลาเซ็ตตัวประมาณ 2-4 สัปดาห์ครับ ในช่วง 2 สัปดาห์แรกอาจมีอาการบวมหนาตัวได้ แนะนำให้รอจนครบ 1 เดือน หากยังนูนเป็นก้อนชัดเจน สามารถเข้ามาให้แพทย์ประเมินเพื่อฉีดสารสลายฟิลเลอร์ (Hyaluronidase) ได้ครับ ไม่ควรปล่อยทิ้งไว้หากเป็นก้อนจากการฉีดตื้นเกินไปหรือใช้รุ่นฟิลเลอร์ที่ไม่เหมาะสม',
        author_display_name: 'นพ. วิรุจน์ สมบูรณ์สุข (แพทย์ผิวหนัง)',
        is_anonymous: false,
        is_doctor_reply: true,
        is_verified_answer: true,
        created_at: '2026-05-24T08:30:00Z'
      },
      {
        id: 102,
        content: 'เราเคยเป็นค่ะ รอ 3 อาทิตย์ไม่หาย สุดท้ายไปฉีดสลายแล้วฉีดใหม่กับหมอผู้เชี่ยวชาญ หายเลยค่ะ สู้ๆ นะคะ',
        author_display_name: 'น้องหมีสีชมพู',
        is_anonymous: false,
        is_doctor_reply: false,
        is_verified_answer: false,
        created_at: '2026-05-24T09:15:00Z'
      }
    ]
  },
  {
    id: 2,
    title: 'เป็นคนผิวแพ้ง่ายมาก หน้าแดง แสบร้อนง่าย เลเซอร์ตัวไหนดี?',
    slug: 'sensitive-skin-laser-inquiry',
    content: 'มีใครผิวบอบบางแพ้ง่ายมากๆ โดนแดดนิดหน่อยหน้าก็แดงแสบ คันยิบๆ ไหมคะ อยากบำรุงหรือทำเลเซอร์ช่วยฟื้นฟูผิวให้แข็งแรงขึ้น แนะนำตัวไหนดีคะ ที่ไม่ทำให้ผิวบางลงไปอีก?',
    author_display_name: 'ทรายแก้ว',
    is_anonymous: false,
    category: 'skincare',
    reply_count: 1,
    created_at: '2026-05-23T12:00:00Z',
    replies: [
      {
        id: 201,
        content: 'คนไข้ที่ผิวบอบบางแพ้ง่าย แนะนำให้หลีกเลี่ยงเลเซอร์กลุ่มผลัดเซลล์ผิวแรงๆ (Ablative Laser) ครับ ควรเน้นหัตถการฟื้นฟูเกราะป้องกันผิว (Skin Barrier) เช่น การทำ LDM (Local Dynamic Micro-massage) เพื่อลดการอักเสบ หรือการฉีดกลุ่ม Rejuran / PDRN เพื่อซ่อมแซมเซลล์จากภายใน และควรล้างหน้าด้วยเจลสูตรอ่อนโยน ทามอยส์เจอไรเซอร์เข้มข้นสม่ำเสมอครับ',
        author_display_name: 'พญ. ปาริชาติ ศักดิ์เจริญ (แพทย์ความงาม)',
        is_anonymous: false,
        is_doctor_reply: true,
        is_verified_answer: true,
        created_at: '2026-05-23T14:45:00Z'
      }
    ]
  }
];

// Main SPA Application Wrapper
export function App() {
  const [currentRoute, setCurrentRoute] = useState(window.location.hash || '#/');
  const [blogPosts, setBlogPosts] = useState(MOCK_BLOG_POSTS);
  const [forumTopics, setForumTopics] = useState(MOCK_FORUM_TOPICS);

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentRoute(window.location.hash || '#/');
      window.scrollTo(0, 0);
    };

    window.addEventListener('hashchange', handleHashChange);
    
    // Initial fetch from real APIs
    loadData();

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  const loadData = async () => {
    // Attempt real API fetches (fallback handled in apiFetch helper)
    const fetchedPosts = await apiFetch('/blog/posts');
    if (fetchedPosts && Array.isArray(fetchedPosts.items)) {
      setBlogPosts(fetchedPosts.items);
    }
    
    const fetchedTopics = await apiFetch('/forum/topics');
    if (fetchedTopics && Array.isArray(fetchedTopics.items)) {
      setForumTopics(fetchedTopics.items);
    }
  };

  const pathname = normalizePathname(window.location.pathname);
  const clinicSlug = extractClinicSlugFromPathname(pathname);

  // Basic Router parser
  const SAAS_SECTION_MAP = { '/pricing': 'pricing', '/demo': 'demo', '/contact': 'contact' };

  const renderPage = () => {
    if (clinicSlug) {
      return <ClinicPublicShell clinicSlug={clinicSlug} currentRoute={currentRoute} />;
    }

    if (pathname === '/blog') {
      return <BlogListPage posts={blogPosts} />;
    }
    if (pathname.startsWith('/blog/')) {
      const slug = pathname.replace('/blog/', '');
      const post = blogPosts.find(p => p.slug === slug);
      return <BlogDetailPage slug={slug} initialPost={post} />;
    }
    if (pathname === '/forum') {
      return (
        <ForumListPage 
          topics={forumTopics} 
          onTopicAdded={(newTopic) => setForumTopics([newTopic, ...forumTopics])}
        />
      );
    }
    if (pathname.startsWith('/forum/')) {
      const topicIdOrSlug = pathname.replace('/forum/', '');
      return (
        <ForumDetailPage 
          topicIdOrSlug={topicIdOrSlug}
          onReplyAdded={() => {
            loadData();
          }}
        />
      );
    }

    // Platform SaaS landing routes
    if (pathname === '/' || pathname in SAAS_SECTION_MAP) {
      return <FlowBizSaasLandingPage activeSection={SAAS_SECTION_MAP[pathname] || 'home'} />;
    }

    const hash = currentRoute.substring(1) || '/';
    
    if (hash === '/') {
      return <FlowBizSaasLandingPage activeSection="home" />;
    }
    
    if (hash === '/blog') {
      return <BlogListPage posts={blogPosts} />;
    }
    
    if (hash.startsWith('/blog/')) {
      const slug = hash.replace('/blog/', '');
      const post = blogPosts.find(p => p.slug === slug);
      return <BlogDetailPage slug={slug} initialPost={post} />;
    }
    
    if (hash === '/forum') {
      return (
        <ForumListPage 
          topics={forumTopics} 
          onTopicAdded={(newTopic) => setForumTopics([newTopic, ...forumTopics])}
        />
      );
    }
    
    if (hash.startsWith('/forum/')) {
      const topicIdOrSlug = hash.replace('/forum/', '');
      return (
        <ForumDetailPage 
          topicIdOrSlug={topicIdOrSlug}
          onReplyAdded={() => {
            loadData();
          }}
        />
      );
    }

    return (
      <div className="public-container" style={{ textAlign: 'center', padding: '5rem 2rem' }}>
        <h1 style={{ fontSize: '3rem', marginBottom: '1.5rem', color: 'var(--gold-primary)' }}>404</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>ขออภัย ไม่พบหน้าที่ท่านต้องการ</p>
        <a href="/" className="cta-btn">กลับหน้าแรก</a>
      </div>
    );
  };

  return (
    <div>
      {/* Premium Sticky Navigation */}
      <header className="header-glass">
        {clinicSlug ? (
          <a href={`/${clinicSlug}`} className="logo">
            <span className="logo-icon">✨</span> FlowBiz Clinic
          </a>
        ) : (
          <a href="/" className="logo">
            <span className="logo-icon">✨</span> FlowBiz Beauty
          </a>
        )}
        <nav>
          <ul className={clinicSlug ? 'nav-links' : 'nav-links saas-nav-links'}>
            {clinicSlug ? (
              <>
                <li><a href={`/${clinicSlug}`} className={parseHashRoute(currentRoute).pathname === '/' ? 'active' : ''}>หน้าแรก</a></li>
                <li><a href={`/${clinicSlug}#/member-access`} className={parseHashRoute(currentRoute).pathname === '/member-access' ? 'active' : ''}>สถานะของฉัน</a></li>
              </>
            ) : (
              <>
                <li><a href="/" className={pathname === '/' ? 'active' : ''}>หน้าแรก</a></li>
                <li><a href="/#saas-features">Features</a></li>
                <li><a href="/pricing" className={pathname === '/pricing' ? 'active' : ''}>Pricing</a></li>
                <li><a href="/demo" className={pathname === '/demo' ? 'active' : ''}>Demo</a></li>
                <li><a href="/contact" className={pathname === '/contact' ? 'active' : ''}>Contact</a></li>
                <li><a href="/blog" className={pathname.startsWith('/blog') ? 'active' : ''}>บทความ</a></li>
                <li><a href="/forum" className={pathname.startsWith('/forum') ? 'active' : ''}>เว็บบอร์ด</a></li>
              </>
            )}
          </ul>
        </nav>
        <div className="header-actions">
          <a href="/admin" className="cta-btn secondary" target="_blank" rel="noopener noreferrer">{clinicSlug ? 'เข้าระบบ CRM' : 'Clinic Login'}</a>
          {clinicSlug ? (
            <button className="cta-btn" onClick={() => openExternalUrl('https://line.me')}>ติดต่อเรา</button>
          ) : (
            <a href="/demo" className="cta-btn">Request Demo</a>
          )}
        </div>
      </header>

      {/* Renders Active SPA Page */}
      <main>{renderPage()}</main>

      {/* Premium Footer */}
      <footer className="footer">
        <div className="footer-content">
          {clinicSlug ? (
            <>
              <div>
                <h3 className="footer-section-title">เกี่ยวกับคลินิก</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                  คลินิกความงามระดับพรีเมียม ให้บริการปรับรูปหน้า ดูแลผิวพรรณ เลเซอร์ และการชะลอวัยโดยแพทย์ผู้เชี่ยวชาญ
                </p>
                <span style={{ color: 'var(--gold-primary)', fontWeight: '700' }}>✨ สวยมั่นใจ อย่างเป็นธรรมชาติ</span>
              </div>
              <div>
                <h3 className="footer-section-title">บริการของเรา</h3>
                <ul className="footer-links">
                  <li><a href="#/">ฉีดโบต็อกปรับรูปหน้า</a></li>
                  <li><a href="#/">ฟิลเลอร์ใต้ตา ร่องแก้ม</a></li>
                  <li><a href="#/">Meso Glow กู้ผิวใส</a></li>
                  <li><a href="#/">ยกกระชับ Ultherapy</a></li>
                </ul>
              </div>
              <div>
                <h3 className="footer-section-title">ติดต่อเรา</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                  📍 123 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร 10110
                </p>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                  📞 โทร: +66 2 123 4567
                </p>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  ⏰ เวลาเปิดทำการ: ทุกวัน 10:00 - 20:00 น.
                </p>
              </div>
            </>
          ) : (
            <>
              <div>
                <h3 className="footer-section-title">FlowBiz Beauty</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                  AI Operating System สำหรับคลินิกความงาม ช่วยจัดการ Lead, CRM, LINE follow-up และ AI governance ในระบบเดียว
                </p>
                <span style={{ color: 'var(--gold-primary)', fontWeight: '700' }}>✨ AI เสนอ · คนอนุมัติ · มี Audit Trail</span>
              </div>
              <div>
                <h3 className="footer-section-title">Platform</h3>
                <ul className="saas-footer-links">
                  <li><a href="/">หน้าแรก</a></li>
                  <li><a href="/pricing">Pricing</a></li>
                  <li><a href="/demo">Request Demo</a></li>
                  <li><a href="/contact">Contact</a></li>
                </ul>
              </div>
              <div>
                <h3 className="footer-section-title">Resources</h3>
                <ul className="saas-footer-links">
                  <li><a href="/blog">บทความ</a></li>
                  <li><a href="/forum">เว็บบอร์ด</a></li>
                  <li><a href="/admin" target="_blank" rel="noopener noreferrer">Clinic Login / CRM</a></li>
                </ul>
              </div>
              <div>
                <h3 className="footer-section-title">ติดต่อ FlowBiz</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                  ✉️ hello@flowbiz.cloud
                </p>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  💬 LINE: @flowbiz
                </p>
              </div>
            </>
          )}
        </div>
        <div className="footer-bottom">
          &copy; {new Date().getFullYear()} {clinicSlug ? 'FlowBiz Clinic' : 'FlowBiz Beauty'}. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

// ----------------------------------------------------
// Page Component: FlowBiz SaaS Landing Page
// ----------------------------------------------------
function FlowBizSaasLandingPage({ activeSection = 'home' }) {
  const [openFaq, setOpenFaq] = useState(null);
  const [demoSubmitted, setDemoSubmitted] = useState(false);
  const [demoForm, setDemoForm] = useState({
    clinicName: '', contactName: '', phone: '', email: '', branches: '1', interest: 'general'
  });

  useEffect(() => {
    if (activeSection && activeSection !== 'home') {
      const targetId = activeSection === 'contact' ? 'saas-demo' : `saas-${activeSection}`;
      setTimeout(() => {
        const el = document.getElementById(targetId);
        if (el && typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, [activeSection]);

  const handleDemoSubmit = (e) => {
    e.preventDefault();
    setDemoSubmitted(true);
  };

  const painPoints = [
    { icon: '😰', title: 'Lead จาก Facebook/LINE หลุดตามไม่ทัน', desc: 'ลูกค้าทักมาแล้วไม่มีระบบติดตาม ทำให้ lead หายไปโดยไม่รู้ตัว' },
    { icon: '🔁', title: 'แอดมินตอบไม่สม่ำเสมอ', desc: 'แต่ละคนตอบไม่เหมือนกัน ไม่มี standard messaging ทำให้ลูกค้าสับสน' },
    { icon: '📉', title: 'ไม่มีระบบติดตามลูกค้าเก่า', desc: 'ลูกค้าเก่าที่ควรกลับมาทำหัตถการซ้ำ ถูกลืมไปเพราะไม่มีระบบ remind' },
    { icon: '⚠️', title: 'AI ตอบเองเสี่ยงเกินไป', desc: 'ให้ AI ตอบโดยอัตโนมัติในบริบททางการแพทย์ อาจนำไปสู่ปัญหาด้านความปลอดภัย' },
    { icon: '👁️', title: 'เจ้าของไม่เห็น performance รวม', desc: 'ไม่มี dashboard รวมดู lead, conversion, follow-up ของทุกช่องทาง' }
  ];

  const features = [
    { icon: '🤖', title: 'AI CRM', desc: 'ระบบ CRM อัจฉริยะที่ช่วยจัดการ Lead Pipeline พร้อม AI สรุปข้อมูลลูกค้า' },
    { icon: '💬', title: 'LINE Automation', desc: 'เชื่อมต่อ LINE OA เพื่อ follow-up อัตโนมัติ พร้อมระบบ template ที่ปรับแต่งได้' },
    { icon: '✅', title: 'Human-in-the-Loop Approval', desc: 'AI ช่วยร่าง แต่คนต้องอนุมัติก่อนส่งจริง มั่นใจได้ว่าข้อความปลอดภัย' },
    { icon: '🌐', title: 'Clinic Website Builder', desc: 'สร้างเว็บไซต์คลินิกของคุณบนแพลตฟอร์ม FlowBiz พร้อม SEO และ blog' },
    { icon: '📊', title: 'Lead Scoring', desc: 'ให้คะแนน lead อัตโนมัติตามพฤติกรรมและความสนใจ จัดลำดับความสำคัญได้ชัด' },
    { icon: '📋', title: 'Audit Trail', desc: 'บันทึกทุกการกระทำของ AI และพนักงาน ตรวจสอบย้อนหลังได้ทุกขั้นตอน' },
    { icon: '🏥', title: 'Multi-Clinic Management', desc: 'จัดการหลายสาขาในระบบเดียว แยกข้อมูลและสิทธิ์อย่างชัดเจน' },
    { icon: '📈', title: 'Campaign Tracking', desc: 'ติดตาม campaign และ promotion ดู ROI แบบ real-time' }
  ];

  const steps = [
    { num: '1', title: 'Lead เข้ามา', desc: 'ลูกค้าทักผ่าน LINE, Facebook, หรือเว็บไซต์' },
    { num: '2', title: 'บันทึกเข้า CRM', desc: 'ระบบจับ lead เข้า pipeline อัตโนมัติ' },
    { num: '3', title: 'AI วิเคราะห์', desc: 'AI สรุปข้อมูลและแนะนำ follow-up ที่เหมาะสม' },
    { num: '4', title: 'คนตรวจ/อนุมัติ', desc: 'พนักงานรีวิวและอนุมัติข้อความก่อนส่ง' },
    { num: '5', title: 'ส่งและติดตาม', desc: 'ส่งข้อความจริงและติดตามผลลัพธ์' },
    { num: '6', title: 'เจ้าของดู Dashboard', desc: 'ดูภาพรวม lead, conversion และ performance' }
  ];

  const packages = [
    {
      name: 'Starter',
      desc: 'สำหรับคลินิกเดี่ยวที่ต้องการเริ่มต้นระบบ lead management',
      price: '9,900',
      features: ['Clinic website', 'Lead CRM dashboard', 'Basic LINE follow-up', 'Manual approval workflow', 'Audit trail', 'Demo/simulated mode']
    },
    {
      name: 'Growth',
      desc: 'สำหรับคลินิกที่มีหลายช่องทาง lead และทีม 2-5 คน',
      price: '19,900',
      featured: true,
      features: ['ทุกอย่างใน Starter', 'AI lead summary & scoring', 'AI suggested replies (HITL)', 'No-show recovery workflow', 'Botox/Filler cycle reminder', 'Campaign tracking', 'Multi-admin workflow']
    },
    {
      name: 'Enterprise',
      desc: 'สำหรับกลุ่มคลินิกหรือ chain ที่ต้องการ governance เต็มรูปแบบ',
      price: null,
      features: ['ทุกอย่างใน Growth', 'Multi-branch management', 'Advanced audit & RBAC', 'Custom automation rules', 'Dedicated setup & support', 'Integration architecture review', 'SLA & governance workshop']
    }
  ];

  const faqs = [
    { q: 'FlowBiz ใช้แทน CRM ได้ไหม?', a: 'FlowBiz Beauty ออกแบบมาเพื่อเป็น AI-powered CRM สำหรับคลินิกความงามโดยเฉพาะ ครอบคลุมการจัดการ lead, follow-up, และ customer lifecycle ทั้งหมด ไม่ใช่แค่ CRM ทั่วไป แต่รวม AI automation และ approval workflow ไว้ในระบบเดียว' },
    { q: 'AI ส่งข้อความเองหรือไม่?', a: 'ไม่ครับ FlowBiz ใช้หลัก Human-in-the-Loop (HITL) ทุกข้อความที่ AI ร่างจะต้องผ่านการตรวจสอบและอนุมัติจากพนักงานก่อนส่งจริง โดยเฉพาะข้อความที่เกี่ยวกับการแพทย์หรือการรักษา AI จะไม่ส่งออกเองโดยเด็ดขาด' },
    { q: 'ใช้กับ LINE OA ได้ไหม?', a: 'ได้ครับ FlowBiz รองรับการเชื่อมต่อกับ LINE Official Account ของคลินิก เพื่อรับ-ส่งข้อความอัตโนมัติ follow-up lead และจัดการ conversation ทั้งหมดผ่านระบบ CRM ส่วนกลาง' },
    { q: 'คลินิกหลายสาขาใช้ได้ไหม?', a: 'ได้ครับ FlowBiz รองรับ Multi-Clinic Management แยกข้อมูล สิทธิ์ และการตั้งค่าของแต่ละสาขาอย่างชัดเจน เจ้าของสามารถดูภาพรวมทุกสาขาได้จาก dashboard เดียว' },
    { q: 'ต้องมีทีม IT ไหม?', a: 'ไม่จำเป็นครับ FlowBiz เป็น SaaS ที่ใช้งานผ่าน browser ได้ทันที ไม่ต้องติดตั้งซอฟต์แวร์ ทีม FlowBiz จะช่วย setup และ onboarding ให้ในช่วงเริ่มต้น' }
  ];

  return (
    <div className="saas-landing" data-testid="saas-landing-page">

      {/* Hero Section */}
      <section className="saas-hero" data-testid="saas-hero" id="saas-hero">
        <div className="saas-hero-content">
          <span className="saas-hero-eyebrow">AI Operating System for Beauty Clinics</span>
          <h1>AI CRM & Automation Platform for Beauty Clinics</h1>
          <p className="saas-hero-sub">
            รวมเว็บไซต์คลินิก, Lead CRM, LINE Automation, AI Copilot และ Human Approval ไว้ในระบบเดียว
          </p>
          <div className="saas-hero-actions">
            <a href="/demo" className="cta-btn" data-testid="saas-request-demo-cta">Request Demo</a>
            <a href="/pricing" className="cta-btn secondary" data-testid="saas-pricing-cta">View Pricing</a>
          </div>
        </div>
      </section>

      {/* Pain Points Section */}
      <div className="saas-section-alt">
        <section className="saas-section" data-testid="saas-pain-points" id="saas-pain-points">
          <div className="saas-section-header">
            <span className="saas-eyebrow">ปัญหาที่คลินิกกำลังเจอ</span>
            <h2>ทำไมคลินิกถึงต้องการ FlowBiz?</h2>
            <p>ปัญหาเหล่านี้คุ้นเคยไหม? FlowBiz ถูกออกแบบมาเพื่อแก้ไขทุกจุดนี้</p>
          </div>
          <div className="saas-grid">
            {painPoints.map((pp, i) => (
              <div key={i} className="saas-pain-card">
                <div className="saas-pain-icon">{pp.icon}</div>
                <div>
                  <h4>{pp.title}</h4>
                  <p>{pp.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Core Features Section */}
      <section className="saas-section" data-testid="saas-features" id="saas-features">
        <div className="saas-section-header">
          <span className="saas-eyebrow">Core Features</span>
          <h2>ครบทุกฟีเจอร์ที่คลินิกต้องการ</h2>
          <p>ไม่ใช่แค่เว็บคลินิก ไม่ใช่แค่ CRM แต่เป็นระบบจัดการ lead + automation + AI governance สำหรับคลินิก</p>
        </div>
        <div className="saas-grid">
          {features.map((feat, i) => (
            <div key={i} className="saas-feature-card">
              <div className="saas-feature-icon">{feat.icon}</div>
              <h3>{feat.title}</h3>
              <p>{feat.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works Section */}
      <div className="saas-section-alt">
        <section className="saas-section" data-testid="saas-how-it-works" id="saas-how-it-works">
          <div className="saas-section-header">
            <span className="saas-eyebrow">How It Works</span>
            <h2>ขั้นตอนการทำงานของ FlowBiz</h2>
            <p>จาก lead เข้าสู่ระบบ จนถึงเจ้าของคลินิกเห็นผลลัพธ์ใน dashboard</p>
          </div>
          <div className="saas-flow-steps">
            {steps.map((step, i) => (
              <div key={i} className="saas-flow-step">
                <div className="saas-flow-step-number">{step.num}</div>
                <h4>{step.title}</h4>
                <p>{step.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* HITL Safety Section */}
      <section className="saas-section" data-testid="saas-hitl-safety" id="saas-hitl-safety">
        <div className="saas-safety-section">
          <div>
            <div className="saas-safety-badge">🛡️ Safety First</div>
            <h2 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Human Approval Gate</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', lineHeight: '1.7' }}>
              AI ไม่ควรส่งข้อความทางการแพทย์หรือข้อความสำคัญออกไปเอง FlowBiz ใช้ Human Approval Gate ก่อนส่งจริงทุกครั้ง
            </p>
          </div>
          <div>
            <ul className="saas-safety-points">
              <li><span className="check">✓</span> AI ร่างข้อความ แต่ไม่ส่งเองโดยอัตโนมัติ</li>
              <li><span className="check">✓</span> พนักงานต้องอนุมัติทุกข้อความก่อนส่งถึงลูกค้า</li>
              <li><span className="check">✓</span> ข้อความที่มีความเสี่ยงทางการแพทย์จะถูก flag พิเศษ</li>
              <li><span className="check">✓</span> บันทึก audit trail ทุกการอนุมัติ/ปฏิเสธ</li>
              <li><span className="check">✓</span> แก้ไขข้อความ AI ก่อนส่งได้ พร้อมเก็บต้นฉบับ</li>
              <li><span className="check">✓</span> ข้อความที่ถูกปฏิเสธ จะไม่ถูกส่งออกไปเด็ดขาด</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <div className="saas-section-alt">
        <section className="saas-section" data-testid="saas-pricing" id="saas-pricing">
          <div className="saas-section-header">
            <span className="saas-eyebrow">Pricing</span>
            <h2>แพ็กเกจที่เหมาะกับคลินิกของคุณ</h2>
            <p>เลือกแผนที่ตรงกับขนาดและความต้องการของคลินิก</p>
          </div>
          <div className="saas-pricing-grid">
            {packages.map((pkg, i) => (
              <div key={i} className={`saas-pricing-card ${pkg.featured ? 'featured' : ''}`}>
                {pkg.featured && <span className="saas-pricing-badge">แนะนำ</span>}
                <h3>{pkg.name}</h3>
                <p className="saas-pricing-desc">{pkg.desc}</p>
                <div className="saas-pricing-price">
                  {pkg.price ? (
                    <><span className="amount">{pkg.price}</span><span className="period"> THB/เดือน</span></>
                  ) : (
                    <span className="amount" style={{ fontSize: '1.5rem' }}>ติดต่อเรา</span>
                  )}
                </div>
                <ul className="saas-pricing-feature-list">
                  {pkg.features.map((f, j) => (
                    <li key={j}><span className="check">✓</span> {f}</li>
                  ))}
                </ul>
                <a href="/demo" className={`cta-btn ${pkg.featured ? '' : 'secondary'}`}>
                  {pkg.price ? 'เริ่มต้นใช้งาน' : 'ติดต่อทีมขาย'}
                </a>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Demo / Contact Section */}
      <section className="saas-section" data-testid="saas-demo" id="saas-demo">
        <div className="saas-demo-section" data-testid="saas-contact">
          <div className="saas-demo-info">
            <h3>พร้อมยกระดับคลินิกของคุณ?</h3>
            <p>
              กรอกข้อมูลเพื่อขอ demo ทีม FlowBiz จะติดต่อกลับเพื่อนัดสาธิตระบบ
              และช่วยวางแผนการใช้งานที่เหมาะกับคลินิกของคุณ
            </p>
            <ul className="saas-demo-highlights">
              <li><span className="icon">🎯</span> สาธิตระบบ CRM และ AI workflow จริง</li>
              <li><span className="icon">💡</span> วิเคราะห์ปัญหาและแนะนำ solution ที่เหมาะสม</li>
              <li><span className="icon">📊</span> ประเมิน ROI เบื้องต้นสำหรับคลินิกของคุณ</li>
              <li><span className="icon">🚀</span> เริ่มต้น pilot ภายใน 14 วัน</li>
            </ul>
          </div>
          <div className="saas-demo-form" data-testid="saas-demo-form">
            {demoSubmitted ? (
              <div className="saas-demo-success" data-testid="saas-demo-success">
                <div className="success-icon">✅</div>
                <h4>ขอบคุณที่สนใจ!</h4>
                <p>Demo request captured locally. Backend integration will be added later.</p>
              </div>
            ) : (
              <>
                <h3>Request Demo</h3>
                <form onSubmit={handleDemoSubmit}>
                  <div className="saas-form-grid">
                    <div className="saas-form-group">
                      <label htmlFor="demo-clinic-name">ชื่อคลินิก</label>
                      <input id="demo-clinic-name" type="text" className="saas-form-input" placeholder="เช่น ABC Beauty Clinic" value={demoForm.clinicName} onChange={(e) => setDemoForm({...demoForm, clinicName: e.target.value})} required />
                    </div>
                    <div className="saas-form-group">
                      <label htmlFor="demo-contact-name">ชื่อผู้ติดต่อ</label>
                      <input id="demo-contact-name" type="text" className="saas-form-input" placeholder="ชื่อ-นามสกุล" value={demoForm.contactName} onChange={(e) => setDemoForm({...demoForm, contactName: e.target.value})} required />
                    </div>
                    <div className="saas-form-group">
                      <label htmlFor="demo-phone">เบอร์โทร / LINE ID</label>
                      <input id="demo-phone" type="text" className="saas-form-input" placeholder="08x-xxx-xxxx" value={demoForm.phone} onChange={(e) => setDemoForm({...demoForm, phone: e.target.value})} />
                    </div>
                    <div className="saas-form-group">
                      <label htmlFor="demo-email">Email</label>
                      <input id="demo-email" type="email" className="saas-form-input" placeholder="email@clinic.com" value={demoForm.email} onChange={(e) => setDemoForm({...demoForm, email: e.target.value})} />
                    </div>
                    <div className="saas-form-group">
                      <label htmlFor="demo-branches">จำนวนสาขา</label>
                      <select id="demo-branches" className="saas-form-input" value={demoForm.branches} onChange={(e) => setDemoForm({...demoForm, branches: e.target.value})}>
                        <option value="1">1 สาขา</option>
                        <option value="2-3">2-3 สาขา</option>
                        <option value="4-10">4-10 สาขา</option>
                        <option value="10+">มากกว่า 10 สาขา</option>
                      </select>
                    </div>
                    <div className="saas-form-group">
                      <label htmlFor="demo-interest">สนใจเรื่อง</label>
                      <select id="demo-interest" className="saas-form-input" value={demoForm.interest} onChange={(e) => setDemoForm({...demoForm, interest: e.target.value})}>
                        <option value="general">ภาพรวมระบบ</option>
                        <option value="crm">AI CRM</option>
                        <option value="line">LINE Automation</option>
                        <option value="multi-clinic">Multi-Clinic</option>
                        <option value="pricing">Pricing & Pilot</option>
                      </select>
                    </div>
                  </div>
                  <button type="submit" className="cta-btn" data-testid="saas-demo-submit">ส่งคำขอ Demo</button>
                </form>
              </>
            )}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <div className="saas-section-alt">
        <section className="saas-section" data-testid="saas-faq" id="saas-faq">
          <div className="saas-section-header">
            <span className="saas-eyebrow">FAQ</span>
            <h2>คำถามที่พบบ่อย</h2>
          </div>
          <div className="saas-faq-list">
            {faqs.map((faq, i) => (
              <div key={i} className={`saas-faq-item ${openFaq === i ? 'open' : ''}`}>
                <button className="saas-faq-question" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                  <span>{faq.q}</span>
                  <span className="saas-faq-arrow">▼</span>
                </button>
                <div className="saas-faq-answer">
                  <div className="saas-faq-answer-inner">{faq.a}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Final CTA Section */}
      <section className="saas-final-cta" data-testid="saas-final-cta" id="saas-final-cta">
        <h2>พร้อมเปลี่ยนวิธีจัดการคลินิกของคุณ?</h2>
        <p>เริ่มต้นใช้ FlowBiz Beauty วันนี้ AI เสนอ · คนอนุมัติ · มี Audit Trail</p>
        <div className="saas-hero-actions">
          <a href="/demo" className="cta-btn">Request Demo</a>
          <a href="/pricing" className="cta-btn secondary">View Pricing</a>
        </div>
      </section>

    </div>
  );
}

// ----------------------------------------------------
// Page Component: Clinic Public Shell
// ----------------------------------------------------
function isValidCssColor(color) {
  if (!color || typeof color !== 'string') return false;
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(color.trim());
}

function buildClinicThemeStyle(brandingSettings) {
  const settings = brandingSettings || {};
  const primary = isValidCssColor(settings.primaryColor) ? settings.primaryColor : 'var(--gold-primary)';
  const secondary = isValidCssColor(settings.secondaryColor) ? settings.secondaryColor : 'var(--bg-secondary)';
  const accent = isValidCssColor(settings.accentColor) ? settings.accentColor : 'var(--gold-hover)';
  
  return {
    '--clinic-primary': primary,
    '--clinic-secondary': secondary,
    '--clinic-accent': accent
  };
}

function ClinicWebsiteTemplate({ data, clinicSlug, offerings = {}, offeringsStatus = 'idle' }) {
  const {
    clinic,
    websiteSettings = {},
    brandingSettings = {},
    contactSettings = {},
    locationSettings = {},
    homepageSections = [],
    isPubliclyRenderable
  } = data;

  const themeStyle = buildClinicThemeStyle(brandingSettings);
  const leadFormRef = useRef(null);
  const bookingFormRef = useRef(null);
  const [selectedInterest, setSelectedInterest] = useState({ interestType: 'general', interestId: '' });
  const [selectedBookingInterest, setSelectedBookingInterest] = useState({
    requestType: 'consultation',
    interestType: 'general',
    interestId: ''
  });

  const handleInterestSelect = (interestType, interestId) => {
    setSelectedInterest({ interestType, interestId: String(interestId || '') });
    window.requestAnimationFrame(() => {
      const formNode = leadFormRef.current;
      if (formNode?.scrollIntoView) {
        formNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      const messageInput = formNode?.querySelector?.('[data-testid="clinic-lead-message"]');
      if (messageInput?.focus) {
        messageInput.focus();
      }
    });
  };

  const handleBookingSelect = (interestType, interestId) => {
    setSelectedBookingInterest({
      requestType: 'booking_request',
      interestType,
      interestId: String(interestId || '')
    });
    window.requestAnimationFrame(() => {
      const formNode = bookingFormRef.current;
      if (formNode?.scrollIntoView) {
        formNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      const messageInput = formNode?.querySelector?.('[data-testid="clinic-booking-message"]');
      if (messageInput?.focus) {
        messageInput.focus();
      }
    });
  };

  // Frontend re-filtering of hidden sections
  const activeSections = (homepageSections || []).filter(sec => sec && sec.status !== 'hidden');

  return (
    <div className="clinic-template" data-testid="clinic-template" style={themeStyle}>
      {!isPubliclyRenderable && (
        <div className="clinic-unpublished-banner" data-testid="clinic-unpublished-notice">
          <span className="notice-icon">⚠️</span>
          <span>เว็บไซต์คลินิกนี้ยังไม่ถูกเผยแพร่เต็มรูปแบบ</span>
        </div>
      )}

      {/* Hidden compatibility elements for PR 6 test runner */}
      <div style={{ display: 'none' }}>
        <span data-testid="clinic-slug">{clinic.slug}</span>
        <span data-testid="clinic-status">{websiteSettings.websiteStatus || 'draft'}</span>
        <div data-testid="clinic-homepage-sections">
          {activeSections.map(s => s.sectionKey).join(', ')}
        </div>
      </div>

      <ClinicHeroSection 
        clinic={clinic} 
        websiteSettings={websiteSettings} 
        brandingSettings={brandingSettings} 
        contactSettings={contactSettings} 
      />

      <ClinicTrustSection homepageSections={activeSections} />

      {offeringsStatus === 'loading' ? (
        <div className="clinic-offerings-inline-state" data-testid="clinic-template-offerings-loading">
          กำลังโหลดบริการ โปรโมชั่น และแพ็กเกจ...
        </div>
      ) : null}

      {offeringsStatus === 'error' ? (
        <div className="clinic-offerings-inline-state error" data-testid="clinic-template-offerings-error">
          ไม่สามารถโหลดบริการ โปรโมชั่น และแพ็กเกจล่าสุดได้ในขณะนี้
        </div>
      ) : null}

      <ClinicServicesPreview
        homepageSections={activeSections}
        services={offerings.services || []}
        onInterestSelect={handleInterestSelect}
        onBookingSelect={handleBookingSelect}
      />

      <ClinicPromotionsPreview
        homepageSections={activeSections}
        promotions={offerings.promotions || []}
        onInterestSelect={handleInterestSelect}
        onBookingSelect={handleBookingSelect}
      />

      <ClinicPackagesPreview
        homepageSections={activeSections}
        packages={offerings.packages || []}
        onInterestSelect={handleInterestSelect}
        onBookingSelect={handleBookingSelect}
      />

      <ClinicLeadCaptureForm
        ref={leadFormRef}
        clinicSlug={clinicSlug}
        selectedInterest={selectedInterest}
      />

      <ClinicBookingRequestForm
        ref={bookingFormRef}
        clinicSlug={clinicSlug}
        selectedBookingInterest={selectedBookingInterest}
      />

      <ClinicAboutSection websiteSettings={websiteSettings} />

      <ClinicHomepageSections homepageSections={activeSections} />

      <div className="clinic-template-grid-contact-location">
        <ClinicContactSection contactSettings={contactSettings} />
        <ClinicLocationSection locationSettings={locationSettings} />
      </div>

      <ClinicFinalCta contactSettings={contactSettings} />
    </div>
  );
}

function MemberAccessPage({ clinicSlug }) {
  const hashInfo = parseHashRoute(window.location.hash || '#/member-access');
  const pageToken = hashInfo.searchParams.get('token') || new URLSearchParams(window.location.search).get('token') || '';
  const [contact, setContact] = useState('');
  const [channel, setChannel] = useState('email');
  const [honeypot, setHoneypot] = useState('');
  const [status, setStatus] = useState({ type: 'idle', message: '' });
  const [session, setSession] = useState(null);
  const [tokenError, setTokenError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    async function verify() {
      if (!pageToken) return;
      setTokenError('');
      setSession(null);
      try {
        const result = await verifyMemberAccessToken(clinicSlug, pageToken);
        if (!active) return;
        setSession(result);
      } catch (err) {
        if (!active) return;
        setTokenError(err.message);
      }
    }
    verify();
    return () => {
      active = false;
    };
  }, [clinicSlug, pageToken]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus({ type: 'idle', message: '' });

    const trimmedContact = contact.trim();
    if (!trimmedContact) {
      setStatus({ type: 'error', message: 'กรุณาระบุช่องทางติดต่อสำหรับรับลิงก์' });
      return;
    }
    if (!channel) {
      setStatus({ type: 'error', message: 'กรุณาเลือกช่องทางรับลิงก์' });
      return;
    }
    if (channel === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedContact)) {
      setStatus({ type: 'error', message: 'รูปแบบอีเมลไม่ถูกต้อง' });
      return;
    }

    setSubmitting(true);
    try {
      const result = await requestMemberAccessLink(clinicSlug, {
        contact: trimmedContact,
        channel,
        honeypot
      });
      setStatus({
        type: 'success',
        message: result.devToken
          ? `${result.message} Dev token: ${result.devToken}`
          : result.message
      });
      setContact('');
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  if (pageToken) {
    if (tokenError) {
      return (
        <section className="clinic-template-section member-access-panel" data-testid="member-access-token-error">
          <h1>ไม่สามารถเปิดข้อมูลสมาชิกได้</h1>
          <p>{tokenError}</p>
          <a href={`/${clinicSlug}#/member-access`} className="cta-btn clinic-btn-primary">ขอลิงก์ใหม่</a>
        </section>
      );
    }

    if (!session) {
      return (
        <section className="clinic-template-section member-access-panel" data-testid="member-access-session-loading">
          <p>กำลังตรวจสอบลิงก์เข้าใช้งาน...</p>
        </section>
      );
    }

    const member = session.member || {};
    const contactInfo = member.contact || {};
    const bookings = Array.isArray(session.bookingRequests) ? session.bookingRequests : [];

    return (
      <section className="clinic-template-section member-access-panel" data-testid="member-access-session">
        <div className="clinic-section-header">
          <span className="clinic-eyebrow">Member Access</span>
          <h1 data-testid="member-access-profile-name">{member.displayName || 'Member'}</h1>
          <p data-testid="member-access-profile-contact">
            {[contactInfo.emailMasked, contactInfo.phoneMasked, contactInfo.lineIdMasked].filter(Boolean).join(' · ') || 'ไม่มีข้อมูลติดต่อที่แสดงได้'}
          </p>
        </div>

        <div className="member-access-bookings" data-testid="member-access-booking-list">
          {bookings.length === 0 ? (
            <div className="clinic-fallback-card">
              <h4>ยังไม่มีคำขอนัดหมายที่เชื่อมกับโปรไฟล์นี้</h4>
            </div>
          ) : bookings.map((booking) => (
            <div className="member-access-booking-row" data-testid={`member-access-booking-row-${booking.id}`} key={booking.id}>
              <div>
                <strong>{booking.requestType}</strong>
                <span>{booking.interestType}</span>
              </div>
              <div>
                <span className="member-access-status">{booking.status}</span>
                <span>{booking.preferredDate || 'ไม่ระบุวัน'} {booking.preferredTimeWindow || ''}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="clinic-template-section member-access-panel">
      <div className="clinic-section-header">
        <span className="clinic-eyebrow">Member Access</span>
        <h1>ตรวจสอบสถานะคำขอของฉัน</h1>
        <p>รับลิงก์เข้าใช้งานแบบจำกัดเวลาเพื่อดูข้อมูลสมาชิกและสถานะคำขอที่เกี่ยวข้อง</p>
      </div>

      <form className="clinic-lead-form member-access-form" data-testid="member-access-request-form" onSubmit={handleSubmit}>
        {status.type === 'success' && (
          <div className="clinic-lead-alert success" data-testid="member-access-request-success">{status.message}</div>
        )}
        {status.type === 'error' && (
          <div className="clinic-lead-alert error" data-testid="member-access-request-error">{status.message}</div>
        )}

        <label className="clinic-lead-field">
          ช่องทางติดต่อ
          <input
            data-testid="member-access-contact"
            type={channel === 'email' ? 'email' : 'text'}
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            placeholder={channel === 'email' ? 'jane@example.com' : channel === 'phone' ? '0899999999' : '@lineid'}
          />
        </label>

        <label className="clinic-lead-field">
          รับลิงก์ผ่าน
          <select data-testid="member-access-channel" value={channel} onChange={(event) => setChannel(event.target.value)}>
            <option value="email">Email</option>
            <option value="phone">Phone</option>
            <option value="line">LINE ID</option>
          </select>
        </label>

        <input
          data-testid="member-access-honeypot"
          className="clinic-lead-honeypot"
          value={honeypot}
          onChange={(event) => setHoneypot(event.target.value)}
          tabIndex="-1"
          autoComplete="off"
          aria-hidden="true"
        />

        <button className="cta-btn clinic-btn-primary clinic-lead-submit" data-testid="member-access-request-submit" type="submit" disabled={submitting}>
          {submitting ? 'กำลังส่ง...' : 'ขอลิงก์เข้าใช้งาน'}
        </button>
      </form>
    </section>
  );
}

function ClinicHeroSection({ clinic, websiteSettings, brandingSettings, contactSettings }) {
  const displayName = websiteSettings.publicDisplayName || clinic.name || 'FlowBiz Clinic';
  const tagline = websiteSettings.tagline || '';
  const shortDesc = websiteSettings.shortDescription || '';
  const lineUrl = contactSettings.lineUrl || 'https://line.me';
  
  const heroStyle = brandingSettings.heroImageUrl && isSafeUrl(brandingSettings.heroImageUrl)
    ? { backgroundImage: `linear-gradient(rgba(10, 11, 13, 0.8), rgba(10, 11, 13, 0.95)), url(${brandingSettings.heroImageUrl})` }
    : {};

  return (
    <section className="clinic-template-hero" data-testid="clinic-template-hero" style={heroStyle}>
      <div className="clinic-hero-container">
        {brandingSettings.logoUrl && isSafeUrl(brandingSettings.logoUrl) ? (
          <img 
            className="clinic-logo-img" 
            data-testid="clinic-template-logo" 
            src={brandingSettings.logoUrl} 
            alt={`${displayName} Logo`} 
          />
        ) : (
          <div className="clinic-logo-placeholder" data-testid="clinic-template-logo">✨</div>
        )}

        <h1 className="clinic-title" data-testid="clinic-template-title">
          {displayName}
        </h1>

        {tagline && (
          <p className="clinic-tagline" data-testid="clinic-template-tagline">
            {tagline}
          </p>
        )}

        {shortDesc && <p className="clinic-hero-desc">{shortDesc}</p>}

        <div className="clinic-hero-ctas">
          <button 
            className="cta-btn clinic-btn-primary" 
            data-testid="clinic-template-primary-cta"
            onClick={() => openExternalUrl(lineUrl)}
          >
            จองคิว / ปรึกษาฟรี
          </button>
          <button 
            className="cta-btn secondary clinic-btn-secondary" 
            data-testid="clinic-template-secondary-cta"
            onClick={() => openExternalUrl(lineUrl)}
          >
            ติดต่อ LINE
          </button>
        </div>
      </div>
    </section>
  );
}

function ClinicTrustSection({ homepageSections }) {
  // Try to find trust_badges section
  const trustSec = homepageSections.find(s => s.sectionType === 'trust_badges' || s.sectionKey === 'trust_badges');
  
  // Structured items parser from content
  let badges = [];
  if (trustSec && trustSec.content && Array.isArray(trustSec.content.items)) {
    badges = trustSec.content.items.map(item => typeof item === 'string' ? item : (item?.title || item?.name || ''));
  }

  // Fallbacks if empty
  if (badges.length === 0) {
    badges = ['แพทย์ดูแล', 'ระบบติดตามลูกค้า', 'ปรึกษาก่อนทำ'];
  }

  return (
    <section className="clinic-template-section clinic-template-trust" data-testid="clinic-template-trust">
      <div className="clinic-section-header">
        <span className="clinic-eyebrow">Highlights</span>
        <h2>ทำไมต้องเลือกเรา</h2>
      </div>
      <div className="clinic-grid-cards">
        {badges.map((badge, idx) => (
          <div className="clinic-glass-card" key={idx}>
            <div className="clinic-card-icon">✨</div>
            <h3 className="clinic-card-title">{badge}</h3>
            <p className="clinic-card-desc">บริการด้วยความใส่ใจและคำนึงถึงความปลอดภัยของคนไข้เป็นอันดับแรก</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ClinicServicesPreview({ homepageSections, services = [], onInterestSelect, onBookingSelect }) {
  const serviceSec = homepageSections.find(s => s.sectionType === 'services_preview' || s.sectionKey === 'services_preview');
  
  let items = [];
  const hasApiItems = Array.isArray(services) && services.length > 0;

  if (hasApiItems) {
    items = services;
  } else if (serviceSec && serviceSec.content && Array.isArray(serviceSec.content.items)) {
    items = serviceSec.content.items;
  }

  const isFallback = items.length === 0;

  if (isFallback) {
    items = [
      { title: '[บริการแนะนำ] ปรับรูปหน้า (ข้อมูลตัวอย่าง)', description: 'บริการปรับโครงสร้างรูปหน้าโดยละเอียดตามหลักอนาโตมี่ ปลอดภัยเป็นธรรมชาติ' },
      { title: '[บริการแนะนำ] ดูแลผิว (ข้อมูลตัวอย่าง)', description: 'ฟื้นบำรุงเกราะผิวพรรณให้แข็งแรง เรียบเนียน กระจ่างใสสุขภาพดีจากภายใน' },
      { title: '[บริการแนะนำ] เลเซอร์ (ข้อมูลตัวอย่าง)', description: 'เลเซอร์มาตรฐานสากล แก้ไขปัญหาเม็ดสี รอยดำรอยแดง และความหมองคล้ำตรงจุด' },
      { title: '[บริการแนะนำ] โปรแกรมชะลอวัย (ข้อมูลตัวอย่าง)', description: 'ฟื้นฟูความอ่อนเยาว์และดูแลสุขภาพผิวแบบองค์รวมภายใต้การดูแลของแพทย์' }
    ];
  }

  return (
    <section className="clinic-template-section clinic-template-services" data-testid="clinic-template-services">
      <div className="clinic-section-header">
        <span className="clinic-eyebrow">Services</span>
        <h2>บริการยอดนิยม</h2>
        {isFallback && <p className="clinic-placeholder-badge">⚠️ แสดงข้อมูลแนะนำชั่วคราว (จะอัปเดตข้อมูลจริงในภายหลัง)</p>}
      </div>
      <div className="clinic-grid-cards">
        {items.map((svc, idx) => (
          <div
            className="clinic-glass-card"
            key={svc?.id || svc?.slug || idx}
            data-testid={hasApiItems ? `clinic-template-service-card-${svc.id}` : undefined}
          >
            <div className="clinic-card-icon">💉</div>
            <h3 className="clinic-card-title">{plainOfferingText(hasApiItems ? svc?.name : svc?.title)}</h3>
            <p className="clinic-card-desc">{plainOfferingText(hasApiItems ? (svc?.shortDescription || svc?.category || '') : svc?.description)}</p>
            {hasApiItems ? <p className="clinic-offering-price">{formatPublicServicePrice(svc)}</p> : null}
            {hasApiItems && svc?.durationMinutes != null ? <p className="clinic-card-desc">{svc.durationMinutes} นาที</p> : null}
            {hasApiItems ? (
              <button
                type="button"
                className="cta-btn secondary clinic-card-cta"
                data-testid={`clinic-template-service-interest-${svc.id}`}
                onClick={() => onInterestSelect?.('service', svc.id)}
              >
                สนใจบริการนี้
              </button>
            ) : null}
            {hasApiItems ? (
              <button
                type="button"
                className="cta-btn clinic-btn-primary clinic-card-cta"
                data-testid={`clinic-template-service-booking-${svc.id}`}
                onClick={() => onBookingSelect?.('service', svc.id)}
              >
                ขอนัดหมายบริการนี้
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function ClinicPromotionsPreview({ homepageSections, promotions = [], onInterestSelect, onBookingSelect }) {
  const promoSec = homepageSections.find(s => s.sectionType === 'promotions_preview' || s.sectionKey === 'promotions_preview');

  let items = [];
  const hasApiItems = Array.isArray(promotions) && promotions.length > 0;

  if (hasApiItems) {
    items = promotions;
  } else if (promoSec && promoSec.content && Array.isArray(promoSec.content.items)) {
    items = promoSec.content.items;
  }

  const isFallback = items.length === 0;

  return (
    <section className="clinic-template-section clinic-template-promotions" data-testid="clinic-template-promotions">
      <div className="clinic-section-header">
        <span className="clinic-eyebrow">Promotions</span>
        <h2>ข้อเสนอพิเศษ</h2>
      </div>
      {isFallback ? (
        <div className="clinic-fallback-card">
          <div className="fallback-icon">📢</div>
          <h4>[ข้อมูลตัวอย่าง] โปรโมชั่นและแพ็กเกจจะอัปเดตโดยคลินิกในเร็วๆ นี้</h4>
          <p>ท่านสามารถติดต่อสอบถามโปรโมชั่นล่าสุดได้โดยตรงผ่าน LINE Official Account ของคลินิก</p>
        </div>
      ) : (
        <div className="clinic-grid-cards">
          {items.map((promo, idx) => (
            <div
              className="clinic-glass-card"
              key={promo?.id || promo?.slug || idx}
              style={{ borderTop: '2px solid var(--clinic-primary)' }}
              data-testid={hasApiItems ? `clinic-template-promotion-card-${promo.id}` : undefined}
            >
              {(hasApiItems ? promo?.badgeLabel : promo?.tag) && <span className="clinic-promo-badge">{hasApiItems ? promo.badgeLabel : promo.tag}</span>}
              <h3 className="clinic-card-title" style={{ marginTop: (hasApiItems ? promo?.badgeLabel : promo?.tag) ? '1rem' : '0' }}>{plainOfferingText(promo?.title)}</h3>
              <p className="clinic-card-desc">{plainOfferingText(hasApiItems ? (promo?.subtitle || '') : promo?.description)}</p>
              {hasApiItems && promo?.ctaUrl && isSafeUrl(promo.ctaUrl) ? (
                <button type="button" className="cta-btn secondary clinic-card-cta" onClick={() => openExternalUrl(promo.ctaUrl)}>
                  {promo.ctaLabel || 'ดูรายละเอียด'}
                </button>
              ) : null}
              {hasApiItems ? (
                <button
                  type="button"
                  className="cta-btn secondary clinic-card-cta"
                  data-testid={`clinic-template-promotion-interest-${promo.id}`}
                  onClick={() => onInterestSelect?.('promotion', promo.id)}
                >
                  สนใจโปรโมชั่นนี้
                </button>
              ) : null}
              {hasApiItems ? (
                <button
                  type="button"
                  className="cta-btn clinic-btn-primary clinic-card-cta"
                  data-testid={`clinic-template-promotion-booking-${promo.id}`}
                  onClick={() => onBookingSelect?.('promotion', promo.id)}
                >
                  ขอนัดหมายโปรโมชั่นนี้
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ClinicPackagesPreview({ homepageSections, packages = [], onInterestSelect, onBookingSelect }) {
  const packageSec = homepageSections.find(s => s.sectionType === 'packages_preview' || s.sectionKey === 'packages_preview');
  let items = [];
  const hasApiItems = Array.isArray(packages) && packages.length > 0;

  if (hasApiItems) {
    items = packages;
  } else if (packageSec && packageSec.content && Array.isArray(packageSec.content.items)) {
    items = packageSec.content.items;
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="clinic-template-section clinic-template-packages" data-testid="clinic-template-packages">
      <div className="clinic-section-header">
        <span className="clinic-eyebrow">Packages</span>
        <h2>แพ็กเกจดูแลต่อเนื่อง</h2>
      </div>
      <div className="clinic-grid-cards">
        {items.map((pkg, idx) => (
          <div
            className="clinic-glass-card"
            key={pkg?.id || pkg?.slug || idx}
            data-testid={hasApiItems ? `clinic-template-package-card-${pkg.id}` : undefined}
          >
            <div className="clinic-card-icon">💎</div>
            <h3 className="clinic-card-title">{plainOfferingText(hasApiItems ? pkg?.name : pkg?.title)}</h3>
            <p className="clinic-card-desc">{plainOfferingText(hasApiItems ? (pkg?.summary || '') : pkg?.description)}</p>
            {hasApiItems ? <p className="clinic-offering-price">{formatPublicPackagePrice(pkg)}</p> : null}
            {hasApiItems ? (
              <button
                type="button"
                className="cta-btn secondary clinic-card-cta"
                data-testid={`clinic-template-package-interest-${pkg.id}`}
                onClick={() => onInterestSelect?.('package', pkg.id)}
              >
                สนใจแพ็กเกจนี้
              </button>
            ) : null}
            {hasApiItems ? (
              <button
                type="button"
                className="cta-btn clinic-btn-primary clinic-card-cta"
                data-testid={`clinic-template-package-booking-${pkg.id}`}
                onClick={() => onBookingSelect?.('package', pkg.id)}
              >
                ขอนัดหมายแพ็กเกจนี้
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

const ClinicLeadCaptureForm = React.forwardRef(function ClinicLeadCaptureForm({ clinicSlug, selectedInterest }, ref) {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    lineId: '',
    interestType: 'general',
    interestId: '',
    message: '',
    consentAccepted: false,
    honeypot: ''
  });
  const [status, setStatus] = useState({ kind: 'idle', message: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!selectedInterest) return;
    setForm((prev) => ({
      ...prev,
      interestType: selectedInterest.interestType || 'general',
      interestId: selectedInterest.interestId || ''
    }));
  }, [selectedInterest]);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (status.kind === 'error') {
      setStatus({ kind: 'idle', message: '' });
    }
  };

  const validate = () => {
    if (!form.consentAccepted) {
      return 'กรุณายอมรับเงื่อนไขการติดต่อกลับก่อนส่งข้อมูล';
    }
    if (!form.phone.trim() && !form.email.trim() && !form.lineId.trim()) {
      return 'กรุณาระบุเบอร์โทรศัพท์ อีเมล หรือ LINE ID อย่างน้อยหนึ่งช่องทาง';
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return 'รูปแบบอีเมลไม่ถูกต้อง';
    }
    if (form.message.length > 1000) {
      return 'ข้อความต้องไม่เกิน 1000 ตัวอักษร';
    }
    if (form.honeypot.trim()) {
      return 'ส่งข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
    }
    return null;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    const validationError = validate();
    if (validationError) {
      setStatus({ kind: 'error', message: validationError });
      return;
    }

    setSubmitting(true);
    setStatus({ kind: 'idle', message: '' });
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      lineId: form.lineId.trim(),
      interestType: form.interestType,
      interestId: form.interestId ? Number(form.interestId) : undefined,
      message: form.message.trim(),
      source: 'clinic_public_website',
      consentAccepted: form.consentAccepted,
      honeypot: form.honeypot
    };

    try {
      const result = await submitPublicClinicLead(clinicSlug, payload);
      setStatus({
        kind: 'success',
        message: result?.message || 'ขอบคุณค่ะ ทีมงานจะติดต่อกลับโดยเร็วที่สุด'
      });
      setForm({
        name: '',
        phone: '',
        email: '',
        lineId: '',
        interestType: 'general',
        interestId: '',
        message: '',
        consentAccepted: false,
        honeypot: ''
      });
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error.message.replace(/^[A-Z_]+:\s*/, '') || 'ส่งข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="clinic-template-section clinic-lead-capture-section" data-testid="clinic-lead-form-section" ref={ref}>
      <div className="clinic-section-header">
        <span className="clinic-eyebrow">Consultation</span>
        <h2>ปรึกษาฟรี / ให้ทีมงานติดต่อกลับ</h2>
      </div>
      <form className="clinic-lead-form" data-testid="clinic-lead-form" onSubmit={handleSubmit}>
        {status.kind === 'success' ? (
          <div className="clinic-lead-alert success" data-testid="clinic-lead-success">{status.message}</div>
        ) : null}
        {status.kind === 'error' ? (
          <div className="clinic-lead-alert error" data-testid="clinic-lead-error">{status.message}</div>
        ) : null}

        <label className="clinic-lead-field">
          <span>ชื่อ</span>
          <input
            data-testid="clinic-lead-name"
            value={form.name}
            maxLength={120}
            onChange={(event) => updateField('name', event.target.value)}
            autoComplete="name"
          />
        </label>

        <label className="clinic-lead-field">
          <span>เบอร์โทรศัพท์</span>
          <input
            data-testid="clinic-lead-phone"
            value={form.phone}
            maxLength={40}
            onChange={(event) => updateField('phone', event.target.value)}
            autoComplete="tel"
          />
        </label>

        <label className="clinic-lead-field">
          <span>อีเมล</span>
          <input
            data-testid="clinic-lead-email"
            type="email"
            value={form.email}
            maxLength={160}
            onChange={(event) => updateField('email', event.target.value)}
            autoComplete="email"
          />
        </label>

        <label className="clinic-lead-field">
          <span>LINE ID</span>
          <input
            data-testid="clinic-lead-line-id"
            value={form.lineId}
            maxLength={80}
            onChange={(event) => updateField('lineId', event.target.value)}
            autoComplete="off"
          />
        </label>

        <label className="clinic-lead-field">
          <span>ประเภทความสนใจ</span>
          <select
            data-testid="clinic-lead-interest-type"
            value={form.interestType}
            onChange={(event) => updateField('interestType', event.target.value)}
          >
            <option value="general">ปรึกษาทั่วไป</option>
            <option value="service">บริการ</option>
            <option value="promotion">โปรโมชั่น</option>
            <option value="package">แพ็กเกจ</option>
          </select>
        </label>

        <label className="clinic-lead-field">
          <span>รหัสบริการ/โปร/แพ็กเกจ</span>
          <input
            data-testid="clinic-lead-interest-id"
            type="number"
            min="1"
            value={form.interestId}
            onChange={(event) => updateField('interestId', event.target.value)}
          />
        </label>

        <label className="clinic-lead-field clinic-lead-field-wide">
          <span>ข้อความถึงทีมงาน</span>
          <textarea
            data-testid="clinic-lead-message"
            value={form.message}
            maxLength={1000}
            onChange={(event) => updateField('message', event.target.value)}
            rows={4}
          />
        </label>

        <input
          data-testid="clinic-lead-honeypot"
          className="clinic-lead-honeypot"
          tabIndex="-1"
          autoComplete="off"
          value={form.honeypot}
          onChange={(event) => updateField('honeypot', event.target.value)}
          aria-hidden="true"
        />

        <label className="clinic-lead-consent clinic-lead-field-wide">
          <input
            data-testid="clinic-lead-consent"
            type="checkbox"
            checked={form.consentAccepted}
            onChange={(event) => updateField('consentAccepted', event.target.checked)}
          />
          <span>ยินยอมให้คลินิกติดต่อกลับตามข้อมูลที่ระบุไว้</span>
        </label>

        <button className="cta-btn clinic-btn-primary clinic-lead-submit" data-testid="clinic-lead-submit" type="submit" disabled={submitting}>
          {submitting ? 'กำลังส่งข้อมูล...' : 'ส่งข้อมูลให้ทีมงานติดต่อกลับ'}
        </button>
      </form>
    </section>
  );
});

const ClinicBookingRequestForm = React.forwardRef(function ClinicBookingRequestForm({ clinicSlug, selectedBookingInterest }, ref) {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    lineId: '',
    requestType: 'consultation',
    interestType: 'general',
    interestId: '',
    preferredDate: '',
    preferredTimeWindow: 'anytime',
    alternativePreferredDate: '',
    alternativeTimeWindow: '',
    visitType: 'consultation',
    urgency: 'normal',
    slotNotes: '',
    preferredContactMethod: 'any',
    message: '',
    consentAccepted: false,
    honeypot: ''
  });
  const [status, setStatus] = useState({ kind: 'idle', message: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!selectedBookingInterest) return;
    setForm((prev) => ({
      ...prev,
      requestType: selectedBookingInterest.requestType || 'consultation',
      interestType: selectedBookingInterest.interestType || 'general',
      interestId: selectedBookingInterest.interestId || ''
    }));
  }, [selectedBookingInterest]);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (status.kind === 'error') {
      setStatus({ kind: 'idle', message: '' });
    }
  };

  const validate = () => {
    if (!form.consentAccepted) {
      return 'กรุณายอมรับเงื่อนไขการติดต่อกลับก่อนส่งคำขอนัดหมาย';
    }
    if (!form.phone.trim() && !form.email.trim() && !form.lineId.trim()) {
      return 'กรุณาระบุเบอร์โทรศัพท์ อีเมล หรือ LINE ID อย่างน้อยหนึ่งช่องทาง';
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return 'รูปแบบอีเมลไม่ถูกต้อง';
    }
    if (form.preferredDate) {
      const todayString = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok' }).format(new Date());
      if (!/^\d{4}-\d{2}-\d{2}$/.test(form.preferredDate) || form.preferredDate < todayString) {
        return 'วันที่ต้องการนัดหมายไม่ถูกต้อง';
      }
    }
    if (form.alternativePreferredDate) {
      const todayString = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok' }).format(new Date());
      if (!/^\d{4}-\d{2}-\d{2}$/.test(form.alternativePreferredDate) || form.alternativePreferredDate < todayString) {
        return 'วันที่สำรองไม่ถูกต้อง';
      }
    }
    if (form.slotNotes.length > 500) {
      return 'หมายเหตุเวลาที่สะดวกต้องไม่เกิน 500 ตัวอักษร';
    }
    if (form.message.length > 1000) {
      return 'ข้อความต้องไม่เกิน 1000 ตัวอักษร';
    }
    if (form.honeypot.trim()) {
      return 'ส่งคำขอนัดหมายไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
    }
    return null;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    const validationError = validate();
    if (validationError) {
      setStatus({ kind: 'error', message: validationError });
      return;
    }

    setSubmitting(true);
    setStatus({ kind: 'idle', message: '' });
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      lineId: form.lineId.trim(),
      requestType: form.requestType,
      interestType: form.interestType,
      interestId: form.interestId ? Number(form.interestId) : undefined,
      preferredDate: form.preferredDate || undefined,
      preferredTimeWindow: form.preferredTimeWindow,
      alternativePreferredDate: form.alternativePreferredDate || undefined,
      alternativeTimeWindow: form.alternativeTimeWindow || undefined,
      visitType: form.visitType,
      urgency: form.urgency,
      slotRequest: form.slotNotes.trim() ? { notes: form.slotNotes.trim() } : {},
      preferredContactMethod: form.preferredContactMethod,
      message: form.message.trim(),
      consentAccepted: form.consentAccepted,
      honeypot: form.honeypot
    };

    try {
      const result = await submitPublicClinicBookingRequest(clinicSlug, payload);
      setStatus({
        kind: 'success',
        message: result?.message || 'รับคำขอนัดหมายแล้วค่ะ ทีมงานจะติดต่อกลับเพื่อยืนยันเวลา'
      });
      setForm({
        name: '',
        phone: '',
        email: '',
        lineId: '',
        requestType: 'consultation',
        interestType: 'general',
        interestId: '',
        preferredDate: '',
        preferredTimeWindow: 'anytime',
        alternativePreferredDate: '',
        alternativeTimeWindow: '',
        visitType: 'consultation',
        urgency: 'normal',
        slotNotes: '',
        preferredContactMethod: 'any',
        message: '',
        consentAccepted: false,
        honeypot: ''
      });
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error.message.replace(/^[A-Z_]+:\s*/, '') || 'ส่งคำขอนัดหมายไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="clinic-template-section clinic-lead-capture-section clinic-booking-request-section" data-testid="clinic-booking-form-section" ref={ref}>
      <div className="clinic-section-header">
        <span className="clinic-eyebrow">Booking Request</span>
        <h2>ขอนัดหมาย / ขอให้ทีมงานติดต่อกลับ</h2>
      </div>
      <form className="clinic-lead-form clinic-booking-form" data-testid="clinic-booking-form" onSubmit={handleSubmit}>
        {status.kind === 'success' ? (
          <div className="clinic-lead-alert success" data-testid="clinic-booking-success">{status.message}</div>
        ) : null}
        {status.kind === 'error' ? (
          <div className="clinic-lead-alert error" data-testid="clinic-booking-error">{status.message}</div>
        ) : null}

        <label className="clinic-lead-field">
          <span>ชื่อ</span>
          <input data-testid="clinic-booking-name" value={form.name} maxLength={120} onChange={(event) => updateField('name', event.target.value)} autoComplete="name" />
        </label>

        <label className="clinic-lead-field">
          <span>เบอร์โทรศัพท์</span>
          <input data-testid="clinic-booking-phone" value={form.phone} maxLength={40} onChange={(event) => updateField('phone', event.target.value)} autoComplete="tel" />
        </label>

        <label className="clinic-lead-field">
          <span>อีเมล</span>
          <input data-testid="clinic-booking-email" type="email" value={form.email} maxLength={160} onChange={(event) => updateField('email', event.target.value)} autoComplete="email" />
        </label>

        <label className="clinic-lead-field">
          <span>LINE ID</span>
          <input data-testid="clinic-booking-line-id" value={form.lineId} maxLength={80} onChange={(event) => updateField('lineId', event.target.value)} autoComplete="off" />
        </label>

        <label className="clinic-lead-field">
          <span>ประเภทคำขอ</span>
          <select data-testid="clinic-booking-request-type" value={form.requestType} onChange={(event) => updateField('requestType', event.target.value)}>
            <option value="consultation">ขอปรึกษา</option>
            <option value="booking_request">ขอนัดหมาย</option>
            <option value="follow_up">ให้ติดต่อกลับ</option>
          </select>
        </label>

        <label className="clinic-lead-field">
          <span>ประเภทความสนใจ</span>
          <select data-testid="clinic-booking-interest-type" value={form.interestType} onChange={(event) => updateField('interestType', event.target.value)}>
            <option value="general">ปรึกษาทั่วไป</option>
            <option value="service">บริการ</option>
            <option value="promotion">โปรโมชั่น</option>
            <option value="package">แพ็กเกจ</option>
          </select>
        </label>

        <label className="clinic-lead-field">
          <span>รหัสบริการ/โปร/แพ็กเกจ</span>
          <input data-testid="clinic-booking-interest-id" type="number" min="1" value={form.interestId} onChange={(event) => updateField('interestId', event.target.value)} />
        </label>

        <label className="clinic-lead-field">
          <span>วันที่ต้องการ</span>
          <input data-testid="clinic-booking-preferred-date" type="date" value={form.preferredDate} onChange={(event) => updateField('preferredDate', event.target.value)} />
        </label>

        <label className="clinic-lead-field">
          <span>ช่วงเวลา</span>
          <select data-testid="clinic-booking-time-window" value={form.preferredTimeWindow} onChange={(event) => updateField('preferredTimeWindow', event.target.value)}>
            <option value="anytime">เวลาใดก็ได้</option>
            <option value="morning">ช่วงเช้า</option>
            <option value="afternoon">ช่วงบ่าย</option>
            <option value="evening">ช่วงเย็น</option>
          </select>
        </label>

        <div className="clinic-lead-field clinic-lead-field-wide">
          <h3 style={{ margin: 0, fontSize: '1rem' }}>เวลาที่สะดวก</h3>
        </div>

        <label className="clinic-lead-field">
          <span>วันที่สำรอง</span>
          <input data-testid="clinic-booking-alt-date" type="date" value={form.alternativePreferredDate} onChange={(event) => updateField('alternativePreferredDate', event.target.value)} />
        </label>

        <label className="clinic-lead-field">
          <span>ช่วงเวลาสำรอง</span>
          <select data-testid="clinic-booking-alt-time-window" value={form.alternativeTimeWindow} onChange={(event) => updateField('alternativeTimeWindow', event.target.value)}>
            <option value="">ไม่ระบุ</option>
            <option value="anytime">เวลาใดก็ได้</option>
            <option value="morning">ช่วงเช้า</option>
            <option value="afternoon">ช่วงบ่าย</option>
            <option value="evening">ช่วงเย็น</option>
          </select>
        </label>

        <label className="clinic-lead-field">
          <span>ประเภทการเข้ารับบริการ</span>
          <select data-testid="clinic-booking-visit-type" value={form.visitType} onChange={(event) => updateField('visitType', event.target.value)}>
            <option value="consultation">ปรึกษา</option>
            <option value="treatment">ทำหัตถการ</option>
            <option value="follow_up">ติดตามผล</option>
            <option value="other">อื่นๆ</option>
          </select>
        </label>

        <label className="clinic-lead-field">
          <span>ความเร่งด่วน</span>
          <select data-testid="clinic-booking-urgency" value={form.urgency} onChange={(event) => updateField('urgency', event.target.value)}>
            <option value="normal">ปกติ</option>
            <option value="soon">เร็วๆ นี้</option>
            <option value="urgent">เร่งด่วน</option>
          </select>
        </label>

        <label className="clinic-lead-field clinic-lead-field-wide">
          <span>หมายเหตุเวลาที่สะดวก</span>
          <textarea data-testid="clinic-booking-slot-notes" value={form.slotNotes} maxLength={500} onChange={(event) => updateField('slotNotes', event.target.value)} rows={3} />
        </label>

        <label className="clinic-lead-field">
          <span>ช่องทางติดต่อกลับ</span>
          <select data-testid="clinic-booking-contact-method" value={form.preferredContactMethod} onChange={(event) => updateField('preferredContactMethod', event.target.value)}>
            <option value="any">ช่องทางใดก็ได้</option>
            <option value="phone">โทรศัพท์</option>
            <option value="line">LINE</option>
            <option value="email">อีเมล</option>
          </select>
        </label>

        <label className="clinic-lead-field clinic-lead-field-wide">
          <span>ข้อความถึงทีมงาน</span>
          <textarea data-testid="clinic-booking-message" value={form.message} maxLength={1000} onChange={(event) => updateField('message', event.target.value)} rows={4} />
        </label>

        <input
          data-testid="clinic-booking-honeypot"
          className="clinic-lead-honeypot"
          tabIndex="-1"
          autoComplete="off"
          value={form.honeypot}
          onChange={(event) => updateField('honeypot', event.target.value)}
          aria-hidden="true"
        />

        <label className="clinic-lead-consent clinic-lead-field-wide">
          <input data-testid="clinic-booking-consent" type="checkbox" checked={form.consentAccepted} onChange={(event) => updateField('consentAccepted', event.target.checked)} />
          <span>ยินยอมให้คลินิกติดต่อกลับเพื่อยืนยันคำขอนัดหมาย</span>
        </label>

        <button className="cta-btn clinic-btn-primary clinic-lead-submit" data-testid="clinic-booking-submit" type="submit" disabled={submitting}>
          {submitting ? 'กำลังส่งคำขอ...' : 'ส่งคำขอนัดหมาย'}
        </button>
      </form>
    </section>
  );
});

function ClinicAboutSection({ websiteSettings }) {
  const shortDesc = websiteSettings?.shortDescription || '';
  if (!shortDesc) return null;

  return (
    <section className="clinic-template-section clinic-about-block clinic-template-about" data-testid="clinic-template-about">
      <div className="clinic-section-header">
        <span className="clinic-eyebrow">About Us</span>
        <h2>เกี่ยวกับเรา</h2>
      </div>
      <div className="clinic-about-content">
        <p>{shortDesc}</p>
      </div>
    </section>
  );
}

function ClinicHomepageSections({ homepageSections }) {
  const standardKeys = new Set(['hero', 'trust_badges', 'services_preview', 'promotions_preview', 'packages_preview']);
  
  const customSections = homepageSections.filter(sec => sec && !standardKeys.has(sec.sectionKey) && !standardKeys.has(sec.sectionType));

  if (customSections.length === 0) return null;

  return (
    <section className="clinic-template-section clinic-template-dynamic-sections" data-testid="clinic-template-dynamic-sections">
      <div className="clinic-section-header">
        <span className="clinic-eyebrow">More Information</span>
        <h2>ข้อมูลเพิ่มเติม</h2>
      </div>
      <div className="clinic-grid-cards">
        {customSections.map((sec, idx) => (
          <div className="clinic-glass-card" key={sec.sectionKey || idx}>
            <div className="clinic-card-icon">💎</div>
            <h3 className="clinic-card-title">{sec.title || 'ข้อมูลเสริม'}</h3>
            {sec.subtitle && <p className="clinic-card-subtitle">{sec.subtitle}</p>}
            {sec.content && typeof sec.content === 'object' && (
              <div className="clinic-custom-section-data">
                {Object.entries(sec.content).map(([k, v]) => (
                  v && typeof v === 'string' && (
                    <p key={k} style={{ margin: '0.25rem 0', fontSize: '0.9rem' }}>
                      <strong>{k}:</strong> {v}
                    </p>
                  )
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function ClinicContactSection({ contactSettings }) {
  const settings = contactSettings || {};
  const phone = settings.phone || '';
  const email = settings.email || '';
  const lineUrl = settings.lineUrl || '';
  const lineOaId = settings.lineOaId || '';

  return (
    <section className="clinic-template-section clinic-contact-block clinic-template-contact" data-testid="clinic-template-contact">
      <h3>ข้อมูลติดต่อ</h3>
      <div className="clinic-contact-details" data-testid="clinic-contact">
        {phone && (
          <p className="contact-item">
            <span className="icon">📞</span>
            <strong>เบอร์โทรศัพท์:</strong> <a href={`tel:${phone}`}>{phone}</a>
          </p>
        )}
        {email && (
          <p className="contact-item">
            <span className="icon">✉️</span>
            <strong>อีเมล:</strong> <a href={`mailto:${email}`}>{email}</a>
          </p>
        )}
        {lineUrl && (
          <p className="contact-item">
            <span className="icon">💬</span>
            <strong>LINE Official Account:</strong>{' '}
            <a href={lineUrl} target="_blank" rel="noopener noreferrer">
              {lineOaId || 'ติดต่อผ่าน LINE'}
            </a>
          </p>
        )}
        {!phone && !email && !lineUrl && (
          <p className="contact-item text-muted">ไม่มีข้อมูลติดต่อประชาสัมพันธ์</p>
        )}
      </div>
    </section>
  );
}

function ClinicLocationSection({ locationSettings }) {
  const {
    addressLine1 = '',
    addressLine2 = '',
    district = '',
    province = '',
    postalCode = '',
    country = 'Thailand',
    googleMapUrl = ''
  } = locationSettings || {};

  const fullAddress = [addressLine1, addressLine2, district, province, postalCode, country]
    .filter(Boolean)
    .join(' ');

  return (
    <section className="clinic-template-section clinic-location-block clinic-template-location" data-testid="clinic-template-location">
      <h3>ที่ตั้งและแผนที่</h3>
      <div className="clinic-location-details">
        <p className="address-text">📍 {fullAddress || 'ไม่ระบุที่อยู่ของคลินิก'}</p>
        {googleMapUrl && isSafeUrl(googleMapUrl) && (
          <div className="clinic-map-link-container">
            <a 
              href={googleMapUrl} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="clinic-map-link cta-btn secondary"
              data-testid="clinic-template-map-link"
            >
              🗺️ ดูแผนที่บน Google Maps
            </a>
          </div>
        )}
      </div>
    </section>
  );
}

function ClinicFinalCta({ contactSettings }) {
  const settings = contactSettings || {};
  const phone = settings.phone || '';
  const lineUrl = settings.lineUrl || 'https://line.me';

  return (
    <section className="clinic-template-final-cta" data-testid="clinic-template-final-cta">
      <h2>สนใจจองคิวหรือปรึกษาแพทย์ฟรี?</h2>
      <p>ร่วมปรึกษาปัญหารูปหน้าหรือผิวพรรณกับแพทย์ผู้เชี่ยวชาญวันนี้ เพื่อผลลัพธ์ที่ตอบโจทย์ความงามในแบบคุณ</p>
      <div className="clinic-final-cta-buttons">
        <button className="cta-btn clinic-btn-primary" onClick={() => openExternalUrl(lineUrl)}>
          💬 ติดต่อทาง LINE
        </button>
        {phone && (
          <a className="cta-btn secondary clinic-btn-secondary" href={`tel:${phone}`} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            📞 โทร: {phone}
          </a>
        )}
      </div>
    </section>
  );
}

function ClinicPublicShell({ clinicSlug, currentRoute }) {
  const [loading, setLoading] = useState(true);
  const [clinicData, setClinicData] = useState(null);
  const [errorStatus, setErrorStatus] = useState(null);
  const [offeringsState, setOfferingsState] = useState({
    status: 'idle',
    data: { services: [], promotions: [], packages: [] }
  });

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setErrorStatus(null);
      setOfferingsState({ status: 'idle', data: { services: [], promotions: [], packages: [] } });
      try {
        const result = await getPublicClinicBySlug(clinicSlug);
        if (!active) return;
        if (result.status === 200) {
          setClinicData(result.data);
          setLoading(false);
          setOfferingsState({ status: 'loading', data: { services: [], promotions: [], packages: [] } });

          try {
            const [services, promotions, packages] = await Promise.all([
              getPublicClinicServices(clinicSlug),
              getPublicClinicPromotions(clinicSlug),
              getPublicClinicPackages(clinicSlug)
            ]);

            if (!active) return;
            setOfferingsState({
              status: 'ready',
              data: { services, promotions, packages }
            });
          } catch (offeringsError) {
            console.warn('Public offerings fetch failed, rendering clinic template fallback:', offeringsError.message);
            if (!active) return;
            setOfferingsState({
              status: 'error',
              data: { services: [], promotions: [], packages: [] }
            });
          }
        } else {
          setErrorStatus(result.status);
        }
      } catch (err) {
        if (!active) return;
        setErrorStatus(500);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [clinicSlug]);

  if (loading) {
    return (
      <div className="public-container" data-testid="clinic-loading-state" style={{ textAlign: 'center', padding: '5rem 2rem' }}>
        <p style={{ color: 'var(--text-secondary)' }}>กำลังโหลดข้อมูลคลินิก...</p>
      </div>
    );
  }

  if (errorStatus === 404) {
    return (
      <div className="public-container" data-testid="clinic-not-found" style={{ textAlign: 'center', padding: '5rem 2rem' }}>
        <h1 style={{ fontSize: '3rem', marginBottom: '1.5rem', color: 'var(--gold-primary)' }}>404</h1>
        <p style={{ color: 'var(--text-secondary)' }}>ไม่พบคลินิกที่ต้องการ</p>
      </div>
    );
  }

  if (errorStatus) {
    return (
      <div className="public-container" style={{ textAlign: 'center', padding: '5rem 2rem' }}>
        <p style={{ color: 'var(--red-primary)' }}>เกิดข้อผิดพลาดในการโหลดข้อมูลคลินิก</p>
      </div>
    );
  }

  if (!clinicData) {
    return null;
  }

  const hashInfo = parseHashRoute(currentRoute);
  const hasTokenQuery = new URLSearchParams(window.location.search).has('token');
  if (hashInfo.pathname === '/member-access' || hasTokenQuery) {
    return (
      <div className="public-container" data-testid="clinic-public-shell">
        <MemberAccessPage clinicSlug={clinicSlug} />
      </div>
    );
  }

  return (
    <div className="public-container" data-testid="clinic-public-shell">
      <ClinicWebsiteTemplate
        data={clinicData}
        clinicSlug={clinicSlug}
        offerings={offeringsState.data}
        offeringsStatus={offeringsState.status}
      />
    </div>
  );
}



// ----------------------------------------------------
// Page Component: Blog List Page
// ----------------------------------------------------
function BlogListPage({ posts }) {
  const visiblePosts = Array.isArray(posts) ? posts : [];

  return (
    <div className="public-container">
      <div className="blog-header">
        <div>
          <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>บทความให้ความรู้ด้านความงาม</h1>
          <p style={{ color: 'var(--text-secondary)' }}>เคล็ดลับการดูแลผิว เทรนด์หัตถการ และความรู้วิเคราะห์เจาะลึกโดยทีมแพทย์ FlowBiz Clinic</p>
        </div>
      </div>
      <div className="blog-grid">
        {visiblePosts.length === 0 ? (
          <div className="empty-state" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem 1rem' }}>
            <h2>ยังไม่มีบทความเผยแพร่</h2>
            <p style={{ color: 'var(--text-secondary)' }}>ทีมคลินิกกำลังเตรียมบทความความรู้ด้านผิวพรรณและหัตถการความงาม</p>
          </div>
        ) : visiblePosts.map((post) => (
          <article key={post.id} className="blog-card">
            <div className="blog-cover">
              {post.cover_image_url && isSafeUrl(post.cover_image_url) ? (
                <img src={post.cover_image_url} alt={post.title} className="blog-cover-img" />
              ) : (
                <span className="blog-cover-placeholder">🧬</span>
              )}
            </div>
            <div className="blog-card-content">
              <div className="blog-meta">
                <span>โดย {post.author_name}</span>
                <span>•</span>
                <span>{new Date(post.published_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
              </div>
              <h2 className="blog-card-title">{post.title}</h2>
              <p className="blog-card-excerpt">{post.excerpt}</p>
              <a href={`#/blog/${post.slug}`} className="blog-card-link">
                อ่านบทความเต็ม &rarr;
              </a>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

// ----------------------------------------------------
// Page Component: Blog Detail Page
// ----------------------------------------------------
function renderContent(text) {
  if (!text) return '';
  // If it looks like HTML, sanitize it before rendering.
  if (text.includes('</p>') || text.includes('</h2>') || text.includes('</ul>') || text.includes('</strong>')) {
    return sanitizeRichHtml(text);
  }
  // Otherwise, parse simple Markdown:
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
  return sanitizeRichHtml('<p>' + html.replace(/\n/g, '<br/>') + '</p>');
}

function BlogDetailPage({ slug, initialPost }) {
  const [post, setPost] = useState(initialPost);
  const [loading, setLoading] = useState(!initialPost);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchPost() {
      try {
        const fetched = await apiFetch(`/blog/posts/${slug}`);
        if (fetched) {
          setPost(fetched);
          setError(null);
        } else if (!post) {
          setError('ไม่พบบทความชิ้นนี้');
        }
      } catch (err) {
        if (!post) {
          setError('ไม่สามารถโหลดบทความได้');
        }
      } finally {
        setLoading(false);
      }
    }
    fetchPost();
  }, [slug]);

  if (loading) {
    return (
      <div className="public-container" style={{ textAlign: 'center', padding: '5rem 2rem' }}>
        <p style={{ color: 'var(--text-secondary)' }}>กำลังโหลดบทความ...</p>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="public-container" style={{ textAlign: 'center', padding: '5rem 2rem' }}>
        <h2>ขออภัย {error || 'ไม่พบบทความชิ้นนี้'}</h2>
        <a href="#/blog" className="cta-btn" style={{ marginTop: '1.5rem' }}>กลับหน้าบทความ</a>
      </div>
    );
  }

  return (
    <div className="public-container">
      <article className="blog-post-detail">
        <header className="blog-post-header">
          <a href="#/blog" style={{ color: 'var(--gold-primary)', fontSize: '0.9rem', display: 'inline-block', marginBottom: '1rem' }}>
            &larr; กลับหน้าบทความ
          </a>
          <h1 className="blog-post-title">{post.title}</h1>
          <div className="blog-post-meta">
            <span>✍️ ผู้เขียน: {post.author_name}</span>
            <span>📅 เผยแพร่เมื่อ: {new Date(post.published_at || post.created_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
            {post.tags?.map((t, idx) => (
              <span key={idx} className="forum-tag">{t}</span>
            ))}
          </div>
        </header>

        <div className="blog-post-cover">
          {post.cover_image_url && isSafeUrl(post.cover_image_url) ? (
            <img src={post.cover_image_url} alt={post.title} />
          ) : (
            <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, var(--bg-tertiary) 0%, rgba(212,175,55,0.08) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gold-primary)', fontSize: '5rem' }}>
              🧬
            </div>
          )}
        </div>

        <div className="blog-post-content" dangerouslySetInnerHTML={{ __html: renderContent(post.content) }} />
        
        <footer className="blog-post-footer">
          <div>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>แชร์ความรู้นี้ให้กับเพื่อนของคุณ</p>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button className="forum-cat-btn" onClick={() => {
                navigator.clipboard.writeText(window.location.href);
                alert('คัดลอกลิงก์บทความเรียบร้อยแล้ว!');
              }}>คัดลอกลิงก์</button>
              <button className="forum-cat-btn" onClick={() => openExternalUrl(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`)}>Facebook</button>
            </div>
          </div>
          <a href="#/blog" className="cta-btn secondary">บทความอื่นๆ</a>
        </footer>
      </article>
    </div>
  );
}

// ----------------------------------------------------
// Page Component: Forum List Page
// ----------------------------------------------------
function ForumListPage({ topics, onTopicAdded }) {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState('general');
  const [newAuthor, setNewAuthor] = useState('');
  const [isAnon, setIsAnon] = useState(true);
  const [showEditor, setShowEditor] = useState(false);

  const categories = [
    { key: 'all', label: 'ทั้งหมด' },
    { key: 'skincare', label: 'สุขภาพผิวพรรณ' },
    { key: 'surgery', label: 'ปรับรูปหน้า & ศัลยกรรม' },
    { key: 'qa', label: 'ถามตอบปัญหาแพทย์' },
    { key: 'general', label: 'ทั่วไป' }
  ];

  const filteredTopics = selectedCategory === 'all' 
    ? topics 
    : topics.filter(t => t.category === selectedCategory);

  const handleCreateTopic = async (e) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) {
      alert('กรุณากรอกหัวข้อและเนื้อหา');
      return;
    }

    const authorDisplayName = isAnon ? 'คนไข้นิรนาม' : (newAuthor.trim() || 'สมาชิกทั่วไป');

    const created = await apiFetch('/forum/topics', {
      method: 'POST',
      body: JSON.stringify({
        title: newTitle,
        content: newContent,
        authorDisplayName,
        isAnonymous: isAnon,
        category: newCategory
      })
    });

    if (created) {
      onTopicAdded(created);
    } else {
      onTopicAdded({
        id: Date.now(),
        title: newTitle,
        slug: newTitle.toLowerCase().replace(/ /g, '-').replace(/[^\w\u0e00-\u0e7f-]/g, ''),
        content: newContent,
        author_display_name: authorDisplayName,
        is_anonymous: isAnon,
        category: newCategory,
        reply_count: 0,
        created_at: new Date().toISOString()
      });
    }

    setNewTitle('');
    setNewContent('');
    setNewAuthor('');
    setShowEditor(false);
  };

  return (
    <div className="public-container">
      <div className="forum-header">
        <div>
          <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>เว็บบอร์ดสุขภาพและผิวพรรณ</h1>
          <p style={{ color: 'var(--text-secondary)' }}>เว็บบอร์ดเปิดกว้างสำหรับปรึกษาทุกปัญหาคาใจ สอบถามได้แบบไม่ระบุชื่อ และรับการตอบกลับจากแพทย์ผู้เชี่ยวชาญ</p>
        </div>
        <button className="cta-btn" onClick={() => setShowEditor(!showEditor)}>ตั้งกระทู้ถามแพทย์</button>
      </div>

      {showEditor && (
        <form onSubmit={handleCreateTopic} className="reply-editor" style={{ marginBottom: '3rem' }}>
          <h3 className="reply-editor-title">ตั้งกระทู้ถามแพทย์</h3>
          
          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="forum-topic-category" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>หมวดหมู่กระทู้</label>
            <select 
              id="forum-topic-category"
              value={newCategory} 
              onChange={(e) => setNewCategory(e.target.value)}
              className="reply-textarea"
              style={{ minHeight: 'auto', padding: '0.6rem' }}
            >
              <option value="skincare">สุขภาพผิวพรรณ</option>
              <option value="surgery">ปรับรูปหน้า & ศัลยกรรม</option>
              <option value="qa">ถามตอบปัญหาแพทย์</option>
              <option value="general">ทั่วไป</option>
            </select>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="forum-topic-title" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>หัวข้อคำถาม</label>
            <input 
              id="forum-topic-title"
              type="text" 
              placeholder="หัวข้อคำถาม (เช่น ฉีดโบท็อกซ์แล้วยิ้มแข็งแก้ยังไงคะ?)" 
              value={newTitle} 
              onChange={(e) => setNewTitle(e.target.value)}
              className="reply-textarea"
              style={{ minHeight: 'auto', padding: '0.75rem' }}
              required
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="forum-topic-content" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>รายละเอียดคำถาม</label>
            <textarea 
              id="forum-topic-content"
              placeholder="อธิบายรายละเอียดปัญหาของคุณอย่างละเอียด..." 
              value={newContent} 
              onChange={(e) => setNewContent(e.target.value)}
              className="reply-textarea"
              required
            />
          </div>

          <div className="reply-editor-actions">
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
              <label className="anon-checkbox-label">
                <input 
                  type="checkbox" 
                  checked={isAnon} 
                  onChange={(e) => setIsAnon(e.target.checked)} 
                />
                ตั้งคำถามโดยไม่ระบุตัวตน
              </label>
              
              {!isAnon && (
                <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.9rem' }}>
                  ชื่อผู้ตั้งกระทู้
                  <input
                    type="text"
                    placeholder="ชื่อผู้ตั้งกระทู้"
                    value={newAuthor}
                    onChange={(e) => setNewAuthor(e.target.value)}
                    className="reply-textarea"
                    style={{ minHeight: 'auto', padding: '0.5rem', width: '200px', margin: 0 }}
                  />
                </label>
              )}
            </div>
            
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="forum-cat-btn" onClick={() => setShowEditor(false)}>ยกเลิก</button>
              <button type="submit" className="cta-btn">เผยแพร่กระทู้</button>
            </div>
          </div>
        </form>
      )}

      {/* Category Navigation */}
      <div className="forum-categories">
        {categories.map(cat => (
          <button 
            key={cat.key} 
            className={`forum-cat-btn ${selectedCategory === cat.key ? 'active' : ''}`}
            onClick={() => setSelectedCategory(cat.key)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Forum List */}
      <div className="forum-list">
        {filteredTopics.length === 0 ? (
          <div className="empty-state" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <h2>ยังไม่มีกระทู้ในหมวดนี้</h2>
            <p style={{ color: 'var(--text-secondary)' }}>เริ่มตั้งคำถามแรกเพื่อให้ทีมคลินิกเข้ามาดูแลและตอบกลับ</p>
          </div>
        ) : filteredTopics.map((topic) => (
          <a key={topic.id} href={`#/forum/${topic.id}`} className="forum-card">
            <div className="forum-card-main">
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span className="forum-tag">{topic.category}</span>
                {topic.is_doctor_verified && (
                  <span className="verified-badge" style={{ marginLeft: '0.5rem' }}>✅ แพทย์ตอบแล้ว</span>
                )}
              </div>
              <h2 className="forum-card-title">{topic.title}</h2>
              <div className="forum-card-meta">
                <span>โดย {topic.author_display_name}</span>
                <span>•</span>
                <span>{new Date(topic.created_at).toLocaleDateString('th-TH')}</span>
              </div>
            </div>
            <div className="forum-card-stat">
              <div className="forum-stat-num">{topic.reply_count}</div>
              <div className="forum-stat-label">การตอบกลับ</div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

// ----------------------------------------------------
// Page Component: Forum Detail Page
// ----------------------------------------------------
function ForumDetailPage({ topicIdOrSlug, onReplyAdded }) {
  const [topic, setTopic] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [isAnon, setIsAnon] = useState(true);
  const [authorName, setAuthorName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function fetchTopic() {
      setLoading(true);
      try {
        const fetched = await apiFetch(`/forum/topics/${topicIdOrSlug}`);
        if (fetched) {
          setTopic(fetched);
          setError(null);
        } else {
          setError('ไม่พบกระทู้ดังกล่าว');
        }
      } catch (err) {
        setError('ไม่สามารถเชื่อมต่อข้อมูลได้');
      } finally {
        setLoading(false);
      }
    }
    fetchTopic();
  }, [topicIdOrSlug]);

  const handlePostReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || submitting || !topic) return;

    setSubmitting(true);
    const authorDisplayName = isAnon ? 'คนไข้นิรนาม' : (authorName.trim() || 'สมาชิกเว็บบอร์ด');
    
    try {
      const response = await apiFetch(`/forum/topics/${topic.id}/replies`, {
        method: 'POST',
        body: JSON.stringify({
          content: replyText,
          authorDisplayName,
          isAnonymous: isAnon
        })
      });

      if (response) {
        setTopic(prev => ({
          ...prev,
          reply_count: (prev.reply_count || 0) + 1,
          replies: [...(prev.replies || []), response]
        }));
        setReplyText('');
        setAuthorName('');
        if (onReplyAdded) onReplyAdded();
      } else {
        alert('เกิดข้อผิดพลาดในการส่งคำตอบ กรุณาลองใหม่อีกครั้ง');
      }
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="public-container" style={{ textAlign: 'center', padding: '5rem 2rem' }}>
        <p style={{ color: 'var(--text-secondary)' }}>กำลังโหลดเนื้อหา...</p>
      </div>
    );
  }

  if (error || !topic) {
    return (
      <div className="public-container" style={{ textAlign: 'center', padding: '5rem 2rem' }}>
        <h2>ขออภัย {error || 'ไม่พบกระทู้ดังกล่าว'}</h2>
        <a href="#/forum" className="cta-btn" style={{ marginTop: '1.5rem' }}>กลับหน้าบอร์ด</a>
      </div>
    );
  }

  return (
    <div className="public-container">
      <div className="forum-topic-view">
        <a href="#/forum" style={{ color: 'var(--gold-primary)', fontSize: '0.9rem', display: 'inline-block', marginBottom: '1.5rem' }}>
          &larr; กลับหน้ากระดานเว็บบอร์ด
        </a>

        {/* Original Thread Post */}
        <article className="forum-post">
          <header className="forum-post-header">
            <div className="forum-post-author">
              <div className={`forum-avatar ${topic.is_anonymous ? 'anonymous' : ''}`}>
                {topic.is_anonymous ? '👤' : topic.author_display_name.substring(0, 1)}
              </div>
              <div>
                <div className="forum-author-name">
                  {topic.author_display_name} 
                  {topic.is_anonymous && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 4, marginLeft: '0.5rem' }}>(คนไข้นิรนาม)</span>}
                </div>
                <div className="forum-post-date">{new Date(topic.created_at).toLocaleString('th-TH')}</div>
              </div>
            </div>
            <span className="forum-tag">{topic.category}</span>
          </header>
          <h1 style={{ fontSize: '1.8rem', marginBottom: '1.5rem' }}>{topic.title}</h1>
          <div className="forum-post-body">{topic.content}</div>
        </article>

        {/* Reply Thread */}
        <div style={{ margin: '3rem 0 1.5rem' }}>
          <h3 style={{ fontSize: '1.25rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>
            การตอบกลับ ({topic.replies?.length || 0})
          </h3>
        </div>

        <div className="forum-replies-list" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {topic.replies?.map((reply) => (
            <div 
              key={reply.id} 
              className="forum-post" 
              style={{ 
                padding: '1.5rem',
                marginLeft: reply.is_doctor_reply ? '0' : '2rem',
                borderColor: reply.is_doctor_reply ? 'var(--gold-primary)' : 'var(--glass-border)',
                background: reply.is_doctor_reply ? 'rgba(212, 175, 55, 0.02)' : 'var(--bg-secondary)'
              }}
            >
              <header className="forum-post-header" style={{ marginBottom: '1rem', paddingBottom: '0.5rem' }}>
                <div className="forum-post-author">
                  <div className={`forum-avatar ${reply.is_doctor_reply ? '' : 'anonymous'}`} style={{ width: '32px', height: '32px', fontSize: '0.85rem' }}>
                    {reply.is_doctor_reply ? '🩺' : '💬'}
                  </div>
                  <div>
                    <div className="forum-author-name" style={{ fontSize: '0.95rem' }}>
                      {reply.author_display_name}
                      {reply.is_doctor_reply && <span className="verified-badge" style={{ marginLeft: '0.5rem' }}>✅ แพทย์ผู้เชี่ยวชาญ</span>}
                      {reply.is_verified_answer && <span className="verified-badge" style={{ backgroundColor: '#b45309', color: '#fff', marginLeft: '0.5rem', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>🏆 คำตอบแนะนำโดยแพทย์</span>}
                    </div>
                    <div className="forum-post-date" style={{ fontSize: '0.75rem' }}>{new Date(reply.created_at).toLocaleString('th-TH')}</div>
                  </div>
                </div>
              </header>
              <div className="forum-post-body" style={{ fontSize: '0.95rem' }}>{reply.content}</div>
            </div>
          ))}
        </div>

        {/* Reply Editor */}
        <form onSubmit={handlePostReply} className="reply-editor">
          <h3 className="reply-editor-title">ร่วมแสดงความคิดเห็น / ตอบคำถาม</h3>
          <textarea 
            placeholder="เขียนคำแนะนำหรือข้อมูลของคุณที่นี่..." 
            value={replyText} 
            onChange={(e) => setReplyText(e.target.value)}
            className="reply-textarea"
            required
          />
          <div className="reply-editor-actions">
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
              <label className="anon-checkbox-label">
                <input 
                  type="checkbox" 
                  checked={isAnon} 
                  onChange={(e) => setIsAnon(e.target.checked)} 
                />
                ตอบความคิดเห็นโดยไม่ระบุตัวตน
              </label>
              
              {!isAnon && (
                <input 
                  type="text" 
                  placeholder="ชื่อของคุณ" 
                  value={authorName} 
                  onChange={(e) => setAuthorName(e.target.value)}
                  className="reply-textarea"
                  style={{ minHeight: 'auto', padding: '0.5rem', width: '200px', margin: 0 }}
                />
              )}
            </div>
            <button type="submit" className="cta-btn" disabled={submitting}>
              {submitting ? 'กำลังส่ง...' : 'ส่งความคิดเห็น'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// Global Mount API
// ----------------------------------------------------
export function mountPublicApp() {
  const container = document.getElementById('app');
  if (container) {
    const root = createRoot(container);
    root.render(<App />);
  }
}
