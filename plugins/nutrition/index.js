import { DESCRIPTORS, describeMatch, parseNutritionQuery } from "./nutrition-query.js";

export { describeMatch, parseNutritionQuery } from "./nutrition-query.js";

const FDC_BASE = "https://api.nal.usda.gov/fdc/v1";
const DEMO_KEY = "DEMO_KEY";
// USDA revises these datasets a few times a year; the shared DEMO_KEY allows
// about 30 requests an hour, so a found food is kept for a week.
const FOOD_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT_PAUSE_MS = 15 * 60 * 1000;
const SEARCH_TIMEOUT_MS = 7000;
const DETAIL_TIMEOUT_MS = 5000;
const PAGE_SIZE = 50;
// Generic foods first; Branded products are never searched.
const DATA_TYPES = ["Foundation", "SR Legacy", "Survey (FNDDS)"];
const DATA_TYPE_RANK = { "Survey (FNDDS)": 3, "SR Legacy": 2, Foundation: 1 };
const MAX_PORTIONS = 8;

// FDA Daily Values for adults and children 4+ (2016 label rule), 2,000 kcal diet.
// `number` is the USDA nutrient number shared by all three datasets.
const MACROS = [
  { key: "fat", number: ["204"], unit: "g", dv: 78 },
  { key: "saturatedFat", number: ["606"], unit: "g", dv: 20, sub: true },
  { key: "cholesterol", number: ["601"], unit: "mg", dv: 300 },
  { key: "sodium", number: ["307"], unit: "mg", dv: 2300 },
  { key: "carbs", number: ["205", "205.2"], unit: "g", dv: 275 },
  { key: "fiber", number: ["291"], unit: "g", dv: 28, sub: true },
  { key: "sugar", number: ["269", "269.3"], unit: "g", sub: true },
  { key: "protein", number: ["203"], unit: "g", dv: 50 },
];
const MICROS = [
  { key: "vitaminA", number: ["320"], unit: "µg", dv: 900 },
  { key: "vitaminC", number: ["401"], unit: "mg", dv: 90 },
  { key: "vitaminD", number: ["328"], unit: "µg", dv: 20 },
  { key: "vitaminB6", number: ["415"], unit: "mg", dv: 1.7 },
  { key: "vitaminB12", number: ["418"], unit: "µg", dv: 2.4 },
  { key: "calcium", number: ["301"], unit: "mg", dv: 1300 },
  { key: "iron", number: ["303"], unit: "mg", dv: 18 },
  { key: "potassium", number: ["306"], unit: "mg", dv: 4700 },
  { key: "magnesium", number: ["304"], unit: "mg", dv: 420 },
];

let template = "";
let runtimeFetch = (...args) => fetch(...args);
let nutritionCache = null;
let apiKey = "";
let rateLimitedUntil = 0;

function createExtensionCache(ctx, namespace, ttlMs) {
  if (typeof ctx?.useCache === "function") return ctx.useCache(namespace, ttlMs);
  return typeof ctx?.createCache === "function" ? ctx.createCache(ttlMs) : null;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function fetchWithTimeout(fetcher, url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function keyedUrl(path) {
  const url = new URL(`${FDC_BASE}${path}`);
  url.searchParams.set("api_key", apiKey || DEMO_KEY);
  return url.toString();
}

/** Per-100 g amounts keyed by MACROS/MICROS key, plus calories. */
export function extractNutrients(foodNutrients) {
  const byNumber = new Map();
  for (const nutrient of Array.isArray(foodNutrients) ? foodNutrients : []) {
    const number = String(nutrient?.nutrientNumber ?? nutrient?.nutrient?.number ?? "");
    const value = Number(nutrient?.value ?? nutrient?.amount);
    const unit = String(nutrient?.unitName ?? nutrient?.nutrient?.unitName ?? "").toUpperCase();
    if (number && Number.isFinite(value) && !byNumber.has(number)) byNumber.set(number, { value, unit });
  }
  const values = {};
  // Survey and SR Legacy report Energy as 208; Foundation foods often only carry Atwater energy.
  const kcal = ["208", "958", "957"].map((number) => byNumber.get(number)).find((entry) => entry?.unit === "KCAL");
  const kj = byNumber.get("268");
  if (kcal) values.calories = kcal.value;
  else if (kj?.unit === "KJ") values.calories = kj.value / 4.184;
  for (const { key, number } of [...MACROS, ...MICROS]) {
    const entry = number.map((n) => byNumber.get(n)).find(Boolean);
    if (entry) values[key] = entry.value;
  }
  return values;
}

function portionLabel(portion) {
  const text = String(portion?.disseminationText || portion?.portionDescription || "").trim();
  if (text) return text;
  const amount = Number(portion?.amount) || 1;
  const unit = portion?.measureUnit?.name && portion.measureUnit.name !== "undetermined" ? portion.measureUnit.name : "";
  return [amount, unit, portion?.modifier].filter(Boolean).join(" ").trim();
}

/** Standard USDA portions, best first, without "Quantity not specified" or duplicates. */
export function extractPortions(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : [])
    .map((portion) => ({ label: portionLabel(portion), grams: Number(portion?.gramWeight), rank: Number(portion?.rank ?? portion?.sequenceNumber ?? 999) }))
    .filter(({ label, grams }) => label && Number.isFinite(grams) && grams > 0 && grams <= 5000 && !/quantity not specified/i.test(label))
    .sort((a, b) => a.rank - b.rank)
    .filter(({ label }) => !seen.has(label.toLowerCase()) && seen.add(label.toLowerCase()))
    .slice(0, MAX_PORTIONS)
    .map(({ label, grams }) => ({ label, grams }));
}

/** Pick the generic food whose description names the request most plainly. */
export function chooseFood(foods, words) {
  let best = null;
  for (const food of Array.isArray(foods) ? foods : []) {
    if (!DATA_TYPE_RANK[food?.dataType] || !food?.fdcId || !food?.description) continue;
    const match = describeMatch(food.description, words);
    if (!match) continue;
    const nutrients = extractNutrients(food.foodNutrients);
    if (!Number.isFinite(nutrients.calories)) continue;
    // Every extra descriptor costs a little and anything else costs more; a bare
    // "raw" is what a generic produce or egg search means.
    let score = DATA_TYPE_RANK[food.dataType] - 10 * (match.used - 1) - food.description.length * 0.02;
    for (const segment of match.rest) {
      if (segment.length === 1 && segment[0] === "raw") score += 3;
      else score -= segment.every((word) => DESCRIPTORS.has(word)) ? 1 : 4;
    }
    if (!best || score > best.score) best = { score, food, nutrients };
  }
  if (!best) return null;
  return {
    fdcId: best.food.fdcId,
    description: best.food.description,
    dataType: best.food.dataType,
    nutrients: best.nutrients,
    portions: extractPortions(best.food.foodMeasures),
  };
}

async function fetchJson(fetcher, url, init, timeoutMs) {
  const response = await fetchWithTimeout(fetcher, url, init, timeoutMs);
  if (response?.status === 429) {
    rateLimitedUntil = Date.now() + RATE_LIMIT_PAUSE_MS;
    return null;
  }
  if (!response?.ok) return null;
  return response.json();
}

/** One search per new food (plus a detail call when the match lacks portions), cached. */
async function lookupFood(parsed, fetcher) {
  const key = `food:${parsed.words.join(" ")}`;
  const cached = nutritionCache ? await nutritionCache.get(key) : null;
  if (cached) return cached.food || null;
  if (Date.now() < rateLimitedUntil) return null;

  const payload = await fetchJson(fetcher, keyedUrl("/foods/search"), {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ query: parsed.food, dataType: DATA_TYPES, pageSize: PAGE_SIZE, requireAllWords: true }),
  }, SEARCH_TIMEOUT_MS);
  if (!payload || !Array.isArray(payload.foods)) return null;

  const food = chooseFood(payload.foods, parsed.words);
  if (food && !food.portions.length) {
    try {
      const detail = await fetchJson(fetcher, keyedUrl(`/food/${food.fdcId}`), { headers: { Accept: "application/json" } }, DETAIL_TIMEOUT_MS);
      food.portions = extractPortions(detail?.foodPortions);
    } catch {
      // The card still works with 100 g alone.
    }
  }
  if (nutritionCache) await nutritionCache.set(key, { food }, food ? FOOD_TTL_MS : MISS_TTL_MS);
  return food;
}

function roundAmount(value) {
  if (!Number.isFinite(value)) return "";
  if (value >= 100) return String(Math.round(value));
  if (value >= 10) return String(Math.round(value * 10) / 10).replace(/\.0$/, "");
  return String(Math.round(value * 100) / 100).replace(/(\.\d)0$/, "$1").replace(/\.0$/, "");
}

const amountText = (value, unit) => `${roundAmount(value)} ${unit}`;
const dvText = (value, dv) => `${Math.round((value / dv) * 100)}%`;

function servingOptions(food, parsed) {
  const options = food.portions.map(({ label, grams }) => ({ label: `${label} (${roundAmount(grams)} g)`, grams }));
  let selected = options[0] || null;
  if (parsed.hint) selected = options.find(({ label }) => label.toLowerCase().includes(parsed.hint)) || selected;
  if (selected && parsed.count > 1) {
    const multiple = { label: `${parsed.count} × ${selected.label}`, grams: selected.grams * parsed.count };
    options.unshift(multiple);
    selected = multiple;
  }
  const hundred = { label: "100 g", grams: 100 };
  options.push(hundred);
  if (parsed.grams && parsed.grams !== 100) {
    const custom = { label: `${roundAmount(parsed.grams)} g`, grams: parsed.grams };
    options.push(custom);
    selected = custom;
  } else if (parsed.grams === 100 || !selected) {
    selected = hundred;
  }
  return { options, selected };
}

function nutrientRow(item, per100, grams, focus) {
  if (!Number.isFinite(per100[item.key])) return "";
  const amount = (per100[item.key] * grams) / 100;
  const classes = ["nutr-row", item.sub ? "nutr-row-sub" : "", focus === item.key ? "nutr-row-focus" : ""].filter(Boolean).join(" ");
  const dv = item.dv
    ? `<td class="nutr-dv" data-nutr-dv="${item.key}" data-nutr-base="${item.dv}">${dvText(amount, item.dv)}</td>`
    : '<td class="nutr-dv"></td>';
  return `<tr class="${classes}"><th scope="row"><span class="nutr-name">{{ t:plugin-nutrition.${item.key} }}</span> <span class="nutr-amount" data-nutr-value="${item.key}" data-nutr-unit="${item.unit}">${amountText(amount, item.unit)}</span></th>${dv}</tr>`;
}

function microItem(item, per100, grams, focus) {
  if (!Number.isFinite(per100[item.key])) return "";
  const amount = (per100[item.key] * grams) / 100;
  return `<li class="nutr-micro${focus === item.key ? " nutr-row-focus" : ""}">
      <span class="nutr-micro-name">{{ t:plugin-nutrition.${item.key} }}</span>
      <span class="nutr-micro-amount" data-nutr-value="${item.key}" data-nutr-unit="${item.unit}">${amountText(amount, item.unit)}</span>
      <span class="nutr-micro-dv" data-nutr-dv="${item.key}" data-nutr-base="${item.dv}">${dvText(amount, item.dv)}</span>
    </li>`;
}

export function renderNutritionCard(food, parsed) {
  const { options, selected } = servingOptions(food, parsed);
  const grams = selected.grams;
  const per100 = food.nutrients;
  const id = `nutr-serving-${food.fdcId}`;
  const optionHtml = options
    .map((option) => `<option value="${option.grams}"${option === selected ? " selected" : ""}>${escapeHtml(option.label)}</option>`)
    .join("");
  const micros = MICROS.map((item) => microItem(item, per100, grams, parsed.focus)).join("");
  const sourceUrl = `https://fdc.nal.usda.gov/food-details/${encodeURIComponent(food.fdcId)}/nutrients`;
  const content = `<div class="nutr-head">
      <div class="nutr-heading">
        <div class="nutr-kicker">{{ t:plugin-nutrition.kicker }}</div>
        <h2 class="nutr-title">${escapeHtml(food.description)}</h2>
      </div>
      <div class="nutr-serving">
        <label class="nutr-serving-label" for="${id}">{{ t:plugin-nutrition.amountPer }}</label>
        <select class="nutr-serving-select" id="${id}" data-nutr-serving>${optionHtml}</select>
      </div>
    </div>
    <div class="nutr-body">
      <div class="nutr-main">
        <div class="nutr-calories${parsed.focus === "calories" ? " nutr-row-focus" : ""}">
          <span class="nutr-calories-label">{{ t:plugin-nutrition.calories }}</span>
          <span class="nutr-calories-value" data-nutr-value="calories" data-nutr-unit="">${Math.round((per100.calories * grams) / 100)}</span>
        </div>
        <table class="nutr-table">
          <thead><tr><th scope="col"><span class="nutr-visually-hidden">{{ t:plugin-nutrition.nutrient }}</span></th><th scope="col" class="nutr-dv">{{ t:plugin-nutrition.dailyValue }}</th></tr></thead>
          <tbody>${MACROS.map((item) => nutrientRow(item, per100, grams, parsed.focus)).join("")}</tbody>
        </table>
      </div>
      ${micros ? `<section class="nutr-side"><h3 class="nutr-side-title">{{ t:plugin-nutrition.vitaminsMinerals }}</h3><ul class="nutr-micros">${micros}</ul></section>` : ""}
    </div>
    <div class="nutr-foot">
      <span>{{ t:plugin-nutrition.dvNote }}</span>
      <span>{{ t:plugin-nutrition.source }} <a href="${sourceUrl}" target="_blank" rel="noopener">USDA FoodData Central</a> · ${escapeHtml(food.dataType)}</span>
    </div>`;
  const per100Json = escapeHtml(JSON.stringify(per100));
  const source = template || '<div class="nutr-card" data-nutr-card data-nutr-per100="{{per100}}">{{content}}</div>';
  return source.replace(/\{\{per100\}\}/g, per100Json).replace(/\{\{content\}\}/g, content);
}

export const slot = {
  id: "nutrition",
  name: "Nutrition",
  description: "Google-style nutrition facts for foods from USDA FoodData Central.",
  isClientExposed: false,
  position: "full-width-above-results",
  slotPositions: ["full-width-above-results", "knowledge-panel"],
  settingsSchema: [
    {
      key: "apiKey",
      label: "USDA API key",
      type: "password",
      secret: true,
      description:
        "Optional free api.data.gov key from [FoodData Central](https://fdc.nal.usda.gov/api-key-signup). Without one, Nutrition uses the shared DEMO_KEY, limited to about 30 requests per hour and 50 per day for this server's IP. Each food is cached for a week.",
    },
  ],

  init(ctx) {
    template = ctx?.template || "";
    if (typeof ctx?.fetch === "function") runtimeFetch = ctx.fetch.bind(ctx);
    nutritionCache = createExtensionCache(ctx, "nutrition", FOOD_TTL_MS);
  },

  // Saving the settings, with a new key or the same one, lifts a rate-limit pause.
  configure(settings) {
    apiKey = String(settings?.apiKey || "").trim();
    rateLimitedUntil = 0;
  },

  trigger(query) {
    return Boolean(parseNutritionQuery(query));
  },

  async execute(query, context) {
    const parsed = parseNutritionQuery(query);
    if (!parsed) return { title: "", html: "" };
    const fetcher = typeof context?.fetch === "function" ? context.fetch.bind(context) : runtimeFetch;
    try {
      const food = await lookupFood(parsed, fetcher);
      return food ? { title: "", html: renderNutritionCard(food, parsed) } : { title: "", html: "" };
    } catch {
      return { title: "", html: "" };
    }
  },
};

export const slotPlugin = slot;
export default slot;
