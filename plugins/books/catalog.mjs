const normalize = (value) => String(value || "").normalize("NFKD")
  .replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function selectAuthorBooks(docs, term) {
  if (!Array.isArray(docs)) return [];
  const tokens = normalize(term).split(" ").filter(Boolean);
  const seen = new Set();
  let author = "";
  return docs.filter((doc) => {
    if (!doc || typeof doc.title !== "string" || !doc.title.trim()) return false;
    const names = Array.isArray(doc.author_name) ? doc.author_name : [];
    const match = names.find((name) => {
      const words = normalize(name).split(" ");
      return tokens.every((token) => words.includes(token));
    });
    if (!match || doc._compilation === true || /\b(?:summar(?:y|ies)|study guide|workbook|sparknotes|cliffsnotes|resumo|resumen)\b|\s\/\s/i.test(`${doc.title} ${doc.subtitle || ""}`)) return false;
    const identity = normalize(match);
    if (author && identity !== author) return false;
    const title = normalize(doc.title);
    if (seen.has(title)) return false;
    author = identity;
    seen.add(title);
    return true;
  }).slice(0, 12);
}

export function plainDescription(value) {
  const text = typeof value === "string" ? value : typeof value?.value === "string" ? value.value : "";
  return text.split(/\n\s*-{3,}/)[0]
    .replace(/<[^>]*>/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ").trim().slice(0, 1600);
}

// Open Library subjects repeat one heading with qualifiers ("Children's stories",
// "Children's stories, English") and mix in machine tags ("nyt:...", "award:...").
const SUBJECT_TAG_RX = /^[a-z]+:\S/i;

export function bookSubjects(value) {
  if (!Array.isArray(value)) return [];
  const picked = new Map();
  for (const subject of value) {
    if (typeof subject !== "string") continue;
    const text = subject.trim();
    if (!text || text.length > 45 || SUBJECT_TAG_RX.test(text)) continue;
    const key = normalize(text.split(",")[0]);
    if (!key) continue;
    if (!picked.has(key)) {
      if (picked.size < 6) picked.set(key, text);
    } else if (normalize(text) === key && normalize(picked.get(key)) !== key) {
      // Prefer the plain heading over a qualified variant seen first.
      picked.set(key, text);
    }
  }
  return [...picked.values()];
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const monthIndex = (name) => MONTHS.indexOf(String(name).slice(0, 3).toLowerCase());

// Open Library publish dates arrive as "Dec 25, 2017", "2018-09", "June 1975"
// or "1989"; keep whatever precision the record has.
function parseEditionDate(value) {
  const text = String(value || "").trim();
  let match = text.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
  if (match) return { year: +match[1], month: +match[2] - 1, day: match[3] ? +match[3] : 0 };
  match = text.match(/^([a-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})$/i);
  if (match && monthIndex(match[1]) >= 0) return { year: +match[3], month: monthIndex(match[1]), day: +match[2] };
  match = text.match(/^(\d{1,2})\s+([a-z]{3,})\.?,?\s+(\d{4})$/i);
  if (match && monthIndex(match[2]) >= 0) return { year: +match[3], month: monthIndex(match[2]), day: +match[1] };
  match = text.match(/^([a-z]{3,})\.?,?\s+(\d{4})$/i);
  if (match && monthIndex(match[1]) >= 0) return { year: +match[2], month: monthIndex(match[1]), day: 0 };
  match = text.match(/(?:^|\D)(1[4-9]\d{2}|20\d{2})(?!\d)/);
  return match ? { year: +match[1], month: -1, day: 0 } : null;
}

function dateFormatter(locale, options) {
  try {
    return new Intl.DateTimeFormat(locale || "en", { timeZone: "UTC", ...options });
  } catch {
    return new Intl.DateTimeFormat("en", { timeZone: "UTC", ...options });
  }
}

export function editionDates(values, locale, limit = 4) {
  if (!Array.isArray(values)) return [];
  const full = dateFormatter(locale, { year: "numeric", month: "short", day: "numeric" });
  const monthOnly = dateFormatter(locale, { year: "numeric", month: "short" });
  const seen = new Set();
  const dates = [];
  for (const value of values) {
    const parsed = parseEditionDate(value);
    if (!parsed || parsed.month > 11) continue;
    const label = parsed.month < 0 ? String(parsed.year)
      : (parsed.day >= 1 && parsed.day <= 31 ? full : monthOnly)
        .format(new Date(Date.UTC(parsed.year, parsed.month, parsed.day || 1)));
    if (seen.has(label)) continue;
    seen.add(label);
    dates.push(label);
    if (dates.length >= limit) break;
  }
  return dates;
}
