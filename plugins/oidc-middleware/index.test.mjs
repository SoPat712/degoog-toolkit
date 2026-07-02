import assert from "node:assert/strict";
import test from "node:test";

import {
  accessDenyDetail,
  evaluateAccess,
  isAllowed,
  readClaim,
  toProfile,
} from "./src/authz.js";
import { avatarCacheKey } from "./src/avatar.js";
import {
  adminRoutePath,
  isLegacySettingsPath,
  legacySettingsPath,
  mapLegacyPathToAdmin,
  shouldAliasSettingsToAdmin,
  targetsAdminRoute,
} from "./src/admin-path.js";
import { userinfoNeeds } from "./src/gate.js";
import { chooseReturnTo, sanitizeReturnTo } from "./src/return-to.js";
import { parseSettings, isConfigured } from "./src/settings.js";
import { validateClaims } from "./src/jwt.js";

test("settings require an explicit admin rule unless any-user is enabled", () => {
  const lockedDown = parseSettings({
    issuer: "https://auth.example.com/application/o/degoog/",
    clientId: "degoog-admin",
  });
  const anyUser = parseSettings({
    issuer: "https://auth.example.com/application/o/degoog/",
    clientId: "degoog-admin",
    allowAnyAuthenticatedUser: true,
  });
  const allowEmail = parseSettings({
    issuer: "https://auth.example.com/application/o/degoog/",
    clientId: "degoog-admin",
    allowedEmails: JSON.stringify([{ email: "admin@example.com" }]),
  });

  assert.equal(isConfigured(lockedDown), false);
  assert.equal(isConfigured(anyUser), true);
  assert.equal(isConfigured(allowEmail), true);
  assert.equal(
    parseSettings({ useAsSettingsGate: "true" }).useAsSettingsGate,
    true,
  );
  assert.equal(parseSettings({ debug: "true" }).debug, true);
});

test("authorization supports verified email domains, group paths, role paths, and required claims", () => {
  const config = parseSettings({
    allowedDomains: JSON.stringify([{ domain: "example.com" }]),
    allowedGroups: JSON.stringify([{ group: "degoog-admins" }]),
    groupsClaim: "realm_access.roles",
    allowedRoles: JSON.stringify([{ role: "platform-admin" }]),
    rolesClaim: "resource_access.search.roles",
    requiredClaims: JSON.stringify([{ claim: "tenant.id", value: "prod" }]),
    requireVerifiedEmail: true,
  });

  assert.equal(
    isAllowed(config, {
      email: "admin@example.com",
      email_verified: true,
      realm_access: { roles: ["degoog-admins"] },
      resource_access: { search: { roles: ["platform-admin"] } },
      tenant: { id: "prod" },
    }),
    true,
  );
  const domainOnlyConfig = parseSettings({
    allowedDomains: JSON.stringify([{ domain: "example.com" }]),
    requireVerifiedEmail: true,
  });
  assert.equal(
    isAllowed(domainOnlyConfig, {
      email: "admin@example.com",
      email_verified: false,
    }),
    false,
  );
  const denied = evaluateAccess(domainOnlyConfig, {
    email: "admin@example.com",
    email_verified: false,
  });
  assert.equal(denied.allowed, false);
  assert.equal(denied.emailVerified, false);
  assert.equal(denied.domainMatch, false);
  assert.equal(denied.selectorConfigured, true);
  assert.equal(accessDenyDetail(denied), "email-not-verified");
});

test("claim path reader supports nested objects and arrays", () => {
  const claims = {
    realm_access: { roles: ["viewer", "admin"] },
    resource_access: { search: { roles: ["owner"] } },
  };

  assert.equal(readClaim(claims, "realm_access.roles.1"), "admin");
  assert.deepEqual(readClaim(claims, "resource_access.search.roles"), ["owner"]);
});

test("userinfo fetch is requested when only the profile picture is missing", () => {
  const config = parseSettings({
    issuer: "https://auth.example.com/application/o/degoog/",
    clientId: "degoog-admin",
    allowAnyAuthenticatedUser: true,
  });

  assert.equal(
    userinfoNeeds(config, {
      sub: "123",
      email: "admin@example.com",
      name: "Admin",
    }).needed,
    true,
  );
  assert.equal(
    userinfoNeeds(config, {
      sub: "123",
      email: "admin@example.com",
      name: "Admin",
      picture: "https://auth.example.com/avatar.png",
    }).needed,
    false,
  );
  assert.equal(
    userinfoNeeds(config, {
      sub: "123",
      email: "admin@example.com",
      name: "Admin",
      avatar_url: "https://auth.example.com/avatar-alt.png",
    }).needed,
    false,
  );
});

test("profile pictures are sanitized to safe URL schemes", () => {
  assert.equal(
    toProfile({
      sub: "123",
      email: "admin@example.com",
      picture: "https://auth.example.com/avatar.png",
    }).picture,
    "https://auth.example.com/avatar.png",
  );
  assert.equal(
    toProfile({
      sub: "123",
      email: "admin@example.com",
      picture: "javascript:alert(1)",
    }).picture,
    "",
  );
  assert.equal(
    toProfile({
      sub: "123",
      iss: "https://auth.example.com/application/o/degoog/",
      email: "admin@example.com",
      picture: "/media/avatar.png",
    }).picture,
    "https://auth.example.com/media/avatar.png",
  );
  assert.equal(
    toProfile({
      sub: "123",
      email: "admin@example.com",
      avatar_url: "https://auth.example.com/avatar-alt.png",
    }).picture,
    "https://auth.example.com/avatar-alt.png",
  );
  assert.equal(
    toProfile(
      {
        sub: "123",
        email: "admin@example.com",
        profile: { avatar: "https://auth.example.com/avatar-nested.png" },
      },
      parseSettings({ pictureClaim: "profile.avatar" }),
    ).picture,
    "https://auth.example.com/avatar-nested.png",
  );
  assert.equal(
    toProfile({
      sub: "123",
      email: "admin@example.com",
      avatarUrl: "https://auth.example.com/avatar-camel.png",
    }).picture,
    "https://auth.example.com/avatar-camel.png",
  );
});

test("return target resolution keeps same-origin custom admin paths", () => {
  assert.equal(
    sanitizeReturnTo(
      "https://search.example.com",
      "https://search.example.com/my-secret-panel-abc123/plugins",
      "/",
    ),
    "/my-secret-panel-abc123/plugins",
  );
  assert.equal(
    chooseReturnTo(
      "https://search.example.com",
      [
        "https://evil.example.com/admin",
        "https://search.example.com/my-secret-panel-abc123",
      ],
      "/",
    ),
    "/my-secret-panel-abc123",
  );
});

test("avatar cache keys are stable for the same identity", () => {
  const identity = {
    sub: "123",
    email: "admin@example.com",
    picture: "https://auth.example.com/media/avatar.png",
  };
  assert.equal(avatarCacheKey(identity), avatarCacheKey(identity));
  assert.notEqual(
    avatarCacheKey(identity),
    avatarCacheKey({ ...identity, picture: "https://auth.example.com/media/avatar-2.png" }),
  );
});

test("admin path helpers only gate the configured admin route", () => {
  const oldPublic = process.env.DEGOOG_PUBLIC_INSTANCE;
  const oldPath = process.env.DEGOOG_SETTINGS_PATH;
  process.env.DEGOOG_PUBLIC_INSTANCE = "true";
  process.env.DEGOOG_SETTINGS_PATH = "my-secret-panel-abc123";

  try {
    const adminPath = adminRoutePath({
      url: "https://search.example.com/api/settings/auth",
    });
    assert.equal(adminPath, "/my-secret-panel-abc123");
    assert.equal(targetsAdminRoute("/my-secret-panel-abc123", adminPath), true);
    assert.equal(targetsAdminRoute("/my-secret-panel-abc123/plugins", adminPath), true);
    assert.equal(targetsAdminRoute("/", adminPath), false);
    assert.equal(targetsAdminRoute("/settings", adminPath), false);
  } finally {
    if (oldPublic == null) delete process.env.DEGOOG_PUBLIC_INSTANCE;
    else process.env.DEGOOG_PUBLIC_INSTANCE = oldPublic;
    if (oldPath == null) delete process.env.DEGOOG_SETTINGS_PATH;
    else process.env.DEGOOG_SETTINGS_PATH = oldPath;
  }
});

test("legacy /settings aliases to admin on public instances", () => {
  const oldPublic = process.env.DEGOOG_PUBLIC_INSTANCE;
  const oldPath = process.env.DEGOOG_SETTINGS_PATH;
  process.env.DEGOOG_PUBLIC_INSTANCE = "true";
  delete process.env.DEGOOG_SETTINGS_PATH;

  const req = { url: "https://dg.joshpatra.me/api/settings/auth" };

  try {
    assert.equal(adminRoutePath(req), "/admin");
    assert.equal(legacySettingsPath(req), "/settings");
    assert.equal(shouldAliasSettingsToAdmin(req), true);
    assert.equal(isLegacySettingsPath("/settings", req), true);
    assert.equal(isLegacySettingsPath("/settings/engines", req), true);
    assert.equal(isLegacySettingsPath("/admin", req), false);
    assert.equal(mapLegacyPathToAdmin("/settings", req), "/admin");
    assert.equal(mapLegacyPathToAdmin("/settings/engines", req), "/admin/engines");
  } finally {
    if (oldPublic == null) delete process.env.DEGOOG_PUBLIC_INSTANCE;
    else process.env.DEGOOG_PUBLIC_INSTANCE = oldPublic;
    if (oldPath == null) delete process.env.DEGOOG_SETTINGS_PATH;
    else process.env.DEGOOG_SETTINGS_PATH = oldPath;
  }
});

test("jwt claim validation rejects bad azp and future iat", () => {
  assert.throws(
    () =>
      validateClaims(
        {
          iss: "https://auth.example.com",
          aud: ["degoog-admin", "other-client"],
          azp: "wrong-client",
          exp: Math.floor(Date.now() / 1000) + 300,
          iat: Math.floor(Date.now() / 1000) - 10,
          nonce: "nonce-123",
        },
        {
          issuer: "https://auth.example.com",
          clientId: "degoog-admin",
          nonce: "nonce-123",
        },
      ),
    /azp mismatch/i,
  );

  assert.throws(
    () =>
      validateClaims(
        {
          iss: "https://auth.example.com",
          aud: "degoog-admin",
          exp: Math.floor(Date.now() / 1000) + 300,
          iat: Math.floor(Date.now() / 1000) + 120,
          nonce: "nonce-123",
        },
        {
          issuer: "https://auth.example.com",
          clientId: "degoog-admin",
          nonce: "nonce-123",
        },
      ),
    /future/i,
  );
});
