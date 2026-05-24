let template = "";
let externalFetch = (...args) => fetch(...args);
let cache = null;

const PLUGIN_NAME = "Translate";
const PLUGIN_DESCRIPTION =
  "Translate text with no-key server-side providers and natural language query matching.";
const PLUGIN_SETTINGS_ID = "plugin-translate-command";
const MAX_TEXT_LENGTH = 5000;
const FETCH_TIMEOUT_MS = 9000;
const DEFAULT_LIBRETRANSLATE_URL = "https://libretranslate.de";

const settings = {
  defaultTarget: "en",
  preferredProvider: "mymemory",
  libreTranslateUrl: DEFAULT_LIBRETRANSLATE_URL,
};

const PROVIDER_IDS = ["mymemory", "google-unofficial", "libretranslate"];
const PROVIDERS = {
  mymemory: {
    id: "mymemory",
    name: "MyMemory",
    description: "No-key public translation memory API",
  },
  "google-unofficial": {
    id: "google-unofficial",
    name: "Google Translate (unofficial no-key)",
    description: "Unofficial no-key Google Translate endpoint, fetched server-side",
  },
  libretranslate: {
    id: "libretranslate",
    name: "LibreTranslate (public/self-hosted)",
    description: "No-key LibreTranslate endpoint from plugin settings",
  },
};

const LANGUAGE_DEFS = [
  { code: "en", name: "English", aliases: ["eng", "anglais"] },
  {
    code: "es",
    name: "Spanish",
    aliases: ["espanol", "español", "castilian", "castellano"],
  },
  { code: "fr", name: "French", aliases: ["francais", "français"] },
  { code: "de", name: "German", aliases: ["deutsch"] },
  { code: "ru", name: "Russian", aliases: ["russian"] },
  { code: "uk", name: "Ukrainian", aliases: ["ukrainian", "ukrainian language"] },
  { code: "zh-CN", name: "Chinese", aliases: ["zh", "chinese", "mandarin", "simplified chinese", "chinese simplified"] },
  { code: "ja", name: "Japanese", aliases: ["japanese", "nihongo"] },
  { code: "ko", name: "Korean", aliases: ["korean"] },
  { code: "ar", name: "Arabic", aliases: ["arabic"] },
  { code: "hi", name: "Hindi", aliases: ["hindi"] },
  { code: "bn", name: "Bengali", aliases: ["bengali", "bangla"] },
  { code: "pt", name: "Portuguese", aliases: ["portuguese", "portugues", "português"] },
  { code: "it", name: "Italian", aliases: ["italian", "italiano"] },
  { code: "nl", name: "Dutch", aliases: ["dutch", "nederlands"] },
  { code: "tr", name: "Turkish", aliases: ["turkish", "turkce", "türkçe"] },
  { code: "pl", name: "Polish", aliases: ["polish", "polski"] },
  { code: "vi", name: "Vietnamese", aliases: ["vietnamese", "viet"] },
  { code: "id", name: "Indonesian", aliases: ["indonesian", "bahasa indonesia"] },
  { code: "ms", name: "Malay", aliases: ["malay", "bahasa melayu"] },
  { code: "th", name: "Thai", aliases: ["thai"] },
  { code: "el", name: "Greek", aliases: ["greek"] },
  { code: "he", name: "Hebrew", aliases: ["hebrew", "ivrit"] },
  { code: "fa", name: "Persian", aliases: ["persian", "farsi"] },
  { code: "ur", name: "Urdu", aliases: ["urdu"] },
  { code: "ta", name: "Tamil", aliases: ["tamil"] },
  { code: "te", name: "Telugu", aliases: ["telugu"] },
  { code: "mr", name: "Marathi", aliases: ["marathi"] },
  { code: "gu", name: "Gujarati", aliases: ["gujarati"] },
  { code: "pa", name: "Punjabi", aliases: ["punjabi", "panjabi"] },
  { code: "kn", name: "Kannada", aliases: ["kannada"] },
  { code: "ml", name: "Malayalam", aliases: ["malayalam"] },
  { code: "ne", name: "Nepali", aliases: ["nepali"] },
  { code: "si", name: "Sinhala", aliases: ["sinhala", "sinhalese"] },
  { code: "sv", name: "Swedish", aliases: ["swedish", "svenska"] },
  { code: "no", name: "Norwegian", aliases: ["norwegian", "norsk"] },
  { code: "da", name: "Danish", aliases: ["danish", "dansk"] },
  { code: "fi", name: "Finnish", aliases: ["finnish", "suomi"] },
  { code: "cs", name: "Czech", aliases: ["czech", "cesky", "česky"] },
  { code: "sk", name: "Slovak", aliases: ["slovak", "slovakian"] },
  { code: "sl", name: "Slovenian", aliases: ["slovenian", "slovene"] },
  { code: "hr", name: "Croatian", aliases: ["croatian", "hrvatski"] },
  { code: "sr", name: "Serbian", aliases: ["serbian", "srpski"] },
  { code: "ro", name: "Romanian", aliases: ["romanian", "romana", "română"] },
  { code: "hu", name: "Hungarian", aliases: ["hungarian", "magyar"] },
  { code: "bg", name: "Bulgarian", aliases: ["bulgarian"] },
  { code: "ca", name: "Catalan", aliases: ["catalan"] },
  { code: "af", name: "Afrikaans", aliases: ["afrikaans"] },
  { code: "sw", name: "Swahili", aliases: ["swahili", "kiswahili"] },
];

const LANGUAGE_BY_CODE = new Map(LANGUAGE_DEFS.map((lang) => [lang.code, lang]));
const TARGET_LANGUAGE_CODES = LANGUAGE_DEFS.map((lang) => lang.code);
const SOURCE_LANGUAGE_CODES = ["auto", ...TARGET_LANGUAGE_CODES];
const ALIASES = buildAliasTable();

const SETTINGS_SCHEMA = [
  {
    key: "defaultTarget",
    label: "Default target language",
    type: "select",
    options: TARGET_LANGUAGE_CODES,
    default: "en",
    description: "Used when a bang command does not name a target language.",
  },
  {
    key: "preferredProvider",
    label: "Preferred provider",
    type: "select",
    options: PROVIDER_IDS,
    default: "mymemory",
    description:
      "Initial provider to try. Failed initial requests fall back to the other no-key providers.",
  },
  {
    key: "libreTranslateUrl",
    label: "LibreTranslate endpoint",
    type: "url",
    default: DEFAULT_LIBRETRANSLATE_URL,
    placeholder: DEFAULT_LIBRETRANSLATE_URL,
    description:
      "Public or self-hosted LibreTranslate base URL. Leave blank to disable that provider.",
  },
];

const NATURAL_LANGUAGE_PHRASES = [
  "translate",
  "translate to",
  "translation of",
  "how do you say",
  "how would you say",
  "how can you say",
];

const COMMAND_PREFIX_RE = /^!(translate|tr|translation|tl|trans)\b\s*/i;
const LEADING_INTENT_PATTERNS = [
  /^please\s+/i,
  /^translate(?:\s+this|\s+text)?\s+/i,
  /^translation\s+of\s+/i,
  /^how\s+(?:do|would|can)\s+(?:you|i|we)\s+say\s+/i,
  /^(?:what\s+is|what's)\s+(?:the\s+)?(?:translation\s+of\s+)?/i,
  /^say\s+/i,
];

function buildAliasTable() {
  const entries = [
    ["auto", "auto"],
    ["autodetect", "auto"],
    ["auto detect", "auto"],
    ["auto-detect", "auto"],
    ["automatic", "auto"],
    ["detect", "auto"],
  ];

  for (const lang of LANGUAGE_DEFS) {
    entries.push([lang.code, lang.code]);
    entries.push([lang.code.toLowerCase(), lang.code]);
    entries.push([lang.name, lang.code]);
    if (lang.code === "zh-CN") entries.push(["zh", lang.code]);
    for (const alias of lang.aliases || []) entries.push([alias, lang.code]);
  }

  return entries
    .map(([alias, code]) => ({ alias: normaliseAlias(alias), code }))
    .filter((entry) => entry.alias)
    .sort((a, b) => b.alias.length - a.alias.length);
}

async function initPlugin(ctx) {
  template = ctx?.template || "";
  if (!template && typeof ctx?.readFile === "function") {
    template = await ctx.readFile("template.html");
  }
  if (typeof ctx?.fetch === "function") {
    externalFetch = (...args) => ctx.fetch(...args);
  }
  if (typeof ctx?.createCache === "function") {
    cache = ctx.createCache(5 * 60 * 1000);
  }
}

function configurePlugin(saved) {
  settings.defaultTarget =
    normaliseLanguageCode(saved?.defaultTarget, { allowAuto: false }) || "en";
  settings.preferredProvider =
    normaliseProviderId(saved?.preferredProvider) || "mymemory";
  settings.libreTranslateUrl = normaliseLibreUrl(
    saved?.libreTranslateUrl ?? DEFAULT_LIBRETRANSLATE_URL,
  );
}

export const command = {
  name: PLUGIN_NAME,
  description: PLUGIN_DESCRIPTION,
  isClientExposed: false,
  trigger: "translate",
  aliases: ["tr", "translation", "tl", "trans"],
  naturalLanguagePhrases: NATURAL_LANGUAGE_PHRASES,
  settingsSchema: SETTINGS_SCHEMA,

  async init(ctx) {
    await initPlugin(ctx);
  },

  configure(saved) {
    configurePlugin(saved);
  },

  async execute(args, context) {
    const parsed = parseTranslationQuery(args, { forceIntent: true });
    return renderExecution(parsed, context, { allowEmpty: true });
  },
};

export const slot = {
  id: "translate-command",
  name: PLUGIN_NAME,
  description:
    "Shows translations for natural queries like 'hello to spanish' or 'daughter in bengali'.",
  isClientExposed: false,
  position: "at-a-glance",
  slotPositions: ["at-a-glance", "above-results"],
  settingsId: PLUGIN_SETTINGS_ID,

  async init(ctx) {
    await initPlugin(ctx);
  },

  configure(saved) {
    configurePlugin(saved);
  },

  trigger(query) {
    const parsed = parseTranslationQuery(query);
    return Boolean(parsed.hasIntent && parsed.text && parsed.target);
  },

  async execute(query, context) {
    if (context?.tab && context.tab !== "all") return { html: "" };
    const parsed = parseTranslationQuery(query);
    if (!parsed.hasIntent || !parsed.text || !parsed.target) return { html: "" };
    return renderExecution(parsed, context);
  },
};

export const slotPlugin = slot;
export default command;

export const routes = [
  {
    method: "post",
    path: "translate",
    handler: handleTranslateRoute,
  },
  {
    method: "get",
    path: "translate",
    handler: handleTranslateRoute,
  },
];

async function renderExecution(parsed, context, options = {}) {
  if (!parsed.text && !options.allowEmpty) return { html: "" };

  const base = {
    text: parsed.text || "",
    source: parsed.source || "auto",
    target: parsed.target || settings.defaultTarget,
  };

  let translation = null;
  if (base.text) {
    translation = await translateWithFallback(base, settings.preferredProvider, {
      fallback: true,
    });
  }

  const html = renderCard({
    text: base.text,
    source: base.source,
    target: base.target,
    translatedText: translation?.result?.translatedText || "",
    detectedSource: translation?.result?.detectedSource || "",
    activeProvider: translation?.result?.provider?.id || settings.preferredProvider,
    providerState:
      translation?.ok === false && base.text
        ? "failed"
        : translation?.ok
          ? "success"
          : "available",
    providerStatus:
      translation?.ok === false && base.text
        ? translation.error || "Translation unavailable"
        : translation?.result?.provider?.name || providerMeta(settings.preferredProvider).name,
    providers: translation?.providers || providerData(settings.preferredProvider),
  });

  return { title: "", html };
}

async function handleTranslateRoute(request) {
  try {
    const payload = await readRoutePayload(request);
    const text = String(payload.text || "").trim().slice(0, MAX_TEXT_LENGTH);
    const source =
      normaliseLanguageCode(payload.source, { allowAuto: true }) || "auto";
    const target =
      normaliseLanguageCode(payload.target, { allowAuto: false }) ||
      settings.defaultTarget;
    const provider = normaliseProviderId(payload.provider) || settings.preferredProvider;

    if (!text) {
      return jsonResponse(
        {
          ok: false,
          error: "No text to translate",
          providers: providerData(provider),
        },
        400,
      );
    }

    const translation = await translateWithFallback(
      { text, source, target },
      provider,
      { fallback: false },
    );

    if (!translation.ok) {
      return jsonResponse(
        {
          ok: false,
          error: translation.error || "Translation unavailable",
          source,
          target,
          providers: translation.providers,
          provider: providerPayload(provider, "failed", translation.error),
        },
        502,
      );
    }

    return jsonResponse({
      ok: true,
      text,
      source,
      target,
      detectedSource: translation.result.detectedSource || "",
      translatedText: translation.result.translatedText,
      provider: translation.result.provider,
      providers: translation.providers,
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: "Translation route failed",
        providers: providerData(settings.preferredProvider),
      },
      500,
    );
  }
}

async function readRoutePayload(request) {
  if (String(request?.method || "").toUpperCase() === "POST") {
    try {
      return await request.json();
    } catch (error) {
      return {};
    }
  }

  const url = new URL(request.url);
  return Object.fromEntries(url.searchParams.entries());
}

async function translateWithFallback(input, selectedProvider, options = {}) {
  const preferred = normaliseProviderId(selectedProvider) || settings.preferredProvider;
  const order = options.fallback ? providerOrder(preferred) : [preferred];
  const statuses = {};
  let lastError = "Translation unavailable";

  if (input.source && input.source !== "auto" && input.source === input.target) {
    const provider = providerPayload(preferred, "success", "Source and target match");
    statuses[preferred] = provider;
    return {
      ok: true,
      result: {
        translatedText: input.text,
        detectedSource: input.source,
        provider,
      },
      providers: providerData(preferred, statuses),
    };
  }

  for (const providerId of order) {
    const availability = providerAvailability(providerId);
    if (availability.status === "disabled") {
      statuses[providerId] = availability;
      lastError = availability.message;
      continue;
    }

    try {
      const result = await translateWithProvider(providerId, input);
      const provider = providerPayload(providerId, "success", "Translated");
      statuses[providerId] = provider;
      return {
        ok: true,
        result: {
          ...result,
          provider,
        },
        providers: providerData(providerId, statuses),
      };
    } catch (error) {
      lastError = shortError(error);
      statuses[providerId] = providerPayload(providerId, "failed", lastError);
    }
  }

  return {
    ok: false,
    error: lastError,
    providers: providerData(preferred, statuses),
  };
}

async function translateWithProvider(providerId, input) {
  const key = [
    providerId,
    input.source,
    input.target,
    providerId === "libretranslate" ? settings.libreTranslateUrl : "",
    input.text,
  ].join("\u001f");
  const cached = cache?.get(key);
  if (cached) return cached;

  let result;
  if (providerId === "mymemory") {
    result = await translateMyMemory(input);
  } else if (providerId === "google-unofficial") {
    result = await translateGoogleUnofficial(input);
  } else if (providerId === "libretranslate") {
    result = await translateLibreTranslate(input);
  } else {
    throw new Error("Unknown provider");
  }

  if (!result?.translatedText) {
    throw new Error("Provider returned an empty translation");
  }

  cache?.set(key, result);
  return result;
}

async function translateMyMemory(input) {
  const source = providerLanguage(input.source, "mymemory");
  const target = providerLanguage(input.target, "mymemory");
  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", input.text);
  url.searchParams.set("langpair", `${source}|${target}`);

  const response = await fetchJson(url.toString(), {
    headers: { Accept: "application/json" },
  });
  const translated = decodeEntities(response?.responseData?.translatedText || "");
  const status = Number(response?.responseStatus || 200);
  if (!translated || status >= 400) {
    throw new Error(response?.responseDetails || "MyMemory request failed");
  }

  return {
    translatedText: translated,
    detectedSource: input.source === "auto" ? "" : input.source,
  };
}

async function translateGoogleUnofficial(input) {
  const source = providerLanguage(input.source, "google-unofficial");
  const target = providerLanguage(input.target, "google-unofficial");
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", source);
  url.searchParams.set("tl", target);
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", input.text);

  const data = await fetchJson(url.toString(), {
    headers: { Accept: "application/json" },
  });
  const translated = Array.isArray(data?.[0])
    ? data[0].map((part) => part?.[0] || "").join("")
    : "";
  if (!translated) throw new Error("Google unofficial request failed");

  return {
    translatedText: translated,
    detectedSource: typeof data?.[2] === "string" ? data[2] : "",
  };
}

async function translateLibreTranslate(input) {
  const base = settings.libreTranslateUrl;
  if (!base) throw new Error("LibreTranslate endpoint is not configured");

  const data = await fetchJson(`${base}/translate`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: input.text,
      source: providerLanguage(input.source, "libretranslate"),
      target: providerLanguage(input.target, "libretranslate"),
      format: "text",
    }),
  });

  const translated = data?.translatedText || "";
  if (!translated) throw new Error(data?.error || "LibreTranslate request failed");

  return {
    translatedText: translated,
    detectedSource: data?.detectedLanguage?.language || "",
  };
}

async function fetchJson(url, init) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await externalFetch(url, {
      ...init,
      signal: controller.signal,
    });
    if (!response?.ok) {
      throw new Error(`HTTP ${response?.status || "error"}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function parseTranslationQuery(input, options = {}) {
  const raw = String(input || "").trim();
  if (!raw) {
    return emptyParsed(options.forceIntent);
  }

  let value = raw.replace(COMMAND_PREFIX_RE, "").trim();
  let hasIntent = options.forceIntent || value !== raw;

  const stripped = stripLeadingIntent(value);
  value = stripped.value;
  hasIntent = hasIntent || stripped.hasIntent;

  const directedLead = parseDirectedLeadingLanguages(value);
  if (directedLead) {
    return parsedResult(
      directedLead.text,
      directedLead.source,
      directedLead.target,
      true,
    );
  }

  const leadingPair = parseLeadingLanguagePair(value);
  if (leadingPair) {
    return parsedResult(leadingPair.text, leadingPair.source, leadingPair.target, true);
  }

  const barePair = hasIntent ? parseBareLanguagePair(value) : null;
  if (barePair) {
    return parsedResult(barePair.text, barePair.source, barePair.target, true);
  }

  const leadingTarget = parseLeadingTarget(value, hasIntent);
  if (leadingTarget) {
    return parsedResult(leadingTarget.text, "auto", leadingTarget.target, true);
  }

  const targetSuffix = findTrailingLanguagePreposition(value, [
    "to",
    "into",
    "in",
    "as",
  ]);
  if (targetSuffix) {
    const sourceSuffix = findTrailingLanguagePreposition(targetSuffix.before, [
      "from",
    ], {
      allowAuto: true,
    });
    return parsedResult(
      sourceSuffix?.before || targetSuffix.before,
      sourceSuffix?.code || "auto",
      targetSuffix.code,
      true,
    );
  }

  if (hasIntent && value) {
    return parsedResult(value, "auto", settings.defaultTarget, true);
  }

  return emptyParsed(false);
}

function emptyParsed(hasIntent = false) {
  return {
    hasIntent,
    text: "",
    source: "auto",
    target: settings.defaultTarget,
  };
}

function parsedResult(text, source, target, hasIntent) {
  return {
    hasIntent,
    text: stripText(text),
    source: normaliseLanguageCode(source, { allowAuto: true }) || "auto",
    target:
      normaliseLanguageCode(target, { allowAuto: false }) || settings.defaultTarget,
  };
}

function stripLeadingIntent(value) {
  let next = value.trim();
  let hasIntent = false;
  let changed = true;

  while (changed) {
    changed = false;
    for (const pattern of LEADING_INTENT_PATTERNS) {
      if (pattern.test(next)) {
        next = next.replace(pattern, "").trim();
        hasIntent = true;
        changed = true;
      }
    }
  }

  return { value: next, hasIntent };
}

function parseDirectedLeadingLanguages(value) {
  const fromLead = value.match(/^from\s+(.+)$/i);
  if (fromLead) {
    const source = matchLeadingLanguage(fromLead[1], { allowAuto: true });
    if (source?.rest) {
      const targetPart = source.rest.match(/^(?:to|into|in|as)\s+(.+)$/i);
      if (targetPart) {
        const target = matchLeadingLanguage(targetPart[1], { allowAuto: false });
        if (target?.rest) {
          return {
            source: source.code,
            target: target.code,
            text: target.rest,
          };
        }
      }
    }
  }

  const toLead = value.match(/^(?:to|into|in|as)\s+(.+)$/i);
  if (toLead) {
    const target = matchLeadingLanguage(toLead[1], { allowAuto: false });
    const sourcePart = target?.rest?.match(/^from\s+(.+)$/i);
    if (sourcePart) {
      const source = matchLeadingLanguage(sourcePart[1], { allowAuto: true });
      if (source?.rest) {
        return {
          source: source.code,
          target: target.code,
          text: source.rest,
        };
      }
    }
  }

  return null;
}

function parseLeadingLanguagePair(value) {
  const first = matchLeadingLanguage(value, { allowAuto: true });
  if (!first?.rest) return null;

  let rest = first.rest.replace(/^(?:->|=>)\s*/, "to ");
  const separator = rest.match(/^(?:to|into|in)\s+(.+)$/i);
  if (!separator) return null;

  const second = matchLeadingLanguage(separator[1], { allowAuto: false });
  if (!second?.rest) return null;

  return {
    source: first.code,
    target: second.code,
    text: second.rest,
  };
}

function parseBareLanguagePair(value) {
  const first = matchLeadingLanguage(value, { allowAuto: true });
  if (!first?.rest) return null;

  const second = matchLeadingLanguage(first.rest, { allowAuto: false });
  if (!second?.rest) return null;

  return {
    source: first.code,
    target: second.code,
    text: second.rest,
  };
}

function parseLeadingTarget(value, hasIntent) {
  const explicit = value.match(/^(?:to|into|in|as)\s+(.+)$/i);
  if (explicit) {
    const target = matchLeadingLanguage(explicit[1], { allowAuto: false });
    if (target?.rest) return { target: target.code, text: target.rest };
  }

  if (hasIntent) {
    const target = matchLeadingLanguage(value, { allowAuto: false });
    if (target?.rest) return { target: target.code, text: target.rest };
  }

  return null;
}

function findTrailingLanguagePreposition(value, prepositions, options = {}) {
  const re = /\b(to|into|in|as|from)\b/gi;
  const matches = [];
  let match;
  while ((match = re.exec(value))) {
    if (prepositions.includes(match[1].toLowerCase())) {
      matches.push({ index: match.index, end: re.lastIndex, prep: match[1] });
    }
  }

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const item = matches[index];
    const before = value.slice(0, item.index).trim();
    const after = value.slice(item.end).trim();
    if (!before || !after) continue;

    const code = resolveLanguage(after, {
      allowAuto: options.allowAuto === true,
    });
    if (code) return { before, code, prep: item.prep };
  }

  return null;
}

function matchLeadingLanguage(value, options = {}) {
  const tokens = [...String(value || "").matchAll(/\S+/g)];
  const maxTokens = Math.min(4, tokens.length);

  for (let count = maxTokens; count >= 1; count -= 1) {
    const end = tokens[count - 1].index + tokens[count - 1][0].length;
    const candidate = value.slice(0, end);
    const code = resolveLanguage(candidate, options);
    if (code) {
      return {
        code,
        rest: value.slice(end).replace(/^[\s:,\-–—>]+/, "").trim(),
      };
    }
  }

  return null;
}

function resolveLanguage(value, options = {}) {
  const alias = normaliseAlias(value)
    .replace(/\b(?:the|language|lang|please)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!alias) return "";

  for (const entry of ALIASES) {
    if (entry.alias !== alias) continue;
    if (entry.code === "auto" && !options.allowAuto) return "";
    return entry.code;
  }

  return "";
}

function normaliseLanguageCode(value, options = {}) {
  const input = String(value || "").trim();
  if (!input) return "";
  const direct = LANGUAGE_BY_CODE.has(input) ? input : "";
  if (direct) return direct;
  return resolveLanguage(input, options);
}

function normaliseProviderId(value) {
  const id = String(value || "").trim().toLowerCase();
  return PROVIDER_IDS.includes(id) ? id : "";
}

function normaliseAlias(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripText(value) {
  return String(value || "")
    .trim()
    .replace(/^[\s"'`“”‘’]+|[\s"'`“”‘’]+$/g, "")
    .trim();
}

function normaliseLibreUrl(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    return parsed.toString().replace(/\/+$/, "");
  } catch (error) {
    return "";
  }
}

function providerOrder(preferred) {
  return [preferred, ...PROVIDER_IDS].filter(
    (id, index, list) => id && list.indexOf(id) === index,
  );
}

function providerMeta(providerId) {
  return PROVIDERS[providerId] || PROVIDERS.mymemory;
}

function providerAvailability(providerId) {
  if (providerId === "libretranslate" && !settings.libreTranslateUrl) {
    return providerPayload(
      providerId,
      "disabled",
      "LibreTranslate endpoint is not configured",
    );
  }
  const meta = providerMeta(providerId);
  return providerPayload(providerId, "available", meta.description);
}

function providerPayload(providerId, status, message) {
  const meta = providerMeta(providerId);
  return {
    id: meta.id,
    name: meta.name,
    status,
    message: message || meta.description,
  };
}

function providerData(activeProvider, statuses = {}) {
  return PROVIDER_IDS.map((providerId) => ({
    ...providerAvailability(providerId),
    ...(statuses[providerId] || {}),
    active: providerId === activeProvider,
  }));
}

function providerLanguage(code, providerId) {
  if (!code || code === "auto") {
    return providerId === "mymemory" ? "autodetect" : "auto";
  }
  if (code === "zh-CN") {
    return providerId === "libretranslate" ? "zh" : "zh-CN";
  }
  return code;
}

function renderCard(view) {
  const html = template || fallbackTemplate();
  const activeProvider = normaliseProviderId(view.activeProvider) || settings.preferredProvider;
  const providers = Array.isArray(view.providers)
    ? view.providers
    : providerData(activeProvider);
  const provider = providers.find((item) => item.id === activeProvider);
  const statusState = provider?.status || view.providerState || "available";
  const status =
    statusState === "success"
      ? provider?.name || view.providerStatus || ""
      : provider?.message || view.providerStatus || "";

  return fillTemplate(html, {
    source_text: esc(view.text || ""),
    translated_text: esc(view.translatedText || ""),
    source_options: renderLanguageOptions(SOURCE_LANGUAGE_CODES, view.source || "auto"),
    target_options: renderLanguageOptions(
      TARGET_LANGUAGE_CODES,
      view.target || settings.defaultTarget,
    ),
    provider_options: renderProviderOptions(providers, activeProvider),
    provider_status: esc(status),
    provider_state: esc(statusState),
    active_provider: esc(activeProvider),
    detected_source: esc(view.detectedSource || ""),
  });
}

function renderLanguageOptions(codes, selectedCode) {
  return codes
    .map((code) => {
      const selected = code === selectedCode ? " selected" : "";
      const name = code === "auto" ? "Auto-detect" : languageName(code);
      return `<option value="${esc(code)}"${selected}>${esc(name)}</option>`;
    })
    .join("");
}

function renderProviderOptions(providers, selectedProvider) {
  return providers
    .map((provider) => {
      const selected = provider.id === selectedProvider ? " selected" : "";
      return `<option value="${esc(provider.id)}" data-status="${esc(
        provider.status,
      )}"${selected}>${esc(provider.name)}</option>`;
    })
    .join("");
}

function languageName(code) {
  return LANGUAGE_BY_CODE.get(code)?.name || code.toUpperCase();
}

function fillTemplate(html, values) {
  return Object.entries(values).reduce(
    (output, [key, value]) => output.replaceAll(`{{${key}}}`, String(value)),
    html,
  );
}

function fallbackTemplate() {
  return `<div class="trc-card command-result" data-trc-card data-detected-source="{{detected_source}}">
    <div class="trc-toolbar">
      <div class="trc-title">Translate</div>
      <label class="trc-provider-field"><span class="trc-label">Provider</span><select class="trc-provider-select">{{provider_options}}</select></label>
    </div>
    <div class="trc-status" data-status="{{provider_state}}">{{provider_status}}</div>
    <div class="trc-language-row">
      <label class="trc-field"><span class="trc-label">From</span><select class="trc-source-select">{{source_options}}</select></label>
      <label class="trc-field"><span class="trc-label">To</span><select class="trc-target-select">{{target_options}}</select></label>
    </div>
    <div class="trc-text-grid">
      <label class="trc-pane"><span class="trc-label">Source</span><textarea class="trc-source-input">{{source_text}}</textarea></label>
      <label class="trc-pane"><span class="trc-label">Translation</span><textarea class="trc-output" readonly>{{translated_text}}</textarea></label>
    </div>
    <div class="trc-actions"><button class="trc-button trc-translate-button" type="button">Translate</button><button class="trc-button trc-copy-button" type="button">Copy</button></div>
  </div>`;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function shortError(error) {
  const message = String(error?.message || "Translation request failed");
  if (message.includes("aborted") || error?.name === "AbortError") {
    return "Provider timed out";
  }
  return message.slice(0, 120);
}

function decodeEntities(value) {
  return String(value || "").replace(
    /&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi,
    (match, entity) => {
      const lower = entity.toLowerCase();
      if (lower === "amp") return "&";
      if (lower === "lt") return "<";
      if (lower === "gt") return ">";
      if (lower === "quot") return '"';
      if (lower === "apos") return "'";
      if (lower.startsWith("#x")) {
        return String.fromCodePoint(parseInt(lower.slice(2), 16));
      }
      if (lower.startsWith("#")) {
        return String.fromCodePoint(parseInt(lower.slice(1), 10));
      }
      return match;
    },
  );
}

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
