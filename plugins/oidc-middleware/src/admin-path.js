const normalizePath = (value) => {
  const path = String(value || "").trim();
  if (!path) return "/";
  const withSlash = path.startsWith("/") ? path : `/${path}`;
  return withSlash === "/" ? withSlash : withSlash.replace(/\/+$/, "");
};

const envTruthy = (name) => {
  const value = String(process.env[name] || "").trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
};

const configuredAdminSegment = () => {
  const custom = String(process.env.DEGOOG_SETTINGS_PATH || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  if (custom) return custom;
  return envTruthy("DEGOOG_PUBLIC_INSTANCE") ? "admin" : "settings";
};

const basePathFromReq = (req) => {
  const pathname = new URL(req.url).pathname;
  return pathname.replace(/\/api\/settings\/auth(?:\/callback)?\/?$/, "");
};

export const adminRoutePath = (req) => {
  const pathname = new URL(req.url).pathname;
  const basePath = basePathFromReq(req);
  const prefix = basePath === pathname ? "" : basePath.replace(/\/+$/, "");
  return normalizePath(`${prefix}/${configuredAdminSegment()}`);
};

export const legacySettingsPath = (req) => {
  const pathname = new URL(req.url).pathname;
  const basePath = basePathFromReq(req);
  const prefix = basePath === pathname ? "" : basePath.replace(/\/+$/, "");
  return normalizePath(`${prefix}/settings`);
};

export const isLegacySettingsPath = (targetPath, req) => {
  const legacy = legacySettingsPath(req);
  const normalized = normalizePath(targetPath);
  return normalized === legacy || normalized.startsWith(`${legacy}/`);
};

export const mapLegacyPathToAdmin = (targetPath, req) => {
  const legacy = legacySettingsPath(req);
  const admin = adminRoutePath(req);
  const normalized = normalizePath(targetPath);
  if (normalized === legacy) return admin;
  if (normalized.startsWith(`${legacy}/`)) {
    return `${admin}${normalized.slice(legacy.length)}`;
  }
  return admin;
};

export const shouldAliasSettingsToAdmin = (req) => {
  const legacy = legacySettingsPath(req);
  const admin = adminRoutePath(req);
  return legacy !== admin;
};

export const targetsAdminRoute = (targetPath, adminPath) => {
  const normalizedTarget = normalizePath(targetPath);
  const normalizedAdmin = normalizePath(adminPath);
  return (
    normalizedTarget === normalizedAdmin ||
    normalizedTarget.startsWith(`${normalizedAdmin}/`)
  );
};
