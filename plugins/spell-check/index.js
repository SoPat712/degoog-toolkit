const YANDEX_SPELLER =
  "https://speller.yandex.net/services/spellservice.json/checkText";

// How long a search may wait for Yandex before it runs what was typed.
const DEFAULT_BUDGET_MS = 300;
const MAX_BUDGET_MS = 2_000;
// A check that misses the budget keeps going in the background up to this.
const REQUEST_TIMEOUT_MS = 3_000;
// After Yandex fails, stop asking it for a while instead of making every
// search wait for the budget again.
const FAILURE_BACKOFF_MS = 30_000;
// Spelling answers do not change, so repeat searches never call Yandex.
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_NAMESPACE = "ext:spell-check:outcomes";
// Glance requests follow their search within seconds.
const NOTICE_TTL_MS = 30_000;
const MAX_REMEMBERED = 500;
const MIN_WORDS = 2;

const TIMED_OUT = Symbol("timed out");

// Corrections the interceptor applied, and late suggestions for searches that
// ran as typed, keyed by normalized query. The glance slot reads only these.
const _applied = new Map();
const _suggested = new Map();
const _skips = new Map();
// One Yandex check per language and query, shared by concurrent searches.
const _pending = new Map();

let _cache = null;
let _lang = "en";
let _budgetMs = DEFAULT_BUDGET_MS;
let _backoffUntil = 0;
let _apiBase = "";
let _tpl = "";
let _suggestionTpl = "";

const _isFresh = (map, key) => {
  const expiresAt = map.get(key)?.expiresAt;
  return !!expiresAt && Date.now() < expiresAt;
};

const _remember = (map, key, entry, ttlMs = NOTICE_TTL_MS) => {
  map.delete(key);
  if (map.size >= MAX_REMEMBERED) {
    const now = Date.now();
    for (const [k, value] of map) {
      if (value.expiresAt <= now) map.delete(k);
    }
    while (map.size >= MAX_REMEMBERED) map.delete(map.keys().next().value);
  }
  map.set(key, { ...entry, expiresAt: Date.now() + ttlMs });
};

const _memoryCache = () => {
  const store = new Map();
  return {
    get: async (key) => (_isFresh(store, key) ? store.get(key).value : null),
    set: async (key, value) => _remember(store, key, { value }, CACHE_TTL_MS),
  };
};

const _resolveCache = (ctx) => {
  if (typeof ctx?.useCache === "function") {
    return ctx.useCache(CACHE_NAMESPACE, CACHE_TTL_MS);
  }
  if (typeof ctx?.createCache === "function") {
    const sync = ctx.createCache(CACHE_TTL_MS);
    return {
      get: async (k) => sync.get(k),
      set: async (k, v) => sync.set(k, v),
    };
  }
  return _memoryCache();
};

const _esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const _fill = (tpl, values) =>
  tpl.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    key in values ? _esc(values[key]) : match,
  );

const _searchUrl = (q) => `/search?q=${encodeURIComponent(q)}`;

const _applyFixes = (query, errors) => {
  let out = query;
  let offset = 0;
  for (const e of errors) {
    if (!e.s?.length || !Number.isInteger(e.pos) || !Number.isInteger(e.len)) {
      continue;
    }
    const start = e.pos + offset;
    const end = start + e.len;
    const rep = e.s[0];
    out = out.slice(0, start) + rep + out.slice(end);
    offset += rep.length - e.len;
  }
  return out;
};

const _toLang = (tag) =>
  String(tag || "en").split(/[-_]/)[0].trim().toLowerCase() || "en";

const _readBudget = (raw) => {
  const text = String(raw ?? "").trim();
  const n = Number(text);
  if (!text || !Number.isFinite(n)) return DEFAULT_BUDGET_MS;
  return Math.min(MAX_BUDGET_MS, Math.max(0, Math.round(n)));
};

const _normalize = (query) => String(query ?? "").trim().replace(/\s+/g, " ");

const BANG = /(?:^|\s)!\S/;
const QUOTES = /["“”„«»]/;
const URL_OR_DOMAIN =
  /^(?:[a-z][\w+.-]*:\/\/|www\.)|^[^\s/]+\.[a-z]{2,}(?:[/:?#]|$)/i;
// site:, filetype:, -word, +word, a lone *
const OPERATOR = /^(?:[-+]\S|\S+:\S|\*$)/;

// Zero-cost skips: Google leaves these alone too.
const _isCheckable = (q) => {
  if (!q || BANG.test(q) || QUOTES.test(q)) return false;
  const words = q.split(" ");
  if (words.length < MIN_WORDS) return false;
  if (words.some((w) => URL_OR_DOMAIN.test(w) || OPERATOR.test(w))) {
    return false;
  }
  const letters = q.match(/\p{L}/gu)?.length ?? 0;
  return letters * 2 >= q.replace(/ /g, "").length;
};

// Settles with the promise, or with TIMED_OUT after ms. Nothing is aborted.
const _within = (promise, ms) => {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(resolve, ms, TIMED_OUT);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

// Resolves to the corrected query, or null when the spelling is fine.
const _askYandex = async (q, fetchFn) => {
  const url = `${YANDEX_SPELLER}?text=${encodeURIComponent(q)}&lang=${encodeURIComponent(_lang)}`;
  const request = (async () => {
    const res = await fetchFn(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  })();
  const errors = await _within(request, REQUEST_TIMEOUT_MS);
  if (errors === TIMED_OUT) throw new Error("timed out");
  if (!Array.isArray(errors)) throw new Error("unexpected response");
  const corrected = errors.length ? _applyFixes(q, errors) : q;
  // Search is case-blind, so a case-only change is not a typo.
  return corrected.toLowerCase() === q.toLowerCase() ? null : corrected;
};

// Resolves to { corrected } (null when the spelling is fine), or null when
// neither the cache nor Yandex could answer.
const _lookup = async (key, q, fetchFn) => {
  try {
    const hit = await _cache.get(key);
    if (hit && typeof hit === "object" && "corrected" in hit) return hit;
  } catch (err) {
    console.warn("[spell-check] cache read failed", err);
  }
  if (Date.now() < _backoffUntil) return null;
  try {
    const outcome = { corrected: await _askYandex(q, fetchFn) };
    _cache.set(key, outcome).catch((err) => {
      console.warn("[spell-check] cache write failed", err);
    });
    return outcome;
  } catch (err) {
    _backoffUntil = Date.now() + FAILURE_BACKOFF_MS;
    console.warn("[spell-check] Yandex Speller request failed", err);
    return null;
  }
};

const _check = (q, fetchFn) => {
  const key = `${_lang}:${q}`;
  const existing = _pending.get(key);
  if (existing) return existing;
  const promise = _lookup(key, q, fetchFn).finally(() => {
    if (_pending.get(key) === promise) _pending.delete(key);
  });
  _pending.set(key, promise);
  return promise;
};

const _forget = (q) => {
  _applied.delete(q);
  _suggested.delete(q);
};

export const plugin = {
  id: "spell-check",
  name: "Spell Check",
  description:
    "Auto-corrects misspelled searches with Yandex Speller, without holding searches up.",
  isClientExposed: false,
};

export const interceptor = {
  isClientExposed: false,
  name: "Spell Check",
  description: plugin.description,

  // Hook-level fields join the plugin's single Configure card, and core only
  // calls configure() at startup for hooks that declare a schema.
  settingsSchema: [
    {
      key: "language",
      label: "Language",
      type: "text",
      default: "en",
      placeholder: "en",
      description: "Language code passed to Yandex Speller (en, ru, uk).",
    },
    {
      key: "timeBudgetMs",
      label: "Time budget (ms)",
      type: "number",
      default: String(DEFAULT_BUDGET_MS),
      min: "0",
      max: String(MAX_BUDGET_MS),
      step: "50",
      placeholder: String(DEFAULT_BUDGET_MS),
      description:
        "How long to wait for Yandex before searching what you typed. 0 never waits and only suggests.",
    },
  ],

  configure(settings) {
    _lang = _toLang(settings?.language);
    _budgetMs = _readBudget(settings?.timeBudgetMs);
  },

  async init(ctx) {
    _cache = _resolveCache(ctx);
    _apiBase = ctx.apiBase;
  },

  async intercept(query, context) {
    const q = _normalize(query);
    if (!_isCheckable(q)) return { query };

    if (_isFresh(_skips, q)) {
      _skips.delete(q);
      _forget(q);
      return { query };
    }

    _cache ??= _memoryCache();
    const check = _check(q, context?.fetch ?? fetch);
    const outcome = _budgetMs > 0 ? await _within(check, _budgetMs) : TIMED_OUT;

    if (outcome === TIMED_OUT) {
      // This search runs as typed; a late answer becomes "Did you mean".
      _applied.delete(q);
      check.then((late) => {
        if (late?.corrected) {
          _remember(_suggested, q, { corrected: late.corrected });
        }
      });
      return { query };
    }

    if (!outcome?.corrected) {
      _forget(q);
      return { query };
    }

    _suggested.delete(q);
    _remember(_applied, q, { corrected: outcome.corrected });
    return { query: outcome.corrected };
  },
};

export const slot = {
  isClientExposed: false,
  name: "Spell Check",
  description: "Shows the correction, or a late suggestion, for the search.",
  position: "at-a-glance",

  async init(ctx) {
    _tpl = ctx.template;
    _apiBase = ctx.apiBase;
    _suggestionTpl = (await ctx.readFile?.("suggestion.html")) ?? "";
  },

  // Core awaits at-a-glance triggers one after another, so this answers from
  // what the interceptor already knows and never waits.
  trigger(query) {
    const q = _normalize(query);
    if (!q || _isFresh(_skips, q)) return false;
    return _isFresh(_applied, q) || _isFresh(_suggested, q);
  },

  async execute(query) {
    const q = _normalize(query);

    if (_isFresh(_applied, q)) {
      const html = _fill(_tpl, {
        corrected: _applied.get(q).corrected,
        original: q,
        search_url: _searchUrl(q),
        skip_endpoint: `${_apiBase}/skip`,
      });
      return { title: "", html };
    }

    if (_isFresh(_suggested, q) && _suggestionTpl) {
      const { corrected } = _suggested.get(q);
      const html = _fill(_suggestionTpl, {
        corrected,
        original: q,
        search_url: _searchUrl(corrected),
      });
      return { title: "", html };
    }

    return { html: "" };
  },
};

export const routes = [
  {
    method: "post",
    path: "/skip",
    async handler(req) {
      try {
        const body = await req.json();
        const q = typeof body?.q === "string" ? _normalize(body.q) : "";
        if (q) {
          _forget(q);
          _remember(_skips, q, {});
        }
      } catch (err) {
        console.warn("[spell-check] skip route parse failed", err);
      }
      return new Response(null, { status: 204 });
    },
  },
];
