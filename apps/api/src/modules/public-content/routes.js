const { matchPath } = require('../../common/routing');
const { AppError } = require('../../common/errors');
const { getPublicClinicBySlug } = require('./clinic-resolver');

/**
 * Handle public-content routes.
 *
 * Currently exposes:
 *   GET /public/clinics/:slug
 *
 * Returns clinic configuration, website settings, branding,
 * contact, location, and homepage sections for active clinics only.
 *
 * All slug validation, reserved-slug rejection, and inactive-clinic
 * gating is handled inside getPublicClinicBySlug, which always
 * responds with 404 CLINIC_NOT_FOUND for any non-renderable state.
 * This avoids leaking route policy to the public.
 */
async function handlePublicContentRoutes(request, response, url, tools) {
  const { json } = tools;

  // GET /public/clinics/:slug
  const slugParams = matchPath(url.pathname, '/public/clinics/:slug');
  if (slugParams && request.method === 'GET') {
    const data = await getPublicClinicBySlug(slugParams.slug);
    return json(response, 200, data);
  }

  return false;
}

module.exports = {
  handlePublicContentRoutes
};
