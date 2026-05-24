function toPublicOrganization(row) {
  if (!row.organization_id && !row.id) {
    return null;
  }

  return {
    id: row.organization_id || row.id,
    clinicId: row.organization_clinic_id || row.clinic_id,
    name: row.organization_name || row.name,
    slug: row.organization_slug || row.slug,
    status: row.organization_status || row.status,
    timezone: row.organization_timezone || row.timezone || 'Asia/Bangkok',
    settingsJson: row.organization_settings_json || row.settings_json || {},
    createdAt: row.organization_created_at || row.created_at,
    updatedAt: row.organization_updated_at || row.updated_at
  };
}

module.exports = {
  toPublicOrganization
};