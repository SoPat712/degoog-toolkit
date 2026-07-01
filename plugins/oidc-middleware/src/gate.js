import {
  getConfig,
  getCtx,
  stashHandoff,
  sweepHandoffs,
} from "./state.js";
import { isConfigured } from "./settings.js";
import {
  readCookie,
  clearCookie,
  OIDC_STATE,
  OIDC_NONCE,
  OIDC_VERIFIER,
} from "./cookies.js";
import {
  exchangeCode,
  verifyIdToken,
  fetchUserInfo,
  handoffCode,
} from "./oidc.js";
import { isAllowed, readClaim, toProfile } from "./authz.js";

const HANDOFF_TTL_MS = 2 * 60 * 1000;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });

const sanitizeReturnTo = (req, candidate) => {
  const origin = originOf(req);
  const fallback = "/settings";
  if (!candidate) return fallback;
  try {
    const url = new URL(candidate, origin);
    if (url.origin !== origin) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
};

const originOf = (req) =>
  getConfig()?.appUrl || new URL(req.url).origin;

const bounce = (req) =>
  new Response(null, {
    status: 302,
    headers: (() => {
      const headers = new Headers({ location: `${originOf(req)}/` });
      for (const name of [OIDC_STATE, OIDC_NONCE, OIDC_VERIFIER]) {
        headers.append("set-cookie", clearCookie(name));
      }
      return headers;
    })(),
  });

const debug = (...args) => {
  if (getConfig()?.debug) console.log("[oidc]", ...args);
};

const onAuthCheck = (req) => {
  const config = getConfig();
  if (!isConfigured(config)) {
    return json({ required: true, valid: false, error: "auth-misconfigured" });
  }
  const ctx = getCtx();
  const url = new URL(req.url);
  const returnTo = sanitizeReturnTo(
    req,
    url.searchParams.get("returnTo") || req.headers.get("referer") || "/settings",
  );
  return json({
    required: true,
    valid: false,
    loginUrl: ctx
      ? ctx.routeUrl(`login?returnTo=${encodeURIComponent(returnTo)}`)
      : "/api/settings/auth",
    providerLabel: config.providerLabel || "OIDC",
    autoRedirect: config.autoRedirect === true,
  });
};

const needsUserinfo = (config, claims) => {
  const missingId =
    !claims.email && !claims.preferred_username && !claims.name;
  const missingGroups =
    config.allowedGroups.length > 0 && readClaim(claims, config.groupsClaim) == null;
  const missingRoles =
    config.allowedRoles.length > 0 && readClaim(claims, config.rolesClaim) == null;
  const missingEmailRule =
    (config.allowedEmails.length > 0 || config.allowedDomains.length > 0) &&
    !claims.email;
  const missingRequiredClaim = config.requiredClaims.some(
    ({ claim }) => readClaim(claims, claim) == null,
  );
  return missingId || missingGroups || missingRoles || missingEmailRule || missingRequiredClaim;
};

const onCallback = async (req) => {
  const config = getConfig();
  if (!isConfigured(config)) return bounce(req);

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const savedState = readCookie(req, OIDC_STATE);
  const verifier = readCookie(req, OIDC_VERIFIER);
  const nonce = readCookie(req, OIDC_NONCE);

  if (!code || !state || !savedState || state !== savedState || !verifier) {
    debug("callback rejected: state or verifier mismatch");
    return bounce(req);
  }

  try {
    const redirectUri = `${originOf(req)}/api/settings/auth/callback`;
    const token = await exchangeCode(config, redirectUri, code, verifier);
    if (!token.id_token) throw new Error("no id_token in token response");

    let claims = await verifyIdToken(config, token.id_token, nonce);
    if (needsUserinfo(config, claims)) {
      const extra = await fetchUserInfo(config, token.access_token);
      claims = { ...extra, ...claims };
    }

    if (!isAllowed(config, claims)) {
      debug("user not allowed:", claims.email || claims.sub);
      return bounce(req);
    }

    const code2 = handoffCode();
    sweepHandoffs();
    stashHandoff(code2, toProfile(claims), HANDOFF_TTL_MS);
    const ctx = getCtx();
    return { redirect: ctx ? ctx.routeUrl(`claim?c=${code2}`) : `${originOf(req)}/` };
  } catch (err) {
    console.error("[oidc] callback failed:", err?.message || err);
    return bounce(req);
  }
};

export const handle = async (req, context = {}) => {
  if (context.route === "settings-auth") return onAuthCheck(req);
  if (context.route === "settings-auth-callback") return onCallback(req);
  return null;
};
