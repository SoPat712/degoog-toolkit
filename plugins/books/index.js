let template = '<article class="books-card" aria-label="Book information">{{CONTENT}}</article>';
let pluginFetch = (...args) => fetch(...args);
let bookCache = null;

const OPEN_LIBRARY_SEARCH = "https://openlibrary.org/search.json";
const USER_AGENT =
  "degoog-toolkit/1.0 (https://github.com/SoPat712/degoog-toolkit)";
const CACHE_TTL_MS = 6 * 60 * 60_000;
const FETCH_TIMEOUT_MS = 8_000;
const BOOKING_TARGET_RX =
  /^(?:a\s+|an\s+|the\s+)?(?:appointment|flight|hotel|reservation|restaurant|room|table|ticket|tickets|trip)\b/i;
const GENERIC_BOOK_REQUEST_RX =
  /^(?:a|an|the|this|that|best|good|new|(?:i|we)\s+(?:need|want)(?:\s+(?:a|an|the))?|(?:find|recommend|show|suggest)(?:\s+me)?(?:\s+(?:a|an|the))?|looking\s+for(?:\s+(?:a|an|the))?)$/i;

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function validIsbn(value) {
  const isbn = String(value || "").replace(/[^\dX]/gi, "").toUpperCase();
  if (isbn.length === 10) {
    return (
      isbn.split("").reduce((sum, digit, index) => {
        const number = digit === "X" && index === 9 ? 10 : Number(digit);
        return sum + number * (10 - index);
      }, 0) % 11 ===
      0
    );
  }
  if (!/^97[89]\d{10}$/.test(isbn)) return false;
  const sum = isbn
    .slice(0, 12)
    .split("")
    .reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === Number(isbn[12]);
}

export function parseBookQuery(query) {
  const raw = String(query || "").trim();
  if (!raw || raw.length > 180) return null;

  const isbnCandidate = raw
    .replace(/^isbn(?:-1[03])?\s*:?\s*/i, "")
    .trim();
  if (/^[\dXx\s-]+$/.test(isbnCandidate) && validIsbn(isbnCandidate)) {
    return {
      kind: "isbn",
      term: isbnCandidate.replace(/[^\dX]/gi, "").toUpperCase(),
    };
  }

  const author = raw.match(/^books?\s+by\s+(.+)$/i);
  if (author?.[1]?.trim().length >= 2) {
    return { kind: "author", term: author[1].trim() };
  }

  const prefixed = raw.match(/^(?:book|novel)(\s*:)?\s+(.+)$/i);
  const suffixed = raw.match(/^(.+?)\s+(?:book|novel)$/i);
  if (prefixed) {
    const term = prefixed[2].trim();
    if (!prefixed[1] && BOOKING_TARGET_RX.test(term)) return null;
    return term.length >= 2 ? { kind: "title", term } : null;
  }

  const term = (suffixed?.[1] || "").trim();
  if (GENERIC_BOOK_REQUEST_RX.test(term)) return null;
  return term.length >= 2 ? { kind: "title", term } : null;
}

function createCache(ctx) {
  if (typeof ctx?.useCache === "function") {
    return ctx.useCache("ext:books:open-library", CACHE_TTL_MS);
  }
  return typeof ctx?.createCache === "function"
    ? ctx.createCache(CACHE_TTL_MS)
    : null;
}

async function fetchJson(url, fetcher) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetcher(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Open Library returned ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function safeWorkKey(value) {
  return /^\/works\/OL\d+W$/i.test(String(value || "")) ? value : "";
}

function proxiedCover(doc, context) {
  const coverId = Number(doc.cover_i);
  if (!Number.isInteger(coverId) || coverId <= 0) return "";
  if (typeof context?.signProxyUrl !== "function") return "";
  try {
    const signed = context.signProxyUrl(
      `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`,
    );
    return typeof signed === "string" ? signed : "";
  } catch {
    return "";
  }
}

function renderBook(doc, parsed, context) {
  const title = String(doc.title || "").trim();
  if (!title) return "";

  const workKey = safeWorkKey(doc.key);
  const openLibraryUrl = workKey
    ? `https://openlibrary.org${workKey}`
    : `https://openlibrary.org/search?q=${encodeURIComponent(parsed.term)}`;
  const authors = Array.isArray(doc.author_name)
    ? doc.author_name.filter(Boolean).slice(0, 4)
    : [];
  const subjects = Array.isArray(doc.subject)
    ? doc.subject.filter(Boolean).slice(0, 6)
    : [];
  const dates = Array.isArray(doc.publish_date)
    ? [...new Set(doc.publish_date.filter(Boolean))].slice(0, 4)
    : [];
  const isbns = Array.isArray(doc.isbn)
    ? doc.isbn.filter(validIsbn)
    : [];
  const primaryIsbn = parsed.kind === "isbn" ? parsed.term : isbns[0] || "";
  const editionCount = Number(doc.edition_count) || 0;
  const cover = proxiedCover(doc, context);
  const readable =
    doc.public_scan_b === true ||
    ["public", "borrowable", "printdisabled"].includes(doc.ebook_access);

  const coverMarkup = cover
    ? `<img class="books-card__cover" src="${escapeHtml(cover)}" alt="Cover of ${escapeHtml(title)}" loading="lazy">`
    : '<div class="books-card__cover books-card__cover--empty" aria-hidden="true">📚</div>';
  const authorMarkup = authors.length
    ? `<p class="books-card__authors">by ${authors.map(escapeHtml).join(", ")}</p>`
    : "";
  const metadata = [
    doc.first_publish_year ? `First published ${doc.first_publish_year}` : "",
    editionCount ? `${editionCount} edition${editionCount === 1 ? "" : "s"}` : "",
    primaryIsbn ? `ISBN ${primaryIsbn}` : "",
  ].filter(Boolean);
  const editionMarkup = dates.length
    ? `<section class="books-card__section"><h3>Editions</h3><p>${dates
        .map(escapeHtml)
        .join(" · ")}</p></section>`
    : "";
  const subjectMarkup = subjects.length
    ? `<section class="books-card__section"><h3>Subjects</h3><div class="books-card__chips">${subjects
        .map((subject) => `<span>${escapeHtml(subject)}</span>`)
        .join("")}</div></section>`
    : "";
  const libraryLink = primaryIsbn
    ? `<a href="https://search.worldcat.org/search?q=bn%3A${encodeURIComponent(primaryIsbn)}" target="_blank" rel="noopener noreferrer">Find in libraries</a>`
    : "";

  return `
    <div class="books-card__layout">
      <div class="books-card__media">${coverMarkup}</div>
      <div class="books-card__content">
        <p class="books-card__eyebrow">Open Library</p>
        <h2>${escapeHtml(title)}</h2>
        ${authorMarkup}
        <div class="books-card__meta">${metadata
          .map((item) => `<span>${escapeHtml(item)}</span>`)
          .join("")}</div>
        ${editionMarkup}
        ${subjectMarkup}
        <nav class="books-card__links" aria-label="Book links">
          <a class="books-card__primary" href="${escapeHtml(openLibraryUrl)}" target="_blank" rel="noopener noreferrer">View book</a>
          ${readable ? `<a href="${escapeHtml(openLibraryUrl)}" target="_blank" rel="noopener noreferrer">Read or borrow</a>` : ""}
          ${libraryLink}
        </nav>
      </div>
    </div>`;
}

export const slot = {
  id: "books",
  name: "Books / ISBN",
  description: "Shows book metadata, covers, editions, subjects, and reading links.",
  isClientExposed: false,
  position: "knowledge-panel",
  slotPositions: ["knowledge-panel", "full-width-above-results"],

  init(ctx) {
    if (ctx?.template) template = ctx.template;
    if (typeof ctx?.fetch === "function") {
      pluginFetch = (...args) => ctx.fetch(...args);
    }
    bookCache = createCache(ctx);
  },

  trigger(query) {
    return Boolean(parseBookQuery(query));
  },

  async execute(query, context) {
    const parsed = parseBookQuery(query);
    if (!parsed) return { html: "" };

    const params = new URLSearchParams({
      limit: "1",
      fields:
        "key,title,author_name,first_publish_year,publish_date,edition_count,isbn,subject,cover_i,public_scan_b,ebook_access",
    });
    params.set(parsed.kind === "isbn" ? "isbn" : parsed.kind, parsed.term);
    const cacheKey = `${parsed.kind}:${parsed.term.toLowerCase()}`;

    try {
      let data = bookCache ? await bookCache.get(cacheKey) : null;
      if (!data) {
        const fetcher =
          typeof context?.fetch === "function"
            ? (...args) => context.fetch(...args)
            : pluginFetch;
        data = await fetchJson(`${OPEN_LIBRARY_SEARCH}?${params}`, fetcher);
        if (bookCache) await bookCache.set(cacheKey, data, CACHE_TTL_MS);
      }
      const content = renderBook(data?.docs?.[0] || {}, parsed, context);
      return { title: "", html: content ? template.replace("{{CONTENT}}", content) : "" };
    } catch {
      return { html: "" };
    }
  },
};

export const slotPlugin = slot;
export default slot;
