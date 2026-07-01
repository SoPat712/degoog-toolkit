import { randomBytes } from "node:crypto";

const PROCESS_SECRET = randomBytes(32).toString("base64url");

let _config = null;
let _ctx = null;

const _handoffs = new Map();

export const setConfig = (config) => {
  _config = config;
};

export const getConfig = () => _config;

export const setCtx = (ctx) => {
  _ctx = ctx;
};

export const getCtx = () => _ctx;

export const pluginFetch = (...args) => (_ctx?.fetch || fetch)(...args);

export const getSecret = () => _config?.cookieSecret || PROCESS_SECRET;

export const stashHandoff = (code, profile, ttlMs) => {
  _handoffs.set(code, { profile, exp: Date.now() + ttlMs });
};

export const claimHandoff = (code) => {
  const entry = _handoffs.get(code);
  if (!entry) return null;
  _handoffs.delete(code);
  return Date.now() > entry.exp ? null : entry.profile;
};

export const sweepHandoffs = () => {
  const now = Date.now();
  for (const [code, entry] of _handoffs) {
    if (now > entry.exp) _handoffs.delete(code);
  }
};
