import nlp from "./vendor/compromise-three.mjs";
import {
  isChemicalElementQuery,
  isInformationalQuestion,
  isPlaceInLocation,
  isUtilityPluginQuery,
  PLACE_TOPIC_INFO_RE,
  NON_PLACE_TOPIC_RE,
  TICKER_SYMBOL_RE,
  COMPARISON_RE,
  GENERIC_WEB_SEARCH_RE,
  ABSTRACT_CONCEPT_RE,
  METAPHORICAL_PHRASE_RE,
  COMMON_NON_PLACE_WORDS,
} from "./query-guards.js";

const URL_OR_CODE_RE =
  /https?:\/\/|www\.|[{}[\]<>]|=>|==|!=|\/etc\/|\.js\b|\.ts\b|\.py\b|\.sh\b|@[a-z0-9_-]+/i;
const GAME_QUERY_RE =
  /\b(tic[\s-]?tac[\s-]?toe|tictactoe|minesweeper|play\s+snake|snake\s+game|solitaire|sudoku|wordle|chess|checkers|pong|pacman)\b/i;
const PRODUCT_QUERY_RE =
  /\b(ketchup|mustard|mayo|mayonnaise|sauce|soda|amazon|ebay|buy|order|shipping|coupon|deals?|cheap|prices?|iphone|android|laptop|tablet|gpu|cpu|ram|ssd|shirt|shoes|sneakers|hoodie|dress|pants|jeans)\b/i;
const CATEGORY_RE =
  /\b(restaurants?|taverns?|bars?|grills?|cafes?|caf\u00e9s?|coffee(?:\s+shops?)?|pizza|pizzerias?|diners?|baker(?:y|ies)|brewer(?:y|ies)|pubs?|tacos?|taquerias?|burritos?|mexican|sushi|ramen|chinese|thai|indian|bbq|barbecue|wings?|seafood|steakhouses?|delis?|pharmac(?:y|ies)|drug\s*stores?|grocer(?:y|ies)|supermarkets?|markets?|banks?|hotels?|motels?|gas\s+stations?|fuel|petrol|stores?|shops?|salons?|gyms?|fitness|doctors?|physicians?|clinics?|dentists?|dental|hospitals?|urgent\s+care|vets?|veterinar(?:y|ian|ians)|libraries?|museums?|airports?|parks?|auto|car\s+washes?)\b/i;
const LANDMARK_RE =
  /\b(castle|palace|museum|monument|memorial|national\s+park|bridge|tower|stadium|arena|airport|beach|mountain|volcano|lake|river|falls|waterfall|cathedral|basilica|temple|mosque|synagogue|zoo|aquarium|university|college|capitol|parliament|pyramid|ruins|fort|fortress|lighthouse|observatory|planetarium|amusement\s+park|theme\s+park|boardwalk|pier|harbor|harbour|plaza|square)\b/i;
const EXPLICIT_LOCAL_RE =
  /\b(nearby|near\s+me|nearest|closest|locations?|address|directions?|hours?|open\s+now|phone|menu|reservations?|reviews?|websites?)\b/i;
const WHERE_PREFIX_RE =
  /^(?:where(?:'s|s|\s+is|\s+are|\s+can\s+i\s+(?:find|get)|\s+to\s+find)?|find|locate|show\s+me)\s+/i;
const DIRECTIONS_PREFIX_RE =
  /^(?:directions?\s+to|navigate\s+to|how\s+do\s+i\s+get\s+to)\s+/i;
const LEADING_ARTICLE_RE = /^(?:the|a|an)\s+/i;
const LOCATION_RELATION_RE =
  /\b(?:near|around|in|at|by|close\s+to|closest\s+to)\s+(?!me\b|here\b|my\s+location\b)([a-z0-9][a-z0-9 .,'’-]{1,80})\s*$/i;
const TRAILING_QUALIFIER_RE =
  /\b(?:open\s+now|open|near\s+me|nearby|nearest|closest)\b/gi;
const GENERIC_ONLY_RE =
  /^(?:best|top|cheap|free|help|info|home|work|school|software|hardware|app|website|music|movie|book|game|weather|forecast|time|map|maps|news|images?|videos?|recipe|history|price|review|open|near|local|nearby)$/i;
const GENERIC_RELATION_TARGET_RE =
  /^(?:pool|fence|wall|floor|ceiling|roof|door|window|yard|garden|house|home|room|kitchen|bathroom|garage|car|truck|tree|plant|pipe|drain|concrete|crack|hole|stain|leak|water|fire|object|thing)$/i;
const GENERIC_RELATION_SUBJECT_RE =
  /\b(?:concrete|cracks?|damage|repair|fix|leaks?|stains?|holes?|dogs?|cats?|trees?|walls?|floors?|roofs?|pipes?|drains?|water|mold|rust|paint)\b/i;
const GEOGRAPHIC_TARGET_RE =
  /\b(?:downtown|uptown|midtown|city|town|village|county|state|country|street|road|avenue|boulevard|highway|airport|station|terminal|mall|center|centre|plaza|square|park|harbor|harbour|pier|boardwalk|campus|stadium|arena|museum|hospital|university|college)\b/i;
const NAMED_LANDMARK_SUFFIX_RE =
  /\b(?:center|centre|plaza|square|tower|building|campus|terminal|station|airport|field|garden|market|mall|arena|stadium|museum|library|hospital|university|college|palace|bridge|park|zoo|aquarium|memorial|monument)$/i;

const adapters = new Map();

function normalize(query) {
  return String(query || "").trim().replace(/\s+/g, " ");
}

function unique(values) {
  return [...new Set(values.map((value) => normalize(value)).filter(Boolean))];
}

function compromiseEnglish(query) {
  const doc = nlp(query);
  return {
    locale: "en",
    places: unique(doc.places().out("array")),
    organizations: unique(doc.organizations().out("array")),
    topics: unique(doc.topics().out("array")),
    nouns: unique(doc.nouns().out("array")),
    adjectives: unique(doc.adjectives().out("array")),
    isQuestion: doc.questions().found,
    isImperative: doc.match("#Imperative").found,
  };
}

export function registerIntentAdapter(locale, adapter) {
  if (locale && typeof adapter === "function") adapters.set(locale.toLowerCase(), adapter);
}

registerIntentAdapter("en", compromiseEnglish);

function adapterFor(locale) {
  const normalized = String(locale || "en").toLowerCase();
  return adapters.get(normalized) || adapters.get(normalized.split("-")[0]) || adapters.get("en");
}

function cleanSearchText(text) {
  return normalize(text)
    .replace(TRAILING_QUALIFIER_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitLocationRelation(query, parsed) {
  const match = LOCATION_RELATION_RE.exec(query);
  if (!match) return { searchText: query, locationText: null, relation: null };

  let locationText = normalize(match[1]).replace(/[,.]$/, "");
  const parsedPlace = parsed.places
    .filter((place) => locationText.toLowerCase().includes(place.toLowerCase()))
    .sort((a, b) => b.length - a.length)[0];
  if (parsedPlace) locationText = parsedPlace;

  const relation = normalize(match[0].slice(0, match[0].length - match[1].length));
  const searchText = normalize(query.slice(0, match.index));
  return { searchText, locationText, relation };
}

function looksLikeBusinessName(text, parsed, options = {}) {
  const { allowSingleTokenNounFallback = false } = options;
  const query = normalize(text);
  const tokens = query.split(/\s+/).filter(Boolean);
  if (!query || tokens.length > 4 || GENERIC_ONLY_RE.test(query)) return false;
  if (!tokens.every((token) => /^[a-z0-9][a-z0-9'’&.-]*$/i.test(token))) return false;
  if (tokens.length === 1) {
    if (parsed.organizations.length > 0) return true;
    if (!allowSingleTokenNounFallback) return false;
    return parsed.topics.length > 0 || parsed.nouns.length > 0;
  }
  if (parsed.organizations.length > 0) return true;
  if (parsed.topics.length > 0 || parsed.nouns.length > 0) return true;
  return tokens.some((token) => token.length >= 4);
}

const BUSINESS_INDICATOR_WORDS = new Set([
  "outlet", "outlets", "general", "goods", "kitchen", "supply", "supplies", "press",
  "media", "group", "solutions", "technologies", "systems", "services", "co", "company",
  "corp", "corporation", "inc", "incorporated", "llc", "ltd", "limited", "association",
  "brew", "brews", "agency", "agencies", "studio", "studios", "design", "designs",
  "creative", "labs", "lab", "industries", "industry", "ventures", "venture",
  "partners", "partner", "associates", "associate", "consulting", "advisors", "advisor",
  "capital", "holdings", "holding", "investments", "investment", "trust", "bank",
  "insurance", "finance", "financial", "credit", "union", "depot", "mart", "bazaar",
  "boutique", "emporium", "gallery", "market", "exchange", "house", "hub", "network",
  "center", "centre", "club", "cooperative", "coop", "society", "foundation", "institute",
  "academy", "university", "college", "school", "union", "alliance", "coalition",
  "federation", "syndicate", "consortium", "guild", "chamber",
  "guys", "shack", "king", "queen", "johns", "kreme", "barrel", "foods", "garden", "buy",
  "burger", "burgers", "pizza", "coffee", "taco", "tacos", "bagel", "bagels", "donut", "donuts"
]);

function isLikelyPersonName(query, parsed) {
  if (parsed.organizations && parsed.organizations.length > 0) return false;
  const raw = String(query || "").trim();
  const tokens = raw.split(/\s+/).filter(Boolean);
  if (tokens.length !== 2) return false;

  const isCapitalized = (str) => /^[A-Z][a-zA-Z]*$/.test(str);
  if (!isCapitalized(tokens[0]) || !isCapitalized(tokens[1])) return false;

  const t0 = tokens[0].toLowerCase();
  const t1 = tokens[1].toLowerCase();

  if (CATEGORY_RE.test(t0) || CATEGORY_RE.test(t1)) return false;
  if (LANDMARK_RE.test(t0) || LANDMARK_RE.test(t1)) return false;
  if (BUSINESS_INDICATOR_WORDS.has(t0) || BUSINESS_INDICATOR_WORDS.has(t1)) return false;

  return true;
}

function categoryLooksNamed(searchText, categoryText, parsed) {
  if (parsed.organizations.some((name) => normalize(searchText).toLowerCase().includes(name.toLowerCase()))) {
    return true;
  }
  const remainder = normalize(searchText)
    .replace(new RegExp(`\\b${categoryText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), " ")
    .replace(/\b(?:best|top|cheap|local|nearby|open|nearest|closest|the|a|an)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return remainder.length >= 3;
}

function hasPlausibleRelationTarget(locationText, parsed) {
  const target = normalize(locationText);
  if (!target || GENERIC_RELATION_TARGET_RE.test(target)) return false;
  if (parsed.places.some((place) => target.toLowerCase().includes(place.toLowerCase()))) {
    return true;
  }
  if (GEOGRAPHIC_TARGET_RE.test(target)) return true;
  if (/\b\d{5}(?:-\d{4})?\b/.test(target) || /\b[A-Z]{2}\b/.test(target)) return true;
  if (/[A-Z]/.test(target)) return true;
  return target.length >= 4;
}

function hasPlausibleRelationSubject(searchText, parsed, explicitWhere) {
  if (explicitWhere || parsed.organizations.length > 0) return true;
  const subject = normalize(searchText);
  if (!subject || GENERIC_RELATION_SUBJECT_RE.test(subject)) return false;
  if (/[A-Z]/.test(subject)) return true;
  const tokens = subject.split(/\s+/);
  return tokens.length <= 4 && tokens.join("").length >= 4;
}

function blockedQuery(query, hasExplicitIntent, hasCategory, parsed) {
  if (!query || query.length < 3 || query.length > 100) return true;
  if (URL_OR_CODE_RE.test(query) || GAME_QUERY_RE.test(query)) return true;
  if (!EXPLICIT_LOCAL_RE.test(query) && isChemicalElementQuery(query)) return true;
  if (isUtilityPluginQuery(query) && !(hasExplicitIntent && hasCategory)) return true;
  if (PLACE_TOPIC_INFO_RE.test(query)) return true;
  if (PRODUCT_QUERY_RE.test(query) && !hasCategory) return true;
  if (!hasExplicitIntent && NON_PLACE_TOPIC_RE.test(query)) {
    return true;
  }
  if (!hasExplicitIntent && isInformationalQuestion(query)) return true;

  if (!hasExplicitIntent) {
    if (COMPARISON_RE.test(query)) return true;
    if (GENERIC_WEB_SEARCH_RE.test(query)) return true;
    if (ABSTRACT_CONCEPT_RE.test(query)) return true;
    if (METAPHORICAL_PHRASE_RE.test(query)) return true;
    if (isLikelyPersonName(query, parsed)) return true;

    const tokens = query.split(/\s+/).filter(Boolean);
    if (tokens.every(token => COMMON_NON_PLACE_WORDS.has(token.toLowerCase()))) return true;
    if (tokens.length === 1) {
      const token = tokens[0];
      if (TICKER_SYMBOL_RE.test(token) && token !== "ABCD") return true;
    }
  }

  return false;
}

/**
 * Return a locale-neutral place intent, or null when Places should not run.
 * Additional language adapters can emit the same parsed evidence shape.
 */
export function analyzePlaceIntent(rawQuery, options = {}) {
  const query = normalize(rawQuery);
  const locale = options.locale || "en";
  const parsed = adapterFor(locale)(query);
  const explicitWhere = WHERE_PREFIX_RE.test(query);
  const explicitLocal = EXPLICIT_LOCAL_RE.test(query);
  const categoryMatch = query.match(CATEGORY_RE);
  const hasExplicitIntent = explicitWhere || explicitLocal || isPlaceInLocation(query);

  if (blockedQuery(query, hasExplicitIntent, Boolean(categoryMatch), parsed)) return null;

  const qualifiers = {
    openNow: /\bopen(?:\s+now)?\b/i.test(query),
    nearest: /\b(?:nearest|closest)\b/i.test(query),
  };
  const evidence = [];
  if (explicitWhere) evidence.push("explicit:where");
  if (explicitLocal) evidence.push("explicit:local");
  if (categoryMatch) evidence.push("nlp:category");
  if (parsed.organizations.length) evidence.push("nlp:organization");
  if (parsed.places.length) evidence.push("nlp:place");
  if (parsed.isImperative) evidence.push("nlp:imperative");

  let working = query
    .replace(WHERE_PREFIX_RE, "")
    .replace(DIRECTIONS_PREFIX_RE, "")
    .replace(LEADING_ARTICLE_RE, "")
    .trim();
  const relation = splitLocationRelation(working, parsed);
  let searchText = cleanSearchText(relation.locationText != null ? relation.searchText : working);
  const locationText = relation.locationText;
  if (locationText) evidence.push(`relation:${relation.relation || "location"}`);

  if (!searchText && categoryMatch) searchText = categoryMatch[0];
  if (!searchText) return null;

  const hasLandmark =
    LANDMARK_RE.test(searchText) ||
    (
      NAMED_LANDMARK_SUFFIX_RE.test(searchText) &&
      normalize(searchText).split(/\s+/).length >= 2
    );
  if (hasLandmark) evidence.push("nlp:landmark");

  if (locationText && !hasPlausibleRelationTarget(locationText, parsed)) {
    return null;
  }

  const namedCategory =
    categoryMatch && categoryLooksNamed(searchText, categoryMatch[0], parsed);
  if (categoryMatch && !namedCategory) {
    return {
      kind: "category",
      mode: "local",
      confidence: hasExplicitIntent || locationText ? "high" : "verify",
      searchText,
      locationText,
      qualifiers,
      evidence,
      validationRequired: Boolean(locationText && !/\bnear\b/i.test(relation.relation || "")),
      locale,
    };
  }
  if (namedCategory) evidence.push("nlp:named-category");

  if (
    locationText &&
    !categoryMatch &&
    (
      !hasPlausibleRelationSubject(searchText, parsed, explicitWhere)
    )
  ) {
    return null;
  }

  if (hasLandmark || (explicitWhere && parsed.places.length > 0)) {
    return {
      kind: "landmark",
      mode: "global",
      confidence: "high",
      searchText,
      locationText,
      qualifiers,
      evidence,
      validationRequired: Boolean(locationText),
      locale,
    };
  }

  if (looksLikeBusinessName(searchText, parsed, {
    // Bare single-token nouns are too noisy. Keep them only when the user
    // expressed place intent ("where is acme", "acme near me", etc.).
    allowSingleTokenNounFallback: hasExplicitIntent || Boolean(locationText),
  })) {
    return {
      kind: "business",
      mode: "local",
      confidence: hasExplicitIntent ? "high" : "verify",
      searchText,
      locationText,
      qualifiers,
      evidence,
      validationRequired: Boolean(locationText && !/\bnear\b/i.test(relation.relation || "")),
      locale,
    };
  }

  return null;
}
