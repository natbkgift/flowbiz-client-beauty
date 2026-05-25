import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

// Config & API Helpers
const CONFIG = window.__FLOWBIZ_WEB_CONFIG__ || { apiBaseUrl: 'http://localhost:8103' };
const API_BASE = '/api'; // proxied by Nginx

async function apiFetch(path, options = {}) {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });
    if (!response.ok) throw new Error('API request failed');
    return await response.json();
  } catch (err) {
    console.warn(`API call to ${path} failed, using local fallback state:`, err.message);
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

  // Basic Hash Router parser
  const renderPage = () => {
    const hash = currentRoute.substring(1) || '/';
    
    if (hash === '/') {
      return <LandingPage />;
    }
    
    if (hash === '/blog') {
      return <BlogListPage posts={blogPosts} />;
    }
    
    if (hash.startsWith('/blog/')) {
      const slug = hash.replace('/blog/', '');
      const post = blogPosts.find(p => p.slug === slug);
      return <BlogDetailPage post={post} />;
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
      const topicId = Number(hash.replace('/forum/', ''));
      const topic = forumTopics.find(t => t.id === topicId);
      return (
        <ForumDetailPage 
          topic={topic}
          onReplyAdded={(topicId, newReply) => {
            setForumTopics(forumTopics.map(t => {
              if (t.id === topicId) {
                return {
                  ...t,
                  reply_count: t.reply_count + 1,
                  replies: [...(t.replies || []), newReply]
                };
              }
              return t;
            }));
          }}
        />
      );
    }

    return (
      <div className="public-container" style={{ textAlign: 'center', padding: '5rem 2rem' }}>
        <h1 style={{ fontSize: '3rem', marginBottom: '1.5rem', color: 'var(--gold-primary)' }}>404</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Page Not Found. ขออภัย ไม่พบหน้าที่ท่านต้องการ</p>
        <a href="#/" className="cta-btn">กลับหน้าแรก</a>
      </div>
    );
  };

  return (
    <div>
      {/* Premium Sticky Navigation */}
      <header className="header-glass">
        <a href="#/" className="logo">
          <span className="logo-icon">✨</span> FlowBiz Beauty
        </a>
        <nav>
          <ul className="nav-links">
            <li><a href="#/" className={currentRoute === '#/' ? 'active' : ''}>หน้าแรก</a></li>
            <li><a href="#/blog" className={currentRoute.startsWith('#/blog') ? 'active' : ''}>บทความผิวดี</a></li>
            <li><a href="#/forum" className={currentRoute.startsWith('#/forum') ? 'active' : ''}>เว็บบอร์ดถามตอบ</a></li>
          </ul>
        </nav>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <a href="/admin" className="cta-btn secondary" target="_blank">เข้าระบบ CRM</a>
          <button className="cta-btn" onClick={() => window.open('https://line.me', '_blank')}>ปรึกษาหมอฟรี</button>
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
              FlowBiz Beauty Clinic คลินิกความงามระดับพรีเมียม ให้บริการปรับรูปหน้า ดูแลผิวพรรณ เลเซอร์ และการชะลอวัยโดยแพทย์ผู้เชี่ยวชาญ
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
          &copy; {new Date().getFullYear()} FlowBiz Beauty Clinic. All rights reserved.
        </div>
      </footer>
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
    { tag: 'Hot Deal', title: 'โบต็อกลดกราม + ลิฟต์กรอบหน้า (ไม่จำกัดยูนิต)', original: '9,900', price: '4,990', desc: 'ดูแลโดยแพทย์ผู้เชี่ยวชาญ แกะกล่องดึงยาต่อหน้า' },
    { tag: 'Best Seller', title: 'ฟิลเลอร์ใต้ตาเติมเต็มผิวฟู (Premium Brand 1cc)', original: '18,000', price: '11,900', desc: 'แก้ปัญหาร่องลึกใต้ตาคล้ำ ดูโทรม ให้กลับมาสดใสทันที' },
    { tag: 'Rejuvenate', title: 'Meso Glow หน้ากระจ่างใสสะกดสายตา 3 ครั้ง', original: '7,500', price: '2,900', desc: 'สูตรพิเศษเติมวิตามินเข้มข้น ผิวเด้งฉ่ำออร่าแบบเร่งด่วน' }
  ];

  return (
    <div>
      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          <div className="hero-subtitle">Premium Aesthetic & Skincare Clinic</div>
          <h1 className="hero-title">ที่สุดแห่งการดูแลผิวพรรณ<br/>และปรับรูปหน้าอย่างมีระดับ</h1>
          <p className="hero-desc">
            ยกระดับความสวยงามของผิวพรรณคุณอย่างปลอดภัย ด้วยเทคโนโลยีทางการแพทย์ที่ทันสมัยและทีมแพทย์ผู้ชำนาญการด้านหัตถการปรับรูปหน้า
          </p>
          <div className="hero-actions">
            <button className="cta-btn" onClick={() => window.open('https://line.me', '_blank')}>จองคิวรับสิทธิ์พิเศษ</button>
            <a href="#/blog" className="cta-btn secondary">อ่านสาระความรู้ผิว</a>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section className="section" style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}>
        <div className="section-header">
          <div className="section-subtitle">Our Specialist Services</div>
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
          <div className="section-subtitle">Exclusive Offers</div>
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
              <button className="cta-btn" style={{ width: '100%' }} onClick={() => window.open('https://line.me', '_blank')}>
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
  return (
    <div className="public-container">
      <div className="blog-header">
        <div>
          <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>บทความให้ความรู้ด้านความงาม</h1>
          <p style={{ color: 'var(--text-secondary)' }}>เคล็ดลับการดูแลผิว เทรนด์หัตถการ และความรู้วิเคราะห์เจาะลึกโดยทีมแพทย์ FlowBiz Clinic</p>
        </div>
      </div>
      <div className="blog-grid">
        {posts.map((post) => (
          <article key={post.id} className="blog-card">
            <div className="blog-cover">
              {post.cover_image_url ? (
                <img src={post.cover_image_url} alt={post.title} className="blog-cover-img" />
              ) : (
                <span className="blog-cover-placeholder">🧬</span>
              )}
            </div>
            <div className="blog-card-content">
              <div className="blog-meta">
                <span>By {post.author_name}</span>
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
function BlogDetailPage({ post }) {
  if (!post) {
    return (
      <div className="public-container" style={{ textAlign: 'center', padding: '5rem 2rem' }}>
        <h2>ขออภัย ไม่พบบทความชิ้นนี้</h2>
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
            <span>📅 เผยแพร่เมื่อ: {new Date(post.published_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
            {post.tags?.map((t, idx) => (
              <span key={idx} className="forum-tag">{t}</span>
            ))}
          </div>
        </header>

        <div className="blog-post-cover">
          {post.cover_image_url ? (
            <img src={post.cover_image_url} alt={post.title} />
          ) : (
            <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, var(--bg-tertiary) 0%, rgba(212,175,55,0.08) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gold-primary)', fontSize: '5rem' }}>
              🧬
            </div>
          )}
        </div>

        <div className="blog-post-content" dangerouslySetInnerHTML={{ __html: post.content }} />
        
        <footer className="blog-post-footer">
          <div>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>แชร์ความรู้นี้ให้กับเพื่อนของคุณ</p>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button className="forum-cat-btn" onClick={() => alert('Link copied!')}>คัดลอกลิงก์</button>
              <button className="forum-cat-btn" onClick={() => window.open('https://facebook.com', '_blank')}>Facebook</button>
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

  const handleCreateTopic = (e) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) {
      alert('กรุณากรอกหัวข้อและเนื้อหา');
      return;
    }

    const topic = {
      id: Date.now(),
      title: newTitle,
      slug: newTitle.toLowerCase().replace(/ /g, '-').replace(/[^\w\u0e00-\u0e7f-]/g, ''),
      content: newContent,
      author_display_name: isAnon ? 'คนไข้นิรนาม' : (newAuthor.trim() || 'สมาชิกทั่วไป'),
      is_anonymous: isAnon,
      category: newCategory,
      reply_count: 0,
      created_at: new Date().toISOString(),
      replies: []
    };

    onTopicAdded(topic);
    setNewTitle('');
    setNewContent('');
    setNewAuthor('');
    setShowEditor(false);
    
    // Attempt back-end API post
    apiFetch('/forum/topics', {
      method: 'POST',
      body: JSON.stringify({
        title: topic.title,
        content: topic.content,
        authorDisplayName: topic.author_display_name,
        isAnonymous: topic.is_anonymous,
        category: topic.category
      })
    });
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
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>หมวดหมู่กระทู้</label>
            <select 
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
            <input 
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
            <textarea 
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
                ตั้งคำถามโดยไม่ระบุตัวตน (Anonymous)
              </label>
              
              {!isAnon && (
                <input 
                  type="text" 
                  placeholder="ชื่อผู้ตั้งกระทู้" 
                  value={newAuthor} 
                  onChange={(e) => setNewAuthor(e.target.value)}
                  className="reply-textarea"
                  style={{ minHeight: 'auto', padding: '0.5rem', width: '200px', margin: 0 }}
                />
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
        {filteredTopics.map((topic) => (
          <a key={topic.id} href={`#/forum/${topic.id}`} className="forum-card">
            <div className="forum-card-main">
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span className="forum-tag">{topic.category}</span>
                {topic.replies?.some(r => r.is_doctor_reply) && (
                  <span className="verified-badge">✅ แพทย์ตอบแล้ว</span>
                )}
              </div>
              <h2 className="forum-card-title">{topic.title}</h2>
              <div className="forum-card-meta">
                <span>By {topic.author_display_name}</span>
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
function ForumDetailPage({ topic, onReplyAdded }) {
  const [replyText, setReplyText] = useState('');
  const [isAnon, setIsAnon] = useState(true);
  const [authorName, setAuthorName] = useState('');

  if (!topic) {
    return (
      <div className="public-container" style={{ textAlign: 'center', padding: '5rem 2rem' }}>
        <h2>ขออภัย ไม่พบกระทู้ดังกล่าว</h2>
        <a href="#/forum" className="cta-btn" style={{ marginTop: '1.5rem' }}>กลับหน้าบอร์ด</a>
      </div>
    );
  }

  const handlePostReply = (e) => {
    e.preventDefault();
    if (!replyText.trim()) return;

    const newReply = {
      id: Date.now(),
      content: replyText,
      author_display_name: isAnon ? 'ผู้ใช้ทั่วไป' : (authorName.trim() || 'สมาชิกเว็บบอร์ด'),
      is_anonymous: isAnon,
      is_doctor_reply: false,
      is_verified_answer: false,
      created_at: new Date().toISOString()
    };

    onReplyAdded(topic.id, newReply);
    setReplyText('');
    setAuthorName('');

    // Attempt back-end API post
    apiFetch(`/forum/topics/${topic.id}/replies`, {
      method: 'POST',
      body: JSON.stringify({
        content: newReply.content,
        authorDisplayName: newReply.author_display_name,
        isAnonymous: newReply.is_anonymous
      })
    });
  };

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
                      {reply.is_doctor_reply && <span className="verified-badge">✅ แพทย์ผู้เชี่ยวชาญ</span>}
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
            <button type="submit" className="cta-btn">ส่งความคิดเห็น</button>
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
