// See results about: Google-style chips for the other meanings of a short,
// ambiguous search, read from the matching Wikipedia disambiguation page.

// Fallback for cores that do not pass template.html.
let template =
  '<nav class="sra-card" aria-label="{{ t:plugin-see-results-about.heading }}"><h2 class="sra-heading">{{ t:plugin-see-results-about.heading }}<span class="sra-hidden"> {{ t:plugin-see-results-about.fromWikipedia }}</span></h2><ul class="sra-chips">{{chips}}</ul></nav>';
let pluginFetch = (...args) => fetch(...args);
let lookupCache = null;
let proxyImage = null;
const inflight = new Map();
let pausedUntil = 0;

const USER_AGENT =
  "degoog-toolkit/1.0 (https://github.com/SoPat712/degoog-toolkit)";
// Disambiguation pages change rarely, so hits and misses both keep a week.
const CACHE_TTL_MS = 7 * 24 * 60 * 60_000;
// One budget for the whole lookup: core runs slots one after another.
const LOOKUP_TIMEOUT_MS = 4_000;
const FAILURE_PAUSE_MS = 60_000;
const MAX_QUERY_LENGTH = 60;
const MAX_WORDS = 4;
const MAX_CJK_LENGTH = 12;
const MIN_CHIPS = 2;
const MAX_CHIPS = 4;
// Pageviews and thumbnails are only fetched for the longest matching articles.
const RANKED_TITLES = 20;
const VIEW_DAYS = 30;
// A strong meaning has real readership and is not dwarfed by the top one.
const MIN_VIEWS = 300;
const MIN_SHARE = 0.02;
// When the plain title is one meaning's article, another must reach this share.
const PRIMARY_SHARE = 0.1;

// The suffix each Wikipedia gives a separate disambiguation page.
const DISAMBIGUATION_SUFFIXES = {
  en: "disambiguation",
  de: "Begriffsklärung",
  es: "desambiguación",
  fr: "homonymie",
  it: "disambigua",
  ja: "曖昧さ回避",
  nl: "doorverwijspagina",
  pl: "ujednoznacznienie",
  pt: "desambiguação",
  ru: "значения",
  uk: "значення",
  zh: "消歧义",
};
// Words that end the type phrase in a short description ("2012 film | by ...").
const DESCRIPTION_STOPS = {
  en: [
    "of", "in", "from", "by", "for", "native", "located", "based", "founded", "that", "which",
    "who", "with", "on", "at", "to", "and", "or", "known", "is", "owned", "made", "produced",
    "developed", "published", "released", "operated", "named", "used", "built", "designed",
    "written", "directed", "starring", "featuring", "before", "after", "during", "between",
    "near", "around", "under", "over", "against", "since", "until", "about", "into", "as",
  ],
  de: ["von", "aus", "in", "im", "der", "des", "für", "mit", "und", "bei", "am"],
  es: ["de", "del", "en", "para", "y", "que", "con", "por"],
  fr: ["de", "du", "des", "d", "en", "à", "au", "aux", "pour", "et", "qui", "par"],
  it: ["di", "del", "della", "dei", "in", "per", "e", "che", "con", "da"],
  nl: ["van", "uit", "in", "voor", "met", "en", "die", "dat"],
  pl: ["z", "w", "na", "dla", "i", "oraz"],
  pt: ["de", "do", "da", "dos", "das", "em", "para", "e", "que", "com"],
  ru: ["из", "в", "во", "на", "для", "и", "с", "со"],
  uk: ["з", "із", "в", "у", "на", "для", "і", "та", "й"],
};
// Nouns that mean nothing without their "of" phrase: "Structured form of play".
const OF_NOUNS = new Set([
  "branch", "collection", "form", "group", "kind", "member", "method", "part", "piece",
  "series", "set", "sort", "style", "type", "unit", "variety", "way",
]);
// Adverbs that lead into a participle phrase: "Type of lung commonly found in ...".
const PARTICIPLE_ADVERBS = new Set([
  "commonly", "formerly", "generally", "largely", "mainly", "mostly", "originally",
  "primarily", "traditionally", "typically", "usually", "widely",
]);
const PARTICIPLE_RX = /^(?:[a-z]{3,}ed|meant|known|made|built|written|sold|held|seen|shown|born|found|used)$/i;
// English and Germanic descriptions end on the type noun; others start with it.
const TYPE_LAST = new Set(["en", "de", "nl"]);
const LEADING_ARTICLES = /^the\s+/i;

const QUESTION_WORDS = new Set([
  "who", "what", "when", "where", "why", "how", "which", "whose", "whom", "is", "are", "was",
  "were", "am", "do", "does", "did", "can", "could", "should", "would", "will", "shall", "may",
  "might", "wie", "wer", "wo", "warum", "wann", "welche", "welcher", "welches", "wieso",
  "weshalb", "comment", "pourquoi", "qui", "quoi", "où", "quand", "quel", "quelle", "quels",
  "quelles", "combien", "cómo", "qué", "quién", "quiénes", "dónde", "cuándo", "cuál", "cuáles",
  "cuánto", "come", "cosa", "chi", "dove", "perché", "quale", "quanto", "como", "quem", "onde",
  "porque", "qual", "quantos", "как", "что", "кто", "где", "почему", "когда", "зачем",
  "сколько", "як", "що", "хто", "де", "чому", "коли", "навіщо", "скільки",
]);
const CJK_QUESTION_RX = /^(?:什么|怎么|怎样|为什么|如何|哪|谁|是否)|[吗呢么]$/u;
// Tool and task words other cards answer, or that make a search a task
// rather than a name ("weather tomorrow", "brave download", "python vs java").
const INTENT_WORDS = new Set([
  "weather", "forecast", "temperature", "time", "timer", "stopwatch", "clock", "alarm",
  "calculator", "calc", "calculate", "convert", "converter", "conversion", "translate",
  "translation", "translator", "define", "definition", "definitions", "meaning", "meanings",
  "synonym", "synonyms", "antonym", "antonyms", "pronounce", "pronunciation", "etymology",
  "spelling", "metronome", "minesweeper", "speedtest", "near", "nearby", "directions", "map",
  "maps", "price", "prices", "cost", "stock", "stocks", "shares", "score", "scores",
  "standings", "schedule", "fixtures", "tickets", "recipe", "recipes", "lyrics", "download",
  "downloads", "login", "signin", "review", "reviews", "vs", "versus", "buy", "cheap",
  "coupon", "news", "images", "videos", "wiki", "wikipedia", "today", "tonight", "tomorrow",
  "yesterday", "flip", "coin", "dice", "random", "tip", "bpm", "play",
]);
// A search of only articles, prepositions and conjunctions ("the", "of the")
// names nothing, even when Wikipedia has a page for the word.
const FUNCTION_WORDS = new Set([
  "a", "about", "above", "across", "after", "against", "along", "among", "an", "and",
  "around", "as", "at", "before", "behind", "below", "beneath", "beside", "between",
  "beyond", "but", "by", "despite", "down", "during", "except", "for", "from", "if", "in",
  "inside", "into", "near", "nor", "of", "off", "on", "onto", "or", "out", "outside",
  "over", "per", "since", "so", "than", "that", "the", "these", "this", "those", "through",
  "till", "to", "toward", "towards", "under", "until", "up", "upon", "via", "with",
  "within", "without", "yet",
]);
// Bangs, search operators, URLs and arithmetic are never a plain name.
const OPERATOR_RX = /[!?？"“”«»:*|~@#$%^&=<>{}[\]\\/()+]|\.\p{L}{2,}/u;
const CJK_RX = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const NON_TOPIC_DESCRIPTION_RX =
  /^(?:lists? of|index of)\b|topics referred to by the same term|same or similar names|^(?:surname|given name|family name|first name)\b/i;
const NON_TOPIC_QUALIFIERS = new Set(["disambiguation", "name", "surname", "given name", "first name"]);
const MATCH_WEIGHT = { exact: 1, qualified: 1, prefix: 0.75, contains: 0.5 };
// A redirect's views belong to its target ("Java (drink)" counts all of Coffee).
const ALIAS_WEIGHT = 0.4;
// By words a title adds to the name: 0-1 ("Brave Search"), 2, then 3 or more.
const EXTRA_WORD_WEIGHT = [1, 1, 0.8, 0.55];
const weight = (candidate) =>
  MATCH_WEIGHT[candidate.kind] *
  (candidate.alias ? ALIAS_WEIGHT : 1) *
  EXTRA_WORD_WEIGHT[Math.min(candidate.extra || 0, EXTRA_WORD_WEIGHT.length - 1)];

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const fold = (value) =>
  String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();

const words = (value) => fold(value).match(/[\p{L}\p{N}]+/gu) || [];

const capitalize = (value) => value.charAt(0).toLocaleUpperCase() + value.slice(1);

const toTitleCase = (value) =>
  value.replace(/(^|\s)(\p{Ll})/gu, (_, gap, letter) => gap + letter.toLocaleUpperCase());

/**
 * The trimmed query when it could be a bare, ambiguous name, otherwise null.
 * Only 1-4 words, no bang, operator, URL, number lead, question or task word.
 */
export function parseAmbiguousQuery(query) {
  const text = String(query ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
  if (!text || text.length > MAX_QUERY_LENGTH) return null;
  if (!/\p{L}/u.test(text) || /^\p{N}/u.test(text) || OPERATOR_RX.test(text)) return null;
  const tokens = text.split(" ");
  if (tokens.length > MAX_WORDS) return null;
  if (tokens.some((token) => /^[-'.,]/.test(token) || /^(?:OR|AND|NOT)$/.test(token))) return null;
  const cjk = CJK_RX.test(text);
  if (cjk && (text.length > MAX_CJK_LENGTH || CJK_QUESTION_RX.test(text))) return null;
  // Letters and symbols ("C", "He", "Fe") match half of Wikipedia.
  if ((text.match(/\p{L}/gu) || []).length < (cjk ? 2 : 3)) return null;
  const lower = tokens.map((token) => token.toLowerCase().replace(/[.,']+$/g, ""));
  if (QUESTION_WORDS.has(lower[0])) return null;
  if (lower.some((token) => INTENT_WORDS.has(token))) return null;
  if (lower.every((token) => FUNCTION_WORDS.has(token))) return null;
  return text;
}

/** degoog's locale ("de-DE") picks the Wikipedia; unknown ones fall back to English. */
export function wikiLanguage(locale) {
  const lang = String(locale || "").toLowerCase().split(/[-_]/)[0];
  return Object.hasOwn(DISAMBIGUATION_SUFFIXES, lang) ? lang : "en";
}

/** "Brave (2012 film)" -> { base: "Brave", qualifier: "2012 film" }. */
export function splitTitle(title) {
  const match = String(title).match(/^(.*\S)\s*\(([^()]+)\)$/);
  return match
    ? { base: match[1], qualifier: match[2].trim() }
    : { base: String(title), qualifier: "" };
}

/**
 * How a linked title relates to the searched name, or null when it does not:
 * "exact" Jaguar, "qualified" Jaguar (band), "prefix" Jaguar Cars, or
 * "contains" Atari Jaguar. A name inside a longer title ("M&T Bank Stadium")
 * is another subject, so "contains" only counts the name at the end.
 */
export function matchKind(title, name, lang = "en") {
  const { base, qualifier } = splitTitle(title);
  const bare = lang === "en" ? base.replace(LEADING_ARTICLES, "") : base;
  if (CJK_RX.test(name)) {
    const target = fold(bare).replace(/\s+/g, "");
    const wanted = fold(name).replace(/\s+/g, "");
    if (!wanted) return null;
    if (target === wanted) return qualifier ? "qualified" : "exact";
    if (target.startsWith(wanted)) return "prefix";
    return target.endsWith(wanted) ? "contains" : null;
  }
  const target = words(bare);
  const wanted = words(name);
  if (!wanted.length) return null;
  const same = (offset) => wanted.every((word, index) => target[offset + index] === word);
  if (target.length === wanted.length && same(0)) return qualifier ? "qualified" : "exact";
  if (same(0)) return "prefix";
  return target.length > wanted.length && same(target.length - wanted.length) ? "contains" : null;
}

// Each word a title adds beyond the name makes it a more specific subject:
// "Brave Search" keeps its weight, "Bank of America Stadium" loses most of it.
function extraWords(title, name) {
  if (CJK_RX.test(name)) return 0;
  return Math.max(0, words(splitTitle(title).base.replace(LEADING_ARTICLES, "")).length - words(name).length);
}

/**
 * The chip's type line from a short description. English keeps the head
 * phrase ("Large cat native to the Americas" -> "Large cat"); other languages
 * keep the first clause, since their prepositions carry the meaning.
 */
export function descriptionHead(description, lang = "en") {
  const clause = String(description || "").split(/[,;:(（，、]/)[0].trim();
  if (!clause || lang !== "en") return clause;
  // "Food and animal care corporation" stays whole on the chip.
  return nounHead(clause, "en", new Set(["and", "or"]), { ofPhrase: true }).join(" ");
}

// "Used to count" has no noun to keep, so the whole clause is its head.
function nounHead(clause, lang, keep, options) {
  const tokens = clause.split(/\s+/);
  const head = headTokens(tokens, lang, keep, options);
  return lang === "en" && head.length === 1 && tokens.length > 1 && PARTICIPLE_RX.test(head[0]) ? tokens : head;
}

// The leading noun phrase of a description. A lone "Family of ..." or
// "Species of ..." keeps its "of" phrase, and English stops before a
// participle phrase ("Entertainer | dressed in ...", "Keyboard key | meant to",
// "Medium | consisting of"). `ofPhrase` keeps the "of" phrase a vague noun
// needs ("Structured form of play").
function headTokens(tokens, lang, keep = new Set(), { ofPhrase = false } = {}) {
  const all = new Set(DESCRIPTION_STOPS[lang] || DESCRIPTION_STOPS.en);
  const word = (index) => String(tokens[index] || "").toLowerCase().replace(/['’]$/, "");
  const isStop = (index) => all.has(word(index)) && !keep.has(word(index));
  const participle = (index) =>
    lang === "en" && (
      (PARTICIPLE_RX.test(tokens[index]) && /^[a-z]/.test(tokens[index]) && all.has(word(index + 1))) ||
      (/^[a-z]+ing$/.test(tokens[index]) && word(index + 1) === "of")
    );
  const cutFrom = (start) => {
    for (let index = start; index < tokens.length; index += 1) {
      if (isStop(index) || participle(index)) return index;
    }
    return tokens.length;
  };
  let cut = cutFrom(1);
  if (cut === 1 && lang === "en" && tokens[1]?.toLowerCase() === "of") cut = cutFrom(2);
  if (ofPhrase && lang === "en" && word(cut) === "of" && OF_NOUNS.has(word(cut - 1))) cut = cutFrom(cut + 1);
  while (lang === "en" && cut > 1 && PARTICIPLE_ADVERBS.has(word(cut - 1))) cut -= 1;
  return tokens.slice(0, cut);
}

/** A short type to add to a refinement: "2012 film by X" -> "2012 film". */
export function descriptionType(description, lang = "en") {
  const clause = String(description || "").split(/[,;:(（，、]/)[0].trim();
  if (!clause) return "";
  if (CJK_RX.test(clause)) return clause.slice(0, 8);
  const head = nounHead(clause, lang);
  if (head.length > 2 && head.length === clause.split(/\s+/).length && PARTICIPLE_RX.test(head[0])) {
    return clause.charAt(0).toLowerCase() + clause.slice(1);
  }
  const picked = TYPE_LAST.has(lang) ? head.slice(-2) : head.slice(0, 2);
  // "Type of lung" refines to "lung", not "of lung".
  if (picked.length > 1 && picked[0].toLowerCase() === "of") picked.shift();
  const phrase = picked.join(" ");
  // Sentence case ("Large cat") reads as a refinement once lower-cased.
  return /^\p{Lu}\p{Ll}/u.test(phrase) && lang !== "de" ? phrase.charAt(0).toLowerCase() + phrase.slice(1) : phrase;
}

/**
 * The refined search a chip runs: "Brave (2012 film)" -> "Brave 2012 film",
 * "Brave Search" as is, the primary "Jaguar" plus its type ("Jaguar large cat").
 */
export function refinedQuery(candidate, lang = "en") {
  const { base, qualifier } = splitTitle(candidate.label || candidate.title);
  if (qualifier) {
    // "Queen (Queen album)" -> "Queen album", not "Queen Queen album".
    const inner = words(qualifier);
    return words(base).every((word) => inner.includes(word)) ? qualifier : `${base} ${qualifier}`;
  }
  // A redirect such as es "Jaguar" -> "Panthera onca" searches the article name.
  if (candidate.alias) {
    const target = splitTitle(candidate.title);
    return [target.base, target.qualifier].filter(Boolean).join(" ");
  }
  if (candidate.kind !== "exact") return base;
  const type = descriptionType(candidate.description, lang);
  return type ? `${base} ${type}` : base;
}

function createCache(ctx) {
  if (typeof ctx?.useCache === "function") {
    return ctx.useCache("ext:see-results-about:wikipedia", CACHE_TTL_MS);
  }
  return typeof ctx?.createCache === "function"
    ? ctx.createCache(CACHE_TTL_MS)
    : null;
}

// Chip links stay on this instance when degoog is served under a sub-path.
function basePath() {
  const raw = String(globalThis.process?.env?.DEGOOG_BASE_URL || "").trim().replace(/\/+$/, "");
  try {
    const path = /^https?:\/\//i.test(raw) ? new URL(raw).pathname.replace(/\/+$/, "") : raw;
    return /^(?:\/[\w.~%-]+)+$/.test(path) ? path : "";
  } catch {
    return "";
  }
}

async function wikiQuery(lang, params, fetcher, signal) {
  const search = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    ...(lang === "zh" ? { converttitles: "1" } : {}),
    ...params,
  });
  const response = await fetcher(`https://${lang}.wikipedia.org/w/api.php?${search}`, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal,
  });
  if (!response.ok) throw new Error(`Wikipedia returned ${response.status}`);
  const data = await response.json();
  if (data?.error) throw new Error(`Wikipedia error ${data.error.code}`);
  return data;
}

// "brave" -> "Brave" when it is itself the disambiguation page, or
// "Apple (disambiguation)" when the plain title is the primary topic.
async function findDisambiguation(name, lang, fetcher, signal) {
  const suffix = DISAMBIGUATION_SUFFIXES[lang];
  // Wikipedia capitalizes only the first letter, so "new york" also tries "New York".
  const variants = [...new Set([capitalize(name), toTitleCase(name)])];
  const titles = variants.flatMap((variant) => [`${variant} (${suffix})`, variant]);
  const data = await wikiQuery(lang, {
    redirects: "1",
    prop: "pageprops",
    ppprop: "disambiguation",
    titles: [...new Set(titles)].join("|"),
  }, fetcher, signal);
  const pages = data?.query?.pages || [];
  const resolve = (title) => {
    let current = title;
    for (const list of [data?.query?.normalized, data?.query?.converted, data?.query?.redirects]) {
      const hop = (list || []).find((entry) => entry.from === current);
      if (hop) current = hop.to;
    }
    return current;
  };
  for (const title of titles) {
    const page = pages.find((entry) => entry.title === resolve(title));
    if (page && !page.missing && page.pageprops && "disambiguation" in page.pageprops) {
      return page.title;
    }
  }
  return "";
}

function rankable(page, lang) {
  if (!page || page.missing || page.invalid || page.ns !== 0) return false;
  if (page.pageprops && "disambiguation" in page.pageprops) return false;
  if (lang === "en") {
    if (/^lists? of\b/i.test(page.title)) return false;
    if (NON_TOPIC_QUALIFIERS.has(splitTitle(page.title).qualifier.toLowerCase())) return false;
    if (NON_TOPIC_DESCRIPTION_RX.test(page.description || "")) return false;
  }
  return Boolean(page.description || splitTitle(page.title).qualifier);
}

// A redirect only stands in for its target when it is the searched name itself,
// in the same case ("Java (drink)" -> Coffee, but not the ticker "JAVA" -> Sun).
function aliasKind(alias, name, lang) {
  const kind = matchKind(alias, name, lang);
  if (kind !== "exact" && kind !== "qualified") return null;
  const base = splitTitle(alias).base;
  return base === capitalize(name) || base === toTitleCase(name) ? kind : null;
}

// Links on the disambiguation page whose title (or a redirect to it) names the
// search. Incidental links in the entries ("Pixar" on Brave) never match, and
// redirects into a section ("Queen (carrom)" -> Carrom#The queen) are skipped.
async function linkedCandidates(page, name, lang, fetcher, signal) {
  const data = await wikiQuery(lang, {
    redirects: "1",
    titles: page,
    generator: "links",
    gplnamespace: "0",
    gpllimit: "max",
    prop: "description|pageprops|info",
    ppprop: "disambiguation",
  }, fetcher, signal);
  const aliases = new Map();
  for (const { from, to, tofragment } of data?.query?.redirects || []) {
    if (!tofragment) aliases.set(to, [...(aliases.get(to) || []), from]);
  }
  const candidates = [];
  for (const entry of data?.query?.pages || []) {
    if (!rankable(entry, lang)) continue;
    const own = matchKind(entry.title, name, lang);
    const alias = own ? "" : (aliases.get(entry.title) || []).find((title) => aliasKind(title, name, lang)) || "";
    const kind = own || (alias && aliasKind(alias, name, lang));
    if (!kind) continue;
    candidates.push({
      title: entry.title,
      label: alias || entry.title,
      alias: Boolean(alias),
      kind,
      extra: extraWords(alias || entry.title, name),
      description: String(entry.description || "").trim(),
      length: Number(entry.length) || 0,
    });
  }
  return candidates;
}

const sumViews = (views) =>
  views && typeof views === "object"
    ? Object.values(views).reduce((total, count) => total + (Number(count) || 0), 0)
    : null;

function safeThumbnail(source) {
  try {
    const url = new URL(String(source || ""));
    if (url.protocol !== "https:" || !/(?:^|\.)wikimedia\.org$/i.test(url.hostname)) return "";
    url.search = "";
    return url.href;
  } catch {
    return "";
  }
}

// Recent pageviews (and thumbnails) for the longest matches. The pageviews
// module answers a few uncached titles per call, so it is continued once.
async function readership(titles, lang, fetcher, signal) {
  const info = new Map();
  let next = {};
  for (let round = 0; round < 2; round += 1) {
    const data = await wikiQuery(lang, {
      titles: titles.join("|"),
      prop: "pageviews|pageimages",
      pvipdays: String(VIEW_DAYS),
      piprop: "thumbnail",
      pithumbsize: "96",
      pilimit: String(titles.length),
      ...next,
    }, fetcher, signal);
    for (const entry of data?.query?.pages || []) {
      const known = info.get(entry.title) || { views: null, thumbnail: "" };
      const views = sumViews(entry.pageviews);
      info.set(entry.title, {
        views: views ?? known.views,
        thumbnail: known.thumbnail || safeThumbnail(entry.thumbnail?.source),
      });
    }
    if (!data?.continue?.pvipcontinue) break;
    next = { ...data.continue };
  }
  return info;
}

/**
 * Strong candidates, best first, as the chips to show (or [] for none).
 * With `primary`, Wikipedia already gives the plain title to one meaning
 * ("Apple" vs "Apple (disambiguation)"), so the others must still be read.
 */
export function rankCandidates(candidates, info, name, lang = "en", { primary = false } = {}) {
  const scored = candidates
    .map((candidate) => {
      const views = info.get(candidate.title)?.views ?? 0;
      return {
        ...candidate,
        views,
        score: views * weight(candidate),
        thumbnail: info.get(candidate.title)?.thumbnail || "",
      };
    })
    .sort((a, b) => b.score - a.score || b.length - a.length);
  const top = scored[0]?.score || 0;
  const searched = fold(name).trim();
  const seen = new Set();
  const chips = [];
  for (const candidate of scored) {
    if (candidate.views < MIN_VIEWS || candidate.score < top * MIN_SHARE) continue;
    const query = refinedQuery(candidate, lang);
    const key = fold(query).replace(/\s+/g, " ").trim();
    if (key === searched || seen.has(key)) continue;
    seen.add(key);
    const { base, qualifier } = splitTitle(candidate.label || candidate.title);
    const type = capitalize(qualifier || descriptionHead(candidate.description, lang));
    if (!type) continue;
    chips.push({
      title: candidate.title,
      name: base,
      type,
      description: candidate.description,
      query,
      thumbnail: candidate.thumbnail,
      views: candidate.views,
      score: candidate.score,
      exact: candidate.kind === "exact",
    });
    if (chips.length === MAX_CHIPS) break;
  }
  if (chips.length < MIN_CHIPS) return [];
  // "Taylor Swift" the singer dwarfs "Taylor Swift (album)": not ambiguous.
  const main = chips.find((chip) => chip.exact);
  const rival = Math.max(0, ...chips.filter((chip) => chip !== main).map((chip) => chip.score));
  if (primary && main && rival < main.score * PRIMARY_SHARE) return [];
  return chips;
}

/** The disambiguation page for a name and its strongest meanings as chips. */
export async function findMeanings(name, lang, fetcher) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const page = await findDisambiguation(name, lang, fetcher, controller.signal);
    if (!page) return { page: "", chips: [] };
    const candidates = await linkedCandidates(page, name, lang, fetcher, controller.signal);
    if (candidates.length < MIN_CHIPS) return { page, chips: [] };
    const longest = [...candidates]
      .sort((a, b) => b.length * weight(b) - a.length * weight(a))
      .slice(0, RANKED_TITLES);
    const info = await readership(longest.map(({ title }) => title), lang, fetcher, controller.signal);
    const primary = page.endsWith(` (${DISAMBIGUATION_SUFFIXES[lang]})`) ||
      (lang === "zh" && /\s\(消歧[义義]\)$/.test(page));
    return { page, chips: rankCandidates(longest, info, name, lang, { primary }) };
  } finally {
    clearTimeout(timer);
  }
}

// Failures are not cached, so a Wikipedia outage does not hide chips for a
// week. Instead new lookups pause briefly, since every slot after this one
// in core's request would otherwise wait out the timeout again.
async function cachedLookup(name, lang, fetcher, cache) {
  const key = `${lang}:${fold(name)}`;
  const cached = cache ? await cache.get(key) : null;
  if (cached && Array.isArray(cached.chips)) return cached;
  if (inflight.has(key)) return inflight.get(key);
  if (Date.now() < pausedUntil) return { page: "", chips: [] };
  const pending = findMeanings(name, lang, fetcher)
    .then(async (found) => {
      if (cache) await cache.set(key, found, CACHE_TTL_MS);
      return found;
    }, (error) => {
      pausedUntil = Date.now() + FAILURE_PAUSE_MS;
      throw error;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, pending);
  return pending;
}

function signedThumbnail(url, context) {
  if (!url) return "";
  const sign = typeof context?.signProxyUrl === "function"
    ? (source) => context.signProxyUrl(source) : proxyImage;
  if (!sign) return "";
  try {
    const signed = sign(url);
    return typeof signed === "string" ? signed : "";
  } catch {
    return "";
  }
}

function renderChip(chip, context) {
  const thumbnail = signedThumbnail(chip.thumbnail, context);
  const media = thumbnail
    ? `<img class="sra-thumb" src="${escapeHtml(thumbnail)}" alt="" width="32" height="32" loading="lazy" decoding="async">`
    : `<span class="sra-thumb sra-thumb--empty" aria-hidden="true">${escapeHtml(Array.from(chip.name)[0] || "")}</span>`;
  const href = `${basePath()}/search?q=${encodeURIComponent(chip.query)}`;
  return `<li class="sra-item"><a class="sra-chip" href="${escapeHtml(href)}"${chip.description ? ` title="${escapeHtml(chip.description)}"` : ""}>${media}<span class="sra-text"><span class="sra-name">${escapeHtml(chip.name)}</span><span class="sra-type">${escapeHtml(chip.type)}</span></span></a></li>`;
}

export function renderCard(found, lang, context) {
  if (!found?.chips?.length) return "";
  const chips = found.chips.map((chip) => renderChip(chip, context)).join("");
  // A function replacement keeps "$&" in remote titles literal.
  return template.replace("{{chips}}", () => chips);
}

export const slot = {
  id: "see-results-about",
  name: "See results about",
  description:
    "Shows Google-style chips for the other meanings of short, ambiguous searches, from Wikipedia disambiguation pages.",
  isClientExposed: false,
  // A borderless row at the top of the results, on the main results rail.
  position: "full-width-above-results",
  slotPositions: ["full-width-above-results", "above-results", "above-sidebar", "below-results"],

  init(ctx) {
    if (ctx?.template) template = ctx.template;
    if (typeof ctx?.fetch === "function") {
      pluginFetch = (...args) => ctx.fetch(...args);
    }
    lookupCache = createCache(ctx);
    proxyImage = typeof ctx?.signProxyUrl === "function" ? (url) => ctx.signProxyUrl(url) : null;
    pausedUntil = 0;
  },

  trigger(query) {
    return Boolean(parseAmbiguousQuery(query));
  },

  async execute(query, context) {
    const name = parseAmbiguousQuery(query);
    if (!name) return { title: "", html: "" };
    const lang = wikiLanguage(context?.locale);
    const fetcher = typeof context?.fetch === "function"
      ? (...args) => context.fetch(...args)
      : pluginFetch;
    try {
      const found = await cachedLookup(name, lang, fetcher, lookupCache || createCache(context));
      return { title: "", html: renderCard(found, lang, context) };
    } catch {
      return { title: "", html: "" };
    }
  },
};

export const slotPlugin = slot;
export default slot;
