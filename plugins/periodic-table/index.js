let template = "";
let enabled = true;

const ELEMENT_NAMES = new Set([
  "hydrogen", "helium", "lithium", "beryllium", "boron", "carbon", "nitrogen", "oxygen", "fluorine", "neon",
  "sodium", "magnesium", "aluminium", "aluminum", "silicon", "phosphorus", "sulfur", "chlorine", "argon",
  "potassium", "calcium", "scandium", "titanium", "vanadium", "chromium", "manganese", "iron", "cobalt",
  "nickel", "copper", "zinc", "gallium", "germanium", "arsenic", "selenium", "bromine", "krypton",
  "rubidium", "strontium", "yttrium", "zirconium", "niobium", "molybdenum", "technetium", "ruthenium",
  "rhodium", "palladium", "silver", "cadmium", "indium", "tin", "antimony", "tellurium", "iodine", "xenon",
  "cesium", "barium", "lanthanum", "cerium", "praseodymium", "neodymium", "promethium", "samarium",
  "europium", "gadolinium", "terbium", "dysprosium", "holmium", "erbium", "thulium", "ytterbium", "lutetium",
  "hafnium", "tantalum", "tungsten", "rhenium", "osmium", "iridium", "platinum", "gold", "mercury",
  "thallium", "lead", "bismuth", "polonium", "astatine", "radon", "francium", "radium", "actinium",
  "thorium", "protactinium", "uranium", "neptunium", "plutonium", "americium", "curium", "berkelium",
  "californium", "einsteinium", "fermium", "mendelevium", "nobelium", "lawrencium", "rutherfordium",
  "dubnium", "seaborgium", "bohrium", "hassium", "meitnerium", "darmstadtium", "roentgenium", "copernicium",
  "nihonium", "flerovium", "moscovium", "livermorium", "tennessine", "oganesson"
]);

function parseElementQuery(query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return null;

  // 1. Exact element names
  if (ELEMENT_NAMES.has(q)) {
    return q;
  }

  // 2. Prefix / Suffix queries: "element gold", "fe element", etc.
  const elementMatch = q.match(/^(?:element\s+([a-z0-9]+)|([a-z0-9]+)\s+element)$/i);
  if (elementMatch) {
    return elementMatch[1] || elementMatch[2];
  }

  // 3. Queries like: "atomic number 79", "atomic mass oxygen", etc.
  const statsMatch = q.match(/^(?:atomic\s+(?:number|mass|weight)\s+([a-z0-9]+))$/i);
  if (statsMatch) {
    return statsMatch[1];
  }

  return null;
}

const settingsSchema = [
  {
    key: "enabled",
    label: "Enabled",
    type: "toggle",
    default: true,
    description: "Show the interactive Periodic Table of Elements for matching queries.",
  },
];

export const slot = {
  id: "periodic-table",
  name: "Periodic Table",
  description: "Interactive periodic table of elements with search, group highlighting, temperature state simulation, and rich element details.",
  isClientExposed: false,
  position: "above-results",
  slotPositions: ["above-results", "knowledge-panel"],
  settingsSchema,

  async init(ctx) {
    template = ctx?.template || "";
    if (!template && typeof ctx?.readFile === "function") {
      template = await ctx.readFile("template.html");
    }
  },

  configure(settings) {
    enabled = settings?.enabled !== false && settings?.enabled !== "false";
  },

  trigger(query) {
    if (!enabled) return false;
    
    // Main periodic table triggers
    if (/^(?:!periodic|!elements|!chemistry|!ptable|\b(?:periodic\s+table(?:\s+of\s+elements)?|elements\s+table)\b)/i.test(query)) {
      return true;
    }

    // Direct element queries
    return Boolean(parseElementQuery(query));
  },

  async execute(query, context) {
    if (context?.tab && context.tab !== "all") return { title: "", html: "" };
    
    const parsedElement = parseElementQuery(query) || "";
    const html = (template || "").replaceAll("{{default_element}}", parsedElement);
    
    return {
      title: "",
      html,
    };
  },
};

export const slotPlugin = slot;
export default slot;
