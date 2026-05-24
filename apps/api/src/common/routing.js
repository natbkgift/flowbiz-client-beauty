function matchPath(pathname, template) {
  const pathSegments = pathname.split('/').filter(Boolean);
  const templateSegments = template.split('/').filter(Boolean);

  if (pathSegments.length !== templateSegments.length) {
    return null;
  }

  const params = {};

  for (let index = 0; index < templateSegments.length; index += 1) {
    const currentTemplate = templateSegments[index];
    const currentPath = pathSegments[index];

    if (currentTemplate.startsWith(':')) {
      params[currentTemplate.slice(1)] = currentPath;
      continue;
    }

    if (currentTemplate !== currentPath) {
      return null;
    }
  }

  return params;
}

module.exports = {
  matchPath
};