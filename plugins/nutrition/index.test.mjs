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
import { foodWords } from "./nutrition-query.js";

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
