'use strict';

function mapNotificationDraftRow(row) {
  return {
    id: row.id ? Number(row.id) : undefined,
    tenantId: row.clinic_id ? Number(row.clinic_id) : undefined,
    eventType: row.event_type,
    recipientType: row.recipient_type,
    recipientId: row.recipient_id === null || row.recipient_id === undefined ? null : Number(row.recipient_id),
    recipientRef: row.recipient_ref,
    channel: row.channel,
    title: row.title,
    subject: row.subject,
    message: row.message,
    status: row.status,
    sourceType: row.source_type,
    sourceId: row.source_id,
    idempotencyKey: row.idempotency_key,
    metadata: row.metadata_json || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

module.exports = {
  mapNotificationDraftRow
};
