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

test('Blog System Service Integration Tests', async (t) => {
  const fixture = await createFixture(t);
  const clinicId = fixture.session.currentClinic.id;

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
