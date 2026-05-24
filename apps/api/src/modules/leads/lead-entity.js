function toLeadSummary(row) {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    source: row.source,
    sourceRef: row.source_ref,
    name: row.full_name,
    fullName: row.full_name,
    nickname: row.nickname,
    phone: row.phone,
    email: row.email,
    status: row.status,
    stage: row.stage,
    ownerUserId: row.owner_user_id,
    ownerName: row.owner_name || null,
    nextFollowupAt: row.next_followup_at,
    lastContactedAt: row.last_contacted_at,
    intentScore: row.intent_score,
    budgetRange: row.budget_range,
    preferredBranch: row.preferred_branch,
    notesSummary: row.notes_summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toLeadDetail(leadRow, related) {
  return {
    ...toLeadSummary(leadRow),
    lineUserId: leadRow.line_user_id,
    gender: leadRow.gender,
    birthDate: leadRow.birth_date,
    interests: related.interests,
    tags: related.tags,
    notes: related.notes,
    activityTimeline: related.activityTimeline
  };
}

module.exports = {
  toLeadSummary,
  toLeadDetail
};