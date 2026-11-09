import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import {
  chooseFood,
  describeMatch,
  extractNutrients,
  parseNutritionQuery,
  slot,
} from "./index.js";
import { foodWords, nutrientKey } from "./nutrition-query.js";

// Search results shaped like FoodData Central's /foods/search payload (values per 100 g).
const NUMBERS = { kcal: "208", protein: "203", fat: "204", carbs: "205", fiber: "291", sugar: "269", sat: "606",
  chol: "601", sodium: "307", vitC: "401", potassium: "306", calcium: "301", iron: "303" };
function food(fdcId, description, dataType, values, foodMeasures) {
  return {
    fdcId, description, dataType, foodMeasures,
    foodNutrients: Object.entries(values).map(([name, value]) => ({
      nutrientNumber: NUMBERS[name], value, unitName: name === "kcal" ? "KCAL" : /sodium|chol|vitC|potassium|calcium|iron/.test(name) ? "MG" : "G",
    })),
  };
}
const BANANA = food(2709224, "Banana, raw", "Survey (FNDDS)", {
  kcal: 97, protein: 0.74, fat: 0.28, carbs: 22.71, fiber: 1.7, sugar: 15.8, sat: 0.112, chol: 0, sodium: 0,
  vitC: 12, potassium: 326, calcium: 5, iron: 0,
}, [
  { disseminationText: "Quantity not specified", gramWeight: 126, rank: 6 },
  { disseminationText: "1 cup", gramWeight: 150, rank: 3 },
  { disseminationText: "1 banana", gramWeight: 126, rank: 1 },
  { disseminationText: "1 slice", gramWeight: 6, rank: 2 },
]);
const BANANA_SEARCH = { foods: [
  food(173945, "Bananas, dehydrated, or banana powder", "SR Legacy", { kcal: 346, protein: 3.89 }),
  food(2709200, "Banana chips", "Survey (FNDDS)", { kcal: 519 }),
  food(9999, "BANANA", "Branded", { kcal: 89 }),
  food(1105314, "Bananas, ripe and slightly ripe, raw", "Foundation", { protein: 0.74 }),
  BANANA,
] };

function memoryCache() {
  const store = new Map();
  return { get: async (key) => store.get(key) ?? null, set: async (key, value) => { store.set(key, value); } };
}

function setup({ key = "", fetch } = {}) {
  slot.init({ template: '<div class="nutr-card" data-nutr-card data-nutr-per100="{{per100}}">{{content}}</div>', useCache: memoryCache, fetch });
  slot.configure({ apiKey: key });
}

test("only nutrition phrases with a food trigger", () => {
  for (const [query, food, focus] of [
    ["calories in a banana", "banana", "calories"], ["banana calories", "banana", "calories"],
    ["banana nutrition", "banana", "calories"], ["protein in eggs", "eggs", "protein"],
    ["nutrition facts avocado", "avocado", "calories"], ["how many calories are in a banana", "banana", "calories"],
    ["how much protein does an egg have", "egg", "protein"], ["nutritional value of quinoa", "quinoa", "calories"],
    ["vitamin c in oranges", "oranges", "vitaminC"], ["chicken breast nutrition facts", "chicken breast", "calories"],
  ]) {
    const parsed = parseNutritionQuery(query);
    assert.equal(parsed?.food, food, query);
    assert.equal(parsed.focus, focus, query);
    assert.equal(slot.trigger(query), true, query);
  }
  for (const query of [
    "banana", "nutrition", "calories", "nutrition facts", "sports nutrition", "plant nutrition", "nutrition jobs",
    "nutrition degree", "calories burned walking", "how many calories should i eat", "calorie calculator",
    "how many calories in a pound", "calories in a pound of fat", "calories per day", "100 calories", "low calories",
    "protein powder", "whey protein", "nutrition facts label", "how to count calories", "calories in beer vs wine",
    "banana bread recipe", "weather in rome", "track 1Z5R89390357567127",
  ]) assert.equal(slot.trigger(query), false, query);
});

test("quantities, measures and grams select the serving", () => {
  assert.deepEqual(
    (({ count, grams, hint }) => ({ count, grams, hint }))(parseNutritionQuery("calories in a slice of pizza")),
    { count: 1, grams: null, hint: "slice" },
  );
  assert.equal(parseNutritionQuery("calories in 2 eggs").count, 2);
  assert.equal(parseNutritionQuery("calories in 150g of rice").grams, 150);
});

test("descriptions match only the requested food plus descriptors", () => {
  const words = (query) => foodWords(query);
  assert.ok(describeMatch("Egg, whole, raw", words("egg")));
  assert.ok(describeMatch("Yogurt, Greek, plain, nonfat", words("greek yogurt")));
  assert.ok(describeMatch("Pie, apple", words("apple pie")));
  assert.ok(describeMatch("Egg, whole, boiled or poached", words("boiled eggs")));
  for (const [description, query] of [
    ["Duck egg, cooked", "egg"], ["Egg roll, meatless", "egg"], ["Egg omelet or scrambled egg, made with oil", "egg"],
    ["Sports drink", "sports"], ["Cake, pound", "pound"], ["Egg, whole, raw", "boiled egg"], ["Bread, egg", "egg"],
  ]) assert.equal(describeMatch(description, words(query)), null, `${description} / ${query}`);
});

test("chooses the plain generic food and never a Branded one", () => {
  const chosen = chooseFood(BANANA_SEARCH.foods, foodWords("banana"));
  assert.equal(chosen.description, "Banana, raw");
  assert.equal(chosen.dataType, "Survey (FNDDS)");
  assert.deepEqual(chosen.portions.map(({ label }) => label), ["1 banana", "1 slice", "1 cup"]);
  assert.equal(chooseFood([BANANA_SEARCH.foods[2]], foodWords("banana")), null);
  // Foundation foods may only report Atwater energy.
  assert.equal(extractNutrients([{ nutrientNumber: "958", value: 85, unitName: "KCAL" }]).calories, 85);
});

test("renders calories, macros with daily values, micros and the source", async () => {
  const requests = [];
  setup({ fetch: async (url, init) => {
    requests.push({ url: new URL(url), init });
    return Response.json(BANANA_SEARCH);
  } });
  const { title, html } = await slot.execute("calories in a banana", {});
  assert.equal(title, "");
  assert.equal(requests.length, 1);
  const { url, init } = requests[0];
  assert.equal(url.origin + url.pathname, "https://api.nal.usda.gov/fdc/v1/foods/search");
  assert.equal(url.searchParams.get("api_key"), "DEMO_KEY");
  const body = JSON.parse(init.body);
  assert.equal(body.query, "banana");
  assert.deepEqual(body.dataType, ["Foundation", "SR Legacy", "Survey (FNDDS)"]);

  assert.match(html, /nutr-title">Banana, raw</);
  assert.match(html, /<option value="126" selected>1 banana \(126 g\)<\/option>/);
  assert.match(html, /<option value="100">100 g<\/option>/);
  assert.match(html, /data-nutr-value="calories" data-nutr-unit="">122</);
  assert.match(html, /data-nutr-value="carbs" data-nutr-unit="g">28.6 g</);
  assert.match(html, /data-nutr-dv="carbs" data-nutr-base="275">10%</);
  assert.match(html, /data-nutr-value="potassium" data-nutr-unit="mg">411 mg</);
  assert.match(html, /\{\{ t:plugin-nutrition\.sugar \}\}/);
  assert.match(html, /fdc\.nal\.usda\.gov\/food-details\/2709224\/nutrients/);
  assert.match(html, /data-nutr-per100="\{&quot;calories&quot;:97/);
});

test("a configured key replaces DEMO_KEY and focus highlights the asked nutrient", async () => {
  let key = "";
  setup({ key: "my-key", fetch: async (url) => { key = new URL(url).searchParams.get("api_key"); return Response.json(BANANA_SEARCH); } });
  const { html } = await slot.execute("potassium in bananas", {});
  assert.equal(key, "my-key");
  assert.match(html, /class="nutr-micro nutr-row-focus"/);
  assert.match(html, /<option value="126" selected>1 banana \(126 g\)<\/option>/);

  const twice = (await slot.execute("calories in 2 bananas", {})).html;
  assert.match(twice, /<option value="252" selected>2 × 1 banana \(126 g\)<\/option>/);
  const grams = (await slot.execute("calories in 30g of banana", {})).html;
  assert.match(grams, /<option value="30" selected>30 g<\/option>/);
  assert.match(grams, /data-nutr-value="calories" data-nutr-unit="">29</);
});

test("caches found and missing foods so DEMO_KEY is spent once", async () => {
  let calls = 0;
  setup({ fetch: async () => { calls++; return Response.json(BANANA_SEARCH); } });
  assert.ok((await slot.execute("banana calories", {})).html);
  assert.ok((await slot.execute("calories in bananas", {})).html);
  assert.equal(calls, 1);
  assert.equal((await slot.execute("kale nutrition", {})).html, "");
  assert.equal((await slot.execute("kale calories", {})).html, "");
  assert.equal(calls, 2);
});

test("missing portions come from the food detail endpoint", async () => {
  const sr = food(173944, "Bananas, raw", "SR Legacy", { kcal: 89, protein: 1.09 });
  const paths = [];
  setup({ fetch: async (url) => {
    const { pathname } = new URL(url);
    paths.push(pathname);
    return pathname.endsWith("/foods/search")
      ? Response.json({ foods: [sr] })
      : Response.json({ foodPortions: [{ amount: 1, modifier: "medium (7\" to 7-7/8\" long)", gramWeight: 118, sequenceNumber: 4, measureUnit: { name: "undetermined" } }] });
  } });
  const { html } = await slot.execute("banana calories", {});
  assert.deepEqual(paths, ["/fdc/v1/foods/search", "/fdc/v1/food/173944"]);
  assert.match(html, /<option value="118" selected>1 medium \(7&quot; to 7-7\/8&quot; long\) \(118 g\)<\/option>/);
  assert.match(html, /data-nutr-value="calories" data-nutr-unit="">105</);
});

test("failures, rate limits and non-food queries render nothing", async () => {
  setup({ fetch: async () => { throw new Error("offline"); } });
  assert.deepEqual(await slot.execute("calories in a banana", {}), { title: "", html: "" });

  let calls = 0;
  setup({ fetch: async () => { calls++; return new Response("{}", { status: 429 }); } });
  assert.equal((await slot.execute("calories in an apple", {})).html, "");
  assert.equal((await slot.execute("calories in a pear", {})).html, "");
  assert.equal(calls, 1, "a 429 pauses further requests");

  setup({ fetch: () => { throw new Error("must not fetch"); } });
  assert.equal((await slot.execute("sports nutrition", {})).html, "");
  setup({ fetch: async () => Response.json({ foods: [food(1, "Banana, <img src=x>", "Survey (FNDDS)", { kcal: 90 })] }) });
  const escaped = (await slot.execute("banana calories", {})).html;
  assert.match(escaped, /Banana, &lt;img src=x&gt;/);
  assert.doesNotMatch(escaped, /<img/);
});

test("any nutrient the card can show is read from the query, with common aliases", () => {
  for (const [query, focus, food] of [
    ["magnesium in eggs", "magnesium", "eggs"], ["vit c in oranges", "vitaminC", "oranges"],
    ["vit. c in oranges", "vitaminC", "oranges"], ["vitamin-c in kiwi", "vitaminC", "kiwi"],
    ["vitamin b-12 in eggs", "vitaminB12", "eggs"], ["vitamin b 12 in salmon", "vitaminB12", "salmon"],
    ["b12 in eggs", "vitaminB12", "eggs"], ["vitamin b6 in bananas", "vitaminB6", "bananas"],
    ["potassium content of bananas", "potassium", "bananas"], ["potassium content in bananas", "potassium", "bananas"],
    ["bananas potassium content", "potassium", "bananas"], ["amount of iron in spinach", "iron", "spinach"],
    ["how much vitamin c is in an orange", "vitaminC", "orange"], ["how much zinc does beef have", "zinc", "beef"],
    ["vitamin a in carrots", "vitaminA", "carrots"], ["vitamin d in salmon", "vitaminD", "salmon"],
    ["vitamin e in almonds", "vitaminE", "almonds"], ["vitamin k in spinach", "vitaminK", "spinach"],
    ["folate in lentils", "folate", "lentils"], ["folic acid in lentils", "folate", "lentils"],
    ["thiamine in pork", "thiamin", "pork"], ["vitamin b1 in pork", "thiamin", "pork"],
    ["riboflavin in milk", "riboflavin", "milk"], ["niacin in chicken", "niacin", "chicken"],
    ["choline in eggs", "choline", "eggs"], ["calcium in milk", "calcium", "milk"],
    ["phosphorus in milk", "phosphorus", "milk"], ["selenium in brazil nuts", "selenium", "brazil nuts"],
    ["copper in cashews", "copper", "cashews"], ["manganese in oats", "manganese", "oats"],
    ["cholesterol in shrimp", "cholesterol", "shrimp"], ["salt in bread", "sodium", "bread"],
    ["sat fat in butter", "saturatedFat", "butter"], ["trans fat in margarine", "transFat", "margarine"],
    ["monounsaturated fat in olive oil", "monoFat", "olive oil"], ["total fat in avocado", "fat", "avocado"],
    ["dietary fiber in oats", "fiber", "oats"], ["added sugars in yogurt", "addedSugar", "yogurt"],
    ["carbohydrates in rice", "carbs", "rice"],
  ]) {
    const parsed = parseNutritionQuery(query);
    assert.equal(parsed?.focus, focus, query);
    assert.equal(parsed.food, food, query);
  }
  assert.equal(nutrientKey("Vit B-12"), "vitaminB12");
  assert.equal(nutrientKey("pantothenic acid"), "pantothenicAcid");
  assert.equal(nutrientKey("vitamins"), "");
  // A nutrient alone, a body or diet topic, or a non-food use stays off.
  for (const query of [
    "magnesium", "vitamin c", "b12", "potassium content", "sodium content", "iron levels", "zinc oxide", "iron man",
    "vitamin d deficiency", "how much vitamin d do i need", "foods high in potassium", "low sodium content",
    "high protein content", "vitamin c in oranges vs lemons", "calcium in milk or cheese", "daily iron intake",
  ]) assert.equal(slot.trigger(query), false, query);
});

// "Egg, whole, raw" (FNDDS 2707152) as USDA's search returns it, trimmed to the card's nutrients.
const EGG = {
  fdcId: 2707152, description: "Egg, whole, raw", dataType: "Survey (FNDDS)",
  foodNutrients: [
    ["203", 12.4, "G"], ["204", 9.96, "G"], ["205", 0.96, "G"], ["208", 143, "KCAL"], ["255", 75.8, "G"], ["269", 0.2, "G"],
    ["291", 0, "G"], ["301", 48, "MG"], ["303", 1.67, "MG"], ["304", 11, "MG"], ["305", 184, "MG"], ["306", 132, "MG"],
    ["307", 129, "MG"], ["309", 1.24, "MG"], ["312", 0, "MG"], ["317", 31.1, "UG"], ["320", 180, "UG"], ["323", 1.05, "MG"],
    ["328", 2.5, "UG"], ["401", 0, "MG"], ["404", 0.077, "MG"], ["405", 0.419, "MG"], ["406", 0, "MG"], ["415", 0.063, "MG"],
    ["417", 71, "UG"], ["418", 1.02, "UG"], ["421", 335, "MG"], ["430", 0.3, "UG"], ["435", 71, "UG"], ["601", 411, "MG"],
    ["606", 3.2, "G"], ["645", 3.63, "G"], ["646", 1.82, "G"],
  ].map(([nutrientNumber, value, unitName]) => ({ nutrientNumber, value, unitName })),
  foodMeasures: [
    { disseminationText: "1 egg", gramWeight: 50, rank: 1 },
    { disseminationText: "Quantity not specified", gramWeight: 50, rank: 3 },
    { disseminationText: "1 cup", gramWeight: 245, rank: 2 },
  ],
};
const focusedKeys = (html) => [...html.matchAll(/class="[^"]*\bnutr-row-focus\b[^"]*"[\s\S]*?data-nutr-value="(\w+)"/g)].map((match) => match[1]);
const shownKeys = (html) => [...html.matchAll(/data-nutr-value="(\w+)"/g)].map((match) => match[1]);

test("the asked nutrient is highlighted, and an unshown one gets its row when USDA has it", async () => {
  let calls = 0;
  setup({ fetch: async () => { calls++; return Response.json({ foods: [EGG] }); } });
  const render = async (query) => (await slot.execute(query, {})).html;

  const magnesium = await render("magnesium in eggs");
  assert.deepEqual(focusedKeys(magnesium), ["magnesium"]);
  assert.match(magnesium, /data-nutr-value="magnesium" data-nutr-unit="mg">5\.5 mg</);
  assert.deepEqual(focusedKeys(await render("protein in eggs")), ["protein"]);
  assert.deepEqual(focusedKeys(await render("vit b-12 in eggs")), ["vitaminB12"]);
  assert.deepEqual(focusedKeys(await render("calories in eggs")), ["calories"]);

  // Default card: no extra rows.
  const plain = await render("egg nutrition");
  for (const key of ["zinc", "folate", "choline", "selenium", "vitaminE", "polyFat"]) assert.ok(!shownKeys(plain).includes(key), key);
  assert.doesNotMatch(plain, /data-nutr-per100="[^"]*zinc/, "the card carries only the amounts it shows");

  const zinc = await render("zinc in eggs");
  assert.deepEqual(focusedKeys(zinc), ["zinc"]);
  assert.match(zinc, /<li class="nutr-micro nutr-row-focus">\s*<span class="nutr-micro-name">\{\{ t:plugin-nutrition\.zinc \}\}/);
  assert.match(zinc, /data-nutr-value="zinc" data-nutr-unit="mg">0\.62 mg</);
  assert.match(zinc, /data-nutr-dv="zinc" data-nutr-base="11">6%</);
  assert.equal(shownKeys(zinc).filter((key) => key === "zinc").length, 1);
  assert.match(zinc, /data-nutr-per100="[^"]*&quot;zinc&quot;:1\.24/);

  // Folate reads dietary folate equivalents, selenium stays in micrograms.
  assert.match(await render("folate in eggs"), /data-nutr-value="folate" data-nutr-unit="µg">35\.5 µg</);
  assert.match(await render("selenium in eggs"), /data-nutr-value="selenium" data-nutr-unit="µg">15\.6 µg</);
  const poly = await render("polyunsaturated fat in eggs");
  assert.match(poly, /<tr class="nutr-row nutr-row-sub nutr-row-focus"><th scope="row"><span class="nutr-name">\{\{ t:plugin-nutrition\.polyFat \}\}/);
  assert.ok(shownKeys(poly).indexOf("polyFat") > shownKeys(poly).indexOf("saturatedFat"), "listed under fat");

  // USDA has no manganese or trans fat for this food: the card shows, unhighlighted.
  for (const query of ["manganese in eggs", "trans fat in eggs"]) {
    const html = await render(query);
    assert.match(html, /nutr-title">Egg, whole, raw</, query);
    assert.deepEqual(focusedKeys(html), [], query);
    assert.doesNotMatch(html, /nutr-row-focus/, query);
  }
  assert.equal(calls, 1, "every nutrient question about one food shares one USDA request");
});

test("amounts are read in the card's unit; non-mass units are skipped", () => {
  const values = extractNutrients([
    { nutrientNumber: "309", value: 0.0012, unitName: "G" },
    { nutrientNumber: "317", value: 0.0311, unitName: "MG" },
    { nutrientNumber: "418", value: 1.02, unitName: "µg" },
    { nutrientNumber: "328", value: 100, unitName: "IU" },
    { nutrientNumber: "203", value: 12.4 },
  ]);
  assert.ok(Math.abs(values.zinc - 1.2) < 1e-9);
  assert.ok(Math.abs(values.selenium - 31.1) < 1e-9);
  assert.equal(values.vitaminB12, 1.02);
  assert.equal(values.vitaminD, undefined);
  assert.equal(values.protein, 12.4);
});

test("a focused vitamin or mineral tile outranks the plain tile surface", async () => {
  const css = await readFile(new URL("./style.css", import.meta.url), "utf8");
  const rule = css.match(/^\.nutr-micro\.nutr-row-focus\s*\{([^}]*)\}/m)?.[1] || "";
  assert.match(rule, /background:\s*color-mix\(in srgb, var\(--primary\)/);
  assert.match(rule, /border-color:\s*color-mix\(in srgb, var\(--primary\)/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|\brgba?\(/i);
});

test("the client script rescales every value when the serving changes", async () => {
  const source = await readFile(new URL("./script.js", import.meta.url), "utf8");
  const node = (attrs) => ({ textContent: "", getAttribute: (name) => attrs[name] ?? null });
  const values = [node({ "data-nutr-value": "calories", "data-nutr-unit": "" }), node({ "data-nutr-value": "fat", "data-nutr-unit": "g" })];
  const dvs = [node({ "data-nutr-dv": "fat", "data-nutr-base": "78" })];
  const card = {
    getAttribute: () => JSON.stringify({ calories: 97, fat: 0.28 }),
    querySelectorAll: (selector) => (selector === "[data-nutr-value]" ? values : dvs),
  };
  let listener = null;
  vm.runInNewContext(source, { document: { addEventListener: (type, fn) => { if (type === "change") listener = fn; } }, isFinite });
  listener({ target: { value: "250", matches: (selector) => selector === "[data-nutr-serving]", closest: () => card } });
  assert.equal(values[0].textContent, "243");
  assert.equal(values[1].textContent, "0.7 g");
  assert.equal(dvs[0].textContent, "1%");
});
