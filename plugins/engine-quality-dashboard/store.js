import { constants } from "node:fs";
import { open, mkdir, lstat, rename, unlink, chmod } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

export const HOUR = 3_600_000;
export const LATENCY_EDGES = [100, 250, 500, 1000, 1500, 2000, 3000, 5000, 10000, 30000, 60000, 600000];
export const STATUSES = ["ok", "blocked", "rate_limited", "captcha", "parse_error", "timeout", "network", "interstitial", "unknown"];
export const WINDOWS = { "1h": HOUR, "6h": 6 * HOUR, "24h": 24 * HOUR, "48h": 48 * HOUR, "7d": 168 * HOUR };
const MAX_ENTRIES = 256;
const MAX_BYTES = 32 * 1024 * 1024;
const FLUSH_MS = 5000;
const shared = new Map();
export function sharedStore(directory) {
  const key = resolve(directory);
  if (!shared.has(key)) shared.set(key, createStore({ directory: key }));
  return shared.get(key);
}
const clean = (value, max) => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max) : "";
const number = value => typeof value === "number" && Number.isFinite(value) && value >= 0;
const counter = value => Number.isSafeInteger(value) && value >= 0;
const blank = at => ({ at, live: 0, cached: 0, failed: 0, ok: 0, empty: 0, time: 0, max: 0, results: 0, statuses: Array(STATUSES.length).fill(0), hist: Array(LATENCY_EDGES.length + 1).fill(0) });
const fields = ["live", "cached", "failed", "ok", "empty", "time", "results"];

function percentile(bucket, fraction) {
  if (!bucket.live) return null;
  const target = Math.ceil(bucket.live * fraction);
  let seen = 0;
  for (let i = 0; i < bucket.hist.length; i++) {
    seen += bucket.hist[i];
    if (seen >= target) return { ms: Math.min(LATENCY_EDGES[i] ?? bucket.max, bucket.max), overflow: i === LATENCY_EDGES.length };
  }
  return null;
}

function merge(target, bucket) {
  for (const key of fields) target[key] += bucket[key];
  target.max = Math.max(target.max, bucket.max);
  target.hist = target.hist.map((v, i) => v + bucket.hist[i]);
  target.statuses = target.statuses.map((v, i) => v + bucket.statuses[i]);
}

function metrics(bucket) {
  return { live: bucket.live, cached: bucket.cached, failed: bucket.failed, ok: bucket.ok, empty: bucket.empty,
    failRate: bucket.live ? bucket.failed / bucket.live * 100 : null,
    emptyRate: bucket.ok ? bucket.empty / bucket.ok * 100 : null,
    avgMs: bucket.live ? bucket.time / bucket.live : null, maxMs: bucket.live ? bucket.max : null,
    avgResults: bucket.ok ? bucket.results / bucket.ok : null,
    p50: percentile(bucket, .5), p95: percentile(bucket, .95),
    statuses: Object.fromEntries(STATUSES.map((s, i) => [s, bucket.statuses[i]]).filter(([, n]) => n)),
  };
}

function validBucket(b) {
  return b && counter(b.at) && b.at % HOUR === 0 && fields.every(k => number(b[k])) && number(b.max)
    && ["live", "cached", "failed", "ok", "empty", "results"].every(k => counter(b[k]))
    && Array.isArray(b.hist) && b.hist.length === LATENCY_EDGES.length + 1 && b.hist.every(counter)
    && Array.isArray(b.statuses) && b.statuses.length === STATUSES.length && b.statuses.every(counter)
    && b.failed + b.ok === b.live && b.empty <= b.ok
    && b.hist.reduce((a, n) => a + n, 0) === b.live
    && b.statuses.reduce((a, n) => a + n, 0) === b.live;
}

export function createStore({ directory, now = Date.now, flushMs = FLUSH_MS } = {}) {
  const file = join(directory, "history.json");
  const entries = new Map();
  let retentionHours = 48, startedAt = now(), savedAt = null, loaded = false, loadPromise;
  let storageError = null, revision = 0, savedRevision = 0, dropped = 0, timer = null, saving = null, clearing = null;
  const keyFor = (id, type) => JSON.stringify([id, type]);

  function prune() {
    const cutoff = Math.floor((now() - retentionHours * HOUR) / HOUR) * HOUR;
    for (const [key, entry] of entries) {
      for (const at of entry.buckets.keys()) if (at < cutoff) { entry.buckets.delete(at); revision++; }
      if (entry.lastFailure?.at < cutoff) entry.lastFailure = null;
      if (!entry.buckets.size) entries.delete(key);
    }
  }

  function schedule() {
    if (timer || clearing || !loaded || revision === savedRevision) return;
    timer = setTimeout(() => { timer = null; void flush(); }, flushMs);
    timer.unref?.();
  }

  async function load() {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      try {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        if (!(await lstat(directory)).isDirectory() || (await lstat(directory)).isSymbolicLink()) throw new Error("unsafe directory");
        await chmod(directory, 0o700);
        let handle;
        try {
          handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
          const stat = await handle.stat();
          if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error("invalid history file");
          const data = JSON.parse(await handle.readFile("utf8"));
          if (data.version !== 1 || !counter(data.startedAt) || !counter(data.savedAt) || !Array.isArray(data.entries) || data.entries.length > MAX_ENTRIES) throw new Error("invalid history");
          for (const entry of data.entries) {
            if (!entry || !clean(entry.id, 200) || entry.id !== clean(entry.id, 200) || !clean(entry.name, 160) || entry.name !== clean(entry.name, 160) || !clean(entry.type, 64) || entry.type !== clean(entry.type, 64) || !Array.isArray(entry.buckets) || entry.buckets.length > 338 || !entry.buckets.every(validBucket)) throw new Error("invalid engine history");
            const buckets = new Map(entry.buckets.map(b => [b.at, {
              ...Object.fromEntries(["at", ...fields, "max"].map(key => [key, b[key]])),
              statuses: [...b.statuses], hist: [...b.hist],
            }]));
            if (buckets.size !== entry.buckets.length) throw new Error("duplicate history bucket");
            const last = entry.lastFailure;
            const lastFailure = last && counter(last.at) && STATUSES.includes(last.status) && last.status !== "ok"
              ? { at: last.at, status: last.status, httpStatus: Number.isInteger(last.httpStatus) && last.httpStatus >= 100 && last.httpStatus <= 599 ? last.httpStatus : null } : null;
            const key = keyFor(entry.id, entry.type);
            if (entries.has(key)) throw new Error("duplicate engine history");
            entries.set(key, { id: entry.id, name: clean(entry.name, 160), type: clean(entry.type, 64), buckets, lastFailure });
          }
          startedAt = data.startedAt; savedAt = data.savedAt;
          dropped = counter(data.dropped) ? data.dropped : 0;
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        } finally { await handle?.close(); }
        loaded = true; prune(); schedule();
      } catch {
        entries.clear(); storageError = "History could not be opened safely. Recording is paused; the existing file has been preserved.";
      }
    })();
    return loadPromise;
  }

  function configure(settings = {}) {
    const hours = Number(settings.retentionHours);
    retentionHours = Number.isFinite(hours) && hours >= 1 ? Math.min(336, Math.floor(hours)) : 48;
    prune(); schedule();
  }

  function serialize(start = startedAt, saved = savedAt, droppedCount = dropped, history = entries) {
    return JSON.stringify({ version: 1, startedAt: start, savedAt: saved, dropped: droppedCount,
      entries: [...history.values()].map(e => ({ ...e, buckets: [...e.buckets.values()] })) });
  }

  async function atomicWrite(body) {
    let temporary;
    try {
      const folder = await lstat(directory);
      if (!folder.isDirectory() || folder.isSymbolicLink()) throw new Error("unsafe directory");
      try {
        const existing = await lstat(file);
        if (!existing.isFile() || existing.isSymbolicLink()) throw new Error("unsafe history file");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      temporary = join(directory, `.history-${randomUUID()}.tmp`);
      const handle = await open(temporary, "wx", 0o600);
      try { await handle.writeFile(body, "utf8"); await handle.sync(); }
      finally { await handle.close(); }
      await rename(temporary, file); temporary = null;
    } finally {
      if (temporary) await unlink(temporary).catch(() => {});
    }
  }

  function record(report) {
    if (!loaded) return false;
    const name = clean(report?.engine, 160), type = clean(report?.searchType, 64) || "web";
    const id = clean(report?.engineId, 200) || name;
    if (!name || !number(report.time) || report.time > 3_600_000 || !counter(report.resultCount) || report.resultCount > 1_000_000 || typeof report.cached !== "boolean") return false;
    const at = now(); // The trusted receipt time bounds retention, even for cache replays.
    const key = keyFor(id, type);
    let entry = entries.get(key);
    if (!entry && entries.size >= MAX_ENTRIES) { prune(); }
    if (!entry && entries.size >= MAX_ENTRIES) { dropped++; revision++; schedule(); return false; }
    if (!entry) { entry = { id, name, type, buckets: new Map(), lastFailure: null }; entries.set(key, entry); }
    entry.name = name;
    const hour = Math.floor(at / HOUR) * HOUR;
    let bucket = entry.buckets.get(hour);
    if (!bucket) { bucket = blank(hour); entry.buckets.set(hour, bucket); }
    if (report.cached) bucket.cached++;
    else {
      const status = STATUSES.includes(report.status) ? report.status : "unknown";
      bucket.live++; bucket.time += report.time; bucket.max = Math.max(bucket.max, report.time);
      bucket.statuses[STATUSES.indexOf(status)]++;
      const index = LATENCY_EDGES.findIndex(edge => report.time <= edge);
      bucket.hist[index < 0 ? LATENCY_EDGES.length : index]++;
      if (status === "ok") { bucket.ok++; bucket.results += report.resultCount; if (!report.resultCount) bucket.empty++; }
      else {
        bucket.failed++;
        entry.lastFailure = { at, status, httpStatus: Number.isInteger(report.httpStatus) && report.httpStatus >= 100 && report.httpStatus <= 599 ? report.httpStatus : null };
      }
    }
    revision++; schedule(); return true;
  }

  async function flush() {
    if (clearing) return clearing;
    if (!loaded || revision === savedRevision) return;
    if (saving) return saving;
    saving = (async () => {
      try {
        prune();
        const current = revision, timestamp = now();
        const body = serialize(startedAt, timestamp, dropped);
        if (Buffer.byteLength(body) > MAX_BYTES) throw new Error("history capacity exceeded");
        await atomicWrite(body);
        savedRevision = current; savedAt = timestamp; storageError = null;
      } catch {
        storageError = "History could not be saved. New statistics are still in memory; check the server storage.";
      }
    })();
    try { await saving; } finally { saving = null; schedule(); }
  }

  async function clear() {
    if (clearing) return clearing;
    if (!loaded) throw new Error("History is not loaded");
    if (timer) { clearTimeout(timer); timer = null; }
    const operation = (async () => {
      if (saving) await saving;
      if (!loaded) throw new Error("History is not loaded");
      const nextStartedAt = Math.max(now(), startedAt + 1);
      const timestamp = now();
      const body = serialize(nextStartedAt, timestamp, 0, new Map());
      if (Buffer.byteLength(body) > MAX_BYTES) throw new Error("history capacity exceeded");
      try { await atomicWrite(body); }
      catch { storageError = "History could not be saved. New statistics are still in memory; check the server storage."; throw new Error("history clear failed"); }
      entries.clear();
      startedAt = nextStartedAt;
      savedAt = timestamp;
      dropped = 0;
      revision++;
      savedRevision = revision;
      storageError = null;
      return true;
    })();
    clearing = operation;
    try { return await operation; }
    finally { if (clearing === operation) clearing = null; schedule(); }
  }

  function snapshot({ window = "24h", type = "all" } = {}) {
    prune(); schedule();
    const requested = Object.hasOwn(WINDOWS, window) ? window : "24h";
    const duration = Math.min(WINDOWS[requested], retentionHours * HOUR);
    const since = Math.floor((now() - duration) / HOUR) * HOUR;
    const sum = blank(0), trend = new Map(), rows = [], types = new Set();
    for (const entry of entries.values()) {
      types.add(entry.type);
      if (type !== "all" && entry.type !== type) continue;
      const bucket = blank(0);
      for (const b of entry.buckets.values()) {
        if (b.at < since) continue;
        merge(bucket, b);
        if (!trend.has(b.at)) trend.set(b.at, blank(b.at));
        merge(trend.get(b.at), b);
      }
      if (!bucket.live && !bucket.cached) continue;
      merge(sum, bucket);
      rows.push({ id: entry.id, name: entry.name, type: entry.type, ...metrics(bucket),
        lastFailure: entry.lastFailure?.at >= since ? { ...entry.lastFailure } : null });
    }
    return { version: 1, generatedAt: now(), startedAt, savedAt, window: requested, retentionHours,
      windowClamped: WINDOWS[requested] > duration, type, types: [...types].sort(),
      storage: { ready: loaded, pending: revision !== savedRevision, error: storageError, errorCode: storageError ? loaded ? "write_error" : "read_error" : null, dropped },
      summary: metrics(sum), rows,
      trend: [...trend.values()].sort((a, b) => a.at - b.at).map(b => ({ at: b.at, live: b.live, failed: b.failed, cached: b.cached })),
    };
  }

  async function close() { if (timer) { clearTimeout(timer); timer = null; } await flush(); if (timer) { clearTimeout(timer); timer = null; } }
  return { load, configure, record, flush, clear, snapshot, close, file };
}
