import { createHash } from "node:crypto";

const RETENTION_MS = 7 * 24 * 60 * 60_000;
const CATALOG_TTL_MS = 15 * 60_000;
const ESPN_TTL_MS = 10_000;
const BALLDONTLIE_TTL_MS = 12_000;

function eventPhase(event) {
  const status = event?.competitions?.[0]?.status || event?.status;
  const type = status && typeof status === "object" ? status.type || status : {};
  const label = typeof status === "string" ? status : `${type.name || ""} ${type.description || ""}`;
  if (/cancel|postpon|suspend|abandon/i.test(label)) return "unknown";
  if (type.completed === true || type.state === "post" || /^final\b|^finished$/i.test(label.trim())) return "final";
  if (type.state === "in" || /^(?:in_play|paused|live)$/i.test(label.trim()) || Number(event?.period) > 0) return "live";
  if (type.state === "pre" || /^(?:scheduled|timed)$/i.test(label.trim())) return "upcoming";
  return "unknown";
}

function pastDateWindow(url) {
  const dates = url.searchParams.get("dates");
  let end = url.searchParams.get("end_date") || url.searchParams.get("dateTo");
  if (dates && /^\d{8}(?:-\d{8})?$/.test(dates)) {
    const day = dates.slice(-8);
    end = `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end || "")) return false;
  return Date.parse(end + "T00:00:00Z") + 86_400_000 <= Date.now();
}

function responseTtl(address, options, data) {
  const url = new URL(address);
  if (String(options.method || "GET").toUpperCase() !== "GET") return 0;
  if (url.protocol !== "https:" || !["site.api.espn.com", "api.balldontlie.io", "api.football-data.org"].includes(url.hostname)) return 0;
  if (url.pathname.endsWith("/teams")) return RETENTION_MS;
  if (url.pathname.endsWith("/standings")) return CATALOG_TTL_MS;
  const liveTtl = url.hostname === "api.balldontlie.io" ? BALLDONTLIE_TTL_MS : ESPN_TTL_MS;
  const singleGame = (url.pathname.endsWith("/summary") && url.searchParams.has("event")) || /\/(?:games|matches)\/\d+$/.test(url.pathname);
  if (singleGame && eventPhase(data?.header || data?.data || data) === "final") return RETENTION_MS;
  const events = data?.events || data?.matches || data?.data;
  if (!Array.isArray(events) || !events.length) return liveTtl;
  const phases = events.map(eventPhase);
  if (phases.includes("live") || phases.includes("unknown")) return liveTtl;
  if (phases.every((phase) => phase === "final")) return pastDateWindow(url) ? RETENTION_MS : CATALOG_TTL_MS;
  const starts = events.filter((event) => eventPhase(event) === "upcoming")
    .map((event) => Date.parse(event.datetime || event.date || event.competitions?.[0]?.date || ""));
  if (starts.some((time) => !Number.isFinite(time) || time <= Date.now())) return liveTtl;
  return Math.max(1000, Math.min(CATALOG_TTL_MS, ...starts.map((time) => time - Date.now())));
}

function requestKey(address, options) {
  const headers = [...new Headers(options.headers).entries()].sort(([a], [b]) => a.localeCompare(b));
  return "sports:providers:v2:" + createHash("sha256")
    .update(JSON.stringify([String(address), String(options.method || "GET").toUpperCase(), headers]))
    .digest("hex");
}

export function createProviderJsonCache({ cache, load }) {
  const inFlight = new Map();
  return {
    async get(address, options = {}) {
      if (!responseTtl(address, options)) return { data: await load(address, options), expiresAt: 0, ttlMs: 0 };
      const key = requestKey(address, options);
      if (!inFlight.has(key)) {
        const pending = (async () => {
          try {
            const entry = await cache?.get(key);
            if (entry && Number.isFinite(entry.expiresAt) && entry.expiresAt > Date.now() && "data" in entry) {
              return { data: entry.data, expiresAt: entry.expiresAt, ttlMs: entry.ttlMs };
            }
          } catch {}
          const data = await load(address, options);
          const ttlMs = responseTtl(address, options, data);
          const entry = { data, expiresAt: Date.now() + ttlMs, ttlMs };
          try { await cache?.set(key, entry, ttlMs); } catch {}
          return { ...entry, ttlMs };
        })();
        inFlight.set(key, pending);
        const clear = () => { if (inFlight.get(key) === pending) inFlight.delete(key); };
        pending.then(clear, clear);
      }
      return structuredClone(await inFlight.get(key));
    },
  };
}
