function toPublicWorkspace(row) {
  if (!row.workspace_id && !row.id) {
    return null;
  }

  return {
    id: row.workspace_id || row.id,
    clinicId: row.workspace_clinic_id || row.clinic_id,
    organizationId: row.workspace_organization_id || row.organization_id,
    name: row.workspace_name || row.name,
    slug: row.workspace_slug || row.slug,
    status: row.workspace_status || row.status,
    timezone: row.workspace_timezone || row.timezone || 'Asia/Bangkok',
    settingsJson: row.workspace_settings_json || row.settings_json || {},
    createdAt: row.workspace_created_at || row.created_at,
    updatedAt: row.workspace_updated_at || row.updated_at
  };
}

module.exports = {
  toPublicWorkspace
};