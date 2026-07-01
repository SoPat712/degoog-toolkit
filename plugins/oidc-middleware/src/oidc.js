import crypto from "node:crypto";
import { discover, fetchJwks } from "./discovery.js";
import { decodeJwt, verifyJwt, validateClaims } from "./jwt.js";
import { pluginFetch } from "./state.js";

const b64url = (buf) => buf.toString("base64url");
const sha256 = (str) => crypto.createHash("sha256").update(str).digest();

export const makePkce = () => {
  const verifier = b64url(crypto.randomBytes(32));
  return { verifier, challenge: b64url(sha256(verifier)) };
};

export const randomToken = () => b64url(crypto.randomBytes(16));
export const handoffCode = () => b64url(crypto.randomBytes(32));

const wantsGroups = (config) => {
  if (config.allowedGroups.length === 0) return false;
  const scope = config.groupsScope.toLowerCase();
  return !!scope && scope !== "no" && scope !== "false";
};

export const buildAuthUrl = async (config, redirectUri, pkce, state, nonce) => {
  const doc = await discover(config.issuer);
  const scope = wantsGroups(config)
    ? `${config.scopes} ${config.groupsScope}`
    : config.scopes;
  const url = new URL(doc.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scope);
  url.searchParams.set("code_challenge", pkce.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  return url.toString();
};

export const exchangeCode = async (config, redirectUri, code, verifier) => {
  const doc = await discover(config.issuer);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: config.clientId,
    code_verifier: verifier,
  });
  const headers = { "content-type": "application/x-www-form-urlencoded" };
  if (config.clientSecret) body.set("client_secret", config.clientSecret);
  const res = await pluginFetch(doc.token_endpoint, {
    method: "POST",
    headers,
    body,
  });
  if (!res.ok) throw new Error(`token exchange ${res.status}`);
  return res.json();
};

export const verifyIdToken = async (config, idToken, nonce) => {
  const doc = await discover(config.issuer);
  const jwks = await fetchJwks(doc.jwks_uri);
  const claims = verifyJwt(idToken, jwks);
  validateClaims(claims, {
    issuer: doc.issuer || config.issuer,
    clientId: config.clientId,
    nonce,
  });
  return claims;
};

export const fetchUserInfo = async (config, accessToken) => {
  const doc = await discover(config.issuer);
  if (!doc.userinfo_endpoint || !accessToken) return {};
  const res = await pluginFetch(doc.userinfo_endpoint, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return {};
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("jwt")) {
    try {
      return decodeJwt(await res.text()).payload;
    } catch (err) {
      console.error("[oidc] userinfo jwt decode failed:", err?.message || err);
      return {};
    }
  }
  return res.json();
};
