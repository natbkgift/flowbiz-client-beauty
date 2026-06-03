'use strict';

function mapNotificationApprovalRequestRow(row) {
  if (!row) return null;

  return {
    id: row.id ? Number(row.id) : undefined,
    tenantId: row.clinic_id ? Number(row.clinic_id) : undefined,
    draftId: row.draft_id ? Number(row.draft_id) : undefined,
    status: row.status,
    requestedByUserId: row.requested_by_user_id === null || row.requested_by_user_id === undefined
      ? null
      : Number(row.requested_by_user_id),
    decidedByUserId: row.decided_by_user_id === null || row.decided_by_user_id === undefined
      ? null
      : Number(row.decided_by_user_id),
    requestedNote: row.requested_note,
    decisionNote: row.decision_note,
    idempotencyKey: row.idempotency_key,
    requestedAt: row.requested_at,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapNotificationApprovalStatus(row) {
  const approval = mapNotificationApprovalRequestRow(row);

  return {
    approvalStatus: approval?.status || 'none',
    approval
  };
}

module.exports = {
  mapNotificationApprovalRequestRow,
  mapNotificationApprovalStatus
};
