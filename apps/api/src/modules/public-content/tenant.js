const { AppError } = require('../../common/errors');
const { resolvePublicClinicBySlug } = require('./clinic-resolver');

/**
 * Resolve a public clinic ID from a URL object.
 *
 * Resolution priority:
 *   1. clinicId query param  →  parse and validate as integer (legacy behavior, preserved)
 *   2. clinicSlug query param → resolve slug to ID via DB (new additive behavior)
 *   3. Neither provided      →  throw PUBLIC_CLINIC_REQUIRED (existing behavior)
 *
 * IMPORTANT: This function is now async because slug resolution requires a DB query.
 * All callers (blog/routes.js, forum/routes.js) must await it.
 */
async function resolvePublicClinicId(url) {
  // 1. Legacy: clinicId query param
  const rawClinicId = url.searchParams.get('clinicId');
  if (rawClinicId !== null) {
    const clinicId = Number.parseInt(rawClinicId, 10);
    if (!Number.isInteger(clinicId) || clinicId <= 0) {
      throw new AppError(400, 'PUBLIC_CLINIC_REQUIRED', 'clinicId is required for public content requests.');
    }
    return clinicId;
  }

  // 2. New: clinicSlug query param
  const rawClinicSlug = url.searchParams.get('clinicSlug');
  if (rawClinicSlug !== null) {
    return resolvePublicClinicIdFromSlug(rawClinicSlug);
  }

  // 3. Neither provided
  throw new AppError(400, 'PUBLIC_CLINIC_REQUIRED', 'clinicId is required for public content requests.');
}

/**
 * Resolve a clinic ID from a slug string, throwing AppError(400) if
 * the slug is invalid, reserved, or the clinic is not active.
 *
 * Note: The public tenant helper uses 400 for missing context rather than 404,
 * because this is a developer-facing helper (blog/forum routes), not the
 * primary public resolver endpoint (which uses 404 via getPublicClinicBySlug).
 */
async function resolvePublicClinicIdFromSlug(slug) {
  const clinic = await resolvePublicClinicBySlug(slug);
  if (!clinic) {
    throw new AppError(400, 'PUBLIC_CLINIC_REQUIRED', 'Clinic not found for the given slug.');
  }
  if (clinic.status !== 'active') {
    throw new AppError(400, 'PUBLIC_CLINIC_REQUIRED', 'Clinic is not active.');
  }
  return Number(clinic.id);
}

/**
 * Resolve a public clinic context object from a URL.
 * Returns { currentClinic: { id: <Number> } }.
 *
 * This function is now async because resolvePublicClinicId may require a DB query.
 */
async function resolvePublicClinicContext(url) {
  return {
    currentClinic: {
      id: await resolvePublicClinicId(url)
    }
  };
}

module.exports = {
  resolvePublicClinicId,
  resolvePublicClinicIdFromSlug,
  resolvePublicClinicContext
};
