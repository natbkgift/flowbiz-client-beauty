const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../apps/api/src/config');
const { signup } = require('../apps/api/src/modules/auth/service');
const {
  createPost,
  updatePost,
  listPosts,
  getPostBySlug,
  deletePost,
  generateSlug
} = require('../apps/api/src/modules/blog/service');
const {
  createTopic,
  listTopics,
  getTopicByIdOrSlug,
  createReply,
  listReplies,
  verifyReply,
  updateTopicStatus
} = require('../apps/api/src/modules/forum/service');
const { handleBlogRoutes } = require('../apps/api/src/modules/blog/routes');
const { handleForumRoutes } = require('../apps/api/src/modules/forum/routes');
const { json } = require('../apps/api/src/common/http');

function createMockResponse() {
  return {
    statusCode: null,
    headers: null,
    body: '',
    writeHead(statusCode, headers = {}) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body = '') {
      this.body = body;
    }
  };
}

async function routeJson(handler, { method = 'GET', path, authenticateRequest, body = {} }) {
  const response = createMockResponse();
  const handled = await handler(
    { method },
    response,
    new URL(`http://localhost${path}`),
    {
      authenticateRequest: authenticateRequest || (async () => {
        throw new Error('anonymous');
      }),
      parseJsonBody: async () => body,
      json
    }
  );

  assert.equal(handled, true);
  return {
    statusCode: response.statusCode,
    body: response.body ? JSON.parse(response.body) : null
  };
}

async function createFixture(t) {
  const uniqueId = Date.now() + Math.floor(Math.random() * 1000);
  const session = await signup({
    clinicName: `Blog Clinic ${uniqueId}`,
    ownerName: 'Blog Owner',
    email: `blog-owner-${uniqueId}@example.com`,
    password: 'StrongPass123!'
  });
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });

  t.after(async () => {
    try {
      await pool.query('delete from clinics where id = $1', [session.currentClinic.id]);
      await pool.query('delete from users where id = $1', [session.user.id]);
    } catch (err) {
      // ignore cleanup errors
    } finally {
      await pool.end();
    }
  });

  const clinicContext = {
    currentClinic: session.currentClinic,
    currentUser: session.user
  };

  return {
    pool,
    session,
    clinicContext
  };
}

test('Blog & Forum System Service Integration Tests', async (t) => {
  const fixture = await createFixture(t);
  const clinicId = fixture.session.currentClinic.id;

  await t.test('Blog Service Subtests', async () => {
    // 1. Test generateSlug (English and Thai support)
    const slug1 = generateSlug('  Hello World!  ');
    assert.equal(slug1, 'hello-world');

    const slug2 = generateSlug('สิวและวิธีการดูแลผิวหน้า 101');
    assert.equal(slug2, 'สิวและวิธีการดูแลผิวหน้า-101');

    // 2. Test createPost
    const postData = {
      title: '5 เคล็ดลับบำรุงผิวสู้แดดเมืองไทย',
      excerpt: 'คัมภีร์กู้ผิวคล้ำแดด',
      content: 'เนื้อหาการบำรุงผิวหน้าระดับละเอียด...',
      coverImageUrl: 'https://example.com/cover.jpg',
      authorName: 'หมอโอ๊ต',
      status: 'draft',
      tags: ['สกินแคร์', 'กันแดด'],
      seoTitle: '5 เคล็ดลับบำรุงผิวสู้แดด',
      seoDescription: 'เคล็ดลับดูแลผิวหน้าร้อนนี้'
    };

    const createdPost = await createPost(fixture.clinicContext, postData);
    assert.ok(createdPost.id);
    assert.equal(createdPost.title, postData.title);
    assert.equal(createdPost.status, 'draft');
    assert.equal(createdPost.slug, '5-เคล็ดลับบำรุงผิวสู้แดดเมืองไทย');
    assert.deepEqual(createdPost.tags, postData.tags);

    // 3. Test uniqueness of slug generation
    const duplicatePost = await createPost(fixture.clinicContext, {
      ...postData,
      title: '5 เคล็ดลับบำรุงผิวสู้แดดเมืองไทย'
    });
    assert.notEqual(duplicatePost.slug, createdPost.slug);
    assert.match(duplicatePost.slug, /^5-เคล็ดลับบำรุงผิวสู้แดดเมืองไทย-.+$/);

    const encodedDraftSlug = encodeURIComponent(duplicatePost.slug);
    const publicDraftLookup = await routeJson(handleBlogRoutes, {
      path: `/blog/posts/${encodedDraftSlug}?clinicId=${clinicId}`
    });
    assert.equal(publicDraftLookup.statusCode, 404);

    const viewerDraftLookup = await routeJson(handleBlogRoutes, {
      path: `/blog/posts/${encodedDraftSlug}`,
      authenticateRequest: async () => ({
        currentClinic: fixture.session.currentClinic,
        currentMembership: { permissions: [] }
      })
    });
    assert.equal(viewerDraftLookup.statusCode, 404);

    const managerDraftLookup = await routeJson(handleBlogRoutes, {
      path: `/blog/posts/${encodedDraftSlug}`,
      authenticateRequest: async () => ({
        currentClinic: fixture.session.currentClinic,
        currentMembership: { permissions: ['blog.manage'] }
      })
    });
    assert.equal(managerDraftLookup.statusCode, 200);
    assert.equal(managerDraftLookup.body.id, duplicatePost.id);

    // 4. Test updatePost & draft-to-published flow
    const updatedPost = await updatePost(fixture.clinicContext, createdPost.id, {
      status: 'published',
      excerpt: 'คัมภีร์กู้ผิวคล้ำแดดอัปเดตใหม่'
    });
    assert.equal(updatedPost.status, 'published');
    assert.equal(updatedPost.excerpt, 'คัมภีร์กู้ผิวคล้ำแดดอัปเดตใหม่');
    assert.ok(updatedPost.published_at);

    // 5. Test listPosts (only published vs drafts vs all)
    const publishedList = await listPosts(clinicId, { status: 'published' });
    assert.equal(publishedList.total, 1);
    assert.equal(publishedList.items[0].id, createdPost.id);

    const draftList = await listPosts(clinicId, { status: 'draft' });
    assert.equal(draftList.total, 1); // the duplicate post is draft
    assert.equal(draftList.items[0].id, duplicatePost.id);

    const allList = await listPosts(clinicId); // status = undefined matches all
    assert.equal(allList.total, 2);

    // 6. Test getPostBySlug
    const fetchedPost = await getPostBySlug(clinicId, createdPost.slug);
    assert.equal(fetchedPost.id, createdPost.id);
    assert.equal(fetchedPost.title, createdPost.title);

    // 7. Test deletePost
    const delResult = await deletePost(fixture.clinicContext, createdPost.id);
    assert.ok(delResult.success);

    // Verify deletion
    const afterDeleteList = await listPosts(clinicId);
    assert.equal(afterDeleteList.total, 1);
    assert.equal(afterDeleteList.items[0].id, duplicatePost.id);
  });

  await t.test('Forum Service Subtests', async () => {
    // 1. Test createTopic
    const topicData = {
      title: 'สอบถามปัญหาผิวสิวอักเสบหลังทำเลเซอร์',
      content: 'ทำไมหลังทำเลเซอร์ผิวหน้าถึงเกิดสิวอักเสบขึ้นเยอะมากคะ? ผิดปกติไหม?',
      authorDisplayName: 'คนไข้กังวลใจ',
      isAnonymous: true,
      category: 'skincare'
    };

    const createdTopic = await createTopic(fixture.clinicContext, topicData);
    assert.ok(createdTopic.id);
    assert.equal(createdTopic.title, topicData.title);
    assert.equal(createdTopic.is_anonymous, true);
    assert.equal(createdTopic.category, 'skincare');
    assert.equal(createdTopic.slug, 'สอบถามปัญหาผิวสิวอักเสบหลังทำเลเซอร์');

    // Test duplicate slug uniqueness
    const duplicateTopic = await createTopic(fixture.clinicContext, topicData);
    assert.notEqual(duplicateTopic.slug, createdTopic.slug);
    assert.match(duplicateTopic.slug, /^สอบถามปัญหาผิวสิวอักเสบหลังทำเลเซอร์-.+$/);

    // 2. Test createReply
    const replyData = {
      content: 'โดยปกติการทำเลเซอร์กลุ่มผลัดเซลล์ผิวอาจกระตุ้นให้สิวอุดตันใต้ผิวประทุออกมาเป็นสิวอักเสบได้ครับ',
      authorDisplayName: 'นพ. สมบูรณ์',
      isAnonymous: false,
      isDoctorReply: false
    };

    const createdReply = await createReply(fixture.clinicContext, createdTopic.id, replyData);
    assert.ok(createdReply.id);
    assert.equal(createdReply.topic_id, createdTopic.id);
    assert.equal(createdReply.content, replyData.content);
    assert.equal(createdReply.is_doctor_reply, false);
    assert.equal(createdReply.is_verified_answer, false);

    // Check that reply count is updated
    const topicAfterReply = await getTopicByIdOrSlug(clinicId, createdTopic.id);
    assert.equal(topicAfterReply.reply_count, 1);
    assert.equal(topicAfterReply.is_doctor_verified, false);

    // 3. Test verifyReply (Doctor verified answer badge logic)
    const verifyResult = await verifyReply(fixture.clinicContext, createdReply.id, true);
    assert.ok(verifyResult.success);

    // Verify that the reply is verified and topic has is_doctor_verified = true
    const topicAfterVerify = await getTopicByIdOrSlug(clinicId, createdTopic.id);
    assert.equal(topicAfterVerify.is_doctor_verified, true);

    // 4. Test create doctor reply directly (auto-verified answer)
    const docReplyData = {
      content: 'แนะนำทายากลุ่มลดการอักเสบ และประคบเย็นได้ครับ',
      authorDisplayName: 'หมอโอ๊ต (แพทย์ผู้เชี่ยวชาญ)',
      isAnonymous: false,
      isDoctorReply: true
    };

    const docReply = await createReply(fixture.clinicContext, createdTopic.id, docReplyData);
    assert.equal(docReply.is_doctor_reply, true);
    assert.equal(docReply.is_verified_answer, true);

    // Check replies list
    const replies = await listReplies(clinicId, createdTopic.id);
    assert.equal(replies.length, 2);
    assert.equal(replies[0].id, createdReply.id);
    assert.equal(replies[1].id, docReply.id);

    // 5. Test updateTopicStatus (moderation: lock/hide)
    const lockedTopic = await updateTopicStatus(fixture.clinicContext, createdTopic.id, 'locked');
    assert.equal(lockedTopic.status, 'locked');

    const hiddenTopic = await updateTopicStatus(fixture.clinicContext, createdTopic.id, 'hidden');
    assert.equal(hiddenTopic.status, 'hidden');

    // 6. Test listTopics with category and status filters
    const topicsList = await listTopics(clinicId, { category: 'skincare', status: 'hidden' });
    assert.equal(topicsList.total, 1);
    assert.equal(topicsList.items[0].id, createdTopic.id);

    const encodedTopicSlug = encodeURIComponent(createdTopic.slug);
    const publicHiddenTopic = await routeJson(handleForumRoutes, {
      path: `/forum/topics/${encodedTopicSlug}?clinicId=${clinicId}`
    });
    assert.equal(publicHiddenTopic.statusCode, 404);

    const moderatorHiddenTopic = await routeJson(handleForumRoutes, {
      path: `/forum/topics/${encodedTopicSlug}`,
      authenticateRequest: async () => ({
        currentClinic: fixture.session.currentClinic,
        currentMembership: { permissions: ['forum.moderate'] }
      })
    });
    assert.equal(moderatorHiddenTopic.statusCode, 200);
    assert.equal(moderatorHiddenTopic.body.id, createdTopic.id);

    await assert.rejects(
      () => createReply(fixture.clinicContext, createdTopic.id, {
        content: 'ตอบกลับหัวข้อที่ถูกซ่อนแบบ public ไม่ควรผ่าน',
        authorDisplayName: 'ผู้ใช้ทั่วไป',
        isAnonymous: true
      }),
      (error) => error.code === 'TOPIC_NOT_FOUND'
    );

    const moderatorReply = await createReply(fixture.clinicContext, createdTopic.id, {
      content: 'ตอบกลับโดย moderator เพื่อปิดเคส',
      authorDisplayName: 'ทีมแพทย์',
      isAnonymous: false,
      isDoctorReply: true,
      allowRestrictedTopic: true
    });
    assert.equal(moderatorReply.is_doctor_reply, true);
  });
});
