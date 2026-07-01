import assert from "node:assert/strict";
import test from "node:test";

import { isAllowed, readClaim } from "./src/authz.js";
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
});

test("claim path reader supports nested objects and arrays", () => {
  const claims = {
    realm_access: { roles: ["viewer", "admin"] },
    resource_access: { search: { roles: ["owner"] } },
  };

  assert.equal(readClaim(claims, "realm_access.roles.1"), "admin");
  assert.deepEqual(readClaim(claims, "resource_access.search.roles"), ["owner"]);
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
