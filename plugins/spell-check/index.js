const CORRECTION_TTL_MS = 15_000;
const YANDEX_SPELLER =
  "https://speller.yandex.net/services/spellservice.json/checkText";

const _corrections = new Map();
// Queries the interceptor already handled without changing them, so the
// glance trigger can answer at once instead of waiting for a correction.
const _checked = new Map();
const _skipOnce = new Set();
const _pending = new Map();

const TRIGGER_WAIT_MS = 2_000;
// The first glance request races the search request; give the interceptor a
// moment to register a pending check before giving up on this query.
const TRIGGER_GRACE_MS = 300;
const TRIGGER_POLL_MS = 25;
const MAX_REMEMBERED = 500;
const _delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let _cache = null;
let _lang = "en";
let _apiBase = "";
let _tpl = "";

const BANG = /^!/;
const MIN_WORDS = 2;
const CACHE_NAMESPACE = "ext:spell-check:corrections";
const CACHE_TTL_MS = 120_000;

const _resolveCache = (ctx) => {
  if (typeof ctx?.useCache === "function") {
    return ctx.useCache(CACHE_NAMESPACE, CACHE_TTL_MS);
  }
  if (typeof ctx?.createCache === "function") {
    const sync = ctx.createCache(CACHE_TTL_MS);
    return {
      get: async (k) => sync.get(k),
      set: async (k, v) => sync.set(k, v),
      delete: async (k) => {
        if (typeof sync.delete === "function") sync.delete(k);
      },
      clear: async () => sync.clear(),
    };
  }
  return null;
};

const _esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const _applyFixes = (query, errors) => {
  let out = query;
  let offset = 0;
  for (const e of errors) {
    if (!e.s?.length) continue;
    const start = e.pos + offset;
    const end = start + e.len;
    const rep = e.s[0];
    out = out.slice(0, start) + rep + out.slice(end);
    offset += rep.length - e.len;
  }
  return out;
};

const _toLang = (tag) => tag.split(/[-_]/)[0].toLowerCase();

const _isCheckable = (q) =>
  !!q && !BANG.test(q) && q.split(/\s+/).length >= MIN_WORDS;

const _isFresh = (map, q) => {
  const expiresAt = map.get(q)?.expiresAt;
  return !!expiresAt && Date.now() < expiresAt;
};

const _remember = (map, q, entry) => {
  if (map.size >= MAX_REMEMBERED) {
    const now = Date.now();
    for (const [key, value] of map) {
      if (value.expiresAt <= now) map.delete(key);
    }
  }
  map.set(q, { ...entry, expiresAt: Date.now() + CORRECTION_TTL_MS });
};

const _markChecked = (q) => {
  _corrections.delete(q);
  _remember(_checked, q, {});
};

export const plugin = {
  id: "spell-check",
  name: "Spell Check",
  description:
    "Intercepts search queries and corrects spelling using Yandex Speller.",
  settingsSchema: [
    {
      key: "language",
      label: "Language",
      type: "text",
      default: "en",
      placeholder: "en",
      description: "Language code passed to Yandex Speller (en, ru, uk).",
    },
  ],
};

export const interceptor = {
  isClientExposed: false,
  name: "Spell Check",

  configure(settings) {
    _lang = _toLang(settings.language || "en");
  },

  async init(ctx) {
    _cache = _resolveCache(ctx);
    _apiBase = ctx.apiBase;
  },

  async intercept(query, context) {
    const q = query.trim();
    if (!_isCheckable(q)) return { query };

    if (_skipOnce.has(q)) {
      _skipOnce.delete(q);
      _markChecked(q);
      return { query };
    }

    const existing = _pending.get(q);
    if (existing) return await existing;

    const promise = _runIntercept(q, context);
    _pending.set(q, promise);
    try {
      const result = await promise;
      if (result.query === q) _markChecked(q);
      return result;
    } finally {
      if (_pending.get(q) === promise) _pending.delete(q);
    }
  },
};

const _runIntercept = async (q, context) => {
  const cacheKey = `${_lang}:${q}`;
  const hit = _cache ? await _cache.get(cacheKey) : null;
  if (hit) {
    if (hit.query !== q) {
      _checked.delete(q);
      _remember(_corrections, q, { corrected: hit.query });
    }
    return hit;
  }

  const fetchFn = context?.fetch ?? fetch;

  try {
    const url = `${YANDEX_SPELLER}?text=${encodeURIComponent(q)}&lang=${_lang}`;
    const res = await fetchFn(url);

    if (!res.ok) return { query: q };

    const errors = await res.json();
    if (!Array.isArray(errors) || errors.length === 0) return { query: q };

    const corrected = _applyFixes(q, errors);
    if (corrected === q) return { query: q };

    const result = { query: corrected };
    if (_cache) await _cache.set(cacheKey, result);
    _checked.delete(q);
    _remember(_corrections, q, { corrected });
    return result;
  } catch (err) {
    console.warn("[spell-check] Yandex Speller request failed", err);
    return { query: q };
  }
};

export const slot = {
  isClientExposed: false,
  name: "Spell Check",
  description: "Shows a correction banner when a query was spell-checked.",
  position: "at-a-glance",

  init(ctx) {
    _tpl = ctx.template;
    _apiBase = ctx.apiBase;
  },

  // Core awaits at-a-glance triggers one after another, so this must answer
  // fast: only wait while this query's correction is actually in flight.
  async trigger(query) {
    const q = String(query ?? "").trim();
    if (_skipOnce.has(q)) return false;
    if (_isFresh(_corrections, q)) return true;
    if (!_isCheckable(q) || _isFresh(_checked, q)) return false;

    const deadline = Date.now() + TRIGGER_WAIT_MS;
    const graceUntil = Date.now() + TRIGGER_GRACE_MS;

    while (Date.now() < deadline) {
      if (_isFresh(_corrections, q)) return true;
      if (_isFresh(_checked, q)) return false;

      const pending = _pending.get(q);
      if (pending) {
        await Promise.race([
          pending.catch(() => {}),
          _delay(deadline - Date.now()),
        ]);
        continue;
      }

      if (Date.now() >= graceUntil) return false;
      await _delay(Math.min(TRIGGER_POLL_MS, graceUntil - Date.now()));
    }

    return _isFresh(_corrections, q);
  },

  async execute(query) {
    const entry = _corrections.get(query);
    if (!entry || Date.now() > entry.expiresAt) return { html: "" };

    const { corrected } = entry;
    const html = _tpl
      .replace(/\{\{corrected\}\}/g, _esc(corrected))
      .replace(/\{\{original\}\}/g, _esc(query))
      .replace(/\{\{search_url\}\}/g, `/search?q=${encodeURIComponent(query)}`)
      .replace(/\{\{skip_endpoint\}\}/g, `${_apiBase}/skip`);

    return { html };
  },
};

export const routes = [
  {
    method: "post",
    path: "/skip",
    async handler(req) {
      try {
        const body = await req.json();
        if (typeof body?.q === "string" && body.q) {
          _corrections.delete(body.q);
          _skipOnce.add(body.q);
          setTimeout(() => _skipOnce.delete(body.q), 30_000);
        }
      } catch (err) {
        console.warn("[spell-check] skip route parse failed", err);
      }
      return new Response(null, { status: 204 });
    },
  },
];
