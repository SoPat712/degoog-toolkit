/**
 * Nutrition intent parsing and USDA description matching. Both sides stay
 * conservative: a query needs a nutrition phrase, and a food only matches when
 * its leading description segments name exactly the requested food.
 */

// "vitamin c", "vit. c", "vitamin-c"; B vitamins also stand alone ("b12", "b-12").
const vitamin = (code) => {
  const [letter, digits] = [code[0], code.slice(1)];
  return new RegExp(digits ? `(?:vit(?:amin|\\.)?[\\s-]*)?${letter}[\\s-]?${digits}` : `vit(?:amin|\\.)?[\\s-]*${letter}`);
};
// Every name a query may use for a nutrient the card can show, by its card key.
// In plain names a space also matches a hyphen ("dietary-fiber").
const NUTRIENT_NAMES = {
  calories: ["calories", "calorie", "kcal", "cals"],
  protein: ["protein", "proteins"],
  fat: ["fat", "fats", "total fat"],
  saturatedFat: ["saturated fat", "saturated fats", "sat fat"],
  transFat: ["trans fat", "trans fats"],
  monoFat: ["monounsaturated fat", "monounsaturated fats"],
  polyFat: ["polyunsaturated fat", "polyunsaturated fats"],
  cholesterol: ["cholesterol"],
  sodium: ["sodium", "salt"],
  carbs: ["carbs", "carb", "carbohydrates", "carbohydrate", "total carbs", "total carbohydrates"],
  fiber: ["fiber", "fibre", "dietary fiber", "dietary fibre"],
  sugar: ["sugar", "sugars", "total sugar", "total sugars"],
  addedSugar: ["added sugar", "added sugars"],
  vitaminA: [vitamin("a")],
  vitaminC: [vitamin("c")],
  vitaminD: [vitamin("d")],
  vitaminE: [vitamin("e")],
  vitaminK: [vitamin("k")],
  thiamin: ["thiamin", "thiamine", vitamin("b1")],
  riboflavin: ["riboflavin", vitamin("b2")],
  niacin: ["niacin", vitamin("b3")],
  pantothenicAcid: ["pantothenic acid", vitamin("b5")],
  vitaminB6: [vitamin("b6")],
  folate: ["folate", "folic acid", vitamin("b9")],
  vitaminB12: [vitamin("b12")],
  choline: ["choline"],
  calcium: ["calcium"],
  iron: ["iron"],
  magnesium: ["magnesium"],
  phosphorus: ["phosphorus", "phosphorous"],
  potassium: ["potassium"],
  zinc: ["zinc"],
  copper: ["copper"],
  manganese: ["manganese"],
  selenium: ["selenium"],
};
const NAME_SOURCES = Object.entries(NUTRIENT_NAMES).flatMap(([key, names]) =>
  names.map((name) => [key, name instanceof RegExp ? name.source : name.replace(/ /g, "[\\s-]+")]));
const NUTRIENT_RX = NAME_SOURCES.map(([key, source]) => [key, new RegExp(`^(?:${source})$`, "i")]);
// Longest names first, so "saturated fat" is not read as "fat".
const NUTRIENT_PATTERN = NAME_SOURCES.map(([, source]) => source).sort((a, b) => b.length - a.length).join("|");

/** The card key for a nutrient name ("vit b-12" -> "vitaminB12"), or "". */
export function nutrientKey(name) {
  const text = String(name || "").trim().replace(/\s+/g, " ");
  return NUTRIENT_RX.find(([, rx]) => rx.test(text))?.[0] || "";
}

const LABEL_WORDS = "(?:facts|information|info|values?|content|label)";
const N = `(?<nutrient>${NUTRIENT_PATTERN})`;
const AMOUNT = "(?:content|amount)";

// Ordered from most to least specific; each names the nutrient (if any) and the food.
const PATTERNS = [
  // "how many calories are in a banana", "how much protein does an egg have"
  new RegExp(`^how\\s+(?:many|much)\\s+${N}\\s+(?:(?:is|are)\\s+(?:there\\s+)?)?(?:in|does|do)\\s+(?<food>.+?)(?:\\s+(?:have|has|contain|contains))?$`, "i"),
  // "calories in a banana", "protein in eggs", "potassium content of bananas", "amount of iron in spinach"
  new RegExp(`^(?:(?:the\\s+)?${AMOUNT}\\s+of\\s+)?${N}(?:\\s+${AMOUNT})?\\s+(?:in|of)\\s+(?<food>.+)$`, "i"),
  // "nutrition facts avocado", "nutritional value of quinoa", "nutrition in oats"
  new RegExp(`^nutrition(?:al)?(?:\\s+${LABEL_WORDS})?\\s+(?:of|for|in|on)\\s+(?<food>.+)$`, "i"),
  new RegExp(`^nutrition(?:al)?\\s+${LABEL_WORDS}\\s+(?<food>.+)$`, "i"),
  new RegExp(`^(?:macros|nutrients)\\s+(?:in|of|for)\\s+(?<food>.+)$`, "i"),
  new RegExp(`^(?<nutrient>calories|kcal)\\s+(?!in\\b|of\\b)(?<food>.+)$`, "i"),
  // "banana calories", "banana nutrition facts", "eggs macros"
  new RegExp(`^(?<food>.+?)\\s+(?:calories|calorie\\s+count|kcal|nutrition(?:al)?(?:\\s+${LABEL_WORDS})?|macros|nutrients)$`, "i"),
  // "bananas potassium content", "egg protein amount"
  new RegExp(`^(?<food>.+?)\\s+${N}\\s+${AMOUNT}$`, "i"),
];

// Queries about bodies, exercise and diet planning rather than a food.
const NON_FOOD_QUERY =
  /\b(?:burn|burns|burned|burnt|burning|lose|losing|lost|gain|gaining|deficit|surplus|should|need|needs|needed|calculator|counter|tracker|app|apps|chart|list|recipes?|diet|plan|intake|requirements?|daily|goal|per\s+day|a\s+day|how\s+to|vs|versus|or)\b/i;
const NON_FOOD_WORDS = new Set([
  "active", "adult", "advanced", "animal", "baby", "basic", "body", "calorie", "calories", "carb", "carbs",
  "cat", "child", "clinical", "community", "count", "day", "dog", "elderly", "empty", "enteral", "extra",
  "fat", "functional", "generator", "global", "gram", "guideline", "high", "holistic", "hour", "human",
  "infant", "kg", "kid", "kilo", "kilogram", "km", "label", "lb", "life", "low", "maintenance", "maker", "man",
  "mile", "minute", "month", "negative", "net", "optimum", "panel", "parenteral", "pdf", "person", "pet",
  "plant", "pound", "precision", "pregnancy", "prenatal", "printable", "protein", "public", "resting", "run",
  "running", "school", "senior", "sex", "sheet", "sleep", "sport", "step", "student", "template", "total",
  "ultimate", "walk", "walking", "week", "woman", "workout", "year", "zero",
]);
const QUESTION_LEAD = /^(?:how|what|which|why|when|where|who|is|are|do|does|can|my|your|our|their)\b/i;
const COUNT_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
// Measures that pick a matching USDA portion: "a slice of pizza" selects "1 slice".
const PORTION_HINTS = new Set([
  "bar", "bowl", "can", "cup", "glass", "handful", "large", "medium", "piece", "scoop", "serving", "slice",
  "small", "stick", "tablespoon", "tbsp", "teaspoon", "tsp",
]);
const PORTION_ALIASES = { tablespoon: "tbsp", teaspoon: "tsp" };

// Words a description may carry beyond the requested food without changing it.
export const DESCRIPTORS = new Set([
  "all", "baked", "boiled", "broiled", "commercial", "cooked", "dried", "fresh", "fried", "grilled", "nfs",
  "ns", "plain", "poached", "prepared", "raw", "regular", "ripe", "roasted", "scrambled", "steamed",
  "unsalted", "unsweetened", "varieties", "whole",
]);
const STOP_WORDS = new Set(["a", "an", "and", "as", "of", "or", "the", "to", "with"]);

/** Lowercase words with simple plural folding, applied identically to queries and descriptions. */
export function foodWords(value) {
  return String(value || "")
    .normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim().split(/\s+/).filter(Boolean)
    .map((word) => {
      if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
      if (word.length > 4 && word.endsWith("oes")) return word.slice(0, -2);
      if (word.length > 3 && word.endsWith("s") && !/(?:ss|us|is)$/.test(word)) return word.slice(0, -1);
      return word;
    });
}

function cleanFood(value) {
  let food = String(value || "").trim().replace(/[?!.,;:]+$/, "").trim();
  let grams = null;
  let count = null;
  let hint = "";
  const gramMatch = food.match(/^(\d+(?:\.\d+)?)\s*(?:g|grams?)\s+(?:of\s+)?/i);
  if (gramMatch) {
    grams = Number(gramMatch[1]);
    food = food.slice(gramMatch[0].length);
  } else {
    const countMatch = food.match(/^(\d{1,2}|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+/i);
    if (countMatch) {
      count = COUNT_WORDS[countMatch[1].toLowerCase()] ?? Number(countMatch[1]);
      food = food.slice(countMatch[0].length);
    }
    const hintMatch = food.match(/^([a-z]+?)s?\s+(?:of\s+)?(?=\S)/i);
    if (hintMatch && PORTION_HINTS.has(hintMatch[1].toLowerCase())) {
      const word = hintMatch[1].toLowerCase();
      hint = PORTION_ALIASES[word] || word;
      food = food.slice(hintMatch[0].length);
    }
  }
  food = food.replace(/^(?:the|some|per)\s+/i, "").trim();
  return { food, grams, count, hint };
}

/**
 * Parse explicit nutrition intent: "calories in a banana", "banana nutrition",
 * "protein in eggs", "vit c in oranges", "nutrition facts avocado". Returns
 * { food, words, focus, grams, count, hint } or null; `focus` is the card key
 * of the nutrient the query names, or "calories".
 */
export function parseNutritionQuery(value) {
  const raw = String(value || "").trim().replace(/\s+/g, " ").replace(/[?!.]+$/, "");
  if (raw.length < 6 || raw.length > 90 || /^!|[<>{}[\]\\/=@#$%^*+|~`"]/.test(raw)) return null;
  if (NON_FOOD_QUERY.test(raw)) return null;

  for (const pattern of PATTERNS) {
    const match = raw.match(pattern);
    if (!match) continue;
    const focus = nutrientKey(match.groups.nutrient) || "calories";
    const { food, grams, count, hint } = cleanFood(match.groups.food);
    const words = foodWords(food).filter((word) => !STOP_WORDS.has(word));
    const core = words.filter((word) => !DESCRIPTORS.has(word));
    if (!core.length || words.length > 5 || food.length < 2 || food.length > 50) return null;
    if (/\d/.test(food) || QUESTION_LEAD.test(food) || core.some((word) => NON_FOOD_WORDS.has(word))) return null;
    if (grams !== null && !(grams > 0 && grams <= 2000)) return null;
    return { food, words, focus, grams, count, hint };
  }
  return null;
}

/**
 * How well a USDA description names the requested food, or null when it names
 * something else. The leading segments must cover every requested word and add
 * only descriptors: "Egg, whole, raw" matches "egg"; "Duck egg" and "Egg roll" do not.
 */
export function describeMatch(description, words) {
  const want = new Set(words.filter((word) => !STOP_WORDS.has(word)));
  const core = [...want].filter((word) => !DESCRIPTORS.has(word));
  if (!core.length) return null;
  const segments = String(description || "").split(",").map((segment) => foodWords(segment).filter((word) => !STOP_WORDS.has(word)));
  const all = new Set(segments.flat());
  if ([...want].some((word) => !all.has(word))) return null;

  const seen = new Set();
  let used = 0;
  while (used < segments.length && core.some((word) => !seen.has(word))) {
    segments[used].forEach((word) => seen.add(word));
    used += 1;
  }
  if ([...seen].some((word) => !want.has(word) && !DESCRIPTORS.has(word))) return null;
  return { used, rest: segments.slice(used) };
}

export { PORTION_HINTS };
