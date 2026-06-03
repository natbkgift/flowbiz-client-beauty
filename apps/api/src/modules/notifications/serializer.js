'use strict';

function mapNotificationDraftRow(row) {
  const draft = {
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

  if (Object.prototype.hasOwnProperty.call(row, 'approval_request_id')) {
    draft.approvalStatus = row.approval_status || 'none';
    draft.approval = row.approval_request_id
      ? {
        id: Number(row.approval_request_id),
        tenantId: Number(row.approval_clinic_id),
        draftId: Number(row.approval_draft_id),
        status: row.approval_status,
        requestedByUserId: row.approval_requested_by_user_id === null || row.approval_requested_by_user_id === undefined
          ? null
          : Number(row.approval_requested_by_user_id),
        decidedByUserId: row.approval_decided_by_user_id === null || row.approval_decided_by_user_id === undefined
          ? null
          : Number(row.approval_decided_by_user_id),
        requestedNote: row.approval_requested_note,
        decisionNote: row.approval_decision_note,
        idempotencyKey: row.approval_idempotency_key,
        requestedAt: row.approval_requested_at,
        decidedAt: row.approval_decided_at,
        createdAt: row.approval_created_at,
        updatedAt: row.approval_updated_at
      }
      : null;
  }

  return draft;
}

function mapNotificationDeliveryAttemptRow(row) {
  return {
    id: row.id ? Number(row.id) : undefined,
    tenantId: row.clinic_id ? Number(row.clinic_id) : undefined,
    draftId: row.draft_id ? Number(row.draft_id) : undefined,
    channel: row.channel,
    provider: row.provider,
    mode: row.mode,
    status: row.status,
    recipientType: row.recipient_type,
    recipientId: row.recipient_id === null || row.recipient_id === undefined ? null : Number(row.recipient_id),
    recipientRef: row.recipient_ref,
    payload: row.payload_json || {},
    result: row.result_json || {},
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

module.exports = {
  mapNotificationDraftRow,
  mapNotificationDeliveryAttemptRow
};
