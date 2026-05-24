const { AppError } = require('../../common/errors');

function asIsoDate(value, fieldName) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(400, 'INVALID_QUERY', `${fieldName} must be a valid date.`);
  }

  return parsed.toISOString().slice(0, 10);
}

function parseMetricFilters(searchParams) {
  return {
    metricDate: asIsoDate(searchParams.get('metricDate'), 'metricDate') || new Date().toISOString().slice(0, 10),
    limit: Math.min(Number.parseInt(searchParams.get('limit') || '30', 10) || 30, 365)
  };
}

module.exports = {
  parseMetricFilters
};