const { matchPath } = require('../../common/routing');
const { authenticateAndAuthorize, authenticateAndAuthorizeAny } = require('../rbac/service');
const {
  inviteWorkspaceMember,
  listWorkspaceMembers,
  changeWorkspaceMemberRole,
  deactivateWorkspaceMember,
  acceptInvite
} = require('./service');

async function handleMembershipRoutes(request, response, url, helpers) {
  const { authenticateRequest, parseJsonBody, json } = helpers;

  if (url.pathname === '/auth/invite/accept' && request.method === 'POST') {
    const body = await parseJsonBody(request);
    const result = await acceptInvite(body);
    json(response, 200, result);
    return true;
  }

  const inviteParams = matchPath(url.pathname, '/workspace/:workspaceId/invite');

  if (inviteParams && request.method === 'POST') {
    const context = await authenticateAndAuthorizeAny(request, authenticateRequest, [
      ['user', 'manage'],
      ['invite', 'manage']
    ]);
    const body = await parseJsonBody(request);
    const result = await inviteWorkspaceMember(context, Number.parseInt(inviteParams.workspaceId, 10), body);
    json(response, 201, result);
    return true;
  }

  const membersParams = matchPath(url.pathname, '/workspace/:workspaceId/members');

  if (membersParams && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'user', 'read');
    const result = await listWorkspaceMembers(context, Number.parseInt(membersParams.workspaceId, 10));
    json(response, 200, result);
    return true;
  }

  const roleParams = matchPath(url.pathname, '/workspace/:workspaceId/members/:membershipId/role');

  if (roleParams && request.method === 'PATCH') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'role', 'manage');
    const body = await parseJsonBody(request);
    const result = await changeWorkspaceMemberRole(
      context,
      Number.parseInt(roleParams.workspaceId, 10),
      Number.parseInt(roleParams.membershipId, 10),
      body
    );
    json(response, 200, result);
    return true;
  }

  const deactivateParams = matchPath(url.pathname, '/workspace/:workspaceId/members/:membershipId/deactivate');

  if (deactivateParams && request.method === 'PATCH') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'user', 'manage');
    const result = await deactivateWorkspaceMember(
      context,
      Number.parseInt(deactivateParams.workspaceId, 10),
      Number.parseInt(deactivateParams.membershipId, 10)
    );
    json(response, 200, result);
    return true;
  }

  return false;
}

module.exports = {
  handleMembershipRoutes
};