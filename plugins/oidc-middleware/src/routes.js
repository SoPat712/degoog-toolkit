import { getConfig, claimHandoff } from "./state.js";
import { isConfigured } from "./settings.js";
import {
  readCookie,
  bakeCookie,
  clearCookie,
  isHttps,
  signIdentity,
  readIdentity,
  USER_COOKIE,
  SESSION_COOKIE,
  OIDC_STATE,
  OIDC_NONCE,
  OIDC_VERIFIER,
  OIDC_RETURN_TO,
} from "./cookies.js";
import { buildAuthUrl, makePkce, randomToken } from "./oidc.js";

const TEMP_MAX_AGE_S = 600;
const IDENTITY_TTL_MS = 12 * 60 * 60 * 1000;

const json = (obj, headers) =>
  new Response(JSON.stringify(obj), {
    status: 200,
    headers: headers || { "content-type": "application/json" },
  });

const redirect = (location, cookies = []) => {
  const headers = new Headers({ location });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(null, { status: 302, headers });
};

const originOf = (req) => getConfig()?.appUrl || new URL(req.url).origin;

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

const tempCookie = (name, value, req) =>
  bakeCookie(name, value, {
    httpOnly: true,
    sameSite: "Lax",
    maxAge: TEMP_MAX_AGE_S,
    secure: isHttps(req),
  });

const onLogin = async (req) => {
  const config = getConfig();
  if (!isConfigured(config)) return redirect(`${originOf(req)}/`);
  try {
    const requestUrl = new URL(req.url);
    const returnTo = sanitizeReturnTo(req, requestUrl.searchParams.get("returnTo"));
    const pkce = makePkce();
    const state = randomToken();
    const nonce = randomToken();
    const redirectUri = `${originOf(req)}/api/settings/auth/callback`;
    const authUrl = await buildAuthUrl(config, redirectUri, pkce, state, nonce);
    return redirect(authUrl, [
      tempCookie(OIDC_STATE, state, req),
      tempCookie(OIDC_NONCE, nonce, req),
      tempCookie(OIDC_VERIFIER, pkce.verifier, req),
      tempCookie(OIDC_RETURN_TO, encodeURIComponent(returnTo), req),
    ]);
  } catch (err) {
    console.error("[oidc] login init failed:", err?.message || err);
    return redirect(`${originOf(req)}/?oidc_error=login`);
  }
};

const onClaim = (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("c") || "";
  const profile = code ? claimHandoff(code) : null;
  const returnTo = sanitizeReturnTo(
    req,
    decodeURIComponent(readCookie(req, OIDC_RETURN_TO) || "/settings"),
  );
  const clear = [
    clearCookie(OIDC_STATE),
    clearCookie(OIDC_NONCE),
    clearCookie(OIDC_VERIFIER),
    clearCookie(OIDC_RETURN_TO),
  ];
  if (!profile) return redirect(`${originOf(req)}${returnTo}`, clear);
  const identity = bakeCookie(USER_COOKIE, signIdentity(profile, IDENTITY_TTL_MS), {
    httpOnly: true,
    sameSite: "Lax",
    maxAge: IDENTITY_TTL_MS / 1000,
    secure: isHttps(req),
  });
  return redirect(`${originOf(req)}${returnTo}`, [identity, ...clear]);
};

const onMe = (req) => {
  const identity = readIdentity(readCookie(req, USER_COOKIE));
  if (!identity) return json({ authenticated: false });
  return json({
    authenticated: true,
    email: identity.email || "",
    name: identity.name || "",
    picture: identity.picture || "",
  });
};

const onLogout = () => {
  const headers = new Headers({ "content-type": "application/json" });
  headers.append("set-cookie", clearCookie(USER_COOKIE));
  headers.append("set-cookie", clearCookie(SESSION_COOKIE));
  return json({ ok: true }, headers);
};

export const routes = [
  { method: "get", path: "login", handler: onLogin },
  { method: "get", path: "claim", handler: onClaim },
  { method: "get", path: "me", handler: onMe },
  { method: "post", path: "logout", handler: onLogout },
];
