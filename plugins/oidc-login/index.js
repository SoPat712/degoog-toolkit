import { createHash, timingSafeEqual } from "node:crypto";
import * as oauth from "./vendor/oauth4webapi-3.8.8.js";

const TX_LIFETIME_MS = 5 * 60 * 1000;
const MAX_TRANSACTIONS = 500;
const COOKIE = "__Host-degoog-oidc-tx";
const RANDOM_VALUE = /^[A-Za-z0-9_-]{43}$/;
const QUIET_ERRORS = new Set(["login_required", "consent_required", "interaction_required", "account_selection_required"]);
const digest = value => createHash("sha256").update(value).digest();
const lines = value => typeof value === "string" ? [...new Set(value.split(/\r?\n/).map(s => s.trim()).filter(Boolean))] : [];
const text = value => typeof value === "string" ? value.trim() : "";
const escape = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function httpsUrl(value) {
  if (!value || /[\u0000-\u0020\u007f\\]/.test(value)) throw new Error("invalid-url");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new Error("invalid-url");
  return url;
}

function configuration(settings) {
  const issuer = httpsUrl(text(settings.issuer));
  if (issuer.search) throw new Error("invalid-issuer");
  const base = httpsUrl(text(settings.publicUrl));
  if (base.search) throw new Error("invalid-public-url");
  const basePath = base.pathname.replace(/\/+$/, "");
  const clientId = text(settings.clientId);
  const authMethod = text(settings.clientAuthentication) || "client_secret_basic";
  if (!clientId || !["client_secret_basic", "client_secret_post", "none"].includes(authMethod)) throw new Error("invalid-client");
  const clientSecret = typeof settings.clientSecret === "string" ? settings.clientSecret : "";
  if (authMethod !== "none" && !clientSecret) throw new Error("missing-secret");
  const subjects = lines(settings.allowedSubjects);
  const emails = lines(settings.allowedEmails).map(s => s.toLowerCase());
  const groups = lines(settings.allowedGroups);
  if (!subjects.length && !emails.length && !groups.length) throw new Error("missing-access-rules");
  const groupsClaim = text(settings.groupsClaim) || "groups";
  if (!groupsClaim.split(".").every(s => /^[\w-]+$/.test(s) && !["__proto__", "constructor", "prototype"].includes(s))) throw new Error("invalid-groups-claim");
  const origins = new Set([issuer.origin]);
  for (const origin of lines(settings.endpointOrigins)) {
    const parsed = httpsUrl(origin);
    if (parsed.pathname !== "/" || parsed.search) throw new Error("invalid-endpoint-origin");
    origins.add(parsed.origin);
  }
  const scopes = [...new Set((text(settings.scopes) || "openid profile email").split(/\s+/))];
  if (!scopes.includes("openid")) throw new Error("missing-openid-scope");
  const timeoutMs = Number(settings.requestTimeoutMs || 10000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) throw new Error("invalid-network-timeout");
  const c = { issuer, base, basePath, clientId, clientSecret, authMethod, subjects, emails, groups, groupsClaim, origins, scopes, timeoutMs,
    match: text(settings.accessRuleMatch) || "all", claimSource: text(settings.claimSource) || "id_token",
    autoLogin: text(settings.automaticSearchLogin) || "silent" };
  if (!["all", "any"].includes(c.match) || !["id_token", "userinfo"].includes(c.claimSource) || !["off", "silent"].includes(c.autoLogin)) throw new Error("invalid-policy");
  const settingsPath = text(settings.settingsPath) || "settings";
  c.settingsPath = returnPath(`${basePath}/${settingsPath.replace(/^\/+/, "")}`, c, `${basePath}/`);
  c.callback = `${base.origin}${basePath}/api/settings/auth/callback`;
  return c;
}

function returnPath(value, c, fallback = c.settingsPath) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  try {
    const url = new URL(value, c.base.origin);
    if (url.origin !== c.base.origin || (c.basePath && url.pathname !== c.basePath && !url.pathname.startsWith(`${c.basePath}/`))) return fallback;
    if (url.pathname.startsWith(`${c.basePath}/api/`) || /^\/(?:%2f|%5c)/i.test(url.pathname)) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return fallback; }
}

function bindingCookie(request) {
  const cookies = (request.headers.get("cookie") || "").split(";").map(s => s.trim()).filter(s => s.startsWith(`${COOKIE}=`));
  if (cookies.length !== 1) return null;
  const value = cookies[0].slice(COOKIE.length + 1);
  return RANDOM_VALUE.test(value) ? value : null;
}

export function permitsAdmin(idClaims, policyClaims, c) {
  const checks = [];
  if (c.subjects.length) checks.push(c.subjects.includes(idClaims.sub));
  if (c.emails.length) checks.push(policyClaims.email_verified === true && typeof policyClaims.email === "string" && c.emails.includes(policyClaims.email.toLowerCase()));
  if (c.groups.length) {
    let value = policyClaims;
    for (const key of c.groupsClaim.split(".")) value = value && typeof value === "object" && Object.hasOwn(value, key) ? value[key] : undefined;
    const groups = typeof value === "string" ? [value] : value;
    checks.push(Array.isArray(groups) && groups.every(s => typeof s === "string") && groups.some(s => c.groups.includes(s)));
  }
  return checks.length > 0 && (c.match === "any" ? checks.some(Boolean) : checks.every(Boolean));
}

export function createOidcGate({ now = Date.now, warn = code => console.warn(`[OIDC Login] ${code}`) } = {}) {
  let config, context, template = "", css = "", metadata, metadataAt = 0, metadataTask;
  const transactions = new Map();
  const headers = (extra = {}) => ({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", ...extra });
  const json = (body, status = 200) => Response.json(body, { status, headers: headers() });
  const routePath = path => `${config.basePath}${context.routeUrl(path)}`;
  const completeUrl = destination => `${routePath("complete")}?returnTo=${encodeURIComponent(destination)}`;

  function page(title, message, destination, refresh = false, status = 200) {
    const csp = `default-src 'none'; style-src 'sha256-${createHash("sha256").update(css).digest("base64")}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
    const html = template.replace("{{style}}", css).replace("{{title}}", escape(title)).replace("{{message}}", escape(message))
      .replace("{{destination}}", escape(destination || "/")).replace("{{refresh}}", refresh ? `<meta http-equiv="refresh" content="0;url=${escape(destination)}">` : "");
    return new Response(html, { status, headers: headers({ "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": csp }) });
  }

  const failure = (code, status = 400) => {
    warn(code);
    return page("Sign-in could not be completed", code === "access-denied" ? "This account is not permitted to administer this instance." : "Please return to degoog and try signing in again. If this continues, ask the operator to check the OIDC configuration.", config ? `${config.basePath}/` : "/", false, status);
  };

  function endpoint(value, c) {
    const url = httpsUrl(value);
    if (!c.origins.has(url.origin)) throw new Error("endpoint-origin-denied");
    return url;
  }

  function options(c) {
    return { [oauth.customFetch]: async (url, init) => {
      endpoint(String(url), c);
      const timeout = AbortSignal.timeout(c.timeoutMs);
      const response = await (context.fetch || fetch)(url, { ...init, credentials: "omit", redirect: "manual", signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
      if (response.status >= 300 && response.status < 400) throw new Error("endpoint-redirect-denied");
      const limit = 1024 * 1024;
      if (Number(response.headers.get("content-length")) > limit) { await response.body?.cancel(); throw new Error("response-too-large"); }
      const reader = response.body?.getReader();
      const chunks = []; let size = 0;
      try {
        if (reader) while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > limit) { await reader.cancel(); throw new Error("response-too-large"); }
          chunks.push(value);
        }
      } finally { reader?.releaseLock(); }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      return new Response(bytes, { status: response.status, headers: response.headers });
    } };
  }

  async function discover(c) {
    if (metadata && now() - metadataAt < 10 * 60 * 1000) return metadata;
    if (metadataTask) return metadataTask;
    const task = (async () => {
      const response = await oauth.discoveryRequest(c.issuer, options(c));
      const server = await oauth.processDiscoveryResponse(c.issuer, response);
      for (const key of ["authorization_endpoint", "token_endpoint", "jwks_uri"]) endpoint(server[key], c);
      if (c.claimSource === "userinfo") endpoint(server.userinfo_endpoint, c);
      if (server.code_challenge_methods_supported && !server.code_challenge_methods_supported.includes("S256")) throw new Error("pkce-s256-unavailable");
      if (server.require_pushed_authorization_requests) throw new Error("par-not-supported");
      if (server.response_types_supported && !server.response_types_supported.includes("code")) throw new Error("code-flow-unavailable");
      if (server.token_endpoint_auth_methods_supported && !server.token_endpoint_auth_methods_supported.includes(c.authMethod)) throw new Error("client-auth-unavailable");
      if (config !== c) throw new Error("configuration-changed");
      metadata = server; metadataAt = now();
      return server;
    })();
    metadataTask = task;
    try { return await task; } finally { if (metadataTask === task) metadataTask = null; }
  }

  async function login(request) {
    const c = config;
    if (!c || !context) return failure("not-configured", 503);
    for (const [state, tx] of transactions) if (tx.expires <= now()) transactions.delete(state);
    if (transactions.size >= MAX_TRANSACTIONS) return failure("login-capacity", 429);
    const binding = bindingCookie(request) || oauth.generateRandomState();
    const hash = digest(binding);
    if ([...transactions.values()].filter(t => timingSafeEqual(t.binding, hash)).length >= 5) return failure("too-many-login-attempts", 429);
    const url = new URL(request.url);
    const state = oauth.generateRandomState();
    const tx = { config: c, binding: hash, verifier: oauth.generateRandomCodeVerifier(), nonce: oauth.generateRandomNonce(), expires: now() + TX_LIFETIME_MS,
      destination: returnPath(url.searchParams.get("returnTo"), c), silent: url.searchParams.get("mode") === "silent" && c.autoLogin === "silent" };
    transactions.set(state, tx);
    try {
      tx.server = await discover(c);
      const authorization = new URL(tx.server.authorization_endpoint);
      authorization.search = new URLSearchParams({ client_id: c.clientId, redirect_uri: c.callback, response_type: "code", scope: c.scopes.join(" "), state, nonce: tx.nonce,
        code_challenge: await oauth.calculatePKCECodeChallenge(tx.verifier), code_challenge_method: "S256", response_mode: "query", ...(tx.silent ? { prompt: "none" } : {}) }).toString();
      return new Response(null, { status: 302, headers: headers({ Location: authorization.href,
        "Set-Cookie": `${COOKIE}=${binding}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${TX_LIFETIME_MS / 1000}` }) });
    } catch { transactions.delete(state); return failure("discovery-failed", 502); }
  }

  async function callback(request) {
    const url = new URL(request.url);
    const states = url.searchParams.getAll("state");
    if (!config || url.pathname !== `${config.basePath}/api/settings/auth/callback` || states.length !== 1 || !RANDOM_VALUE.test(states[0])) return failure("invalid-transaction");
    const tx = transactions.get(states[0]);
    const binding = bindingCookie(request);
    if (!tx || !binding || tx.expires <= now() || tx.config !== config || !tx.server || !timingSafeEqual(tx.binding, digest(binding))) return failure("invalid-transaction");
    // Consume synchronously, before token exchange: concurrent/replayed callbacks cannot grant access.
    transactions.delete(states[0]);
    const c = tx.config;
    const client = { client_id: c.clientId, [oauth.clockTolerance]: 30 };
    let params;
    try { params = oauth.validateAuthResponse(tx.server, client, url, states[0]); }
    catch (error) {
      if (error instanceof oauth.AuthorizationResponseError && tx.silent && QUIET_ERRORS.has(error.error)) {
        return new Response(null, { status: 302, headers: headers({ Location: completeUrl(tx.destination) }) });
      }
      return failure("authorization-response-rejected");
    }
    try {
      const authenticate = c.authMethod === "none" ? oauth.None() : c.authMethod === "client_secret_post" ? oauth.ClientSecretPost(c.clientSecret) : oauth.ClientSecretBasic(c.clientSecret);
      const response = await oauth.authorizationCodeGrantRequest(tx.server, client, authenticate, params, c.callback, tx.verifier, options(c));
      const tokens = await oauth.processAuthorizationCodeResponse(tx.server, client, response, { expectedNonce: tx.nonce, requireIdToken: true });
      // Never rely on JWT decoding or TLS alone to authenticate an administrator.
      await oauth.validateApplicationLevelSignature(tx.server, response, options(c));
      const claims = oauth.getValidatedIdTokenClaims(tokens);
      if (claims.iat > Math.floor(now() / 1000) + 30) throw new Error("future-issued-at");
      let policyClaims = claims;
      if (c.claimSource === "userinfo") {
        const info = await oauth.userInfoRequest(tx.server, client, tokens.access_token, options(c));
        policyClaims = await oauth.processUserInfoResponse(tx.server, client, claims.sub, info);
        if (info.headers.get("content-type")?.split(";")[0].trim() === "application/jwt") await oauth.validateApplicationLevelSignature(tx.server, info, options(c));
      }
      if (config !== c) return failure("configuration-changed", 403);
      if (!permitsAdmin(claims, policyClaims, c)) {
        if (!tx.silent) return failure("access-denied", 403);
        warn("access-denied");
        return new Response(null, { status: 302, headers: headers({ Location: completeUrl(tx.destination) }) });
      }
      // This is the documented core hand-off. Core, not this extension, creates the admin session.
      return { redirect: completeUrl(tx.destination) };
    } catch { return failure("token-validation-failed", 403); }
  }

  return {
    setupResult() {
      return { title: "OpenID Connect", html: `<div class="oidc-status"><p>${config ? "OIDC configuration is present. Administration still requires a permitted identity and the selected settings gate." : "Open Settings → Plugins → OpenID Connect to configure your provider and admin access rules."}</p></div>` };
    },
    async init(ctx) { context = ctx; template = ctx.template; css = await ctx.readFile("style.css"); },
    configure(settings = {}) {
      config = undefined; metadata = undefined; metadataTask = undefined; transactions.clear();
      try { config = configuration(settings); } catch { /* An incomplete setup must fail closed. */ }
    },
    login,
    complete(request) {
      if (!config) return failure("not-configured", 503);
      const destination = returnPath(new URL(request.url).searchParams.get("returnTo"), config);
      // A document navigation breaks the cross-site IdP redirect chain before core's Strict cookie is used.
      return page("Returning to degoog", "Continue to your search or settings.", destination, true);
    },
    async handle(request, { route } = {}) {
      if (route === "settings-auth-callback") return callback(request);
      if (route === "settings-auth-post") return json({ ok: false, error: "Use OpenID Connect sign-in." }, 400);
      if (route !== "settings-auth") return null;
      if (!config || !context) return json({ required: true, valid: false, error: "auth-misconfigured" }, 503);
      const referrer = request.headers.get("referer"); let destination;
      try { const ref = new URL(referrer); if (ref.origin === config.base.origin) destination = returnPath(`${ref.pathname}${ref.search}${ref.hash}`, config); } catch {}
      const loginUrl = `${routePath("login")}?returnTo=${encodeURIComponent(destination || config.settingsPath)}`;
      return json({ required: true, valid: false, loginUrl, oidcPlugin: context.pluginId, automaticSearchLogin: config.autoLogin });
    },
  };
}


const gate = createOidcGate();

export const command = {
  name: "OpenID Connect",
  description: "Use your identity provider to sign in to degoog administration.",
  trigger: "oidc",
  isClientExposed: true,
  settingsSchema: [
    { key: "setup", label: "Before enabling", type: "info", description: "Configure an issuer, canonical HTTPS degoog URL, client and explicit admin access rules, then select Use as settings gate. Register your public URL followed by /api/settings/auth/callback with the provider. Keep the existing password configured for console recovery." },
    { key: "useAsSettingsGate", label: "Use as settings gate", type: "toggle", default: "false", description: "Enable only after configuring the provider and explicit admin access rules. Replaces the normal settings password flow; unconfigured or failed OIDC logins remain locked." },
    { key: "issuer", label: "Issuer URL", type: "url", required: true, placeholder: "https://id.example.com", description: "Exact issuer from your provider's discovery document. Supports issuer paths such as Authentik applications." },
    { key: "publicUrl", label: "Public degoog URL", type: "url", required: true, placeholder: "https://search.example.com", description: "Canonical HTTPS URL, including a base path if used. Never inferred from proxy headers." },
    { key: "settingsPath", label: "Settings path", type: "text", default: "settings", description: "Path relative to degoog, such as admin or your custom settings path. Existing settings-page return paths are preserved automatically." },
    { key: "clientId", label: "Client ID", type: "text", required: true },
    { key: "clientSecret", label: "Client secret", type: "password", secret: true, description: "Stored server-side. Required for confidential clients." },
    { key: "clientAuthentication", label: "Token endpoint authentication", type: "select", options: ["client_secret_basic", "client_secret_post", "none"], default: "client_secret_basic", description: "Match the provider's client registration. Public clients (none) still use PKCE S256." },
    { key: "scopes", label: "Scopes", type: "text", default: "openid profile email", description: "Space-separated. Add groups if your provider requires that scope. Tokens are not retained or refreshed." },
    { key: "allowedSubjects", label: "Allowed admin subjects", type: "textarea", placeholder: "provider-user-id", description: "One exact sub claim per line. Subject IDs are bound to the configured issuer; stable IDs are preferred over email." },
    { key: "allowedEmails", label: "Allowed admin emails", type: "textarea", placeholder: "admin@example.com", description: "One address per line. Requires email_verified to be boolean true. Matching is case-insensitive." },
    { key: "allowedGroups", label: "Allowed admin groups", type: "textarea", placeholder: "degoog-admins", description: "One exact group per line. At least one access-rule field must be configured; an empty policy denies everyone." },
    { key: "groupsClaim", label: "Groups claim", type: "text", default: "groups", description: "Claim name or dotted path, such as realm_access.roles." },
    { key: "claimSource", label: "Access-rule claim source", type: "select", options: ["id_token", "userinfo"], default: "id_token", description: "Use UserInfo when the provider exposes email/groups there. Its subject must match the signed ID token." },
    { key: "accessRuleMatch", label: "Combine access rules", type: "select", options: ["all", "any"], default: "all", description: "All requires every nonempty rule category to match. Any permits a match in one configured category." },
    { key: "automaticSearchLogin", label: "Automatic sign-in from search", type: "select", options: ["silent", "off"], default: "silent", description: "Silent makes one prompt=none round trip per tab when signed out. An existing IdP session can unlock search actions without visiting settings. Settings sign-in redirects interactively." },
    { key: "endpointOrigins", label: "Additional provider endpoint origins", type: "textarea", description: "Optional HTTPS origins, one per line, only when discovery uses endpoints on a different host. The issuer origin is allowed automatically." },
    { key: "requestTimeoutMs", label: "Provider request timeout (ms)", type: "text", default: "10000", description: "1000–30000 ms for discovery, token exchange, UserInfo and signing keys. Independent of search-engine timeouts." },
    { key: "sessions", label: "Session behavior", type: "info", description: "Successful login uses degoog's native HttpOnly admin cookie. Current core sessions last 24 hours; IdP logout/group changes do not immediately revoke an existing degoog session. In-flight logins require a single process or sticky routing." },
  ],
  init: ctx => gate.init(ctx),
  configure: settings => gate.configure(settings),
  execute: () => gate.setupResult(),
};

export default command;

// Core exposes gate settings through the command's Configure card and its
// useAsSettingsGate toggle. The middleware has no separate schema/configuration.
export const middleware = {
  name: "OpenID Connect",
  isClientExposed: true,
  init: ctx => gate.init(ctx),
  handle: (request, context) => gate.handle(request, context),
};

export const routes = [
  { method: "get", path: "login", rateLimit: true, handler: request => gate.login(request) },
  { method: "get", path: "complete", handler: request => gate.complete(request) },
];
