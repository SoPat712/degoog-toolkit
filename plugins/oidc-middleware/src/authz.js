const asArray = (v) =>
  Array.isArray(v)
    ? v.map(String)
    : typeof v === "string"
      ? v.split(/[\s,]+/).filter(Boolean)
      : [];

export const readClaim = (claims, path) =>
  String(path || "")
    .split(".")
    .filter(Boolean)
    .reduce((value, segment) => {
      if (value == null) return undefined;
      if (Array.isArray(value) && /^\d+$/.test(segment)) {
        return value[Number.parseInt(segment, 10)];
      }
      if (typeof value !== "object") return undefined;
      return value[segment];
    }, claims);

const matchesExpected = (actual, expected) => {
  if (Array.isArray(actual)) return actual.some((entry) => matchesExpected(entry, expected));
  if (actual == null) return false;
  return String(actual) === expected;
};

export const isAllowed = (config, claims) => {
  const email = typeof claims.email === "string" ? claims.email.toLowerCase() : "";
  const emailVerified =
    claims.email_verified === true ||
    String(claims.email_verified || "").toLowerCase() === "true";
  const emailUsable =
    email && (!config.requireVerifiedEmail || emailVerified);

  const exactEmailMatch = emailUsable && config.allowedEmails.includes(email);
  const domainMatch =
    emailUsable &&
    config.allowedDomains.includes((email.split("@")[1] || "").toLowerCase());
  const groupMatch = config.allowedGroups.some((group) =>
    asArray(readClaim(claims, config.groupsClaim)).includes(group),
  );
  const roleMatch = config.allowedRoles.some((role) =>
    asArray(readClaim(claims, config.rolesClaim)).includes(role),
  );
  const requiredClaimsMatch = config.requiredClaims.every(({ claim, value }) =>
    matchesExpected(readClaim(claims, claim), value),
  );

  const selectorConfigured =
    config.allowAnyAuthenticatedUser ||
    config.allowedEmails.length > 0 ||
    config.allowedDomains.length > 0 ||
    config.allowedGroups.length > 0 ||
    config.allowedRoles.length > 0;
  const selectorMatch =
    config.allowAnyAuthenticatedUser ||
    exactEmailMatch ||
    domainMatch ||
    groupMatch ||
    roleMatch;

  return selectorConfigured ? selectorMatch && requiredClaimsMatch : false;
};

export const toProfile = (claims) => {
  const email = typeof claims.email === "string" ? claims.email : "";
  const name =
    claims.name ||
    claims.preferred_username ||
    (email ? email.split("@")[0] : "") ||
    claims.sub ||
    "user";
  return {
    sub: claims.sub || "",
    email,
    name: String(name),
    picture: typeof claims.picture === "string" ? claims.picture : "",
  };
};
