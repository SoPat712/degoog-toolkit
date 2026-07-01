import crypto from "node:crypto";

const RS_HASHES = { RS256: "sha256", RS384: "sha384", RS512: "sha512" };
const CLOCK_SKEW_S = 5;

const b64urlJson = (seg) =>
  JSON.parse(Buffer.from(seg, "base64url").toString("utf8"));

export const decodeJwt = (token) => {
  const parts = String(token).split(".");
  if (parts.length !== 3) throw new Error("malformed jwt");
  return { header: b64urlJson(parts[0]), payload: b64urlJson(parts[1]), parts };
};

const pickKey = (jwks, kid) => {
  const keys = Array.isArray(jwks?.keys) ? jwks.keys : [];
  if (keys.length === 0) throw new Error("no jwks keys");
  return keys.find((k) => k.kid === kid) || (keys.length === 1 ? keys[0] : null);
};

export const verifyJwt = (token, jwks) => {
  const { header, parts } = decodeJwt(token);
  const hash = RS_HASHES[header.alg];
  if (!hash) throw new Error(`unsupported alg ${header.alg}`);
  const jwk = pickKey(jwks, header.kid);
  if (!jwk) throw new Error(`no jwks key for kid ${header.kid}`);
  const key = crypto.createPublicKey({ key: jwk, format: "jwk" });
  const signed = `${parts[0]}.${parts[1]}`;
  const sig = Buffer.from(parts[2], "base64url");
  if (!crypto.createVerify(hash).update(signed).verify(key, sig)) {
    throw new Error("signature verification failed");
  }
  return b64urlJson(parts[1]);
};

export const validateClaims = (claims, { issuer, clientId, nonce }) => {
  if (claims.iss !== issuer) throw new Error("iss mismatch");
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(clientId)) throw new Error("aud mismatch");
  if (aud.length > 1 && claims.azp !== clientId) throw new Error("azp mismatch");
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp === "number" && now > claims.exp + CLOCK_SKEW_S) {
    throw new Error("token expired");
  }
  if (typeof claims.nbf === "number" && now + CLOCK_SKEW_S < claims.nbf) {
    throw new Error("token not yet valid");
  }
  if (typeof claims.iat === "number" && claims.iat > now + CLOCK_SKEW_S) {
    throw new Error("token issued in the future");
  }
  if (nonce && claims.nonce !== nonce) {
    throw new Error("nonce mismatch");
  }
};
