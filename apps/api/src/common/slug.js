function toSlugParts(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function toSlug(value, fallback = 'item') {
  return toSlugParts(value) || fallback;
}

module.exports = {
  toSlug
};