import { createHash, randomBytes } from "node:crypto";

const PLUGIN_NAME = "OIDC Settings Gate";
const PLUGIN_DESCRIPTION =
  "Secure OIDC login for degoog's settings and admin gate with PKCE, nonce/state checks, issuer discovery, JWKS verification, and explicit admin allow rules.";

const FLOW_TTL_MS = 10 * 60 * 1000;
const DISCOVERY_TTL_MS = 60 * 60 * 1000;
const JWKS_TTL_MS = 15 * 60 * 1000;
const USERINFO_TIMEOUT_MS = 15 * 1000;
const SUPPORTED_AUTH_METHODS = new Set([
  "client_secret_basic",
  "client_secret_post",
  "none",
]);
const RESERVED_AUTHORIZE_PARAMS = new Set([
  "client_id",
  "code_challenge",
  "code_challenge_method",
  "nonce",
  "redirect_uri",
  "response_type",
  "scope",
  "state",
]);

let apiBase = "";
let fetchImpl = (...args) => fetch(...args);
let flowCache = createMemoryCache(FLOW_TTL_MS);
let discoveryCache = createMemoryCache(DISCOVERY_TTL_MS);
let jwksCache = createMemoryCache(JWKS_TTL_MS);
let rawSettings = {};

function createMemoryCache(defaultTtlMs) {
  const store = new Map();
  return {
    async get(key) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= Date.now()) {
        store.delete(key);
        return undefined;
      }
      return entry.value;
    },
    async set(key, value, ttlMs = defaultTtlMs) {
      store.set(key, {
        value,
        expiresAt: Date.now() + Math.max(1, Number(ttlMs) || defaultTtlMs),
      });
    },
    async delete(key) {
      store.delete(key);
    },
    async clear() {
      store.clear();
    },
  };
}

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function asBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
}

function asPositiveInteger(value, fallback) {
  const candidate =
    typeof value === "number"
      ? value
      : Number.parseInt(typeof value === "string" ? value.trim() : "", 10);
  return Number.isFinite(candidate) && candidate >= 0
    ? Math.trunc(candidate)
    : fallback;
}

function base64UrlEncode(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(segment, label) {
  if (typeof segment !== "string" || !segment) {
    throw new Error(`${label} is missing`);
  }
  if (!/^[A-Za-z0-9\-_]+$/.test(segment)) {
    throw new Error(`${label} is not valid base64url`);
  }
  const padded = `${segment}${"===".slice((segment.length + 3) % 4)}`;
  return Buffer.from(
    padded.replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  );
}

function parseBase64UrlJson(segment, label) {
  let parsed;
  try {
    parsed = JSON.parse(base64UrlDecode(segment, label).toString("utf8"));
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed;
}

function utf8Bytes(value) {
  return new TextEncoder().encode(value);
}

function randomToken(bytes = 32) {
  return base64UrlEncode(randomBytes(bytes));
}

function sha256Base64Url(value) {
  return createHash("sha256").update(value).digest("base64url");
}

function splitLinesOrCommas(value, { lowercase = false } = {}) {
  const entries = String(value || "")
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return lowercase ? entries.map((entry) => entry.toLowerCase()) : entries;
}

function parseListSetting(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseAuthorizeParams(value) {
  return parseListSetting(value)
    .map((row) => ({
      key: asString(row?.key),
      value: asString(row?.value),
    }))
    .filter((row) => row.key && row.value);
}

function parseRequiredClaims(value) {
  return parseListSetting(value)
    .map((row) => ({
      claim: asString(row?.claim),
      value: asString(row?.value),
    }))
    .filter((row) => row.claim && row.value);
}

function isLoopbackHost(hostname) {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]"
  );
}

function normalizeAbsoluteUrl(
  value,
  label,
  { allowLoopbackHttp = false, stripTrailingSlash = false } = {},
) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute URL`);
  }

  const isLoopback = isLoopbackHost(url.hostname);
  if (url.protocol !== "https:" && !(allowLoopbackHttp && isLoopback && url.protocol === "http:")) {
    throw new Error(`${label} must use https unless it targets localhost`);
  }

  if (url.username || url.password) {
    throw new Error(`${label} must not embed credentials`);
  }

  if (stripTrailingSlash && url.pathname !== "/") {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }

  const serialized = url.toString();
  if (stripTrailingSlash && url.pathname === "/" && !url.search && !url.hash) {
    return serialized.replace(/\/$/, "");
  }
  return serialized;
}

function buildDefaultReturnTo(publicBaseUrl) {
  const base = new URL(publicBaseUrl);
  const path = base.pathname === "/" ? "" : base.pathname.replace(/\/+$/, "");
  return `${path}/settings`;
}

function getBasePathPrefix(publicBaseUrl) {
  const base = new URL(publicBaseUrl);
  return base.pathname === "/" ? "" : base.pathname.replace(/\/+$/, "");
}

function buildAppPath(publicBaseUrl, path) {
  return `${getBasePathPrefix(publicBaseUrl)}${path}`;
}

function sanitizeReturnTo(publicBaseUrl, candidate) {
  const fallback = buildDefaultReturnTo(publicBaseUrl);
  if (!candidate) return fallback;

  const base = new URL(publicBaseUrl);
  let target;
  try {
    target = new URL(candidate, base);
  } catch {
    return fallback;
  }

  if (target.origin !== base.origin) {
    return fallback;
  }

  const basePath = base.pathname === "/" ? "" : base.pathname.replace(/\/+$/, "");
  if (
    basePath &&
    target.pathname !== basePath &&
    !target.pathname.startsWith(`${basePath}/`)
  ) {
    return fallback;
  }

  return `${target.pathname}${target.search}${target.hash}`;
}

function parseCacheControlMaxAge(headerValue) {
  if (typeof headerValue !== "string") return null;
  const match = headerValue.match(/(?:^|,)\s*max-age=(\d+)\s*(?:,|$)/i);
  if (!match) return null;
  const seconds = Number.parseInt(match[1], 10);
  return Number.isFinite(seconds) ? seconds * 1000 : null;
}

function buildRuntimeConfig(settings = rawSettings) {
  const issuer = asString(settings.issuer);
  const discoveryUrl = asString(settings.discoveryUrl);
  const publicBaseUrl = asString(settings.publicBaseUrl);
  const clientId = asString(settings.clientId);
  const clientSecret = settings.clientSecret;
  const providerLabel = asString(settings.providerLabel) || "OIDC";
  const tokenEndpointAuthMethod = asString(settings.tokenEndpointAuthMethod) || "client_secret_basic";
  const scopes = asString(settings.scopes) || "openid profile email";
  const groupsClaim = asString(settings.groupsClaim) || "groups";
  const allowAnyAuthenticatedUser = asBoolean(
    settings.allowAnyAuthenticatedUser,
    false,
  );
  const requireVerifiedEmail = asBoolean(settings.requireVerifiedEmail, true);
  const userInfoFallback = asBoolean(settings.userInfoFallback, true);
  const clockSkewSeconds = asPositiveInteger(settings.clockSkewSeconds, 60);
  const allowedEmails = new Set(
    splitLinesOrCommas(settings.allowedEmails, { lowercase: true }),
  );
  const allowedDomains = new Set(
    splitLinesOrCommas(settings.allowedDomains, { lowercase: true }).map(
      (domain) => domain.replace(/^@+/, ""),
    ),
  );
  const allowedGroups = new Set(splitLinesOrCommas(settings.allowedGroups));
  const requiredClaims = parseRequiredClaims(settings.requiredClaims);
  const extraAuthorizeParams = parseAuthorizeParams(
    settings.extraAuthorizeParams,
  );

  const errors = [];

  let normalizedIssuer = "";
  let normalizedDiscoveryUrl = "";
  let normalizedPublicBaseUrl = "";

  try {
    normalizedIssuer = normalizeAbsoluteUrl(issuer, "Issuer URL", {
      allowLoopbackHttp: true,
      stripTrailingSlash: true,
    });
  } catch (error) {
    errors.push(error.message);
  }

  if (discoveryUrl) {
    try {
      normalizedDiscoveryUrl = normalizeAbsoluteUrl(
        discoveryUrl,
        "Discovery URL",
        {
          allowLoopbackHttp: true,
          stripTrailingSlash: true,
        },
      );
    } catch (error) {
      errors.push(error.message);
    }
  }

  try {
    normalizedPublicBaseUrl = normalizeAbsoluteUrl(
      publicBaseUrl,
      "Public base URL",
      {
        allowLoopbackHttp: true,
        stripTrailingSlash: true,
      },
    );
  } catch (error) {
    errors.push(error.message);
  }

  if (!clientId) {
    errors.push("Client ID is required");
  }

  if (!SUPPORTED_AUTH_METHODS.has(tokenEndpointAuthMethod)) {
    errors.push(
      "Token endpoint auth method must be client_secret_basic, client_secret_post, or none",
    );
  }

  if (tokenEndpointAuthMethod !== "none" && !asString(clientSecret)) {
    errors.push("Client secret is required unless auth method is none");
  }

  if (!/\bopenid\b/.test(scopes)) {
    errors.push("Scopes must include openid");
  }

  for (const { key } of extraAuthorizeParams) {
    if (RESERVED_AUTHORIZE_PARAMS.has(key)) {
      errors.push(`Authorization extra param "${key}" is reserved`);
    }
  }

  const hasAuthorizationRule =
    allowAnyAuthenticatedUser ||
    allowedEmails.size > 0 ||
    allowedDomains.size > 0 ||
    allowedGroups.size > 0 ||
    requiredClaims.length > 0;
  if (!hasAuthorizationRule) {
    errors.push(
      "Configure at least one admin allow rule, or explicitly enable allowAnyAuthenticatedUser",
    );
  }

  if (errors.length > 0) {
    throw new Error(errors.join("; "));
  }

  return {
    issuer: normalizedIssuer,
    discoveryUrl: normalizedDiscoveryUrl,
    publicBaseUrl: normalizedPublicBaseUrl,
    clientId,
    clientSecret: asString(clientSecret),
    providerLabel,
    tokenEndpointAuthMethod,
    scopes,
    groupsClaim,
    allowAnyAuthenticatedUser,
    requireVerifiedEmail,
    userInfoFallback,
    clockSkewSeconds,
    allowedEmails,
    allowedDomains,
    allowedGroups,
    requiredClaims,
    extraAuthorizeParams,
  };
}

function buildDiscoveryUrl(config) {
  if (config.discoveryUrl) {
    return config.discoveryUrl;
  }
  return `${config.issuer}/.well-known/openid-configuration`;
}

async function fetchJson(url, init, label) {
  const response = await fetchImpl(url, {
    ...init,
    redirect: "error",
    headers: {
      accept: "application/json",
      ...(init?.headers || {}),
    },
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${label} did not return valid JSON`);
  }

  if (!response.ok) {
    throw new Error(`${label} failed with HTTP ${response.status}`);
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`${label} returned an invalid JSON object`);
  }

  return { data, response };
}

async function loadDiscovery(config, forceRefresh = false) {
  const cacheKey = `discovery:${buildDiscoveryUrl(config)}`;
  if (!forceRefresh) {
    const cached = await discoveryCache.get(cacheKey);
    if (cached) return cached;
  }

  const { data, response } = await fetchJson(
    buildDiscoveryUrl(config),
    undefined,
    "OIDC discovery",
  );

  const issuer = normalizeAbsoluteUrl(data.issuer, "Discovery issuer", {
    allowLoopbackHttp: true,
    stripTrailingSlash: true,
  });
  if (issuer !== config.issuer) {
    throw new Error("Discovery issuer does not match the configured issuer");
  }

  const authorizationEndpoint = normalizeAbsoluteUrl(
    data.authorization_endpoint,
    "Authorization endpoint",
    { allowLoopbackHttp: true },
  );
  const tokenEndpoint = normalizeAbsoluteUrl(
    data.token_endpoint,
    "Token endpoint",
    { allowLoopbackHttp: true },
  );
  const jwksUri = normalizeAbsoluteUrl(data.jwks_uri, "JWKS URI", {
    allowLoopbackHttp: true,
  });
  const userinfoEndpoint = data.userinfo_endpoint
    ? normalizeAbsoluteUrl(data.userinfo_endpoint, "Userinfo endpoint", {
      allowLoopbackHttp: true,
    })
    : "";

  if (
    Array.isArray(data.response_types_supported) &&
    !data.response_types_supported.includes("code")
  ) {
    throw new Error("Provider does not advertise the code response type");
  }

  if (
    Array.isArray(data.code_challenge_methods_supported) &&
    !data.code_challenge_methods_supported.includes("S256")
  ) {
    throw new Error("Provider does not advertise PKCE S256 support");
  }

  if (
    Array.isArray(data.token_endpoint_auth_methods_supported) &&
    !data.token_endpoint_auth_methods_supported.includes(
      config.tokenEndpointAuthMethod,
    )
  ) {
    throw new Error(
      `Provider does not advertise ${config.tokenEndpointAuthMethod} token auth`,
    );
  }

  const discovery = {
    issuer,
    authorizationEndpoint,
    tokenEndpoint,
    jwksUri,
    userinfoEndpoint,
    idTokenSigningAlgs: Array.isArray(data.id_token_signing_alg_values_supported)
      ? data.id_token_signing_alg_values_supported
      : [],
  };

  const ttl =
    parseCacheControlMaxAge(response.headers.get("cache-control")) ||
    DISCOVERY_TTL_MS;
  await discoveryCache.set(cacheKey, discovery, ttl);
  return discovery;
}

async function loadJwks(discovery, forceRefresh = false) {
  const cacheKey = `jwks:${discovery.jwksUri}`;
  if (!forceRefresh) {
    const cached = await jwksCache.get(cacheKey);
    if (cached) return cached;
  }

  const { data, response } = await fetchJson(discovery.jwksUri, undefined, "JWKS");
  if (!Array.isArray(data.keys)) {
    throw new Error("JWKS response did not include a keys array");
  }

  const jwks = { keys: data.keys };
  const ttl =
    parseCacheControlMaxAge(response.headers.get("cache-control")) ||
    JWKS_TTL_MS;
  await jwksCache.set(cacheKey, jwks, ttl);
  return jwks;
}

function getVerifyAlgorithm(alg) {
  switch (alg) {
    case "RS256":
      return {
        importAlgorithm: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        verifyAlgorithm: { name: "RSASSA-PKCS1-v1_5" },
      };
    case "RS384":
      return {
        importAlgorithm: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-384" },
        verifyAlgorithm: { name: "RSASSA-PKCS1-v1_5" },
      };
    case "RS512":
      return {
        importAlgorithm: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-512" },
        verifyAlgorithm: { name: "RSASSA-PKCS1-v1_5" },
      };
    case "PS256":
      return {
        importAlgorithm: { name: "RSA-PSS", hash: "SHA-256" },
        verifyAlgorithm: { name: "RSA-PSS", saltLength: 32 },
      };
    case "PS384":
      return {
        importAlgorithm: { name: "RSA-PSS", hash: "SHA-384" },
        verifyAlgorithm: { name: "RSA-PSS", saltLength: 48 },
      };
    case "PS512":
      return {
        importAlgorithm: { name: "RSA-PSS", hash: "SHA-512" },
        verifyAlgorithm: { name: "RSA-PSS", saltLength: 64 },
      };
    case "ES256":
      return {
        importAlgorithm: { name: "ECDSA", namedCurve: "P-256" },
        verifyAlgorithm: { name: "ECDSA", hash: "SHA-256" },
      };
    case "ES384":
      return {
        importAlgorithm: { name: "ECDSA", namedCurve: "P-384" },
        verifyAlgorithm: { name: "ECDSA", hash: "SHA-384" },
      };
    case "ES512":
      return {
        importAlgorithm: { name: "ECDSA", namedCurve: "P-521" },
        verifyAlgorithm: { name: "ECDSA", hash: "SHA-512" },
      };
    case "EdDSA":
      return {
        importAlgorithm: { name: "Ed25519" },
        verifyAlgorithm: { name: "Ed25519" },
      };
    default:
      throw new Error(`Unsupported ID token algorithm: ${alg}`);
  }
}

function filterCandidateKeys(keys, header) {
  return keys.filter((jwk) => {
    if (!jwk || typeof jwk !== "object") return false;
    if (typeof header.kid === "string" && header.kid && jwk.kid !== header.kid) {
      return false;
    }
    if (typeof jwk.use === "string" && jwk.use !== "sig") return false;
    if (Array.isArray(jwk.key_ops) && !jwk.key_ops.includes("verify")) {
      return false;
    }
    if (typeof jwk.alg === "string" && jwk.alg !== header.alg) return false;
    return true;
  });
}

async function verifySignatureWithJwks(header, signingInput, signature, jwks) {
  const candidates = filterCandidateKeys(jwks.keys, header);
  if (candidates.length === 0) return false;

  for (const jwk of candidates) {
    try {
      const algorithms = getVerifyAlgorithm(header.alg);
      const key = await crypto.subtle.importKey(
        "jwk",
        jwk,
        algorithms.importAlgorithm,
        false,
        ["verify"],
      );
      const verified = await crypto.subtle.verify(
        algorithms.verifyAlgorithm,
        key,
        signature,
        signingInput,
      );
      if (verified) return true;
    } catch {
      continue;
    }
  }

  return false;
}

function validateIdTokenClaims(payload, config, expectedNonce) {
  const now = Math.floor(Date.now() / 1000);
  const skew = config.clockSkewSeconds;

  const issuer = asString(payload.iss);
  if (!issuer) {
    throw new Error("ID token iss claim is missing");
  }
  const normalizedIssuer = normalizeAbsoluteUrl(issuer, "ID token issuer", {
    allowLoopbackHttp: true,
    stripTrailingSlash: true,
  });
  if (normalizedIssuer !== config.issuer) {
    throw new Error("ID token issuer does not match");
  }

  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(config.clientId)) {
    throw new Error("ID token audience does not include the client ID");
  }

  if (audiences.length > 1 && asString(payload.azp) !== config.clientId) {
    throw new Error("ID token azp must equal the client ID when aud is multi-valued");
  }

  if (typeof payload.sub !== "string" || !payload.sub) {
    throw new Error("ID token sub claim is missing");
  }

  if (typeof payload.exp !== "number" || now - skew >= payload.exp) {
    throw new Error("ID token is expired");
  }

  if (typeof payload.nbf === "number" && now + skew < payload.nbf) {
    throw new Error("ID token is not yet valid");
  }

  if (typeof payload.iat === "number" && payload.iat > now + skew) {
    throw new Error("ID token iat is in the future");
  }

  if (typeof payload.nonce !== "string" || payload.nonce !== expectedNonce) {
    throw new Error("ID token nonce does not match");
  }
}

async function verifyIdToken(idToken, config, discovery, expectedNonce) {
  const segments = String(idToken || "").split(".");
  if (segments.length !== 3) {
    throw new Error("ID token must be a JWS with three segments");
  }

  const header = parseBase64UrlJson(segments[0], "JWT header");
  const payload = parseBase64UrlJson(segments[1], "JWT payload");

  if (typeof header.alg !== "string" || !header.alg || header.alg === "none") {
    throw new Error("ID token alg is missing or unsupported");
  }

  if (
    discovery.idTokenSigningAlgs.length > 0 &&
    !discovery.idTokenSigningAlgs.includes(header.alg)
  ) {
    throw new Error("ID token alg is not advertised by the provider");
  }

  const signingInput = utf8Bytes(`${segments[0]}.${segments[1]}`);
  const signature = base64UrlDecode(segments[2], "JWT signature");

  let jwks = await loadJwks(discovery, false);
  let verified = await verifySignatureWithJwks(header, signingInput, signature, jwks);
  if (!verified) {
    jwks = await loadJwks(discovery, true);
    verified = await verifySignatureWithJwks(header, signingInput, signature, jwks);
  }
  if (!verified) {
    throw new Error("ID token signature verification failed");
  }

  validateIdTokenClaims(payload, config, expectedNonce);
  return payload;
}

function readClaim(claims, path) {
  if (!path) return undefined;
  return String(path)
    .split(".")
    .filter(Boolean)
    .reduce((value, segment) => {
      if (value === null || value === undefined) return undefined;
      if (Array.isArray(value) && /^\d+$/.test(segment)) {
        return value[Number.parseInt(segment, 10)];
      }
      if (typeof value !== "object") return undefined;
      return value[segment];
    }, claims);
}

function claimMatchesExpected(actual, expected) {
  if (Array.isArray(actual)) {
    return actual.some((item) => claimMatchesExpected(item, expected));
  }
  if (actual === undefined || actual === null) return false;
  return String(actual) === expected;
}

function authorizeClaims(config, claims) {
  const email = asString(readClaim(claims, "email")).toLowerCase();
  const emailVerified = readClaim(claims, "email_verified");
  const emailTrusted =
    email &&
    (!config.requireVerifiedEmail ||
      emailVerified === true ||
      String(emailVerified).toLowerCase() === "true");

  const emailRulesConfigured =
    config.allowedEmails.size > 0 || config.allowedDomains.size > 0;
  const exactEmailMatch =
    emailTrusted && config.allowedEmails.size > 0 && config.allowedEmails.has(email);
  const domainMatch =
    emailTrusted &&
    config.allowedDomains.size > 0 &&
    (() => {
      const domain = email.split("@")[1];
      return !!domain && config.allowedDomains.has(domain);
    })();

  const groupsValue = readClaim(claims, config.groupsClaim);
  const groupMatch =
    config.allowedGroups.size > 0 &&
    (Array.isArray(groupsValue)
      ? groupsValue.some((entry) => config.allowedGroups.has(String(entry)))
      : config.allowedGroups.has(String(groupsValue)));

  const requiredClaimsMatch = config.requiredClaims.every(({ claim, value }) =>
    claimMatchesExpected(readClaim(claims, claim), value),
  );

  const selectorConfigured =
    config.allowAnyAuthenticatedUser ||
    config.allowedEmails.size > 0 ||
    config.allowedDomains.size > 0 ||
    config.allowedGroups.size > 0;

  const selectorMatch =
    config.allowAnyAuthenticatedUser ||
    exactEmailMatch ||
    domainMatch ||
    groupMatch ||
    (!selectorConfigured && config.requiredClaims.length > 0);

  return {
    ok: selectorMatch && requiredClaimsMatch,
    reason: selectorMatch ? "claims-mismatch" : "not-allowed",
  };
}

function mergeMissingClaims(primaryClaims, fallbackClaims) {
  const merged = { ...fallbackClaims };
  for (const [key, value] of Object.entries(primaryClaims)) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }
  return merged;
}

function buildCallbackUrl(config) {
  return `${config.publicBaseUrl}/api/settings/auth/callback`;
}

function buildAuthorizationUrl(config, discovery, flow) {
  const url = new URL(discovery.authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", buildCallbackUrl(config));
  url.searchParams.set("scope", config.scopes);
  url.searchParams.set("state", flow.state);
  url.searchParams.set("nonce", flow.nonce);
  url.searchParams.set("code_challenge", flow.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  for (const { key, value } of config.extraAuthorizeParams) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

async function exchangeCodeForTokens(config, discovery, code, codeVerifier) {
  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("code", code);
  body.set("redirect_uri", buildCallbackUrl(config));
  body.set("client_id", config.clientId);
  body.set("code_verifier", codeVerifier);

  const headers = {
    "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    accept: "application/json",
  };

  if (config.tokenEndpointAuthMethod === "client_secret_post") {
    body.set("client_secret", config.clientSecret);
  } else if (config.tokenEndpointAuthMethod === "client_secret_basic") {
    headers.authorization = `Basic ${Buffer.from(
      `${config.clientId}:${config.clientSecret}`,
      "utf8",
    ).toString("base64")}`;
  }

  const { data } = await fetchJson(
    discovery.tokenEndpoint,
    {
      method: "POST",
      headers,
      body: body.toString(),
    },
    "Token exchange",
  );

  if (typeof data.id_token !== "string" || !data.id_token) {
    throw new Error("Token response did not include an id_token");
  }

  return {
    idToken: data.id_token,
    accessToken: typeof data.access_token === "string" ? data.access_token : "",
  };
}

async function maybeLoadUserInfo(config, discovery, accessToken) {
  if (
    !config.userInfoFallback ||
    !discovery.userinfoEndpoint ||
    !accessToken
  ) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), USERINFO_TIMEOUT_MS);

  try {
    const { data } = await fetchJson(
      discovery.userinfoEndpoint,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        signal: controller.signal,
      },
      "Userinfo",
    );
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function needsUserInfo(config, claims) {
  if (config.allowAnyAuthenticatedUser) {
    return false;
  }

  const emailRequired =
    config.allowedEmails.size > 0 || config.allowedDomains.size > 0;
  if (emailRequired && !asString(readClaim(claims, "email"))) {
    return true;
  }

  if (config.allowedGroups.size > 0 && readClaim(claims, config.groupsClaim) === undefined) {
    return true;
  }

  return config.requiredClaims.some(
    ({ claim }) => readClaim(claims, claim) === undefined,
  );
}

async function buildSettingsAuthResponse(request) {
  const config = buildRuntimeConfig();
  const referer = request.headers.get("referer");
  const returnTo = sanitizeReturnTo(config.publicBaseUrl, referer);
  const loginUrl = new URL(
    buildAppPath(config.publicBaseUrl, `${apiBase}/login`),
    config.publicBaseUrl,
  );
  loginUrl.searchParams.set("returnTo", returnTo);

  return jsonResponse({
    required: true,
    valid: false,
    loginUrl: loginUrl.pathname + loginUrl.search,
    providerLabel: config.providerLabel,
  });
}

async function beginLogin(request) {
  const config = buildRuntimeConfig();
  const discovery = await loadDiscovery(config);
  const requestUrl = new URL(request.url);
  const returnTo = sanitizeReturnTo(
    config.publicBaseUrl,
    requestUrl.searchParams.get("returnTo"),
  );
  const codeVerifier = randomToken(48);
  const flow = {
    state: randomToken(32),
    nonce: randomToken(32),
    codeVerifier,
    codeChallenge: sha256Base64Url(codeVerifier),
    returnTo,
  };

  await flowCache.set(flow.state, {
    nonce: flow.nonce,
    codeVerifier: flow.codeVerifier,
    returnTo: flow.returnTo,
  });

  return Response.redirect(buildAuthorizationUrl(config, discovery, flow), 302);
}

async function finishLogin(request) {
  const config = buildRuntimeConfig();
  const discovery = await loadDiscovery(config);
  const url = new URL(request.url);
  const providerError = asString(url.searchParams.get("error"));
  if (providerError) {
    const description = asString(url.searchParams.get("error_description"));
    return textResponse(
      `OIDC sign-in failed: ${providerError}${description ? ` (${description})` : ""}`,
      401,
    );
  }

  const state = asString(url.searchParams.get("state"));
  const code = asString(url.searchParams.get("code"));
  if (!state || !code) {
    return textResponse("OIDC callback is missing the state or code", 400);
  }

  const flow = await flowCache.get(state);
  await flowCache.delete(state);
  if (!flow) {
    return textResponse("OIDC login state is missing or expired", 400);
  }

  const tokens = await exchangeCodeForTokens(
    config,
    discovery,
    code,
    flow.codeVerifier,
  );
  const idClaims = await verifyIdToken(
    tokens.idToken,
    config,
    discovery,
    flow.nonce,
  );

  const userInfo = needsUserInfo(config, idClaims)
    ? await maybeLoadUserInfo(config, discovery, tokens.accessToken)
    : null;
  const claims = userInfo ? mergeMissingClaims(idClaims, userInfo) : idClaims;
  const authorization = authorizeClaims(config, claims);
  if (!authorization.ok) {
    return textResponse("OIDC user is authenticated but not allowed to administer degoog", 403);
  }

  return { redirect: flow.returnTo };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function textResponse(message, status) {
  return new Response(message, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function logAuthError(stage, error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[oidc-settings-gate] ${stage}: ${message}`);
}

export const middleware = {
  name: PLUGIN_NAME,
  description: PLUGIN_DESCRIPTION,
  isClientExposed: false,
  settingsSchema: [
    {
      key: "publicBaseUrl",
      label: "Public base URL",
      type: "url",
      required: true,
      placeholder: "https://search.example.com",
      description:
        "The externally visible base URL of this degoog instance. Used to build the exact OIDC callback URI.",
    },
    {
      key: "issuer",
      label: "Issuer URL",
      type: "url",
      required: true,
      placeholder: "https://auth.example.com/application/o/degoog/",
      description:
        "Exact OIDC issuer URL from your provider metadata. Authentik, Authelia, Keycloak, Tinyauth, and similar providers should expose this.",
    },
    {
      key: "discoveryUrl",
      label: "Discovery URL override",
      type: "url",
      advanced: true,
      placeholder:
        "https://auth.example.com/application/o/degoog/.well-known/openid-configuration",
      description:
        "Optional override when the discovery document is not at issuer + /.well-known/openid-configuration.",
    },
    {
      key: "clientId",
      label: "Client ID",
      type: "text",
      required: true,
      placeholder: "degoog-admin",
    },
    {
      key: "providerLabel",
      label: "Provider label",
      type: "text",
      default: "OIDC",
      placeholder: "Authentik",
      description:
        "Shown on the gate page button as 'Sign in with X'.",
    },
    {
      key: "tokenEndpointAuthMethod",
      label: "Token endpoint auth method",
      type: "select",
      default: "client_secret_basic",
      options: ["client_secret_basic", "client_secret_post", "none"],
      description:
        "Use confidential-client auth by default. 'none' is only for providers configured as PKCE-only public clients.",
    },
    {
      key: "clientSecret",
      label: "Client secret",
      type: "password",
      secret: true,
      placeholder: "Only optional when auth method is none",
      description:
        "Required for client_secret_basic and client_secret_post. Leave blank only if your provider is explicitly configured as a PKCE-only public client.",
    },
    {
      key: "scopes",
      label: "Scopes",
      type: "text",
      default: "openid profile email",
      placeholder: "openid profile email groups",
      description:
        "Space-separated OIDC scopes. Include any provider-specific scope needed for group or role claims.",
    },
    {
      key: "extraAuthorizeParams",
      label: "Extra authorize params",
      type: "list",
      advanced: true,
      addLabel: "+ Add auth param",
      description:
        "Optional provider-specific authorization request parameters such as prompt, audience, or acr_values.",
      itemSchema: [
        { key: "key", label: "Param", type: "text" },
        { key: "value", label: "Value", type: "text" },
      ],
    },
    {
      key: "allowAnyAuthenticatedUser",
      label: "Allow any authenticated user",
      type: "toggle",
      default: false,
      description:
        "Disabled by default. Leave this off and use the allow rules below so authentication alone never grants admin access by accident.",
    },
    {
      key: "allowedEmails",
      label: "Allowed emails",
      type: "textarea",
      placeholder: "admin@example.com\nops@example.com",
      description:
        "Optional exact-email allowlist. One email per line or comma-separated.",
    },
    {
      key: "allowedDomains",
      label: "Allowed email domains",
      type: "textarea",
      placeholder: "example.com\ninternal.example",
      description:
        "Optional domain allowlist. One domain per line or comma-separated.",
    },
    {
      key: "requireVerifiedEmail",
      label: "Require verified email",
      type: "toggle",
      default: true,
      description:
        "Recommended. Email-based allow rules only pass if the provider marks the email as verified.",
    },
    {
      key: "groupsClaim",
      label: "Groups claim path",
      type: "text",
      default: "groups",
      placeholder: "groups or realm_access.roles",
      description:
        "Dot-path to the group or role claim used for group-based admin allow rules.",
    },
    {
      key: "allowedGroups",
      label: "Allowed groups",
      type: "textarea",
      placeholder: "degoog-admins\nplatform-admins",
      description:
        "Optional exact group or role allowlist. One value per line or comma-separated.",
    },
    {
      key: "requiredClaims",
      label: "Required claims",
      type: "list",
      addLabel: "+ Add required claim",
      description:
        "Optional exact-match claim requirements. Every row must match for access to be granted.",
      itemSchema: [
        { key: "claim", label: "Claim path", type: "text" },
        { key: "value", label: "Expected value", type: "text" },
      ],
    },
    {
      key: "userInfoFallback",
      label: "Use userinfo when claims are missing",
      type: "toggle",
      default: true,
      advanced: true,
      description:
        "When enabled, the plugin can fill missing profile or group claims from the provider's userinfo endpoint.",
    },
    {
      key: "clockSkewSeconds",
      label: "Clock skew seconds",
      type: "text",
      default: "60",
      advanced: true,
      placeholder: "60",
      description:
        "Allowed token timestamp skew. Keep this small unless you know your clocks drift.",
    },
  ],
  async init(ctx) {
    apiBase = ctx.apiBase;
    fetchImpl = ctx.fetch || fetchImpl;
    flowCache = ctx.useCache
      ? ctx.useCache("oidc-settings-gate:flows", FLOW_TTL_MS)
      : flowCache;
    discoveryCache = ctx.useCache
      ? ctx.useCache("oidc-settings-gate:discovery", DISCOVERY_TTL_MS)
      : discoveryCache;
    jwksCache = ctx.useCache
      ? ctx.useCache("oidc-settings-gate:jwks", JWKS_TTL_MS)
      : jwksCache;
  },
  configure(settings) {
    rawSettings = settings || {};
  },
  async handle(request, context) {
    try {
      switch (context?.route) {
        case "settings-auth":
          return await buildSettingsAuthResponse(request);
        case "settings-auth-post":
          return jsonResponse({ ok: false, error: "Use the OIDC login flow" }, 400);
        case "settings-auth-callback":
          return await finishLogin(request);
        default:
          return null;
      }
    } catch (error) {
      logAuthError(context?.route || "middleware", error);
      const status = context?.route === "settings-auth" ? 503 : 500;
      return context?.route === "settings-auth"
        ? jsonResponse(
          {
            required: true,
            valid: false,
            error: "oidc-settings-gate-misconfigured",
          },
          status,
        )
        : textResponse("OIDC settings authentication failed", status);
    }
  },
};

export const routes = [
  {
    method: "get",
    path: "login",
    async handler(request) {
      try {
        return await beginLogin(request);
      } catch (error) {
        logAuthError("login", error);
        return textResponse("OIDC login could not be started", 500);
      }
    },
  },
];

export const __test = {
  authorizeClaims,
  buildAuthorizationUrl,
  buildCallbackUrl,
  buildRuntimeConfig,
  sanitizeReturnTo,
  splitLinesOrCommas,
  validateIdTokenClaims,
  verifyIdToken,
  verifySignatureWithJwks,
};
