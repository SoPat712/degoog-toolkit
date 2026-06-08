/**
 * Query-intent guards for Places triggering.
 * Store installs each plugin folder separately — keep this self-contained.
 */

export const INFORMATIONAL_QUESTION_RE =
  /^(?:how\s+(?:many|much|often|long|far|old|big|small|tall|wide|deep|fast|slow|do|does|did|can|could|would|should|is|are|was|were|to)|what(?:'s|s|\s+(?:is|are|was|were|do|does|did|can|could|would|should))|which|who|why|when|where|list|name|count|tell\s+me|give\s+me|do\s+you\s+know|is\s+there|are\s+there)\b/i;

export const LINGUISTIC_QUESTION_RE =
  /\b(?:have|has|had)\s+(?:the\s+)?(?:word|words|letter|letters|name|names|character|characters|syllable|syllables)\s+\w+\s+in\b/i;

export const ENGLISH_IN_RE =
  /\b(?:in|into)\s+(?:the|a|an|this|that|these|those|them|it|my|your|his|her|our|their|each|every|some|any|all|one|two|three|four|five|six|seven|eight|nine|ten)\b/i;

/** Utility / companion-plugin queries that must never trigger Places. */
export const UTILITY_QUERY_RE =
  /\b(?:speed\s*tests?|speedtest|stopwatch|countdown|metronome|coin\s*flips?|coinflip|dice\s*rolls?|yes\s*no|undecided|minesweeper|tic[\s-]?tac[\s-]?toe|tictactoe|play\s+snake|snake\s+game|play\s+tic)\b/i;

/** Time / timezone lookups — "time in japan", "what time in tokyo". */
export const TIMEZONE_QUERY_RE =
  /\b(?:(?:what(?:'s|s|\s+is)?|current|local)\s+)?(?:time|timezone|time\s*zone|clock)\b/i;

/** Leading topic word before "in …" that signals a non-place query. */
export const NON_PLACE_IN_LEAD_RE =
  /^(?:time|timezone|time\s*zone|clock|weather|forecast|temperature|translate|translation|convert|converter|currency|currencies|exchange|stock|stocks|bitcoin|crypto|define|definition|meaning|synonym|antonym|pronunciation|etymology|speed\s*tests?|speedtest|stopwatch|countdown|until|news|wiki|wikipedia|lyrics|recipe|recipes|calculator|calc|calculate|graph|plot|math|tip|tips|gratuity|unit|units|chart|charts|price|prices|history|sports|score|scores|sunrise|sunset|moon|uv|humidity|wind|rain|snow|video|videos|youtube|movie|movies|show|shows|book|books|pdf|download|install|error|fix|tutorial|course|benchmark|review|vs|password|qr|jellyfin|meilisearch|reddit|tmdb|color|colour|hex|rgb|hsl)\b/i;

/** Category or explicit place-seeking wording before a geographic "in …" phrase. */
const CATEGORY_IN_LOCATION_RE =
  /\b(?:restaurants?|taverns?|taps?|bars?|grills?|cafes?|caf\u00e9s?|coffee|pizza|pizzerias?|diners?|baker(?:y|ies)|brewer(?:y|ies)|pubs?|tacos?|taquerias?|burritos?|mexican|sushi|ramen|chinese|thai|indian|bbq|barbecue|wings?|seafood|steakhouses?|delis?|pharmac(?:y|ies)|drug\s*stores?|grocer(?:y|ies)|supermarkets?|markets?|banks?|hotels?|motels?|gas\s+stations?|fuel|petrol|stores?|shops?|salons?|gyms?|fitness|doctors?|physicians?|clinics?|dentists?|dental|hospitals?|urgent\s+care|vets?|veterinar(?:y|ian|ians)|libraries?|places?|locations?|businesses)\s+in\s+[a-z]/i;

/** Category word + informational topic — not a place lookup ("pizza calories", "pizza recipe"). */
export const PLACE_TOPIC_INFO_RE =
  /\b(?:calories|calorie|nutrition|recipe|recipes|ingredients|meme|joke|trivia|logo|wallpaper|meaning|definition|origin|allergens?|gluten|vegan|vegetarian|carbs|macros|how\s+to\s+make|types?\s+of|versus|compared\s+to)\b/i;

const UTILITY_SINGLE_WORDS = new Set([
  "speedtest", "speed", "stopwatch", "timer", "countdown", "metronome", "weather",
  "forecast", "until", "currency", "convert", "converter", "calculator", "calc",
  "calculate", "define", "definition", "translate", "translation", "unit", "units",
  "stocks", "stock", "coinflip", "yesno", "dice", "history", "sports", "tmdb",
  "reddit", "minesweeper", "snake", "tictactoe", "graph", "plot", "math", "tip",
  "tips", "gratuity", "color", "colour", "undecided", "time", "timezone", "clock",
  "youtube", "video", "lyrics", "recipe", "wiki", "wikipedia", "news", "bitcoin",
  "crypto", "password", "qr", "jellyfin", "meilisearch", "settings", "images",
  "videos", "sunrise", "sunset", "moon", "translate",
]);

const CHEMISTRY_SINGLE_WORDS = new Set([
  "hydrogen",
  "helium",
  "carbon",
  "nitrogen",
  "oxygen",
  "fluorine",
  "neon",
  "silicon",
  "phosphorus",
  "sulfur",
  "chlorine",
  "argon",
  "lithium",
  "beryllium",
  "boron",
  "sodium",
  "magnesium",
  "aluminium",
  "aluminum",
  "potassium",
  "calcium",
  "scandium",
  "titanium",
  "vanadium",
  "chromium",
  "manganese",
  "iron",
  "cobalt",
  "nickel",
  "copper",
  "zinc",
  "gallium",
  "germanium",
  "arsenic",
  "selenium",
  "bromine",
  "krypton",
  "rubidium",
  "strontium",
  "yttrium",
  "zirconium",
  "niobium",
  "molybdenum",
  "technetium",
  "ruthenium",
  "rhodium",
  "palladium",
  "silver",
  "cadmium",
  "indium",
  "tin",
  "antimony",
  "tellurium",
  "iodine",
  "xenon",
  "cesium",
  "barium",
  "lanthanum",
  "cerium",
  "praseodymium",
  "neodymium",
  "promethium",
  "samarium",
  "europium",
  "gadolinium",
  "terbium",
  "dysprosium",
  "holmium",
  "erbium",
  "thulium",
  "ytterbium",
  "lutetium",
  "hafnium",
  "tantalum",
  "tungsten",
  "rhenium",
  "osmium",
  "iridium",
  "platinum",
  "gold",
  "mercury",
  "thallium",
  "lead",
  "bismuth",
  "polonium",
  "astatine",
  "radon",
  "francium",
  "radium",
  "actinium",
  "thorium",
  "protactinium",
  "uranium",
  "neptunium",
  "plutonium",
  "americium",
  "curium",
  "berkelium",
  "californium",
  "einsteinium",
  "fermium",
  "mendelevium",
  "nobelium",
  "lawrencium",
  "rutherfordium",
  "dubnium",
  "seaborgium",
  "bohrium",
  "hassium",
  "meitnerium",
  "darmstadtium",
  "roentgenium",
  "copernicium",
  "nihonium",
  "flerovium",
  "moscovium",
  "livermorium",
  "tennessine",
  "oganesson",
]);

/** Levenshtein distance for short typo checks against utility keywords. */
function _levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * Single-token typos of companion-plugin keywords ("weathert", "forcast") should
 * not fall through to optimistic Places name matching.
 */
function isLikelyUtilityKeywordTypo(token) {
  const lower = String(token || "").toLowerCase();
  if (!lower) return false;

  for (const word of UTILITY_SINGLE_WORDS) {
    if (word.length < 5) continue;

    // Prefix slip: weathert, forecastt
    if (lower.startsWith(word) && lower.length <= word.length + 2) return true;

    // Near miss: weater, forcast, translat
    if (Math.abs(lower.length - word.length) <= 2 && _levenshtein(lower, word) <= 2) {
      return true;
    }
  }

  return false;
}

const ENGLISH_IN_STOPWORDS = new Set([
  "the", "a", "an", "this", "that", "these", "those", "them", "it",
  "my", "your", "his", "her", "our", "their", "each", "every", "some", "any", "all",
  "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
]);

export function isInformationalQuestion(query) {
  const q = String(query || "").trim();
  if (!q) return false;
  if (INFORMATIONAL_QUESTION_RE.test(q)) return true;
  if (LINGUISTIC_QUESTION_RE.test(q)) return true;
  return false;
}

export function isEnglishPrepositionIn(query) {
  return ENGLISH_IN_RE.test(String(query || ""));
}

export function isUnitConversionIn(query, isUnitToken) {
  const q = String(query || "");
  if (!/\bin\b/i.test(q) || typeof isUnitToken !== "function") return false;

  let found = false;
  q.replace(/\bin\b/gi, (match, index) => {
    const before = q.slice(0, index).trimEnd().match(/([a-z0-9./-]+)$/i)?.[1];
    const after = q.slice(index + match.length).trimStart().match(/^([a-z0-9./-]+)/i)?.[1];
    if (isUnitToken(before) && isUnitToken(after)) found = true;
    return match;
  });
  return found;
}

/**
 * True when the query has an explicit "seek places in …" shape.
 * Bare "in japan" (e.g. "time in japan") is intentionally NOT enough.
 */
export function isPlaceInLocation(query) {
  const q = String(query || "").trim();
  if (!q || isUtilityPluginQuery(q)) return false;
  if (CATEGORY_IN_LOCATION_RE.test(q)) return true;
  if (/\b(?:places?|locations?|businesses|shops|stores)\s+in\s+[a-z]/i.test(q)) {
    return true;
  }
  return false;
}

/** Queries owned by other plugins or generic web search — never Places. */
export function isUtilityPluginQuery(query) {
  const raw = String(query || "").trim();
  if (!raw) return false;

  const q = raw.replace(/^!(?:places?|map|osm|nearby|location|locations)\b\s*/i, "").trim();
  const lower = q.toLowerCase();

  if (UTILITY_QUERY_RE.test(lower)) return true;
  if (NON_PLACE_IN_LEAD_RE.test(lower)) return true;
  if (TIMEZONE_QUERY_RE.test(lower) && /\bin\b/i.test(lower)) return true;

  const tokens = lower.split(/\s+/).filter(Boolean);
  if (tokens.length === 1) {
    if (UTILITY_SINGLE_WORDS.has(tokens[0])) return true;
    if (isLikelyUtilityKeywordTypo(tokens[0])) return true;
  }

  // Unit-style "100 miles in km" — the token after "in" is not a place name.
  if (/\d/.test(lower) && /\bin\b/i.test(lower)) {
    const afterIn = lower.split(/\bin\b/i).slice(1).join(" in ").trim().split(/\s+/)[0];
    if (afterIn && !ENGLISH_IN_STOPWORDS.has(afterIn) && afterIn.length <= 4) {
      return true;
    }
  }

  return false;
}

export function isChemicalElementQuery(query) {
  const normalized = String(query || "")
    .trim()
    .toLowerCase()
    .replace(/^where(?:'s|s|\s+is|\s+are)?\s+/, "");
  return CHEMISTRY_SINGLE_WORDS.has(normalized);
}

export function hasNumericConversionPattern(query) {
  return /\d[\d\s,.]*\s*\S+\s+(?:to|into)\s+\S+/i.test(String(query || "").trim());
}
