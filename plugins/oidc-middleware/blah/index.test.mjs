import assert from "node:assert/strict";
import test from "node:test";

import command, { __test, middleware } from "./index.js";

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

test("runtime config requires an explicit admin authorization rule", () => {
  assert.throws(
    () =>
      __test.buildRuntimeConfig({
        appUrl: "https://search.example.com",
        issuer: "https://auth.example.com/application/o/degoog/",
        clientId: "degoog-admin",
        clientSecret: "secret",
        tokenEndpointAuthMethod: "client_secret_basic",
      }),
    /admin allow rule/i,
  );
});

test("command surface exposes gate toggle and full OIDC settings", () => {
  assert.equal(middleware.id, "oidc-settings-gate");
  assert.equal(command.name, "OIDC");
  assert.equal(command.trigger, "oidc");
  assert.equal(command.settingsSchema?.[0]?.key, "useAsSettingsGate");
  assert.equal(command.settingsSchema?.[1]?.key, "appUrl");
  assert.equal(middleware.settingsSchema?.[0]?.key, "appUrl");
});

test("runtime config accepts required claims as the sole admin rule", () => {
  const config = __test.buildRuntimeConfig({
    appUrl: "https://search.example.com",
    issuer: "https://auth.example.com/application/o/degoog/",
    clientId: "degoog-admin",
    clientSecret: "secret",
    tokenEndpointAuthMethod: "client_secret_basic",
    requiredClaims: JSON.stringify([{ claim: "sub", value: "abc123" }]),
  });

  assert.equal(config.requiredClaims.length, 1);
  assert.equal(config.publicBaseUrl, "https://search.example.com");
});

test("runtime config derives app URL from the request when unset", () => {
  const config = __test.buildRuntimeConfig(
    {
      issuer: "https://auth.example.com/application/o/degoog/",
      clientId: "degoog-admin",
      clientSecret: "secret",
      tokenEndpointAuthMethod: "client_secret_basic",
      allowedEmails: JSON.stringify([{ email: "admin@example.com" }]),
    },
    new Request("https://search.example.com/api/plugin/oidc-settings-gate/login"),
  );

  assert.equal(config.publicBaseUrl, "https://search.example.com");
});

test("returnTo sanitization rejects external origins", () => {
  const safe = __test.sanitizeReturnTo(
    "https://search.example.com/degoog",
    "https://evil.example.net/phish",
  );
  assert.equal(safe, "/degoog/settings");
});

test("returnTo sanitization keeps same-origin admin paths", () => {
  const safe = __test.sanitizeReturnTo(
    "https://search.example.com/degoog",
    "https://search.example.com/degoog/admin/plugins",
  );
  assert.equal(safe, "/degoog/admin/plugins");
});

test("authorization requires verified email for email allow rules by default", () => {
  const config = __test.buildRuntimeConfig({
    appUrl: "https://search.example.com",
    issuer: "https://auth.example.com/application/o/degoog/",
    clientId: "degoog-admin",
    clientSecret: "secret",
    tokenEndpointAuthMethod: "client_secret_basic",
    allowedEmails: "admin@example.com",
  });

  const denied = __test.authorizeClaims(config, {
    email: "admin@example.com",
    email_verified: false,
  });
  const allowed = __test.authorizeClaims(config, {
    email: "admin@example.com",
    email_verified: true,
  });

  assert.equal(denied.ok, false);
  assert.equal(allowed.ok, true);
});

test("authorization supports domain, group, and required nested claim checks", () => {
  const config = __test.buildRuntimeConfig({
    appUrl: "https://search.example.com",
    issuer: "https://auth.example.com/application/o/degoog/",
    clientId: "degoog-admin",
    clientSecret: "secret",
    tokenEndpointAuthMethod: "client_secret_basic",
    allowedDomains: JSON.stringify([{ domain: "example.com" }]),
    allowedGroups: JSON.stringify([{ group: "degoog-admins" }]),
    allowedRoles: JSON.stringify([{ role: "platform-admin" }]),
    groupsClaim: "realm_access.roles",
    rolesClaim: "resource_access.degoog.roles",
    requiredClaims: JSON.stringify([{ claim: "tenant.id", value: "prod" }]),
  });

  const allowed = __test.authorizeClaims(config, {
    email: "admin@example.com",
    email_verified: true,
    realm_access: { roles: ["viewer", "degoog-admins"] },
    resource_access: { degoog: { roles: ["platform-admin"] } },
    tenant: { id: "prod" },
  });
  const denied = __test.authorizeClaims(config, {
    email: "admin@other.example",
    email_verified: true,
    realm_access: { roles: ["viewer"] },
    tenant: { id: "prod" },
  });

  assert.equal(allowed.ok, true);
  assert.equal(denied.ok, false);
});

test("authorization URL always includes PKCE, state, nonce, and callback", () => {
  const config = __test.buildRuntimeConfig({
    appUrl: "https://search.example.com",
    issuer: "https://auth.example.com/application/o/degoog/",
    clientId: "degoog-admin",
    clientSecret: "secret",
    tokenEndpointAuthMethod: "client_secret_basic",
    allowedEmails: "admin@example.com",
    extraAuthorizeParams: JSON.stringify([{ key: "prompt", value: "login" }]),
  });

  const url = new URL(
    __test.buildAuthorizationUrl(
      config,
      { authorizationEndpoint: "https://auth.example.com/authorize" },
      {
        state: "state123",
        nonce: "nonce123",
        codeChallenge: "challenge123",
      },
    ),
  );

  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_id"), "degoog-admin");
  assert.equal(
    url.searchParams.get("redirect_uri"),
    __test.buildCallbackUrl(config),
  );
  assert.equal(url.searchParams.get("state"), "state123");
  assert.equal(url.searchParams.get("nonce"), "nonce123");
  assert.equal(url.searchParams.get("code_challenge"), "challenge123");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("prompt"), "login");
});

test("JWT verification accepts a correctly signed RS256 token and validates nonce", async () => {
  const config = __test.buildRuntimeConfig({
    appUrl: "https://search.example.com",
    issuer: "https://auth.example.com/application/o/degoog/",
    clientId: "degoog-admin",
    clientSecret: "secret",
    tokenEndpointAuthMethod: "client_secret_basic",
    allowedEmails: "admin@example.com",
  });

  const { publicKey, privateKey } = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", publicKey);
  jwk.kid = "kid-1";
  jwk.use = "sig";

  const header = { alg: "RS256", kid: "kid-1", typ: "JWT" };
  const payload = {
    iss: config.issuer,
    sub: "user-123",
    aud: config.clientId,
    exp: Math.floor(Date.now() / 1000) + 300,
    iat: Math.floor(Date.now() / 1000) - 5,
    nonce: "nonce-123",
  };

  const signingInput = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(signingInput),
  );

  const verified = await __test.verifySignatureWithJwks(
    header,
    new TextEncoder().encode(signingInput),
    Buffer.from(signature),
    { keys: [jwk] },
  );
  assert.equal(verified, true);

  assert.doesNotThrow(() =>
    __test.validateIdTokenClaims(payload, config, "nonce-123"),
  );
  assert.throws(() =>
    __test.validateIdTokenClaims(payload, config, "wrong-nonce"),
  );
});

test("JWT verification accepts a correctly signed ES256 token", async () => {
  const { publicKey, privateKey } = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", publicKey);
  jwk.kid = "ec-kid-1";
  jwk.use = "sig";
  jwk.alg = "ES256";

  const header = { alg: "ES256", kid: "ec-kid-1", typ: "JWT" };
  const payload = { sub: "user-123" };
  const signingInput = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(signingInput),
  );

  const verified = await __test.verifySignatureWithJwks(
    header,
    new TextEncoder().encode(signingInput),
    Buffer.from(signature),
    { keys: [jwk] },
  );
  assert.equal(verified, true);
});
