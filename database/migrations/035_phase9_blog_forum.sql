-- Phase 9: Blog & Forum Tables

CREATE TABLE IF NOT EXISTS blog_posts (
    id SERIAL PRIMARY KEY,
    clinic_id INTEGER NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    excerpt TEXT,
    content TEXT NOT NULL,
    cover_image_url VARCHAR(2048),
    author_name VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    tags TEXT[] DEFAULT '{}',
    seo_title VARCHAR(255),
    seo_description VARCHAR(1000),
    og_image_url VARCHAR(2048),
    published_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS forum_topics (
    id SERIAL PRIMARY KEY,
    clinic_id INTEGER NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    content TEXT NOT NULL,
    author_display_name VARCHAR(255) NOT NULL,
    is_anonymous BOOLEAN DEFAULT TRUE,
    category VARCHAR(50) DEFAULT 'general' CHECK (category IN ('skincare', 'surgery', 'qa', 'general')),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'locked', 'hidden')),
    is_doctor_verified BOOLEAN DEFAULT FALSE,
    view_count INTEGER DEFAULT 0,
    reply_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS forum_replies (
    id SERIAL PRIMARY KEY,
    topic_id INTEGER NOT NULL REFERENCES forum_topics(id) ON DELETE CASCADE,
    clinic_id INTEGER NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    author_display_name VARCHAR(255) NOT NULL,
    is_anonymous BOOLEAN DEFAULT TRUE,
    is_doctor_reply BOOLEAN DEFAULT FALSE,
    is_verified_answer BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_blog_posts_clinic_status ON blog_posts(clinic_id, status);
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS idx_forum_topics_clinic_cat ON forum_topics(clinic_id, category, status);
CREATE INDEX IF NOT EXISTS idx_forum_topics_slug ON forum_topics(slug);
CREATE INDEX IF NOT EXISTS idx_forum_replies_topic ON forum_replies(topic_id);
