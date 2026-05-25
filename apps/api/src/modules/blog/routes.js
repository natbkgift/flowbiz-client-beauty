const { matchPath } = require('../../common/routing');
const { authenticateAndAuthorize, hasPermission } = require('../rbac/service');
const {
  createPost,
  updatePost,
  listPosts,
  getPostBySlug,
  deletePost
} = require('./service');

async function handleBlogRoutes(request, response, url, tools) {
  const { authenticateRequest, parseJsonBody, json } = tools;

  // 1. Public GET /blog/posts (listing published posts)
  if (url.pathname === '/blog/posts' && request.method === 'GET') {
    // If it has client auth, authenticate it to check clinicId, but for public page, we can also extract clinicId from a query parameter
    // Wait, the client is single-clinic specific!
    // Since this is FlowBiz Beauty specific, we can get clinic_id from the database or context.
    // Wait! How do public clients identify the clinic? They pass clinicId in query params!
    // Let's support either authenticating using token or falling back to a query parameter `clinicId` for public page.
    let clinicId;
    let canManageBlog = false;
    try {
      const context = await authenticateRequest(request);
      clinicId = context.currentClinic.id;
      canManageBlog = hasPermission(context, 'blog', 'manage');
    } catch (_) {
      // Fallback for public requests
      clinicId = Number(url.searchParams.get('clinicId')) || 1001; // default to first seeded clinic if not provided
    }

    const reqStatus = url.searchParams.get('status');
    const posts = await listPosts(clinicId, {
      status: canManageBlog && reqStatus === 'all' ? null : (reqStatus && canManageBlog ? reqStatus : 'published'),
      limit: url.searchParams.get('limit'),
      offset: url.searchParams.get('offset')
    });
    return json(response, 200, posts);
  }

  // 2. Public GET /blog/posts/:slug
  const slugParams = matchPath(url.pathname, '/blog/posts/:slug');
  if (slugParams && request.method === 'GET') {
    let clinicId;
    try {
      const context = await authenticateRequest(request);
      clinicId = context.currentClinic.id;
    } catch (_) {
      clinicId = Number(url.searchParams.get('clinicId')) || 1001;
    }

    // Wait! If slug is a number, is it possible they are calling PUT /blog/posts/:id?
    // Since PUT is handled separately, a GET request on this path is always a slug lookup.
    try {
      const post = await getPostBySlug(clinicId, slugParams.slug);
      return json(response, 200, post);
    } catch (err) {
      if (err.code === 'POST_NOT_FOUND') {
        return json(response, 404, { error: 'Not Found', message: err.message });
      }
      throw err;
    }
  }

  // 3. Admin POST /blog/posts (create post)
  if (url.pathname === '/blog/posts' && request.method === 'POST') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'blog', 'manage');
    const body = await parseJsonBody(request);
    const post = await createPost(context, body);
    return json(response, 201, post);
  }

  // 4. Admin PUT /blog/posts/:id (update post)
  const idParams = matchPath(url.pathname, '/blog/posts/:id');
  if (idParams && request.method === 'PUT') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'blog', 'manage');
    const body = await parseJsonBody(request);
    const postId = Number(idParams.id);
    
    try {
      const post = await updatePost(context, postId, body);
      return json(response, 200, post);
    } catch (err) {
      if (err.code === 'POST_NOT_FOUND') {
        return json(response, 404, { error: 'Not Found', message: err.message });
      }
      throw err;
    }
  }

  // 5. Admin DELETE /blog/posts/:id (delete post)
  if (idParams && request.method === 'DELETE') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'blog', 'manage');
    const postId = Number(idParams.id);
    
    try {
      await deletePost(context, postId);
      return json(response, 200, { success: true });
    } catch (err) {
      if (err.code === 'POST_NOT_FOUND') {
        return json(response, 404, { error: 'Not Found', message: err.message });
      }
      throw err;
    }
  }

  return false;
}

module.exports = {
  handleBlogRoutes
};
