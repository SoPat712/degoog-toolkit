export const INFORMATIONAL_QUESTION_RE =
  /^(?:how\s+(?:many|much|often|long|far|old|big|small|tall|wide|deep|fast|slow|do|does|did|can|could|would|should|is|are|was|were|to)|what(?:'s|s|\s+(?:is|are|was|were|do|does|did|can|could|would|should))|which|who|why|when|where|list|name|count|tell\s+me|give\s+me|do\s+you\s+know|is\s+there|are\s+there)\b/i;

export const LINGUISTIC_QUESTION_RE =
  /\b(?:have|has|had)\s+(?:the\s+)?(?:word|words|letter|letters|name|names|character|characters|syllable|syllables)\s+\w+\s+in\b/i;

export const ENGLISH_IN_RE =
  /\b(?:in|into)\s+(?:the|a|an|this|that|these|those|them|it|my|your|his|her|our|their|each|every|some|any|all|one|two|three|four|five|six|seven|eight|nine|ten)\b/i;

const ENGLISH_IN_STOPWORDS = new Set([
  "the", "a", "an", "this", "that", "these", "those", "them", "it",
  "my", "your", "his", "her", "our", "their", "each", "every", "some", "any", "all",
  "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
]);

export function isInformationalQuestion(query) {
  const q = String(query || "").trim();
  return Boolean(q && (INFORMATIONAL_QUESTION_RE.test(q) || LINGUISTIC_QUESTION_RE.test(q)));
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

export function isPlaceInLocation(query) {
  const q = String(query || "").toLowerCase();
  const re = /\bin\s+([a-z][a-z .'-]*)\b/gi;
  let match;
  while ((match = re.exec(q)) !== null) {
    const place = match[1].trim().split(/\s+/)[0];
    if (place && !ENGLISH_IN_STOPWORDS.has(place)) return true;
  }
  return false;
}

export function hasNumericConversionPattern(query) {
  return /\d[\d\s,.]*\s*\S+\s+(?:to|into)\s+\S+/i.test(String(query || "").trim());
}
