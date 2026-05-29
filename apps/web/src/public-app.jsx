import React, { useState, useEffect } from 'react';
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
  const renderPage = () => {
    if (clinicSlug) {
      return <ClinicPublicShell clinicSlug={clinicSlug} />;
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

    const hash = currentRoute.substring(1) || '/';
    
    if (hash === '/') {
      return <PlatformLandingPlaceholder />;
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
          <ul className="nav-links">
            {clinicSlug ? (
              <li><a href={`/${clinicSlug}`} className="active">หน้าแรก</a></li>
            ) : (
              <>
                <li><a href="#/" className={currentRoute === '#/' && pathname === '/' ? 'active' : ''}>หน้าแรก</a></li>
                <li><a href="#/blog" className={currentRoute.startsWith('#/blog') || pathname.startsWith('/blog') ? 'active' : ''}>บทความผิวดี</a></li>
                <li><a href="#/forum" className={currentRoute.startsWith('#/forum') || pathname.startsWith('/forum') ? 'active' : ''}>เว็บบอร์ดถามตอบ</a></li>
              </>
            )}
          </ul>
        </nav>
        <div className="header-actions">
          <a href="/admin" className="cta-btn secondary" target="_blank" rel="noopener noreferrer">เข้าระบบ CRM</a>
          <button className="cta-btn" onClick={() => openExternalUrl('https://line.me')}>
            {clinicSlug ? 'ติดต่อเรา' : 'ปรึกษาหมอฟรี'}
          </button>
        </div>
      </header>

      {/* Renders Active SPA Page */}
      <main>{renderPage()}</main>

      {/* Premium Footer */}
      <footer className="footer">
        <div className="footer-content">
          <div>
            <h3 className="footer-section-title">เกี่ยวกับคลินิก</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
              {clinicSlug 
                ? 'คลินิกความงามระดับพรีเมียม ให้บริการปรับรูปหน้า ดูแลผิวพรรณ เลเซอร์ และการชะลอวัยโดยแพทย์ผู้เชี่ยวชาญ'
                : 'FlowBiz Beauty Clinic คลินิกความงามระดับพรีเมียม ให้บริการปรับรูปหน้า ดูแลผิวพรรณ เลเซอร์ และการชะลอวัยโดยแพทย์ผู้เชี่ยวชาญ'
              }
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
        </div>
        <div className="footer-bottom">
          &copy; {new Date().getFullYear()} {clinicSlug ? 'FlowBiz Clinic' : 'FlowBiz Beauty Clinic'}. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

// ----------------------------------------------------
// Page Component: Platform Landing Placeholder
// ----------------------------------------------------
function PlatformLandingPlaceholder() {
  return (
    <div className="public-container" data-testid="public-platform-landing" style={{ textAlign: 'center', padding: '5rem 2rem' }}>
      <h1 style={{ fontSize: '3rem', color: 'var(--gold-primary)', marginBottom: '1.5rem' }}>FlowBiz Beauty</h1>
      <p style={{ fontSize: '1.25rem', color: 'var(--text-secondary)', marginBottom: '2.5rem' }}>
        AI CRM + LINE Automation + HITL for beauty clinics
      </p>
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
        <button className="cta-btn" onClick={() => alert('Request Demo clicked')}>Request Demo</button>
        <button className="cta-btn secondary" onClick={() => window.location.pathname = '/flowbiz-beauty-demo'}>View Example Clinic</button>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// Page Component: Clinic Public Shell
// ----------------------------------------------------
function ClinicPublicShell({ clinicSlug }) {
  const [loading, setLoading] = useState(true);
  const [clinicData, setClinicData] = useState(null);
  const [errorStatus, setErrorStatus] = useState(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setErrorStatus(null);
      try {
        const result = await getPublicClinicBySlug(clinicSlug);
        if (!active) return;
        if (result.status === 200) {
          setClinicData(result.data);
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

  const { clinic, websiteSettings, contactSettings, locationSettings, homepageSections, isPubliclyRenderable } = clinicData;

  return (
    <div className="public-container" data-testid="clinic-public-shell">
      {!isPubliclyRenderable && (
        <div data-testid="clinic-unpublished-notice" style={{ backgroundColor: 'rgba(212, 175, 55, 0.1)', border: '1px solid var(--gold-primary)', padding: '1rem', borderRadius: '8px', marginBottom: '2rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--gold-primary)', margin: 0 }}>เว็บไซต์คลินิกนี้ยังไม่ถูกเผยแพร่เต็มรูปแบบ</p>
        </div>
      )}

      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)', padding: '2.5rem', borderRadius: '12px' }}>
        <h1 data-testid="clinic-name" style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>{clinic.name}</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Slug: <span data-testid="clinic-slug">{clinic.slug}</span></p>
        <p>Status: <span data-testid="clinic-status" className="forum-tag">{websiteSettings.websiteStatus}</span></p>

        {websiteSettings.tagline && (
          <p style={{ fontStyle: 'italic', color: 'var(--text-secondary)', marginTop: '1rem' }}>"{websiteSettings.tagline}"</p>
        )}

        <div data-testid="clinic-contact" style={{ marginTop: '2rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1.5rem' }}>
          <h3>ข้อมูลติดต่อ</h3>
          {contactSettings.phone && <p>📞 เบอร์โทร: {contactSettings.phone}</p>}
          {contactSettings.email && <p>✉️ อีเมล: {contactSettings.email}</p>}
          {contactSettings.lineUrl && <p>💬 LINE: <a href={contactSettings.lineUrl} target="_blank" rel="noopener noreferrer">{contactSettings.lineOaId || 'LINE OA'}</a></p>}
        </div>

        <div style={{ marginTop: '1.5rem' }}>
          <h3>ที่ตั้งคลินิก</h3>
          <p>📍 {locationSettings.province || 'ไม่ระบุ'}, {locationSettings.country}</p>
        </div>

        <div data-testid="clinic-homepage-sections" style={{ marginTop: '2rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1.5rem' }}>
          <h3>โครงสร้างหน้าแรก (Sections)</h3>
          {homepageSections && homepageSections.length > 0 ? (
            <ul>
              {homepageSections.map((sec, idx) => (
                <li key={idx} style={{ color: 'var(--text-secondary)' }}>
                  {sec.sectionKey} ({sec.sectionType})
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: 'var(--text-muted)' }}>ไม่มีหัวข้อแสดงบนหน้าแรก</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// Page Component: Landing Page
// ----------------------------------------------------
function LandingPage() {
  const services = [
    { icon: '💉', title: 'Botox V-Shape', desc: 'ปรับหน้าเรียว ล็อกริ้วรอย หางตา หน้าผาก หรี่กล้ามเนื้อกรามอย่างเป็นธรรมชาติด้วยโบต็อกแท้ผ่านอย.' },
    { icon: '✨', title: 'Dermal Fillers', desc: 'เติมเต็มร่องลึกใต้ตา ร่องแก้ม ปรับทรงคางและปากให้ฟูอิ่มน้ำ ปลอดภัย สลายหมด 100%' },
    { icon: '💆‍♀️', title: 'Meso Bright & Glow', desc: 'ผลักวิตามินเข้มข้น สารอาหารสำคัญและคอลลาเจนเข้าสู่ชั้นผิวโดยตรง บูสต์ผิวขาวใสฉ่ำวาว' },
    { icon: '⚡', title: 'Ultherapy Lift', desc: 'ยกกระชับระดับลึกถึงชั้น SMAS โดยไม่ต้องผ่าตัด กระตุ้นการสร้างคอลลาเจนใหม่ หน้าเรียวเหนียงหาย' }
  ];

  const promotions = [
    { tag: 'โปรยอดนิยม', title: 'โบต็อกลดกราม + ลิฟต์กรอบหน้า (ไม่จำกัดยูนิต)', original: '9,900', price: '4,990', desc: 'ดูแลโดยแพทย์ผู้เชี่ยวชาญ แกะกล่องดึงยาต่อหน้า' },
    { tag: 'ขายดีที่สุด', title: 'ฟิลเลอร์ใต้ตาเติมเต็มผิวฟู (Premium Brand 1cc)', original: '18,000', price: '11,900', desc: 'แก้ปัญหาร่องลึกใต้ตาคล้ำ ดูโทรม ให้กลับมาสดใสทันที' },
    { tag: 'ฟื้นฟูผิว', title: 'Meso Glow หน้ากระจ่างใสสะกดสายตา 3 ครั้ง', original: '7,500', price: '2,900', desc: 'สูตรพิเศษเติมวิตามินเข้มข้น ผิวเด้งฉ่ำออร่าแบบเร่งด่วน' }
  ];

  return (
    <div>
      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          <div className="hero-subtitle">คลินิกความงามและดูแลผิวระดับพรีเมียม</div>
          <h1 className="hero-title">ที่สุดแห่งการดูแลผิวพรรณ<br/>และปรับรูปหน้าอย่างมีระดับ</h1>
          <p className="hero-desc">
            ยกระดับความสวยงามของผิวพรรณคุณอย่างปลอดภัย ด้วยเทคโนโลยีทางการแพทย์ที่ทันสมัยและทีมแพทย์ผู้ชำนาญการด้านหัตถการปรับรูปหน้า
          </p>
          <div className="hero-actions">
            <button className="cta-btn" onClick={() => openExternalUrl('https://line.me')}>จองคิวรับสิทธิ์พิเศษ</button>
            <a href="#/blog" className="cta-btn secondary">อ่านสาระความรู้ผิว</a>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section className="section" style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}>
        <div className="section-header">
          <div className="section-subtitle">บริการดูแลเฉพาะทาง</div>
          <h2 className="section-title">หัตถการความงามที่เชี่ยวชาญ</h2>
        </div>
        <div className="grid-cards">
          {services.map((svc, i) => (
            <div key={i} className="glass-card">
              <div className="card-icon">{svc.icon}</div>
              <h3 className="card-title">{svc.title}</h3>
              <p className="card-desc">{svc.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Promotions Section */}
      <section className="section" style={{ borderTop: '1px solid rgba(255,255,255,0.03)', background: 'rgba(212, 175, 55, 0.01)' }}>
        <div className="section-header">
          <div className="section-subtitle">ข้อเสนอเฉพาะเดือนนี้</div>
          <h2 className="section-title">โปรโมชั่นพิเศษประจำเดือนนี้</h2>
        </div>
        <div className="grid-cards">
          {promotions.map((promo, i) => (
            <div key={i} className="glass-card" style={{ borderTopColor: 'var(--gold-primary)' }}>
              <span className="promo-badge">{promo.tag}</span>
              <h3 className="card-title" style={{ marginTop: '1rem', minHeight: '3rem' }}>{promo.title}</h3>
              <p className="card-desc">{promo.desc}</p>
              <div className="promo-price-box">
                <span className="promo-price">{promo.price}</span>
                <span className="promo-currency">THB</span>
                <span className="promo-original">{promo.original}.-</span>
              </div>
              <button className="cta-btn" style={{ width: '100%' }} onClick={() => openExternalUrl('https://line.me')}>
                จองสิทธิ์โปรนี้ทาง LINE
              </button>
            </div>
          ))}
        </div>
      </section>
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
