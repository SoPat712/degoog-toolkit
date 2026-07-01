import { pluginFetch } from "./state.js";

const DISCOVERY_TTL_MS = 5 * 60 * 1000;

const _docs = new Map();
const _jwks = new Map();

const wellKnown = (issuer) =>
  issuer.includes(".well-known/openid-configuration")
    ? issuer
    : `${issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`;

const cached = (store, key, ttlMs, load) => async () => {
  const hit = store.get(key);
  if (hit && Date.now() < hit.exp) return hit.value;
  const value = await load();
  store.set(key, { value, exp: Date.now() + ttlMs });
  return value;
};

export const discover = async (issuer) => {
  const url = wellKnown(issuer);
  return cached(_docs, url, DISCOVERY_TTL_MS, async () => {
    const res = await pluginFetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`discovery ${res.status}`);
    return res.json();
  })();
};

export const fetchJwks = async (jwksUri) =>
  cached(_jwks, jwksUri, DISCOVERY_TTL_MS, async () => {
    const res = await pluginFetch(jwksUri, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`jwks ${res.status}`);
    return res.json();
  })();
