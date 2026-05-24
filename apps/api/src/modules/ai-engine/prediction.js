const { getPool } = require('../../db');
const { validateEntityId } = require('../ai/validation');
const { extractLeadFeatures, extractCustomerFeatures } = require('./feature_extractor');
const { predictLeadConversion, predictCustomerChurn } = require('./decision_engine');

function mapPrediction(row) {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    predictionType: row.prediction_type,
    score: Number(row.score),
    nextBestAction: row.next_best_action,
    detailJson: row.detail_json,
    generatedAt: row.generated_at
  };
}

async function upsertFeatureVector(clinicId, entityType, entityId, features, client = getPool()) {
  await client.query(
    `
      insert into ai_feature_vectors (clinic_id, entity_type, entity_id, feature_json, generated_at)
      values ($1, $2, $3, $4::jsonb, now())
      on conflict (clinic_id, entity_type, entity_id)
      do update set feature_json = excluded.feature_json, generated_at = excluded.generated_at
    `,
    [clinicId, entityType, entityId, JSON.stringify(features)]
  );
}

async function upsertPrediction(clinicId, entityType, entityId, prediction, client = getPool()) {
  const result = await client.query(
    `
      insert into ai_predictions (clinic_id, entity_type, entity_id, prediction_type, score, next_best_action, detail_json, generated_at)
      values ($1, $2, $3, $4, $5, $6, $7::jsonb, now())
      on conflict (clinic_id, entity_type, entity_id, prediction_type)
      do update set
        score = excluded.score,
        next_best_action = excluded.next_best_action,
        detail_json = excluded.detail_json,
        generated_at = excluded.generated_at
      returning *
    `,
    [clinicId, entityType, entityId, prediction.predictionType, prediction.score, prediction.nextBestAction, JSON.stringify(prediction.detailJson)]
  );

  return mapPrediction(result.rows[0]);
}

async function generateLeadPrediction(clinicContext, leadId) {
  const normalizedLeadId = validateEntityId(leadId, 'leadId');
  const features = await extractLeadFeatures(clinicContext.currentClinic.id, normalizedLeadId);
  await upsertFeatureVector(clinicContext.currentClinic.id, 'lead', normalizedLeadId, features);
  return upsertPrediction(clinicContext.currentClinic.id, 'lead', normalizedLeadId, predictLeadConversion(features));
}

async function generateCustomerPrediction(clinicContext, customerId) {
  const normalizedCustomerId = validateEntityId(customerId, 'customerId');
  const features = await extractCustomerFeatures(clinicContext.currentClinic.id, normalizedCustomerId);
  await upsertFeatureVector(clinicContext.currentClinic.id, 'customer', normalizedCustomerId, features);
  return upsertPrediction(clinicContext.currentClinic.id, 'customer', normalizedCustomerId, predictCustomerChurn(features));
}

async function getLeadPrediction(clinicContext, leadId) {
  return generateLeadPrediction(clinicContext, leadId);
}

async function getCustomerPrediction(clinicContext, customerId) {
  return generateCustomerPrediction(clinicContext, customerId);
}

module.exports = {
  getLeadPrediction,
  getCustomerPrediction,
  generateLeadPrediction,
  generateCustomerPrediction,
  upsertFeatureVector,
  upsertPrediction
};