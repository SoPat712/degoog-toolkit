export const DEFAULT_SCOPES = "openid profile email";
export const DEFAULT_GROUPS_SCOPE = "groups";
export const DEFAULT_GROUPS_CLAIM = "groups";
export const DEFAULT_ROLES_CLAIM = "roles";

const asStr = (v) => (typeof v === "string" ? v : v == null ? "" : String(v));
const asBool = (v) => v === true || v === "true";

const asList = (v, key) => {
  let source = v;
  if (typeof source === "string") {
    const trimmed = source.trim();
    if (trimmed.startsWith("[")) {
      try {
        source = JSON.parse(trimmed);
      } catch {
        source = trimmed;
      }
    }
  }
  if (Array.isArray(source)) {
    return source
      .map((x) => {
        if (x && typeof x === "object") return asStr(x[key]).trim();
        return asStr(x).trim();
      })
      .filter(Boolean);
  }
  return asStr(source).split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
};

const asPairs = (v) => {
  let source = v;
  if (typeof source === "string") {
    const trimmed = source.trim();
    if (trimmed.startsWith("[")) {
      try {
        source = JSON.parse(trimmed);
      } catch {
        source = [];
      }
    }
  }
  if (!Array.isArray(source)) return [];
  return source
    .map((row) => ({
      claim: asStr(row?.claim).trim(),
      value: asStr(row?.value).trim(),
    }))
    .filter((row) => row.claim && row.value);
};

export const parseSettings = (raw = {}) => ({
  useAsSettingsGate: asBool(raw.useAsSettingsGate),
  issuer: asStr(raw.issuer).trim().replace(/\/+$/, ""),
  clientId: asStr(raw.clientId).trim(),
  clientSecret: asStr(raw.clientSecret),
  appUrl: asStr(raw.appUrl).trim().replace(/\/+$/, ""),
  providerLabel: asStr(raw.providerLabel).trim() || "OIDC",
  autoRedirect: raw.autoRedirect !== false && raw.autoRedirect !== "false",
  scopes: asStr(raw.scopes).trim() || DEFAULT_SCOPES,
  groupsScope: asStr(raw.groupsScope).trim() || DEFAULT_GROUPS_SCOPE,
  groupsClaim: asStr(raw.groupsClaim).trim() || DEFAULT_GROUPS_CLAIM,
  rolesClaim: asStr(raw.rolesClaim).trim() || DEFAULT_ROLES_CLAIM,
  allowAnyAuthenticatedUser: asBool(raw.allowAnyAuthenticatedUser),
  requireVerifiedEmail: raw.requireVerifiedEmail !== false && raw.requireVerifiedEmail !== "false",
  allowedEmails: asList(raw.allowedEmails, "email").map((value) => value.toLowerCase()),
  allowedDomains: asList(raw.allowedDomains, "domain").map((value) =>
    value.replace(/^@+/, "").toLowerCase(),
  ),
  allowedGroups: asList(raw.allowedGroups, "group"),
  allowedRoles: asList(raw.allowedRoles, "role"),
  requiredClaims: asPairs(raw.requiredClaims),
  cookieSecret: asStr(raw.cookieSecret),
  debug: asBool(raw.debug),
});

export const hasAdminRule = (config) =>
  !!(
    config &&
    (
      config.allowAnyAuthenticatedUser ||
      config.allowedEmails.length > 0 ||
      config.allowedDomains.length > 0 ||
      config.allowedGroups.length > 0 ||
      config.allowedRoles.length > 0
    )
  );

export const isConfigured = (config) =>
  !!(config && config.issuer && config.clientId && hasAdminRule(config));

export const settingsSchema = [
  {
    key: "intro",
    label: "Provider redirect URI",
    type: "info",
    default: "<App URL>/api/settings/auth/callback",
    description:
      "Register this exact callback URL at your OIDC provider. If App URL is blank, the plugin derives the base URL from the request used to open /settings or /admin.",
  },
  {
    key: "issuer",
    label: "Issuer URL",
    type: "url",
    required: true,
    placeholder: "https://auth.example.com/application/o/degoog/",
    description:
      "Your OpenID Connect issuer. The `.well-known/openid-configuration` document is discovered automatically.",
  },
  {
    key: "clientId",
    label: "Client ID",
    type: "text",
    required: true,
    description: "The client ID registered with your provider.",
  },
  {
    key: "clientSecret",
    label: "Client Secret",
    type: "password",
    secret: true,
    description:
      "Confidential clients (recommended) send this alongside PKCE. Leave blank only for public clients.",
  },
  {
    key: "providerLabel",
    label: "Provider label",
    type: "text",
    placeholder: "Authentik",
    description: "Shown on the gate page button as 'Sign in with X'.",
  },
  {
    key: "appUrl",
    label: "App URL",
    type: "url",
    placeholder: "https://search.example.com",
    description:
      "External base URL used to build the redirect URI. Leave blank to derive it from the request. Set this when running behind a reverse proxy or on a subpath. Register `<App URL>/api/settings/auth/callback` as the redirect URI at your provider.",
  },
  {
    key: "autoRedirect",
    label: "Auto redirect to provider",
    type: "toggle",
    default: true,
    description:
      "When enabled, opening /settings or /admin immediately redirects to the OIDC provider instead of showing a local sign-in button.",
  },
  {
    key: "scopes",
    label: "Scopes",
    type: "text",
    placeholder: DEFAULT_SCOPES,
    description: "Space separated scopes. Defaults to `openid profile email`.",
  },
  {
    key: "allowAnyAuthenticatedUser",
    label: "Allow any authenticated user",
    type: "toggle",
    default: false,
    description:
      "Disabled by default for safety. Turn this on only if you intentionally want every successful OIDC login to unlock admin/settings access.",
  },
  {
    key: "allowedEmails",
    label: "Allowed emails",
    type: "list",
    addLabel: "+ Add email",
    itemSchema: [
      { key: "email", label: "Email", type: "text", placeholder: "admin@example.com" },
    ],
    description:
      "Optional allowlist. When set, only these email addresses may unlock settings.",
  },
  {
    key: "allowedDomains",
    label: "Allowed email domains",
    type: "list",
    addLabel: "+ Add domain",
    itemSchema: [
      { key: "domain", label: "Domain", type: "text", placeholder: "example.com" },
    ],
    description:
      "Optional domain allowlist. Matches the domain portion of a verified email address.",
  },
  {
    key: "requireVerifiedEmail",
    label: "Require verified email",
    type: "toggle",
    default: true,
    description:
      "Recommended. Email and domain allow rules only pass when the provider marks the email as verified.",
  },
  {
    key: "allowedGroups",
    label: "Allowed groups",
    type: "list",
    addLabel: "+ Add group",
    itemSchema: [
      { key: "group", label: "Group", type: "text", placeholder: "admins" },
    ],
    description:
      "Optional allowlist. Requires your provider to send a `groups` claim.",
  },
  {
    key: "groupsClaim",
    label: "Groups claim path",
    type: "text",
    placeholder: DEFAULT_GROUPS_CLAIM,
    description:
      "Dot-path to the group claim. Examples: `groups` or `realm_access.roles`.",
  },
  {
    key: "allowedRoles",
    label: "Allowed roles",
    type: "list",
    addLabel: "+ Add role",
    itemSchema: [
      { key: "role", label: "Role", type: "text", placeholder: "admin" },
    ],
    description:
      "Optional allowlist. Requires your provider to send a `roles` claim.",
  },
  {
    key: "rolesClaim",
    label: "Roles claim path",
    type: "text",
    placeholder: DEFAULT_ROLES_CLAIM,
    description:
      "Dot-path to the role claim. Examples: `roles` or `resource_access.search.roles`.",
  },
  {
    key: "requiredClaims",
    label: "Required claims",
    type: "list",
    addLabel: "+ Add required claim",
    description:
      "Optional exact-match claim requirements. Every listed claim must match.",
    itemSchema: [
      { key: "claim", label: "Claim path", type: "text", placeholder: "tenant.id" },
      { key: "value", label: "Expected value", type: "text", placeholder: "prod" },
    ],
  },
  {
    key: "groupsScope",
    label: "Groups scope",
    type: "text",
    placeholder: DEFAULT_GROUPS_SCOPE,
    description:
      "Extra scope requested when an allowed-groups list is set. Set to `no` to disable.",
  },
  {
    key: "cookieSecret",
    label: "Avatar cookie secret",
    type: "password",
    secret: true,
    description:
      "Optional. Signs the home-page avatar session. Set a stable value to keep avatars signed in across restarts or multiple instances. A random per-process secret is used when blank.",
  },
  {
    key: "debug",
    label: "Debug logging",
    type: "toggle",
    description: "Log OIDC flow details to the server console.",
  },
];
