import { parseBookResultHint, selectHintedBook, shouldConsiderBookResults } from "./result-hints.mjs";
import { bookSubjects, plainDescription, selectAuthorBooks } from "./catalog.mjs";
import { createHardcoverClient } from "./hardcover.mjs";

let template = '<article class="books-card" aria-label="{{ t:plugin-books.information }}">{{CONTENT}}</article>';
let pluginFetch = (...args) => fetch(...args);
let bookCache = null;
let proxyCover = null;
const hardcover = createHardcoverClient();

const OPEN_LIBRARY_SEARCH = "https://openlibrary.org/search.json";
const USER_AGENT =
  "degoog-toolkit/1.0 (https://github.com/SoPat712/degoog-toolkit)";
const CACHE_TTL_MS = 6 * 60 * 60_000;
const DESCRIPTION_TTL_MS = 7 * 24 * 60 * 60_000;
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

async function cachedJson(key, url, fetcher, ttl = CACHE_TTL_MS) {
  const cached = bookCache ? await bookCache.get(key) : null;
  if (cached) return cached;
  const data = await fetchJson(url, fetcher);
  if (bookCache) await bookCache.set(key, data, ttl);
  return data;
}

function proxiedCover(doc, context) {
  const coverId = Number(doc.cover_i);
  const imageUrl = doc._coverUrl || (Number.isInteger(coverId) && coverId > 0
    ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : "");
  if (!imageUrl) return "";
  const sign = typeof context?.signProxyUrl === "function"
    ? (url) => context.signProxyUrl(url) : proxyCover;
  if (!sign) return "";
  try {
    const signed = sign(imageUrl);
    return typeof signed === "string" ? signed : "";
  } catch {
    return "";
  }
}

function bookUrl(doc, term) {
  if (doc._source === "Hardcover") return doc._url || `https://hardcover.app/search?q=${encodeURIComponent(term)}`;
  const workKey = safeWorkKey(doc.key);
  return workKey ? `https://openlibrary.org${workKey}`
    : `https://openlibrary.org/search?q=${encodeURIComponent(term)}`;
}

function renderBook(doc, parsed, context, description = "") {
  const title = String(doc.title || "").trim();
  if (!title) return "";

  const primaryUrl = bookUrl(doc, parsed.term);
  const accessUrl = doc._accessUrl || (doc._source === "Hardcover" ? "" : primaryUrl);
  const source = doc._source === "Hardcover" ? "Hardcover" : "Open Library";
  const authors = Array.isArray(doc.author_name)
    ? doc.author_name.filter(Boolean).slice(0, 4)
    : [];
  const subjects = bookSubjects(doc.subject);
  const dates = Array.isArray(doc.publish_date)
    ? [...new Set(doc.publish_date.filter(Boolean))].slice(0, 4)
    : [];
  const isbns = Array.isArray(doc.isbn)
    ? doc.isbn.filter(validIsbn)
    : [];
  const primaryIsbn = parsed.kind === "isbn" ? parsed.term
    : isbns.find((isbn) => String(isbn).length === 13) || isbns[0] || "";
  const editionCount = Number(doc.edition_count) || 0;
  const cover = proxiedCover(doc, context);
  const access = doc.ebook_access === "printdisabled" ? ""
    : doc.public_scan_b === true || doc.ebook_access === "public" ? "readFree"
    : doc.ebook_access === "borrowable" ? "borrow" : "";
  const pages = Number(doc.number_of_pages_median);
  const rating = Number(doc.ratings_average);
  const ratingsCount = Number(doc.ratings_count);
  const ratingMarkup = Number.isFinite(rating) && rating > 0 && rating <= 5
    ? `<p class="books-card__rating"><span aria-hidden="true">★</span> ${rating.toFixed(1)} / 5${Number.isInteger(ratingsCount) && ratingsCount > 0 ? ` <span>(${ratingsCount} {{ t:plugin-books.ratings }})</span>` : ""}</p>`
    : "";

  const coverMarkup = cover
    ? `<img class="books-card__cover" src="${escapeHtml(cover)}" alt="{{ t:plugin-books.cover }} ${escapeHtml(title)}" loading="lazy">`
    : '<div class="books-card__cover books-card__cover--empty" aria-hidden="true">📚</div>';
  const authorMarkup = authors.length
    ? `<p class="books-card__authors">{{ t:plugin-books.by }} ${authors.map(escapeHtml).join(", ")}</p>`
    : "";
  const metadata = [
    Number.isInteger(Number(doc.first_publish_year)) && Number(doc.first_publish_year) > 0 ? `{{ t:plugin-books.firstPublished }} ${Number(doc.first_publish_year)}` : "",
    editionCount ? `${editionCount} {{ t:plugin-books.${editionCount === 1 ? "edition" : "editions"} }}` : "",
    Number.isInteger(pages) && pages > 0 ? `${pages} {{ t:plugin-books.pages }}` : "",
    doc._series ? `${doc._series}${doc._seriesPosition ? ` #${doc._seriesPosition}` : ""}` : "",
    Number(doc._readers) > 0 ? `${Number(doc._readers)} {{ t:plugin-books.readers }}` : "",
    doc._ebook ? "{{ t:plugin-books.ebook }}" : "",
    doc._audiobook ? "{{ t:plugin-books.audiobook }}" : "",
    primaryIsbn ? `ISBN ${primaryIsbn}` : "",
  ].filter(Boolean);
  const editionMarkup = dates.length
    ? `<section class="books-card__section"><h3>{{ t:plugin-books.editions }}</h3><p>${dates
        .map(escapeHtml)
        .join(" · ")}</p></section>`
    : "";
  const subjectMarkup = subjects.length
    ? `<section class="books-card__section"><h3>{{ t:plugin-books.subjects }}</h3><div class="books-card__chips">${subjects
        .map((subject) => `<span>${escapeHtml(subject)}</span>`)
        .join("")}</div></section>`
    : "";
  const libraryQuery = parsed.kind === "isbn" ? `bn:${parsed.term}` : `${title} ${authors[0] || ""}`.trim();
  const libraryLink = `<a href="https://search.worldcat.org/search?q=${encodeURIComponent(libraryQuery)}" target="_blank" rel="noopener noreferrer">{{ t:plugin-books.libraries }}</a>`;
  const discoveryQuery = encodeURIComponent(`${title} ${authors[0] || ""}`.trim());
  const moodMarkup = Array.isArray(doc._moods) && doc._moods.length
    ? `<section class="books-card__section"><h3>{{ t:plugin-books.moods }}</h3><div class="books-card__chips">${doc._moods.slice(0, 5).map((mood) => `<span>${escapeHtml(mood)}</span>`).join("")}</div></section>` : "";
  const warningsMarkup = Array.isArray(doc._warnings) && doc._warnings.length
    ? `<details class="books-card__synopsis"><summary>{{ t:plugin-books.contentWarnings }}</summary><div class="books-card__chips">${doc._warnings.slice(0, 10).map((warning) => `<span>${escapeHtml(warning)}</span>`).join("")}</div></details>` : "";

  return `
    <div class="books-card__layout">
      <div class="books-card__media">${coverMarkup}</div>
      <div class="books-card__content">
        <p class="books-card__eyebrow">${source}</p>
        <h2>${escapeHtml(title)}</h2>
        ${typeof doc.subtitle === "string" && doc.subtitle.trim() ? `<p class="books-card__subtitle">${escapeHtml(doc.subtitle)}</p>` : ""}
        ${authorMarkup}
        ${ratingMarkup}
        <div class="books-card__meta">${metadata
          .map((item) => `<span>${escapeHtml(item)}</span>`)
          .join("")}</div>
        ${editionMarkup}
        ${description ? `<details class="books-card__synopsis"><summary>{{ t:plugin-books.synopsis }}</summary><p>${escapeHtml(description)}</p></details>` : ""}
        ${subjectMarkup}
        ${moodMarkup}
        ${warningsMarkup}
        <nav class="books-card__links" aria-label="{{ t:plugin-books.links }}">
          <a class="books-card__primary" href="${escapeHtml(primaryUrl)}" target="_blank" rel="noopener noreferrer">{{ t:plugin-books.view }}</a>
          ${access && accessUrl ? `<a href="${escapeHtml(accessUrl)}" target="_blank" rel="noopener noreferrer">{{ t:plugin-books.${access} }}</a>` : ""}
          ${libraryLink}
        </nav>
        <nav class="books-card__discovery" aria-label="{{ t:plugin-books.findOn }}">
          <span>{{ t:plugin-books.findOn }}</span>
          <a href="https://openlibrary.org/search?q=${discoveryQuery}" target="_blank" rel="noopener noreferrer">Open Library</a>
          <a href="https://hardcover.app/search?q=${discoveryQuery}" target="_blank" rel="noopener noreferrer">Hardcover</a>
          <a href="https://www.goodreads.com/search?q=${discoveryQuery}" target="_blank" rel="noopener noreferrer">Goodreads</a>
          <a href="https://app.thestorygraph.com/browse?search_term=${discoveryQuery}" target="_blank" rel="noopener noreferrer">StoryGraph</a>
        </nav>
      </div>
    </div>`;
}

function renderAuthorBooks(docs, parsed, context) {
  const books = selectAuthorBooks(docs, parsed.term);
  if (!books.length) return "";
  const words = (value) => String(value).normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  const wanted = words(parsed.term);
  const author = books[0].author_name.find((name) => wanted.every((token) => words(name).includes(token)));
  const url = books[0]._source === "Hardcover" ? `https://hardcover.app/search?q=${encodeURIComponent(author)}`
    : `https://openlibrary.org/search?author=${encodeURIComponent(author)}`;
  const slides = books.map((doc) => {
    const href = bookUrl(doc, `${doc.title} ${author}`);
    const cover = proxiedCover(doc, context);
    const year = Number(doc.first_publish_year);
    return `<a class="books-card__slide" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">
      ${cover ? `<img class="books-card__cover" src="${escapeHtml(cover)}" alt="" loading="lazy">` : '<span class="books-card__cover books-card__cover--empty" aria-hidden="true">📚</span>'}
      <span class="books-card__slide-title">${escapeHtml(doc.title)}</span>
      ${Number.isInteger(year) && year > 0 ? `<span class="books-card__slide-meta">${year}</span>` : ""}
    </a>`;
  }).join("");
  return `<p class="books-card__eyebrow">{{ t:plugin-books.author }}</p>
    <h2>${escapeHtml(author)}</h2>
    <p class="books-card__authors">{{ t:plugin-books.booksByAuthor }}</p>
    <div class="books-card__carousel" tabindex="0" role="region" aria-label="{{ t:plugin-books.booksByAuthor }}">${slides}</div>
    <nav class="books-card__links"><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">{{ t:plugin-books.viewAll }}</a></nav>`;
}

export const slot = {
  id: "books",
  name: "Books / ISBN",
  description: "Shows book details, ratings, synopses, author collections, and library links.",
  isClientExposed: false,
  position: "knowledge-panel",
  slotPositions: ["knowledge-panel", "full-width-above-results"],
  waitForResults: true,
  settingsSchema: [{
    key: "hardcoverToken", label: "Hardcover API token", type: "password", secret: true,
    description: "Optional. Add your token from Hardcover account settings → Hardcover API. Books uses Hardcover first and falls back to Open Library. The token stays on the server.",
  }],

  configure(settings = {}) {
    hardcover.configure(settings.hardcoverToken);
  },

  init(ctx) {
    if (ctx?.template) template = ctx.template;
    if (typeof ctx?.fetch === "function") {
      pluginFetch = (...args) => ctx.fetch(...args);
    }
    bookCache = createCache(ctx);
    proxyCover = typeof ctx?.signProxyUrl === "function" ? (url) => ctx.signProxyUrl(url) : null;
  },

  trigger(query) {
    return Boolean(parseBookQuery(query)) || shouldConsiderBookResults(query);
  },

  async execute(query, context) {
    const explicit = parseBookQuery(query);
    const hint = explicit ? null : parseBookResultHint(query, context?.results);
    const parsed = explicit || hint;
    if (!parsed) return { html: "" };

    const params = new URLSearchParams({
      limit: parsed.kind === "author" ? "16" : hint ? "5" : "1",
      fields:
        "key,title,subtitle,author_name,first_publish_year,publish_date,edition_count,isbn,subject,cover_i,public_scan_b,ebook_access,ratings_average,ratings_count,number_of_pages_median" +
        (hint ? ",editions,editions.title" : ""),
    });
    if (hint) {
      params.set("q", hint.workKey ? `key:${hint.workKey}` : hint.term);
      if (hint.author) params.set("author", hint.author);
      const lang = String(context?.locale || context?.lang || "en").split(/[-_]/)[0];
      params.set("lang", /^[a-z]{2}$/i.test(lang) ? lang.toLowerCase() : "en");
    } else {
      params.set(parsed.kind, parsed.term);
    }
    if (parsed.kind === "author") params.set("sort", "readinglog");
    const cacheKey = params.toString();

    try {
      const fetcher =
          typeof context?.fetch === "function"
            ? (...args) => context.fetch(...args)
            : pluginFetch;
      let data = null;
      let note = "";
      if (hardcover.isConfigured() && (!hint || hint.author)) {
        try {
          const docs = await hardcover.search(parsed, fetcher, bookCache);
          const selected = parsed.kind === "author" ? selectAuthorBooks(docs, parsed.term)
            : hint ? [selectHintedBook(docs, { ...hint, workKey: "" })].filter(Boolean)
            : parsed.kind === "isbn" ? docs.filter((doc) => doc.isbn?.some((isbn) => String(isbn).replace(/[\s-]/g, "").toUpperCase() === parsed.term))
            : docs;
          if (selected.length) data = { docs: selected };
          else note = "hardcoverNoMatch";
        } catch (error) {
          note = error?.reason === "auth" ? "hardcoverAuth"
            : error?.reason === "limit" ? "hardcoverLimit" : "hardcoverUnavailable";
        }
      }
      if (!data) data = await cachedJson(cacheKey, `${OPEN_LIBRARY_SEARCH}?${params}`, fetcher);
      const wrap = (content) => ({ title: "", html: content ? template.replace("{{CONTENT}}", content +
        (note ? `<p class="books-card__note">{{ t:plugin-books.${note} }}</p>` : "")) : "" });
      if (parsed.kind === "author") {
        const content = renderAuthorBooks(data?.docs, parsed, context);
        return wrap(content);
      }
      let doc = data?.docs?.[0]?._source === "Hardcover" ? data.docs[0]
        : hint ? selectHintedBook(data?.docs, hint) : data?.docs?.[0];
      if (doc?._source === "Hardcover") {
        const isbn = Array.isArray(doc.isbn) ? doc.isbn.find(validIsbn) : "";
        if (isbn) {
          try {
            const accessParams = new URLSearchParams({ isbn, limit: "1", fields: "key,ebook_access,public_scan_b" });
            const accessData = await cachedJson(`access:${isbn}`, `${OPEN_LIBRARY_SEARCH}?${accessParams}`, fetcher, DESCRIPTION_TTL_MS);
            const access = accessData?.docs?.[0];
            const accessKey = safeWorkKey(access?.key);
            if (accessKey) doc = { ...doc, ebook_access: access.ebook_access, public_scan_b: access.public_scan_b,
              _accessUrl: `https://openlibrary.org${accessKey}` };
          } catch {}
        }
      }
      const workKey = safeWorkKey(doc?.key);
      let description = plainDescription(doc?._description);
      if (doc?.title && workKey) {
        try {
          const work = await cachedJson(`work:${workKey}`, `https://openlibrary.org${workKey}.json`, fetcher, DESCRIPTION_TTL_MS);
          description = plainDescription(work?.description);
        } catch {}
      }
      const content = renderBook(doc || {}, parsed, context, description);
      return wrap(content);
    } catch {
      return { html: "" };
    }
  },
};

export const slotPlugin = slot;
export default slot;
