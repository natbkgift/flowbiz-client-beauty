const { matchPath } = require('../../common/routing');
const {
  listClinics,
  getClinicDetail,
  createClinic,
  updateClinic,
  updateClinicStatus
} = require('./service');

/**
 * Handle routes under /admin/clinics
 */
async function handleClinicRoutes(request, response, url, tools) {
  const { authenticateRequest, parseJsonBody, json } = tools;

  // 1. GET /admin/clinics
  if (url.pathname === '/admin/clinics' && request.method === 'GET') {
    const context = await authenticateRequest(request);
    const options = {
      status: url.searchParams.get('status'),
      search: url.searchParams.get('search'),
      limit: url.searchParams.get('limit'),
      offset: url.searchParams.get('offset')
    };
    const result = await listClinics(context, options);
    json(response, 200, result);
    return true;
  }

  // 2. POST /admin/clinics
  if (url.pathname === '/admin/clinics' && request.method === 'POST') {
    const context = await authenticateRequest(request);
    const body = await parseJsonBody(request);
    const result = await createClinic(context, body);
    json(response, 201, result);
    return true;
  }

  // 3. GET /admin/clinics/:id
  const detailParams = matchPath(url.pathname, '/admin/clinics/:id');
  if (detailParams && request.method === 'GET') {
    const context = await authenticateRequest(request);
    const result = await getClinicDetail(context, detailParams.id);
    json(response, 200, result);
    return true;
  }

  // 4. PATCH /admin/clinics/:id
  if (detailParams && request.method === 'PATCH') {
    const context = await authenticateRequest(request);
    const body = await parseJsonBody(request);
    const result = await updateClinic(context, detailParams.id, body);
    json(response, 200, result);
    return true;
  }

  // 5. PATCH /admin/clinics/:id/status
  const statusParams = matchPath(url.pathname, '/admin/clinics/:id/status');
  if (statusParams && request.method === 'PATCH') {
    const context = await authenticateRequest(request);
    const body = await parseJsonBody(request);
    const result = await updateClinicStatus(context, statusParams.id, body);
    json(response, 200, result);
    return true;
  }

  return false;
}

module.exports = {
  handleClinicRoutes
};
