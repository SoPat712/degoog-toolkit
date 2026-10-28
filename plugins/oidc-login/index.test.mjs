import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createOidcGate } from "./index.js";
import { command, middleware, routes } from "./index.js";

const key = generateKeyPairSync("rsa", { modulusLength: 2048 });
const wrongKey = generateKeyPairSync("rsa", { modulusLength: 2048 });
const template = await readFile(new URL("./template.html", import.meta.url), "utf8");
const css = await readFile(new URL("./style.css", import.meta.url), "utf8");
const pluginId = "sopat712-degoog-toolkit-oidc-login";
const issuer = "https://identity.example/realm/";
const publicUrl = "https://search.example";
const defaults = { issuer, publicUrl, clientId: "fixture-client", clientSecret: "fixture-only-not-a-real-secret", allowedSubjects: "owner" };
const jwt = (claims, signingKey = key.privateKey, algorithm = "RS256", kid = "fixture-key") => {
  const parts = [ { alg: algorithm, kid, typ: "JWT" }, claims ].map(p => Buffer.from(JSON.stringify(p)).toString("base64url"));
  const input = parts.join(".");
  return `${input}.${algorithm === "none" ? "" : sign("sha256", Buffer.from(input), signingKey).toString("base64url")}`;
};

export async function fixture(overrides = {}, behavior = {}) {
  const settings = { ...defaults, ...overrides };
  const requests = [], warnings = [], fixtureErrors = [];
  const grants = new Map();
  let clock = Date.now();
  const gate = createOidcGate({ now: () => clock, warn: code => warnings.push(code) });
  const server = {
    issuer: settings.issuer,
    authorization_endpoint: new URL("authorize", settings.issuer).href,
    token_endpoint: new URL("token", settings.issuer).href,
    jwks_uri: new URL("jwks", settings.issuer).href,
    userinfo_endpoint: new URL("userinfo", settings.issuer).href,
    response_types_supported: ["code"], subject_types_supported: ["public"], id_token_signing_alg_values_supported: ["RS256"],
    code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none"],
    ...behavior.metadata,
  };
  const outbound = async (input, init) => {
    const url = new URL(input); requests.push({ url: url.href, init });
    assert.equal(init.redirect, "manual"); assert.equal(init.credentials, "omit"); assert.ok(init.signal instanceof AbortSignal);
    if (url.pathname.endsWith("/.well-known/openid-configuration")) return Response.json(server);
    if (url.href === server.jwks_uri) return Response.json({ keys: [{ ...key.publicKey.export({ format: "jwk" }), alg: "RS256", use: "sig", kid: "fixture-key" }] });
    if (url.href === server.userinfo_endpoint) return Response.json(behavior.userinfo || { sub: "owner", groups: ["degoog-admins"] });
    if (url.href !== server.token_endpoint) throw new Error("unexpected endpoint");
    if (behavior.tokenResponse) return behavior.tokenResponse();
    const params = new URLSearchParams(init.body);
    const grant = grants.get(params.get("code"));
    assert.ok(grant, "authorization code came from this fixture");
    assert.equal(params.get("grant_type"), "authorization_code");
    assert.equal(params.get("redirect_uri"), `${settings.publicUrl.replace(/\/$/, "")}/api/settings/auth/callback`);
    assert.equal(createHash("sha256").update(params.get("code_verifier")).digest("base64url"), grant.get("code_challenge"));
    const method = settings.clientAuthentication || "client_secret_basic";
    if (method === "client_secret_basic") {
      const basic = new Headers(init.headers).get("authorization");
      assert.ok(basic.startsWith("Basic "));
      assert.deepEqual(Buffer.from(basic.slice(6), "base64").toString().split(":").map(part => decodeURIComponent(part.replace(/\+/g, " "))), [settings.clientId, settings.clientSecret]);
    }
    if (method === "client_secret_post") assert.equal(params.get("client_secret"), settings.clientSecret);
    if (method === "none") { assert.equal(params.has("client_secret"), false); assert.equal(new Headers(init.headers).has("authorization"), false); }
    const claims = { iss: settings.issuer, sub: "owner", aud: settings.clientId, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300, nonce: grant.get("nonce"), ...behavior.claims };
    for (const name of behavior.omitClaims || []) delete claims[name];
    return Response.json({ access_token: "fixture-access-token", token_type: "Bearer", expires_in: 300,
      ...(behavior.omitIdToken ? {} : { id_token: jwt(claims, behavior.badSignature ? wrongKey.privateKey : key.privateKey, behavior.algorithm || "RS256", behavior.kid || "fixture-key") }) });
  };
  const ctx = { pluginId, id: pluginId, template, readFile: async name => { assert.equal(name, "style.css"); return css; }, routeUrl: path => `/api/plugin/${pluginId}/${path}`,
    fetch: async (...args) => { try { return await outbound(...args); } catch (error) { fixtureErrors.push(error); throw error; } } };
  await gate.init(ctx); gate.configure(settings);
  const issueCode = authorization => { const code = `fixture-${randomUUID()}`; grants.set(code, authorization.searchParams); return code; };
  async function begin({ returnTo = "/search?q=rust", mode = "", cookie = "" } = {}) {
    const start = new URL(`${settings.publicUrl}/api/plugin/${pluginId}/login`);
    start.search = new URLSearchParams({ returnTo, mode }).toString();
    const response = await gate.login(new Request(start, { headers: cookie ? { cookie } : {} }));
    if (response.status !== 302) return { response };
    const authorization = new URL(response.headers.get("location"));
    const browserCookie = response.headers.get("set-cookie").split(";")[0];
    const code = issueCode(authorization);
    const callback = new URL(authorization.searchParams.get("redirect_uri"));
    callback.search = new URLSearchParams({ state: authorization.searchParams.get("state"), code }).toString();
    return { response, authorization, cookie: browserCookie, callback };
  }
  const finish = async flow => {
    const result = await gate.handle(new Request(flow.callback, { headers: { cookie: flow.cookie } }), { route: "settings-auth-callback" });
    if (fixtureErrors.length) throw fixtureErrors[0];
    return result;
  };
  return { gate, ctx, settings, server, requests, warnings, begin, finish, issueCode, advance: ms => { clock += ms; } };
}

test("OIDC registers one schema owner, standard settings middleware and namespaced routes", () => {
  assert.equal(middleware.isClientExposed, true);
  assert.equal(command.settingsSchema.find(f => f.key === "clientSecret").secret, true);
  assert.equal(command.settingsSchema.find(f => f.key === "useAsSettingsGate").default, "false");
  assert.equal(middleware.settingsSchema, undefined);
  assert.equal(middleware.configure, undefined, "empty middleware settings must not erase command-owned configuration");
  assert.deepEqual(routes.map(r => r.path), ["login", "complete"]);
  assert.equal(routes[0].rateLimit, true);
});

test("signed authorization code + PKCE grants only the documented core callback hand-off", async () => {
  const f = await fixture(); const flow = await f.begin();
  assert.equal(flow.authorization.origin, new URL(issuer).origin);
  assert.equal(flow.authorization.searchParams.get("response_type"), "code");
  assert.equal(flow.authorization.searchParams.get("code_challenge_method"), "S256");
  assert.equal(flow.authorization.searchParams.has("prompt"), false);
  const cookie = flow.response.headers.get("set-cookie");
  for (const flag of ["__Host-", "HttpOnly", "Secure", "SameSite=Lax", "Path=/", "Max-Age=300"]) assert.ok(cookie.includes(flag));
  assert.equal(cookie.includes("Domain="), false);
  const result = await f.finish(flow);
  assert.deepEqual(result, { redirect: `/api/plugin/${pluginId}/complete?returnTo=%2Fsearch%3Fq%3Drust` });
  assert.equal(f.requests.filter(r => r.url === f.server.token_endpoint).length, 1);
  assert.equal(f.requests.some(r => r.url === f.server.jwks_uri), true, "JWT signature is checked against discovered keys");
  assert.deepEqual(f.warnings, []);
});

for (const method of ["client_secret_post", "none"]) test(`OIDC supports ${method} clients with PKCE`, async () => {
  const f = await fixture({ clientAuthentication: method, ...(method === "none" ? { clientSecret: "" } : {}) });
  assert.equal((await f.finish(await f.begin())) instanceof Response, false);
});

for (const [name, behavior] of Object.entries({
  signature: { badSignature: true }, unknownKey: { kid: "unrecognized" }, unsigned: { algorithm: "none" },
  issuer: { claims: { iss: "https://other.example" } }, audience: { claims: { aud: "another-client" } },
  nonce: { claims: { nonce: "wrong" } }, expired: { claims: { exp: 1 } }, futureNotBefore: { claims: { nbf: Math.floor(Date.now() / 1000) + 600 } },
  futureIssuedAt: { claims: { iat: Math.floor(Date.now() / 1000) + 600 } }, authorizedParty: { claims: { aud: [defaults.clientId, "other"], azp: "other" } },
  missingNonce: { omitClaims: ["nonce"] }, missingSubject: { omitClaims: ["sub"] }, missingExpiry: { omitClaims: ["exp"] }, missingToken: { omitIdToken: true },
})) test(`OIDC rejects invalid ID token: ${name}`, async () => {
  const f = await fixture({}, behavior); const result = await f.finish(await f.begin());
  assert.ok(result instanceof Response); assert.equal(result.status, 403);
  assert.deepEqual(f.warnings, ["token-validation-failed"]);
  assert.equal((await result.text()).includes(defaults.clientSecret), false);
});

test("state, browser binding, duplicate parameters, expiry and one-time consumption protect the callback", async () => {
  for (const mutation of ["missingCookie", "wrongCookie", "wrongState", "duplicateState", "expired"]) {
    const f = await fixture(); const flow = await f.begin();
    if (mutation === "missingCookie") flow.cookie = "";
    if (mutation === "wrongCookie") flow.cookie = `__Host-degoog-oidc-tx=${"a".repeat(43)}`;
    if (mutation === "wrongState") flow.callback.searchParams.set("state", "a".repeat(43));
    if (mutation === "duplicateState") flow.callback.searchParams.append("state", flow.callback.searchParams.get("state"));
    if (mutation === "expired") f.advance(300001);
    assert.equal((await f.finish(flow)).status, 400, mutation);
    assert.equal(f.requests.some(r => r.url === f.server.token_endpoint), false);
  }
  const f = await fixture(); const flow = await f.begin();
  const both = await Promise.all([f.finish(flow), f.finish(flow)]);
  assert.equal(both.filter(r => !(r instanceof Response)).length, 1);
  assert.equal(both.find(r => r instanceof Response).status, 400);
  assert.equal(f.requests.filter(r => r.url === f.server.token_endpoint).length, 1);
});

test("empty admin policy and incomplete or unsafe configuration fail closed", async () => {
  for (const invalid of [ { allowedSubjects: "" }, { issuer: "http://identity.example" }, { publicUrl: "http://search.example" }, { clientSecret: "" },
    { groupsClaim: "__proto__.admin" }, { endpointOrigins: "https://other.example/path" }, { scopes: "profile" }, { requestTimeoutMs: "0" } ]) {
    const f = await fixture(); f.gate.configure({ ...defaults, ...invalid });
    const auth = await f.gate.handle(new Request(`${publicUrl}/api/settings/auth`), { route: "settings-auth" });
    assert.equal(auth.status, 503);
    assert.equal((await auth.json()).error, "auth-misconfigured");
    assert.equal((await f.begin()).response.status, 503);
  }
});

test("subjects, verified emails and groups honor explicit all/any access policies", async () => {
  for (const [settings, claims, permitted] of [
    [{ allowedSubjects: "another" }, {}, false],
    [{ allowedSubjects: "", allowedEmails: "Owner@Example.com" }, { email: "owner@example.com", email_verified: true }, true],
    [{ allowedSubjects: "", allowedEmails: "owner@example.com" }, { email: "owner@example.com", email_verified: "true" }, false],
    [{ allowedGroups: "admins" }, { groups: ["members"] }, false],
    [{ allowedGroups: "admins", accessRuleMatch: "any" }, { groups: ["members"] }, true],
    [{ allowedSubjects: "", allowedGroups: "admins", groupsClaim: "realm_access.roles" }, { realm_access: { roles: ["admins"] } }, true],
    [{ allowedSubjects: "", allowedGroups: "admins" }, { groups: ["admins", {}] }, false],
  ]) {
    const f = await fixture(settings, { claims }); const result = await f.finish(await f.begin());
    assert.equal(!(result instanceof Response), permitted);
    if (!permitted) assert.equal(result.status, 403);
  }
});

test("UserInfo access claims require the same subject as the signed ID token", async () => {
  const settings = { allowedSubjects: "", allowedGroups: "degoog-admins", claimSource: "userinfo" };
  const good = await fixture(settings); assert.equal((await good.finish(await good.begin())) instanceof Response, false);
  const bad = await fixture(settings, { userinfo: { sub: "other-user", groups: ["degoog-admins"] } });
  assert.equal((await bad.finish(await bad.begin())).status, 403);
});

test("silent SSO falls back to search only for validated interaction-required responses", async () => {
  const f = await fixture(); const flow = await f.begin({ mode: "silent" });
  assert.equal(flow.authorization.searchParams.get("prompt"), "none");
  flow.callback.searchParams.delete("code"); flow.callback.searchParams.set("error", "login_required");
  const result = await f.finish(flow);
  assert.ok(result instanceof Response); assert.equal(result.status, 302);
  assert.equal(result.headers.has("set-cookie"), false, "silent failure never creates an admin session");
  assert.equal(f.requests.some(r => r.url === f.server.token_endpoint), false);
  const explicit = await f.begin(); explicit.callback.searchParams.delete("code"); explicit.callback.searchParams.set("error", "access_denied");
  assert.equal((await f.finish(explicit)).status, 400);
});

test("a signed-in non-admin remains a guest after silent SSO without receiving an admin session", async () => {
  const f = await fixture({ allowedSubjects: "another-user" });
  const result = await f.finish(await f.begin({ mode: "silent" }));
  assert.ok(result instanceof Response); assert.equal(result.status, 302);
  assert.equal(result.headers.has("set-cookie"), false);
  assert.deepEqual(f.warnings, ["access-denied"]);
});

test("return destinations, custom settings paths and subpath installs stay on the configured app", async () => {
  for (const returnTo of ["https://evil.example", "//evil.example", "/\\evil.example", "/api/settings/auth/callback", "/%2f/evil.example"]) {
    const f = await fixture({ settingsPath: "private-admin" }); const result = await f.finish(await f.begin({ returnTo }));
    assert.equal(new URL(result.redirect, publicUrl).searchParams.get("returnTo"), "/private-admin");
  }
  const f = await fixture({ publicUrl: `${publicUrl}/degoog`, settingsPath: "private-admin" });
  const result = await f.finish(await f.begin({ returnTo: "/degoog/search?q=rust" }));
  assert.ok(result.redirect.startsWith("/degoog/api/plugin/"));
  const complete = await f.gate.complete(new Request(`${publicUrl}${result.redirect}`));
  const html = await complete.text();
  assert.equal(complete.headers.get("referrer-policy"), "no-referrer");
  assert.match(complete.headers.get("content-security-policy"), /default-src 'none'/);
  assert.ok(html.includes('content="0;url=/degoog/search?q=rust"'));
  assert.ok(complete.headers.get("content-security-policy").includes(`sha256-${createHash("sha256").update(css).digest("base64")}`));
});

test("discovery validates issuer, endpoint origins and PKCE support before requesting tokens", async () => {
  for (const metadata of [ { issuer: "https://impostor.example" }, { token_endpoint: "https://other.example/token" }, { jwks_uri: "http://identity.example/jwks" }, { code_challenge_methods_supported: ["plain"] }, { require_pushed_authorization_requests: true } ]) {
    const f = await fixture({}, { metadata }); assert.equal((await f.begin()).response.status, 502);
    assert.equal(f.requests.some(r => r.url === f.server.token_endpoint), false);
  }
  const allowed = await fixture({ endpointOrigins: "https://keys.example" }, { metadata: { jwks_uri: "https://keys.example/jwks" } });
  assert.equal((await allowed.finish(await allowed.begin())) instanceof Response, false);
});

test("endpoint redirects, malformed and oversized responses never grant a session", async () => {
  for (const tokenResponse of [ () => new Response(null, { status: 302, headers: { Location: "https://evil.example" } }), () => new Response("not JSON"),
    () => Response.json({ error: "invalid_grant" }, { status: 400 }), () => new Response("x".repeat(1024 * 1024 + 1)) ]) {
    const f = await fixture({}, { tokenResponse }); assert.equal((await f.finish(await f.begin())).status, 403);
    assert.equal(f.requests.some(r => r.url.startsWith("https://evil.example")), false);
  }
});

test("configuration changes invalidate pending logins; per-browser attempts are bounded", async () => {
  const f = await fixture(); const flow = await f.begin(); f.gate.configure(defaults);
  assert.equal((await f.finish(flow)).status, 400);
  const fresh = await f.begin();
  for (let i = 1; i < 5; i++) assert.equal((await f.begin({ cookie: fresh.cookie })).response.status, 302);
  assert.equal((await f.begin({ cookie: fresh.cookie })).response.status, 429);
  f.advance(300001);
  assert.equal((await f.begin({ cookie: fresh.cookie })).response.status, 302);
});

test("settings auth advertises only safe login metadata and respects the actual custom settings referrer", async () => {
  const f = await fixture();
  const response = await f.gate.handle(new Request(`${publicUrl}/api/settings/auth`, { headers: { referer: `${publicUrl}/hidden-admin?tab=engines` } }), { route: "settings-auth" });
  const data = await response.json();
  assert.equal(data.oidcPlugin, pluginId);
  assert.equal(new URL(data.loginUrl, publicUrl).searchParams.get("returnTo"), "/hidden-admin?tab=engines");
  assert.equal(JSON.stringify(data).includes(defaults.clientSecret), false);
  assert.equal((await f.gate.handle(new Request(`${publicUrl}/api/settings/auth`, { method: "POST" }), { route: "settings-auth-post" })).status, 400);
  assert.equal(await f.gate.handle(new Request(publicUrl), { route: "other" }), null);
});
