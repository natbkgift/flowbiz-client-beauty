const { AppError } = require('../../common/errors');

function resolvePublicClinicId(url) {
  const clinicId = Number.parseInt(url.searchParams.get('clinicId'), 10);

  if (!Number.isInteger(clinicId) || clinicId <= 0) {
    throw new AppError(400, 'PUBLIC_CLINIC_REQUIRED', 'clinicId is required for public content requests.');
  }

  return clinicId;
}

function resolvePublicClinicContext(url) {
  return {
    currentClinic: {
      id: resolvePublicClinicId(url)
    }
  };
}

module.exports = {
  resolvePublicClinicId,
  resolvePublicClinicContext
};
