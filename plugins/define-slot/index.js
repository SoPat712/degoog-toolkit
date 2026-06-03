import {
  readSlotPosition,
  shouldRenderSlotForContext,
} from "./slot-position.js";

let template = "";
let selectedSlotPosition = "at-a-glance";
let pluginFetch = (...args) => fetch(...args);
let pluginRouteBase = "";
let dictionaryCache = null;

const DICTIONARY_API_BASE =
  "https://api.dictionaryapi.dev/api/v2/entries/en";
const POWER_THESAURUS_API_URL = "https://api.powerthesaurus.org";
const POWER_THESAURUS_WEB_URL = "https://www.powerthesaurus.org";
const AUDIO_HOSTS = new Set([
  "api.dictionaryapi.dev",
  "ssl.gstatic.com",
  "www.gstatic.com",
]);

const POWER_THESAURUS_SEARCH_QUERY = `query SEARCH_QUERY($query: String!) {
  search(query: $query) {
    terms {
      id
      name
    }
  }
}`;

const POWER_THESAURUS_THESAURUS_QUERY = `query THESAURUSES_QUERY($after: String, $first: Int, $before: String, $last: Int, $termID: ID!, $list: List!, $sort: ThesaurusSorting!, $tagID: Int, $posID: Int, $syllables: Int) {
  thesauruses(termId: $termID, sort: $sort, list: $list, after: $after, first: $first, before: $before, last: $last, tagId: $tagID, partOfSpeechId: $posID, syllables: $syllables) {
    edges {
      node {
        id
        targetTerm {
          id
          name
          slug
          counters
        }
        relations
        rating
        votes
      }
    }
  }
}`;

const POWER_PARTS_OF_SPEECH = new Map([
  [1, "adj."],
  [2, "n."],
  [3, "pr."],
  [4, "adv."],
  [5, "idi."],
  [6, "v."],
  [7, "int."],
  [8, "phr."],
  [9, "conj."],
  [10, "prep."],
  [11, "phr. v."],
]);

const POWER_USER_AGENT = "Degoog-Define-Slot/1.0";

const WORD_CAPTURE = "([A-Za-z](?:[A-Za-z'-]{0,46}[A-Za-z])?)";
const LOOKUP_WORD_RE = /^[A-Za-z](?:[A-Za-z'-]{0,46}[A-Za-z])?$/;

const DEFAULT_SETTINGS = {
  triggerMode: "keyword",
  maxDefinitions: 3,
  maxRelatedTerms: 4,
};

const settings = { ...DEFAULT_SETTINGS };

const QUERY_PATTERNS = [
  {
    intent: "definition",
    pattern: new RegExp(
      `^!?\\s*(?:define|definition|meaning)\\b(?:\\s+(?:of|for))?\\s*[:=-]?\\s*${WORD_CAPTURE}$`,
      "i",
    ),
  },
  {
    intent: "synonym",
    pattern: new RegExp(
      `^!?\\s*(?:synonym|synonyms)\\b(?:\\s+(?:for|of))?\\s*[:=-]?\\s*${WORD_CAPTURE}$`,
      "i",
    ),
  },
  {
    intent: "antonym",
    pattern: new RegExp(
      `^!?\\s*(?:antonym|antonyms)\\b(?:\\s+(?:for|of))?\\s*[:=-]?\\s*${WORD_CAPTURE}$`,
      "i",
    ),
  },
  {
    intent: "pronunciation",
    pattern: new RegExp(
      `^!?\\s*(?:pronounce|pronunciation)\\b(?:\\s+(?:of|for))?\\s*[:=-]?\\s*${WORD_CAPTURE}$`,
      "i",
    ),
  },
  {
    intent: "origin",
    pattern: new RegExp(
      `^!?\\s*(?:origin|etymology)\\b(?:\\s+(?:of|for))?\\s*[:=-]?\\s*${WORD_CAPTURE}$`,
      "i",
    ),
  },
  {
    intent: "definition",
    pattern: new RegExp(
      `^(?:what\\s+is|what's|whats)\\s+(?:the\\s+)?(?:definition|meaning)\\s+of\\s+${WORD_CAPTURE}$`,
      "i",
    ),
  },
  {
    intent: "synonym",
    pattern: new RegExp(
      `^(?:what\\s+is|what\\s+are|what's|whats)\\s+(?:a\\s+|some\\s+|the\\s+)?(?:synonym|synonyms)\\s+(?:for|of)\\s+${WORD_CAPTURE}$`,
      "i",
    ),
  },
  {
    intent: "antonym",
    pattern: new RegExp(
      `^(?:what\\s+is|what\\s+are|what's|whats)\\s+(?:a\\s+|some\\s+|the\\s+)?(?:antonym|antonyms)\\s+(?:for|of)\\s+${WORD_CAPTURE}$`,
      "i",
    ),
  },
  {
    intent: "pronunciation",
    pattern: new RegExp(
      `^how\\s+(?:do\\s+i\\s+)?pronounce\\s+${WORD_CAPTURE}$`,
      "i",
    ),
  },
  {
    intent: "definition",
    pattern: new RegExp(`^what\\s+does\\s+${WORD_CAPTURE}\\s+mean$`, "i"),
  },
  {
    intent: "definition",
    pattern: new RegExp(`^(?:what\\s+is|what's|whats)\\s+${WORD_CAPTURE}$`, "i"),
  },
];

const SINGLE_WORD_BLOCKLIST = new Set([
  "weather",
  "forecast",
  "currency",
  "convert",
  "unit",
  "units",
  "map",
  "maps",
  "sports",
  "speedtest",
  "history",
  "settings",
  "images",
  "videos",
  "news",
  "calc",
  "calculator",
  "graph",
  "plot",
  "math",
  "stopwatch",
  "timer",
  "countdown",
  "coinflip",
  "yesno",
  "dice",
  "die",
  "stocks",
  "stock",
  "tip",
  "tips",
  "gratuity",
  "gratuities",
  "translate",
  "translation",
  "until",
]);

const FALLBACK_TEMPLATE = `
<div class="dslot-card" data-dslot-root data-dslot-word="{{word}}">
  <div class="dslot-head">
    <div class="dslot-kicker">Dictionary</div>
    <div class="dslot-word-line">
      <h2 class="dslot-word">{{word}}</h2>
      {{phonetic_html}}
      {{audio_button}}
    </div>
  </div>
  {{body_html}}
  {{related_html}}
  {{origin_html}}
  <div class="dslot-source">Data: <a href="https://dictionaryapi.dev/" target="_blank" rel="noopener">dictionaryapi.dev</a> · Related: <a href="https://www.powerthesaurus.org/" target="_blank" rel="noopener">Power Thesaurus</a></div>
</div>`;

export const slot = {
  id: "define-slot",
  name: "Dictionary",
  description:
    "Shows definitions, pronunciation, synonyms, antonyms, and origin for explicit dictionary queries.",
  isClientExposed: false,
  position: "at-a-glance",
  slotPositions: ["at-a-glance", "above-results", "knowledge-panel"],

  settingsSchema: [
    {
      key: "triggerMode",
      label: "When to show",
      type: "select",
      options: ["keyword", "single-word"],
      default: "keyword",
      description:
        "Keyword only reacts to dictionary words like define, synonym, pronounce, origin, and meaning. Single-word also tries plain one-word searches.",
    },
    {
      key: "maxDefinitions",
      label: "Definitions",
      type: "select",
      options: ["2", "3", "5"],
      default: "3",
      description: "Maximum number of definitions to show.",
    },
    {
      key: "maxRelatedTerms",
      label: "Synonyms/antonyms per group",
      type: "number",
      default: "4",
      placeholder: "4",
      description: "Maximum number of synonyms and antonyms to show in each group. Use 1-12.",
    },
  ],

  init(ctx) {
    template = ctx?.template || FALLBACK_TEMPLATE;
    setPluginRouteBase(ctx);
    if (typeof ctx?.fetch === "function") {
      pluginFetch = (...args) => ctx.fetch(...args);
    }
    if (typeof ctx?.createCache === "function") {
      dictionaryCache = ctx.createCache(6 * 60 * 60 * 1000);
    }
  },

  configure(nextSettings) {
    selectedSlotPosition = readSlotPosition(nextSettings, "at-a-glance");
    settings.triggerMode =
      nextSettings?.triggerMode === "single-word" ? "single-word" : "keyword";
    settings.maxDefinitions = readBoundedInteger(
      nextSettings?.maxDefinitions,
      DEFAULT_SETTINGS.maxDefinitions,
      1,
      5,
    );
    settings.maxRelatedTerms = readBoundedInteger(
      nextSettings?.maxRelatedTerms,
      DEFAULT_SETTINGS.maxRelatedTerms,
      1,
      12,
    );
  },

  trigger(query) {
    return Boolean(parseDictionaryQuery(query));
  },

  async execute(query, context) {
    if (context?.tab && context.tab !== "all") return { html: "" };
    if (!shouldRenderSlotForContext(context, selectedSlotPosition)) {
      return { html: "" };
    }

    const parsed = parseDictionaryQuery(query);
    if (!parsed) return { html: "" };

    const [result, relatedTerms] = await Promise.all([
      lookupDictionary(parsed.word, context),
      lookupPowerThesaurus(parsed.word, context),
    ]);

    if (result.status === "ok") {
      const entry = normalizeDictionaryData(result.data, parsed.word);
      entry.synonyms = mergeRelatedTerms(
        relatedTerms.synonyms,
        entry.synonyms,
        "synonym",
      );
      entry.antonyms = mergeRelatedTerms(
        relatedTerms.antonyms,
        entry.antonyms,
        "antonym",
      );

      if (hasRenderableEntry(entry)) {
        return { html: renderEntry(entry, parsed.intent) };
      }
    }

    const relatedOnlyEntry = {
      word: parsed.word,
      phonetic: "",
      audioUrl: "",
      origin: "",
      definitions: [],
      synonyms: relatedTerms.synonyms,
      antonyms: relatedTerms.antonyms,
    };
    if (hasRenderableEntry(relatedOnlyEntry)) {
      return { html: renderEntry(relatedOnlyEntry, parsed.intent) };
    }

    if (parsed.explicit && result.status === "not-found") {
      return { html: renderEmpty(parsed.word) };
    }

    return { html: "" };
  },
};

export const slotPlugin = slot;
export const routes = [
  {
    method: "get",
    path: "audio",
    handler: async (request) => {
      const url = new URL(request.url);
      const source = normalizeAudioUrl(decodeAudioUrl(url.searchParams.get("src")));

      if (!source) {
        return new Response("Invalid audio URL", {
          status: 400,
          headers: { "Cache-Control": "no-store" },
        });
      }

      try {
        const response = await pluginFetch(source, {
          headers: { Accept: "audio/*,*/*;q=0.1" },
        });

        if (!response.ok) {
          return new Response("Audio unavailable", {
            status: 502,
            headers: { "Cache-Control": "no-store" },
          });
        }

        return new Response(response.body, {
          status: 200,
          headers: {
            "Cache-Control": "public, max-age=86400",
            "Content-Type":
              response.headers.get("content-type") || "audio/mpeg",
          },
        });
      } catch {
        return new Response("Audio unavailable", {
          status: 502,
          headers: { "Cache-Control": "no-store" },
        });
      }
    },
  },
];

export default slot;

function setPluginRouteBase(ctx) {
  if (ctx?.apiBase) {
    pluginRouteBase = ctx.apiBase;
  } else if (typeof ctx?.routeUrl === "function") {
    pluginRouteBase = ctx.routeUrl();
  } else {
    const dir = typeof ctx?.dir === "string" ? ctx.dir : "";
    const folder = dir.replace(/[\\/]+$/, "").split(/[\\/]/).filter(Boolean).pop();
    const prefix = ["", "api", "plugin"].join("/");
    pluginRouteBase = folder ? `${prefix}/${encodeURIComponent(folder)}` : `${prefix}/define-slot`;
  }
}

function parseDictionaryQuery(query) {
  const q = normalizeQuery(query);
  if (!q) return null;

  for (const { intent, pattern } of QUERY_PATTERNS) {
    const match = q.match(pattern);
    if (!match) continue;
    const word = cleanLookupWord(match[1]);
    if (word) return { word, intent, explicit: true };
  }

  if (settings.triggerMode === "single-word") {
    const word = cleanLookupWord(q);
    if (word && !SINGLE_WORD_BLOCKLIST.has(word)) {
      return { word, intent: "definition", explicit: false };
    }
  }

  return null;
}

function normalizeQuery(query) {
  return String(query || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[?!.,;:]+$/g, "");
}

function cleanLookupWord(value) {
  const word = String(value || "")
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/[?!.,;:]+$/g, "")
    .toLowerCase();

  if (!LOOKUP_WORD_RE.test(word)) return "";
  if (word.replace(/[^a-z]/g, "").length < 2) return "";
  if (/--|''|^-|-$|^'|'$/.test(word)) return "";
  return word;
}

function readBoundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

async function lookupDictionary(word, context) {
  const cacheKey = `en:${word}`;
  const cached = dictionaryCache?.get(cacheKey);
  if (cached) return cached;

  const fetcher =
    typeof context?.fetch === "function" ? (...args) => context.fetch(...args) : pluginFetch;

  try {
    const response = await fetcher(
      `${DICTIONARY_API_BASE}/${encodeURIComponent(word)}`,
      { headers: { Accept: "application/json" } },
    );

    if (response.status === 404) {
      const result = { status: "not-found", data: null };
      dictionaryCache?.set(cacheKey, result, 30 * 60 * 1000);
      return result;
    }

    if (!response.ok) return { status: "error", data: null };

    const data = await response.json();
    if (!Array.isArray(data) || !data.length) {
      return { status: "not-found", data: null };
    }

    const result = { status: "ok", data };
    dictionaryCache?.set(cacheKey, result);
    return result;
  } catch {
    return { status: "error", data: null };
  }
}

function normalizeDictionaryData(data, requestedWord) {
  const entries = Array.isArray(data) ? data : [];
  const first = entries[0] || {};
  const phonetics = entries.flatMap((entry) =>
    Array.isArray(entry.phonetics) ? entry.phonetics : [],
  );
  const definitions = [];
  const synonyms = new Map();
  const antonyms = new Map();

  for (const entry of entries) {
    for (const meaning of asArray(entry.meanings)) {
      collectTerms(synonyms, meaning.synonyms);
      collectTerms(antonyms, meaning.antonyms);

      for (const definition of asArray(meaning.definitions)) {
        collectTerms(synonyms, definition.synonyms);
        collectTerms(antonyms, definition.antonyms);

        if (!definition?.definition) continue;
        definitions.push({
          partOfSpeech: String(meaning.partOfSpeech || "").trim(),
          definition: String(definition.definition || "").trim(),
          example: String(definition.example || "").trim(),
        });
      }
    }
  }

  return {
    word: String(first.word || requestedWord || "").trim(),
    phonetic:
      String(first.phonetic || "").trim() ||
      String(phonetics.find((item) => item?.text)?.text || "").trim(),
    audioUrl: firstValidAudioUrl(phonetics),
    origin:
      firstString(entries.map((entry) => entry.origin)) ||
      firstString(entries.map((entry) => entry.etymology)),
    definitions,
    synonyms: [...synonyms.values()].map((word) =>
      makeSimpleRelatedTerm(word, "synonym"),
    ),
    antonyms: [...antonyms.values()].map((word) =>
      makeSimpleRelatedTerm(word, "antonym"),
    ),
  };
}

async function lookupPowerThesaurus(word, context) {
  const cacheKey = `power:${word}`;
  const cached = dictionaryCache?.get(cacheKey);
  if (cached) return cached;

  const fetcher =
    typeof context?.fetch === "function" ? (...args) => context.fetch(...args) : pluginFetch;

  const result = await lookupPowerThesaurusGraphql(word, fetcher).catch(() => ({
    synonyms: [],
    antonyms: [],
  }));

  if (!result.synonyms.length && !result.antonyms.length) {
    const fallback = await lookupPowerThesaurusWeb(word, fetcher).catch(() => ({
      synonyms: [],
      antonyms: [],
    }));
    result.synonyms = fallback.synonyms;
    result.antonyms = fallback.antonyms;
  }

  const ttl = result.synonyms.length || result.antonyms.length
    ? 12 * 60 * 60 * 1000
    : 15 * 60 * 1000;
  dictionaryCache?.set(cacheKey, result, ttl);
  return result;
}

async function lookupPowerThesaurusGraphql(word, fetcher) {
  const term = await searchPowerThesaurusTerm(word, fetcher);
  if (!term?.id) return { synonyms: [], antonyms: [] };

  const [synonyms, antonyms] = await Promise.all([
    fetchPowerThesaurusList(term.id, "synonym", fetcher),
    fetchPowerThesaurusList(term.id, "antonym", fetcher),
  ]);

  return { synonyms, antonyms };
}

async function searchPowerThesaurusTerm(word, fetcher) {
  const json = await postPowerThesaurus(fetcher, {
    operationName: "SEARCH_QUERY",
    variables: { query: word },
    query: POWER_THESAURUS_SEARCH_QUERY,
  });

  const terms = Array.isArray(json?.data?.search?.terms)
    ? json.data.search.terms
    : [];
  const normalizedWord = normalizeTermKey(word);
  return (
    terms.find((term) => normalizeTermKey(term?.name) === normalizedWord) ||
    null
  );
}

async function fetchPowerThesaurusList(termId, kind, fetcher) {
  const json = await postPowerThesaurus(fetcher, {
    operationName: "THESAURUSES_QUERY",
    variables: {
      list: kind.toUpperCase(),
      termID: termId,
      sort: { field: "RATING", direction: "DESC" },
      limit: 50,
      syllables: null,
      query: null,
      posID: null,
      first: 50,
      after: "",
    },
    query: POWER_THESAURUS_THESAURUS_QUERY,
  });

  const edges = Array.isArray(json?.data?.thesauruses?.edges)
    ? json.data.thesauruses.edges
    : [];
  return dedupePowerTerms(
    edges
      .map((edge) => normalizePowerTerm(edge?.node, kind))
      .filter(Boolean),
  );
}

async function postPowerThesaurus(fetcher, payload) {
  const response = await fetcher(POWER_THESAURUS_API_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": POWER_USER_AGENT,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Power Thesaurus returned ${response.status}`);
  }

  const json = await response.json();
  if (Array.isArray(json?.errors) && json.errors.length) {
    throw new Error("Power Thesaurus returned GraphQL errors");
  }
  return json;
}

async function lookupPowerThesaurusWeb(word, fetcher) {
  const [synonyms, antonyms] = await Promise.all([
    fetchPowerThesaurusWebList(word, "synonym", fetcher),
    fetchPowerThesaurusWebList(word, "antonym", fetcher),
  ]);
  return { synonyms, antonyms };
}

async function fetchPowerThesaurusWebList(word, kind, fetcher) {
  const url = buildPowerTermUrl(word, kind);
  const response = await fetcher(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": POWER_USER_AGENT,
    },
  });
  if (!response.ok) return [];

  const html = await response.text();
  if (isCloudflareChallenge(html)) return [];

  const terms = [
    ...extractPowerTermsFromJson(html, kind),
    ...extractPowerTermsFromHtml(html, kind),
  ];
  return dedupePowerTerms(terms);
}

function extractPowerTermsFromJson(html, kind) {
  const jsonText = extractNextDataJson(html);
  if (!jsonText) return [];

  try {
    const data = JSON.parse(decodeHtmlEntities(jsonText));
    const terms = [];
    walkPowerJson(data, kind, terms);
    return terms;
  } catch {
    return [];
  }
}

function walkPowerJson(value, kind, terms) {
  if (!value || terms.length >= 80) return;

  if (Array.isArray(value)) {
    for (const item of value) walkPowerJson(item, kind, terms);
    return;
  }

  if (typeof value !== "object") return;

  const term = normalizePowerTerm(value, kind);
  if (term) terms.push(term);

  for (const next of Object.values(value)) {
    walkPowerJson(next, kind, terms);
  }
}

function extractPowerTermsFromHtml(html, kind) {
  const terms = [];
  const itemPattern =
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = itemPattern.exec(html)) && terms.length < 80) {
    const href = decodeHtmlEntities(match[1]);
    const text = cleanHtmlText(match[2]);
    if (!text || text.length > 64) continue;
    if (!isLikelyPowerTermUrl(href, kind, text)) continue;

    terms.push(
      normalizePowerTerm(
        {
          word: text,
          url: href.startsWith("http")
            ? href
            : `${POWER_THESAURUS_WEB_URL}${href.startsWith("/") ? "" : "/"}${href}`,
        },
        kind,
      ),
    );
  }

  return terms;
}

function normalizePowerTerm(value, kind) {
  if (!value) return null;

  const targetTerm = value.targetTerm || value.term || value.target || {};
  const word = cleanRelatedWord(
    targetTerm.name || value.word || value.name || value.title,
  );
  if (!word) return null;

  const relations = value.relations || {};
  const slug = targetTerm.slug || value.slug || slugifyPowerTerm(word);
  const rating = finiteNumber(value.rating ?? value.votes ?? value.score);
  const partsOfSpeech = normalizePowerParts(
    relations.parts_of_speech ||
      relations.partsOfSpeech ||
      value.parts_of_speech ||
      value.partsOfSpeech ||
      value.parts,
  );
  const tags = normalizeStringList(
    relations.tags || value.tags || value.topics || value.subjects,
  );

  return {
    word,
    rating,
    partsOfSpeech,
    tags,
    url: sanitizePowerUrl(value.url) || buildPowerTermUrl(slug, kind),
  };
}

function makeSimpleRelatedTerm(word, kind) {
  return {
    word,
    rating: null,
    partsOfSpeech: [],
    tags: [],
    url: buildPowerTermUrl(word, kind),
  };
}

function mergeRelatedTerms(primaryTerms, fallbackTerms, kind) {
  const primary = Array.isArray(primaryTerms) ? primaryTerms : [];
  const fallback = Array.isArray(fallbackTerms) ? fallbackTerms : [];
  return dedupePowerTerms([
    ...primary,
    ...fallback.map((term) =>
      typeof term === "string" ? makeSimpleRelatedTerm(term, kind) : term,
    ),
  ]);
}

function dedupePowerTerms(terms) {
  const seen = new Set();
  const deduped = [];

  for (const term of terms) {
    const normalized = normalizePowerTerm(term, "synonym");
    if (!normalized) continue;
    const key = normalizeTermKey(normalized.word);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(normalized);
  }

  return deduped.sort(comparePowerTerms);
}

function comparePowerTerms(a, b) {
  const aRating = Number.isFinite(a.rating) ? a.rating : -Infinity;
  const bRating = Number.isFinite(b.rating) ? b.rating : -Infinity;
  if (bRating !== aRating) return bRating - aRating;
  return a.word.localeCompare(b.word);
}

function normalizePowerParts(value) {
  return normalizeStringList(value)
    .map((part) => {
      const numeric = Number.parseInt(part, 10);
      if (POWER_PARTS_OF_SPEECH.has(numeric)) {
        return POWER_PARTS_OF_SPEECH.get(numeric);
      }
      return part;
    })
    .filter(Boolean)
    .slice(0, 3);
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];

  const seen = new Set();
  const list = [];
  for (const item of value) {
    const text = cleanRelatedMeta(
      typeof item === "object"
        ? item?.name || item?.title || item?.slug || item?.label
        : item,
    );
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(text);
  }
  return list;
}

function cleanRelatedWord(value) {
  const word = String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^["'`]+|["'`]+$/g, "")
    .slice(0, 80);
  return /[A-Za-z]/.test(word) ? word : "";
}

function cleanRelatedMeta(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^#+/, "")
    .slice(0, 36);
}

function normalizeTermKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function buildPowerTermUrl(slugOrWord, kind) {
  const list = kind === "antonym" ? "antonyms" : "synonyms";
  const slug = slugifyPowerTerm(slugOrWord);
  return `${POWER_THESAURUS_WEB_URL}/${encodeURIComponent(slug)}/${list}`;
}

function slugifyPowerTerm(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function sanitizePowerUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const url = new URL(raw, POWER_THESAURUS_WEB_URL);
    if (url.protocol !== "https:") return "";
    if (url.hostname !== "www.powerthesaurus.org") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function extractNextDataJson(html) {
  const match = String(html || "").match(
    /<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  return match?.[1] || "";
}

function isCloudflareChallenge(html) {
  const text = String(html || "").toLowerCase();
  return text.includes("cf_chl") || text.includes("just a moment...");
}

function isLikelyPowerTermUrl(href, kind, text) {
  const normalizedHref = String(href || "").toLowerCase();
  if (!normalizedHref.includes(kind === "antonym" ? "antonym" : "synonym")) {
    return false;
  }
  const slug = slugifyPowerTerm(text);
  return slug && normalizedHref.includes(slug);
}

function cleanHtmlText(html) {
  return decodeHtmlEntities(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#x22;/gi, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function hasRenderableEntry(entry) {
  return Boolean(
    entry.definitions.length ||
      entry.synonyms.length ||
      entry.antonyms.length ||
      entry.origin ||
      entry.phonetic,
  );
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function firstString(values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

function collectTerms(target, terms) {
  for (const term of asArray(terms)) {
    const normalized = String(term || "").trim().replace(/\s+/g, " ");
    if (!normalized || normalized.length > 64) continue;
    const key = normalized.toLowerCase();
    if (!target.has(key)) target.set(key, normalized);
  }
}

function firstValidAudioUrl(phonetics) {
  for (const item of phonetics) {
    const url = normalizeAudioUrl(item?.audio);
    if (url) return url;
  }
  return "";
}

function normalizeAudioUrl(value) {
  let raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("//")) raw = `https:${raw}`;
  if (raw.startsWith("/")) raw = `https://api.dictionaryapi.dev${raw}`;

  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    if (!AUDIO_HOSTS.has(url.hostname)) return "";

    const path = url.pathname.toLowerCase();
    const isKnownAudioPath =
      path.includes("/media/pronunciations/") ||
      path.includes("/dictionary/static/sounds/") ||
      /\.(?:mp3|wav|ogg)$/.test(path);

    return isKnownAudioPath ? url.toString() : "";
  } catch {
    return "";
  }
}

function renderEntry(entry, intent) {
  const audioRoute = entry.audioUrl
    ? `${pluginRouteBase}/audio?src=${encodeURIComponent(encodeAudioUrl(entry.audioUrl))}`
    : "";

  return applyTemplate({
    word: esc(entry.word),
    phonetic_html: entry.phonetic
      ? `<span class="dslot-phonetic">${esc(entry.phonetic)}</span>`
      : "",
    audio_button: audioRoute ? renderAudioButton(audioRoute, entry.word) : "",
    body_html: renderDefinitions(entry.definitions),
    related_html: renderRelated(entry.synonyms, entry.antonyms, intent),
    origin_html: entry.origin ? renderOrigin(entry.origin) : "",
  });
}

function renderEmpty(word) {
  return applyTemplate({
    word: esc(word),
    phonetic_html: "",
    audio_button: "",
    body_html: `<div class="dslot-empty">${t("noDefinition")} <strong>${esc(word)}</strong>.</div>`,
    related_html: "",
    origin_html: "",
  });
}

function applyTemplate(replacements) {
  let html = template || FALLBACK_TEMPLATE;
  for (const [key, value] of Object.entries(replacements)) {
    html = html.split(`{{${key}}}`).join(String(value ?? ""));
  }
  return html;
}

function renderAudioButton(audioRoute, word) {
  return `<button class="dslot-audio" type="button" data-dslot-audio="${escAttr(audioRoute)}" aria-label="${t("playPronunciationFor")} ${escAttr(word)}" aria-pressed="false" title="${t("playPronunciation")}">
    <svg class="dslot-audio-icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3 8v4h3l4 3V5L6 8H3z"></path>
      <path d="M13 7.2a4 4 0 0 1 0 5.6"></path>
      <path d="M15.2 5a7 7 0 0 1 0 10"></path>
    </svg>
  </button>`;
}

function renderDefinitions(definitions) {
  const visibleDefinitions = definitions.slice(0, settings.maxDefinitions);
  const rows = visibleDefinitions
    .map((item, index) => {
      const partOfSpeech = item.partOfSpeech
        ? `<span class="dslot-pos">${esc(item.partOfSpeech)}</span>`
        : "";
      const example = item.example
        ? `<div class="dslot-example">${esc(item.example)}</div>`
        : "";

      return `<li class="dslot-def">
        <span class="dslot-def-num">${index + 1}</span>
        <div class="dslot-def-copy">
          <div class="dslot-def-line">${partOfSpeech}<span class="dslot-def-text">${esc(item.definition)}</span></div>
          ${example}
        </div>
      </li>`;
    })
    .join("");

  return `<ol class="dslot-definitions">${rows}</ol>`;
}

function renderRelated(synonyms, antonyms, intent) {
  const groups = [];
  const synonymGroup = renderRelatedGroup("Synonyms", synonyms, "synonym");
  const antonymGroup = renderRelatedGroup("Antonyms", antonyms, "antonym");

  if (intent === "antonym") {
    if (antonymGroup) groups.push(antonymGroup);
    if (synonymGroup) groups.push(synonymGroup);
  } else {
    if (synonymGroup) groups.push(synonymGroup);
    if (antonymGroup) groups.push(antonymGroup);
  }

  if (!groups.length) return "";
  return `<div class="dslot-related">${groups.join("")}</div>`;
}

function renderRelatedGroup(label, terms, kind) {
  const visibleTerms = terms.slice(0, settings.maxRelatedTerms);
  if (!visibleTerms.length) return "";

  const remaining = Math.max(0, terms.length - visibleTerms.length);
  const tags = visibleTerms.map((term) => renderTerm(term, kind)).join("");
  const serializedTerms = escAttr(JSON.stringify(terms));
  const more = remaining
    ? `<button class="dslot-more" type="button" data-dslot-more-kind="${escAttr(kind)}" data-dslot-more-terms="${serializedTerms}">+${remaining} ${t("moreFromPower")}</button>`
    : "";

  return `<div class="dslot-related-group">
    <div class="dslot-label">${esc(label)}</div>
    <div class="dslot-tags">${tags}${more}</div>
  </div>`;
}

function renderTerm(term, kind) {
  const item =
    typeof term === "string" ? makeSimpleRelatedTerm(term, kind) : term;
  const word = cleanRelatedWord(item?.word);
  if (!word) return "";

  const lookupWord = cleanLookupWord(word);
  const rating =
    Number.isFinite(item.rating) && item.rating !== 0
      ? `<span class="dslot-rating" title="Power Thesaurus rating">${esc(item.rating)}</span>`
      : "";
  const parts = item.partsOfSpeech?.length
    ? `<span class="dslot-term-meta">${esc(item.partsOfSpeech.join(", "))}</span>`
    : "";
  const tags = item.tags?.length
    ? `<span class="dslot-term-tags">${item.tags
        .slice(0, 3)
        .map((tag) => `<span>#${esc(tag)}</span>`)
        .join("")}</span>`
    : "";
  const wordControl = lookupWord
    ? `<button class="dslot-term-word dslot-tag-button" type="button" data-dslot-lookup="${escAttr(lookupWord)}" aria-label="Look up ${escAttr(kind)} ${escAttr(word)}">${esc(word)}</button>`
    : `<span class="dslot-term-word">${esc(word)}</span>`;

  return `<span class="dslot-term">
    <span class="dslot-term-main">${wordControl}${rating}</span>
    ${parts || tags ? `<span class="dslot-term-detail">${parts}${tags}</span>` : ""}
  </span>`;
}

function renderOrigin(origin) {
  return `<div class="dslot-origin">
    <div class="dslot-label">${esc(t("origin"))}</div>
    <p>${esc(origin)}</p>
  </div>`;
}

function encodeAudioUrl(url) {
  return Buffer.from(String(url), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeAudioUrl(value) {
  const raw = String(value || "");
  if (!raw) return "";
  const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return Buffer.from(padded, "base64").toString("utf8");
  } catch {
    return "";
  }
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escAttr(value) {
  return esc(value).replace(/`/g, "&#096;");
}

function t(key) {
  return `{{ t:plugin-define-slot.${key} }}`;
}
