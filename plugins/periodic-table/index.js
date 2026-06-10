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

const ELEMENT_SYMBOLS = new Set(
  "H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og"
    .split(" ")
    .map((sym) => sym.toLowerCase())
);

function resolveElementToken(token) {
  const t = String(token || "").trim().toLowerCase();
  if (!t) return null;
  if (ELEMENT_NAMES.has(t)) return t;
  if (ELEMENT_SYMBOLS.has(t)) return t;
  if (/^\d{1,3}$/.test(t)) {
    const num = Number(t);
    if (num >= 1 && num <= 118) return t;
  }
  return null;
}

function isPeriodicTableQuery(query) {
  const q = String(query || "").trim();
  if (!q) return false;
  if (/^(?:!periodic(?:\s+table)?|!elements|!chemistry|!ptable|ptable)$/i.test(q)) {
    return true;
  }
  return /\b(?:periodic\s+table(?:\s+of\s+elements)?|elements\s+table)\b/i.test(q);
}

function parseElementQuery(query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return null;

  const whole = resolveElementToken(q);
  if (whole) return whole;

  const ptableElement = q.match(/^(?:!)?ptable\s+(.+)$/i);
  if (ptableElement) {
    return resolveElementToken(ptableElement[1].trim());
  }

  const elementMatch = q.match(/^(?:element\s+([a-z0-9]+)|([a-z0-9]+)\s+element)$/i);
  if (elementMatch) {
    return resolveElementToken(elementMatch[1] || elementMatch[2]);
  }

  const atomicNumMatch = q.match(/^atomic\s+number\s+(\d{1,3})$/i);
  if (atomicNumMatch) {
    return resolveElementToken(atomicNumMatch[1]);
  }

  const statsMatch = q.match(/^atomic\s+(?:mass|weight)\s+([a-z0-9]+)$/i);
  if (statsMatch) {
    return resolveElementToken(statsMatch[1]);
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
    if (isPeriodicTableQuery(query)) return true;
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
