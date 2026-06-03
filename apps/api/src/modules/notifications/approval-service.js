'use strict';

const { getPool } = require('../../db');
const { AppError } = require('../../common/errors');
const { recordAuditLog } = require('../audit/service');
const { getAdminNotificationDraft } = require('./service');
const {
  mapNotificationApprovalRequestRow,
  mapNotificationApprovalStatus
} = require('./approval-serializer');

function normalizePositiveInteger(value, fieldName) {
  const stringValue = String(value);
  if (!/^\d+$/.test(stringValue)) {
    throw new AppError(400, 'INVALID_NOTIFICATION_DRAFT_QUERY', `${fieldName} must be a positive integer.`);
  }
  const parsed = Number.parseInt(stringValue, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError(400, 'INVALID_NOTIFICATION_DRAFT_QUERY', `${fieldName} must be a positive integer.`);
  }
  return parsed;
}

function trimNote(value, fieldName) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new AppError(400, 'INVALID_NOTIFICATION_APPROVAL_DECISION', `${fieldName} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > 1000 ? trimmed.slice(0, 1000) : trimmed;
}

function buildApprovalIdempotencyKey(draft, input = {}) {
  if (input.idempotencyKey !== undefined && input.idempotencyKey !== null && String(input.idempotencyKey).trim()) {
    return String(input.idempotencyKey).trim().slice(0, 240);
  }

  return [
    `tenant:${draft.tenantId}`,
    `notification_draft:${draft.id}`,
    'approval_request:v1'
  ].join(':');
}

async function auditApprovalEvent(client, actionType, approval, context, extra = {}) {
  await recordAuditLog({
    clinicId: approval.tenantId,
    entityType: 'notification_approval_request',
    entityId: approval.id,
    actionType,
    actorUserId: context.currentUser?.id || null,
    contextJson: {
      clinic_id: approval.tenantId,
      draft_id: approval.draftId,
      approval_request_id: approval.id,
      status: approval.status,
      has_requested_note: Boolean(approval.requestedNote),
      has_decision_note: Boolean(approval.decisionNote),
      ...extra
    }
  }, client);
}

async function getLatestApprovalForDraft(client, clinicId, draftId) {
  const result = await client.query(
    `
      select *
      from notification_approval_requests
      where clinic_id = $1 and draft_id = $2
      order by created_at desc, id desc
      limit 1
    `,
    [clinicId, draftId]
  );

  return mapNotificationApprovalRequestRow(result.rows[0]);
}

async function getPendingApprovalForDraft(client, clinicId, draftId) {
  const result = await client.query(
    `
      select *
      from notification_approval_requests
      where clinic_id = $1 and draft_id = $2 and status = 'pending'
      order by created_at desc, id desc
      limit 1
    `,
    [clinicId, draftId]
  );

  return mapNotificationApprovalRequestRow(result.rows[0]);
}

async function loadApprovalById(client, context, approvalId) {
  const normalizedId = normalizePositiveInteger(approvalId, 'approvalId');
  const result = await client.query(
    `
      select *
      from notification_approval_requests
      where clinic_id = $1 and id = $2
      limit 1
    `,
    [context.currentClinic.id, normalizedId]
  );

  if (result.rowCount === 0) {
    throw new AppError(404, 'NOTIFICATION_APPROVAL_NOT_FOUND', 'Notification approval request not found.');
  }

  return mapNotificationApprovalRequestRow(result.rows[0]);
}

async function requestNotificationApproval(context, draftId, input = {}, client = getPool()) {
  const draft = await getAdminNotificationDraft(context, draftId, client);
  const pending = await getPendingApprovalForDraft(client, draft.tenantId, draft.id);

  if (pending) {
    return pending;
  }

  const idempotencyKey = buildApprovalIdempotencyKey(draft, input);
  let insertResult;
  try {
    insertResult = await client.query(
      `
        insert into notification_approval_requests (
          clinic_id,
          draft_id,
          status,
          requested_by_user_id,
          requested_note,
          idempotency_key
        )
        values ($1, $2, 'pending', $3, $4, $5)
        on conflict (idempotency_key) do nothing
        returning *
      `,
      [
        draft.tenantId,
        draft.id,
        context.currentUser?.id || null,
        trimNote(input.note ?? input.requestedNote, 'note'),
        idempotencyKey
      ]
    );
  } catch (error) {
    if (error.code !== '23505') {
      throw error;
    }

    const existing = await getPendingApprovalForDraft(client, draft.tenantId, draft.id);
    if (existing) return existing;
    throw new AppError(409, 'NOTIFICATION_APPROVAL_ALREADY_EXISTS', 'Notification approval request already exists.');
  }

  if (insertResult.rowCount === 0) {
    const existing = await getPendingApprovalForDraft(client, draft.tenantId, draft.id);
    if (existing) return existing;
    throw new AppError(409, 'NOTIFICATION_APPROVAL_ALREADY_EXISTS', 'Notification approval request already exists.');
  }

  const approval = mapNotificationApprovalRequestRow(insertResult.rows[0]);
  await auditApprovalEvent(client, 'notification.approval_requested', approval, context);
  return approval;
}

async function decideNotificationApproval(context, approvalId, status, input = {}, client = getPool()) {
  if (!['approved', 'rejected', 'cancelled'].includes(status)) {
    throw new AppError(400, 'INVALID_NOTIFICATION_APPROVAL_DECISION', 'Invalid notification approval decision.');
  }

  const approval = await loadApprovalById(client, context, approvalId);
  if (approval.status !== 'pending') {
    throw new AppError(409, 'NOTIFICATION_APPROVAL_NOT_PENDING', 'Notification approval request is not pending.');
  }

  const result = await client.query(
    `
      update notification_approval_requests
      set status = $1,
          decided_by_user_id = $2,
          decision_note = $3,
          decided_at = now(),
          updated_at = now()
      where clinic_id = $4 and id = $5 and status = 'pending'
      returning *
    `,
    [
      status,
      context.currentUser?.id || null,
      trimNote(input.note ?? input.decisionNote, 'note'),
      context.currentClinic.id,
      approval.id
    ]
  );

  if (result.rowCount === 0) {
    throw new AppError(409, 'NOTIFICATION_APPROVAL_NOT_PENDING', 'Notification approval request is not pending.');
  }

  const updated = mapNotificationApprovalRequestRow(result.rows[0]);
  const actionType = status === 'approved'
    ? 'notification.approved'
    : status === 'rejected'
      ? 'notification.rejected'
      : 'notification.cancelled';
  await auditApprovalEvent(client, actionType, updated, context);
  return updated;
}

async function approveNotificationDraft(context, approvalId, input = {}, client = getPool()) {
  return decideNotificationApproval(context, approvalId, 'approved', input, client);
}

async function rejectNotificationDraft(context, approvalId, input = {}, client = getPool()) {
  return decideNotificationApproval(context, approvalId, 'rejected', input, client);
}

async function cancelNotificationApproval(context, approvalId, input = {}, client = getPool()) {
  return decideNotificationApproval(context, approvalId, 'cancelled', input, client);
}

async function getNotificationApprovalStatus(context, draftId, client = getPool()) {
  const draft = await getAdminNotificationDraft(context, draftId, client);
  const approval = await getLatestApprovalForDraft(client, draft.tenantId, draft.id);
  return {
    draftId: draft.id,
    ...mapNotificationApprovalStatus(approval)
  };
}

module.exports = {
  approveNotificationDraft,
  cancelNotificationApproval,
  getNotificationApprovalStatus,
  rejectNotificationDraft,
  requestNotificationApproval
};
