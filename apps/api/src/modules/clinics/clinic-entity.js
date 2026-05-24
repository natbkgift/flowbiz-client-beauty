function toPublicClinic(row) {
  return {
    id: row.clinic_id || row.id,
    name: row.clinic_name || row.name,
    slug: row.clinic_slug || row.slug,
    plan: row.clinic_plan || row.plan,
    status: row.clinic_status || row.status,
    timezone: row.clinic_timezone || row.timezone,
    locale: row.clinic_locale || row.locale || 'th-TH',
    brandingJson: row.clinic_branding_json || row.branding_json || {},
    settingsJson: row.clinic_settings_json || row.settings_json || {},
    createdAt: row.clinic_created_at || row.created_at,
    updatedAt: row.clinic_updated_at || row.updated_at
  };
}

module.exports = {
  toPublicClinic
};