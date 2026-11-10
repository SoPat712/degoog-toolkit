const YANDEX_SPELLER =
  "https://speller.yandex.net/services/spellservice.json/checkText";

// How long the suggestion may wait for Yandex once results are in. Searches
// never wait: they always run what was typed.
const DEFAULT_BUDGET_MS = 300;
const MAX_BUDGET_MS = 2_000;
// A check keeps going in the background up to this.
const REQUEST_TIMEOUT_MS = 3_000;
// After Yandex fails, stop asking it for a while instead of making every
// suggestion wait for the budget again.
const FAILURE_BACKOFF_MS = 30_000;
// Spelling answers do not change, so repeat searches never call Yandex.
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_NAMESPACE = "ext:spell-check:fixes";
// Glance requests follow their search within seconds.
const NOTICE_TTL_MS = 30_000;
const MAX_REMEMBERED = 500;
const MIN_WORDS = 2;
// A word two of these top results spell as typed is a name, not a typo. One
// can be a page about the misspelling itself ("Receive or recieve?").
const TOP_TITLES = 5;
const NAME_TITLES = 2;

const TIMED_OUT = Symbol("timed out");

// The check each recent search started, keyed by normalized query. The
// glance slot reads only these.
const _checks = new Map();
// One Yandex check per language and query, shared by concurrent searches.
const _pending = new Map();

let _cache = null;
let _lang = "en";
let _budgetMs = DEFAULT_BUDGET_MS;
let _backoffUntil = 0;
let _tpl = "";

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

const _memoryCache = (ttlMs) => {
  const store = new Map();
  return {
    get: async (key) => (_isFresh(store, key) ? store.get(key).value : null),
    set: async (key, value) => _remember(store, key, { value }, ttlMs),
  };
};

const _resolveCache = (ctx, namespace, ttlMs) => {
  if (typeof ctx?.useCache === "function") {
    return ctx.useCache(namespace, ttlMs);
  }
  if (typeof ctx?.createCache === "function") {
    const sync = ctx.createCache(ttlMs);
    return {
      get: async (k) => sync.get(k),
      set: async (k, v) => sync.set(k, v),
    };
  }
  return _memoryCache(ttlMs);
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

const _wordOf = (q, fix) => q.slice(fix.pos, fix.pos + fix.len);

// The corrected query, or null when the fixes change nothing but letter case
// (search is case-blind).
const _correct = (q, fixes) => {
  let out = q;
  let offset = 0;
  for (const { pos, len, to } of fixes) {
    const start = pos + offset;
    out = out.slice(0, start) + to + out.slice(start + len);
    offset += to.length - len;
  }
  return out.toLowerCase() === q.toLowerCase() ? null : out;
};

const _fold = (s) =>
  String(s ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();

// Names Yandex doesn't know ("the weeknd" to weekend, "jellyfin" to jellyfish)
// are spelled as typed in the top results, so those fixes are dropped.
const _inTopTitles = (word, results) => {
  if (!Array.isArray(results)) return false;
  const wanted = _fold(word);
  const titles = results
    .slice(0, TOP_TITLES)
    .filter((result) => _fold(result?.title).split(/[^\p{L}\p{N}]+/u).includes(wanted));
  return titles.length >= NAME_TITLES;
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

// Resolves to Yandex's fixes, [] when the spelling is fine.
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
  return errors
    .filter((e) => e.s?.length && Number.isInteger(e.pos) && Number.isInteger(e.len))
    .map((e) => ({ pos: e.pos, len: e.len, to: e.s[0] }));
};

// Resolves to { fixes }, or null when neither the cache nor Yandex could answer.
const _lookup = async (key, q, fetchFn) => {
  try {
    const hit = await _cache.get(key);
    if (Array.isArray(hit?.fixes)) return hit;
  } catch (err) {
    console.warn("[spell-check] cache read failed", err);
  }
  if (Date.now() < _backoffUntil) return null;
  try {
    const outcome = { fixes: await _askYandex(q, fetchFn) };
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

export const plugin = {
  id: "spell-check",
  name: "Spell Check",
  description:
    "Suggests spelling fixes for searches with Yandex Speller, without holding searches up.",
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
        "How long the suggestion waits for Yandex once results are in. 0 shows it only when Yandex has already answered.",
    },
  ],

  configure(settings) {
    _lang = _toLang(settings?.language);
    _budgetMs = _readBudget(settings?.timeBudgetMs);
  },

  async init(ctx) {
    _cache = _resolveCache(ctx, CACHE_NAMESPACE, CACHE_TTL_MS);
  },

  // Never rewrites the query: it starts the check so the suggestion is ready
  // by the time results are.
  async intercept(query, context) {
    const q = _normalize(query);
    if (!_isCheckable(q)) return { query };

    _cache ??= _memoryCache(CACHE_TTL_MS);
    const check = _check(q, context?.fetch ?? fetch);
    _remember(_checks, q, { check });
    const entry = _checks.get(q);
    check.then((outcome) => {
      entry.outcome = outcome;
    });
    return { query };
  },
};

export const slot = {
  isClientExposed: false,
  name: "Spell Check",
  description: "Shows a \"Did you mean\" suggestion for the search.",
  position: "at-a-glance",
  // A fix is checked against the result titles, so the glance request made
  // before results arrive only marks this slot pending.
  waitForResults: true,

  async init(ctx) {
    _tpl = ctx.template ?? "";
  },

  // Core awaits at-a-glance triggers one after another, so this only asks
  // whether the search started a check and never waits.
  trigger(query) {
    const q = _normalize(query);
    return !!q && _isFresh(_checks, q);
  },

  // Glance panels load after results, so the check has usually answered.
  async execute(query, context) {
    const q = _normalize(query);
    const entry = _isFresh(_checks, q) ? _checks.get(q) : null;
    if (!entry || !_tpl) return { html: "" };

    const outcome =
      "outcome" in entry || _budgetMs === 0
        ? entry.outcome
        : await _within(entry.check, _budgetMs);
    if (!outcome || outcome === TIMED_OUT) return { html: "" };

    const fixes = outcome.fixes.filter(
      (fix) => !_inTopTitles(_wordOf(q, fix), context?.results),
    );
    const corrected = _correct(q, fixes);
    if (!corrected) return { html: "" };
    const html = _fill(_tpl, {
      corrected,
      original: q,
      search_url: _searchUrl(corrected),
    });
    return { title: "", html };
  },
};
