function toPublicUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    status: row.status,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

module.exports = {
  toPublicUser
};