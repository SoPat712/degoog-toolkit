let template = "";
let pluginFetch = (...args) => fetch(...args);
let pluginRouteBase = "/api/plugin/define-slot";
let dictionaryCache = null;

const DICTIONARY_API_BASE =
  "https://api.dictionaryapi.dev/api/v2/entries/en";
const AUDIO_HOSTS = new Set([
  "api.dictionaryapi.dev",
  "ssl.gstatic.com",
  "www.gstatic.com",
]);

const WORD_CAPTURE = "([A-Za-z](?:[A-Za-z'-]{0,46}[A-Za-z])?)";
const LOOKUP_WORD_RE = /^[A-Za-z](?:[A-Za-z'-]{0,46}[A-Za-z])?$/;

const DEFAULT_SETTINGS = {
  triggerMode: "keyword",
  maxDefinitions: 3,
  maxRelatedTerms: 12,
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
  <div class="dslot-source">Data: <a href="https://dictionaryapi.dev/" target="_blank" rel="noopener">dictionaryapi.dev</a></div>
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
      label: "Synonyms and antonyms",
      type: "select",
      options: ["6", "12", "20"],
      default: "12",
      description: "Maximum number of related terms to show in each group.",
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
      24,
    );
  },

  trigger(query) {
    return Boolean(parseDictionaryQuery(query));
  },

  async execute(query, context) {
    if (context?.tab && context.tab !== "all") return { html: "" };

    const parsed = parseDictionaryQuery(query);
    if (!parsed) return { html: "" };

    const result = await lookupDictionary(parsed.word, context);
    if (result.status === "ok") {
      const entry = normalizeDictionaryData(result.data, parsed.word);
      if (entry.definitions.length) {
        return { html: renderEntry(entry, parsed.intent) };
      }
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
  const dir = typeof ctx?.dir === "string" ? ctx.dir : "";
  const folder = dir.replace(/[\\/]+$/, "").split(/[\\/]/).filter(Boolean).pop();
  if (folder) pluginRouteBase = `/api/plugin/${encodeURIComponent(folder)}`;
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
    synonyms: [...synonyms.values()],
    antonyms: [...antonyms.values()],
  };
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
    body_html: `<div class="dslot-empty">No definition found for <strong>${esc(word)}</strong>.</div>`,
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
  return `<button class="dslot-audio" type="button" data-dslot-audio="${escAttr(audioRoute)}" aria-label="Play pronunciation for ${escAttr(word)}" aria-pressed="false" title="Play pronunciation">
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
  const more = remaining
    ? `<span class="dslot-more">+${remaining} more</span>`
    : "";

  return `<div class="dslot-related-group">
    <div class="dslot-label">${esc(label)}</div>
    <div class="dslot-tags">${tags}${more}</div>
  </div>`;
}

function renderTerm(term, kind) {
  const lookupWord = cleanLookupWord(term);
  if (!lookupWord) {
    return `<span class="dslot-tag">${esc(term)}</span>`;
  }

  return `<button class="dslot-tag dslot-tag-button" type="button" data-dslot-lookup="${escAttr(lookupWord)}" aria-label="Look up ${escAttr(kind)} ${escAttr(term)}">${esc(term)}</button>`;
}

function renderOrigin(origin) {
  return `<div class="dslot-origin">
    <div class="dslot-label">Origin</div>
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
