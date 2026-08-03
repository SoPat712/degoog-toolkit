let template = '<article class="papers-card" aria-label="Research paper information">{{CONTENT}}</article>';
let pluginFetch = (...args) => fetch(...args);
let paperCache = null;

const CROSSREF_WORKS = "https://api.crossref.org/works";
const USER_AGENT =
  "degoog-toolkit/1.0 (https://github.com/SoPat712/degoog-toolkit)";
const CACHE_TTL_MS = 24 * 60 * 60_000;
const FETCH_TIMEOUT_MS = 8_000;
const DOI_PATTERN = /10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i;

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function extractDoi(value) {
  const match = String(value || "").match(DOI_PATTERN);
  if (!match) return "";
  let doi = match[0].replace(/[.,;:!?]+$/, "");
  while (
    doi.endsWith(")") &&
    (doi.match(/\(/g)?.length || 0) < (doi.match(/\)/g)?.length || 0)
  ) {
    doi = doi.slice(0, -1);
  }
  return doi;
}

export function parsePaperQuery(query) {
  const raw = String(query || "").trim();
  if (!raw || raw.length > 300) return null;

  const doi = extractDoi(raw);
  if (doi) return { kind: "doi", term: doi };

  const prefixed = raw.match(
    /^(?:paper|research\s+paper|academic\s+paper|journal\s+article)\s*:?\s+(.+)$/i,
  );
  const study = raw.match(/^study\s*(?::|on\b|about\b)\s*(.+)$/i);
  const suffixed = raw.match(/^(.+?)\s+(?:research\s+paper|academic\s+paper)$/i);
  const suffixTerm = (suffixed?.[1] || "").trim();
  if (/^(?:a|an|the|this|that|(?:i|we)\s+(?:need|want)(?:\s+(?:a|an|the))?|(?:find|recommend|show|suggest)(?:\s+me)?(?:\s+(?:a|an|the))?)$/i.test(suffixTerm)) {
    return null;
  }
  const term = (prefixed?.[1] || study?.[1] || suffixTerm).trim();
  return term.length >= 3 ? { kind: "title", term } : null;
}

function createCache(ctx) {
  if (typeof ctx?.useCache === "function") {
    return ctx.useCache("ext:papers:crossref", CACHE_TTL_MS);
  }
  return typeof ctx?.createCache === "function"
    ? ctx.createCache(CACHE_TTL_MS)
    : null;
}

async function fetchWithTimeout(fetcher, url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetcher(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchCrossref(parsed, fetcher) {
  const url =
    parsed.kind === "doi"
      ? `${CROSSREF_WORKS}/${encodeURIComponent(parsed.term)}`
      : `${CROSSREF_WORKS}?${new URLSearchParams({
          "query.bibliographic": parsed.term,
          rows: "1",
        })}`;
  const response = await fetchWithTimeout(fetcher, url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
  });
  if (!response.ok) throw new Error(`Crossref returned ${response.status}`);
  const data = await response.json();
  return parsed.kind === "doi" ? data?.message : data?.message?.items?.[0];
}

function first(value) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function publicationDate(work) {
  const parts =
    work?.["published-print"]?.["date-parts"]?.[0] ||
    work?.published?.["date-parts"]?.[0] ||
    work?.issued?.["date-parts"]?.[0] ||
    work?.created?.["date-parts"]?.[0] ||
    [];
  if (!parts.length) return "";
  const [year, month, day] = parts;
  return [year, month && String(month).padStart(2, "0"), day && String(day).padStart(2, "0")]
    .filter(Boolean)
    .join("-");
}

function plainAbstract(value) {
  const entities = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&nbsp;": " ",
  };
  const text = String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (entity) => entities[entity] || " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 900 ? `${text.slice(0, 897).trim()}…` : text;
}

function relationDoi(item) {
  return extractDoi(item?.DOI || item?.doi || item?.id || "");
}

function renderStatuses(work) {
  const statuses = [];
  for (const update of work?.["updated-by"] || []) {
    const type = String(update?.type || "").toLowerCase();
    if (/retract/.test(type)) statuses.push(["Retracted", update]);
    else if (/expression/.test(type)) statuses.push(["Expression of concern", update]);
    else if (/correct|errat/.test(type)) statuses.push(["Corrected", update]);
  }
  for (const target of work?.["update-to"] || []) {
    const type = String(target?.type || "").toLowerCase();
    if (/retract/.test(type)) statuses.push(["Retraction notice", target]);
    else if (/expression/.test(type)) statuses.push(["Concern notice", target]);
    else if (/correct|errat/.test(type)) statuses.push(["Correction notice", target]);
  }
  if (!statuses.length) return "";

  return `<div class="papers-card__statuses" aria-label="Publication status">${statuses
    .map(([label, item]) => {
      const doi = relationDoi(item);
      const content = `<span>${escapeHtml(label)}</span>`;
      return doi
        ? `<a href="https://doi.org/${escapeHtml(doi)}" target="_blank" rel="noopener noreferrer">${content}</a>`
        : content;
    })
    .join("")}</div>`;
}

function renderPaper(work) {
  const title = String(first(work?.title)).trim();
  const doi = extractDoi(work?.DOI || "");
  if (!title || !doi) return "";

  const authors = Array.isArray(work.author)
    ? work.author
        .map((author) => [author?.given, author?.family].filter(Boolean).join(" "))
        .filter(Boolean)
        .slice(0, 8)
    : [];
  const moreAuthors = Math.max(0, (work.author?.length || 0) - authors.length);
  const journal = first(work["container-title"]) || work.publisher || "";
  const date = publicationDate(work);
  const abstract = plainAbstract(work.abstract);
  const type = String(work.type || "").replace(/-/g, " ");
  const citationCount = Number(work["is-referenced-by-count"]);
  const metadata = [date, journal, type].filter(Boolean);
  const statuses = renderStatuses(work);

  return `
    <header class="papers-card__header">
      <div>
        <p class="papers-card__eyebrow">Crossref</p>
        <h2>${escapeHtml(title)}</h2>
      </div>
      ${statuses}
    </header>
    ${authors.length ? `<p class="papers-card__authors">${authors.map(escapeHtml).join(", ")}${moreAuthors ? `, and ${moreAuthors} more` : ""}</p>` : ""}
    <div class="papers-card__meta">${metadata
      .map((item) => `<span>${escapeHtml(item)}</span>`)
      .join("")}${Number.isFinite(citationCount) ? `<span>Cited by ${citationCount}</span>` : ""}</div>
    ${abstract ? `<section class="papers-card__abstract"><h3>Abstract</h3><p>${escapeHtml(abstract)}</p></section>` : ""}
    <footer class="papers-card__footer">
      <nav class="papers-card__links" aria-label="Paper links">
        <a class="papers-card__primary" href="https://doi.org/${escapeHtml(doi)}" target="_blank" rel="noopener noreferrer">Open paper</a>
        <a href="https://search.crossref.org/?q=${encodeURIComponent(doi)}" target="_blank" rel="noopener noreferrer">Crossref record</a>
      </nav>
      <div class="papers-card__citations" aria-label="Copy citation">
        <span>Cite</span>
        <button type="button" data-paper-citation="apa" data-doi="${escapeHtml(doi)}">APA</button>
        <button type="button" data-paper-citation="bibtex" data-doi="${escapeHtml(doi)}">BibTeX</button>
        <button type="button" data-paper-citation="ris" data-doi="${escapeHtml(doi)}">RIS</button>
      </div>
    </footer>`;
}

export const slot = {
  id: "papers",
  name: "Papers / DOI",
  description: "Shows scholarly metadata, abstracts, citations, and publication status.",
  isClientExposed: false,
  position: "full-width-above-results",
  slotPositions: ["full-width-above-results", "knowledge-panel"],

  init(ctx) {
    if (ctx?.template) template = ctx.template;
    if (typeof ctx?.fetch === "function") {
      pluginFetch = (...args) => ctx.fetch(...args);
    }
    paperCache = createCache(ctx);
  },

  trigger(query) {
    return Boolean(parsePaperQuery(query));
  },

  async execute(query, context) {
    const parsed = parsePaperQuery(query);
    if (!parsed) return { html: "" };
    const cacheKey = `${parsed.kind}:${parsed.term.toLowerCase()}`;
    try {
      let work = paperCache ? await paperCache.get(cacheKey) : null;
      if (!work) {
        const fetcher =
          typeof context?.fetch === "function"
            ? (...args) => context.fetch(...args)
            : pluginFetch;
        work = await fetchCrossref(parsed, fetcher);
        if (work && paperCache) {
          await paperCache.set(cacheKey, work, CACHE_TTL_MS);
        }
      }
      const content = renderPaper(work);
      return { title: "", html: content ? template.replace("{{CONTENT}}", content) : "" };
    } catch {
      return { html: "" };
    }
  },
};

export const routes = [
  {
    method: "get",
    path: "citation",
    handler: async (request) => {
      const url = new URL(request.url);
      const doi = extractDoi(url.searchParams.get("doi"));
      const format = url.searchParams.get("format") || "";
      const accept = {
        apa: "text/x-bibliography; style=apa; locale=en-US",
        bibtex: "application/x-bibtex",
        ris: "application/x-research-info-systems",
      }[format];
      if (!doi || !accept) {
        return new Response("Invalid citation request", {
          status: 400,
          headers: { "Cache-Control": "no-store" },
        });
      }

      try {
        const response = await fetchWithTimeout(
          pluginFetch,
          `https://doi.org/${doi.split("/").map(encodeURIComponent).join("/")}`,
          { headers: { Accept: accept, "User-Agent": USER_AGENT } },
        );
        if (!response.ok) throw new Error(`DOI resolver returned ${response.status}`);
        return new Response(await response.text(), {
          status: 200,
          headers: {
            "Cache-Control": "public, max-age=86400",
            "Content-Type": "text/plain; charset=utf-8",
          },
        });
      } catch {
        return new Response("Citation unavailable", {
          status: 502,
          headers: { "Cache-Control": "no-store" },
        });
      }
    },
  },
];

export const slotPlugin = slot;
export default slot;
