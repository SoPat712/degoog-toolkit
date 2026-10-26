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

export function bookSubjects(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.filter((subject) => {
    if (typeof subject !== "string" || !subject.trim() || subject.length > 45) return false;
    const key = normalize(subject);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6);
}
