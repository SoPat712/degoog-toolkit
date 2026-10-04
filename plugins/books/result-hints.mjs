const NON_BOOK_QUERY = /\b(?:books?|novels?|isbn|discography|albums?|songs?|tracks?|lyrics|weather|forecast|temperature|near\s+me)\b/i;

const normalize = (value) => String(value || "")
  .normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function shouldConsiderBookResults(query) {
  const raw = String(query || "").trim();
  const normalized = normalize(raw);
  return raw.length >= 3 && raw.length <= 120 &&
    !/^(?:!|[a-z][a-z0-9+.-]*:|www\.)|[%#{}[\]<>/=\\]/i.test(raw) &&
    !NON_BOOK_QUERY.test(raw) && normalized.length >= 2 && normalized.split(/\s+/).length <= 12;
}

function bookHint(result, query) {
  let url;
  try { url = new URL(result?.url); } catch { return null; }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.port) return null;
  const host = url.hostname.replace(/^www\./, "");
  const goodreads = host === "goodreads.com" && /^\/(?:[a-z]{2}\/)?book\/show\/\d+(?:[.-][^/]+)?\/?$/.test(url.pathname);
  const openLibrary = host === "openlibrary.org" && /^\/(?:works\/OL\d+W|books\/OL\d+M)(?:\/[^/]+)?\/?$/.test(url.pathname);
  if (!goodreads && !openLibrary) return null;
  if (openLibrary && /\/(?:edit|history|covers|editions|borrow|read)\/?$/i.test(url.pathname)) return null;
  if (typeof result.title !== "string" || result.title.length > 500) return null;

  const text = result.title.replace(/\p{Cf}/gu, "")
    .replace(/\s+[|–—-]\s+(?:Goodreads|Open Library)\s*$/i, "").trim();
  const split = text.lastIndexOf(" by ");
  const title = (split >= 0 ? text.slice(0, split) : text)
    .replace(/\s+\((?:\d{4}\s+edition|[^()]*#\d[^()]*)\)$/i, "").trim();
  const author = split >= 0 ? text.slice(split + 4).trim() : "";
  const workKey = openLibrary ? url.pathname.match(/^\/works\/OL\d+W(?=\/|$)/)?.[0] : "";
  if (!title || title.length > 180 || author.length > 160 || (!author && !workKey)) return null;
  const q = normalize(query);
  if (![title, ...(author ? [`${title} ${author}`, `${title} by ${author}`, `${author} ${title}`] : [])]
    .some((candidate) => normalize(candidate) === q)) return null;
  return { kind: "title", term: title, author, workKey: workKey || "" };
}

/** Use matching book-detail pages only; conflicting authors leave the query alone. */
export function parseBookResultHint(query, results) {
  if (!shouldConsiderBookResults(query) || !Array.isArray(results)) return null;
  const hints = results.slice(0, 8).map((result) => bookHint(result, query)).filter(Boolean);
  if (!hints.length) return null;
  if (new Set(hints.map((hint) => normalize(hint.term))).size > 1 ||
      new Set(hints.filter((hint) => hint.author).map((hint) => normalize(hint.author))).size > 1 ||
      new Set(hints.filter((hint) => hint.workKey).map((hint) => hint.workKey)).size > 1) return null;
  const selected = hints.find((hint) => hint.workKey) || hints[0];
  return { ...selected, author: selected.author || hints.find((hint) => hint.author)?.author || "" };
}

/** Require the returned work or edition and author to agree with the search evidence. */
export function selectHintedBook(docs, hint) {
  if (!Array.isArray(docs)) return null;
  for (const doc of docs.slice(0, 5)) {
    if (!doc || (hint.workKey && doc.key !== hint.workKey)) continue;
    if (hint.author && !(Array.isArray(doc.author_name) && doc.author_name.some((name) => normalize(name) === normalize(hint.author)))) continue;
    const edition = (Array.isArray(doc.editions?.docs) ? doc.editions.docs : [])
      .find((item) => normalize(item?.title) === normalize(hint.term));
    if (normalize(doc.title) === normalize(hint.term)) return doc;
    if (edition) return { ...doc, title: edition.title };
  }
  return null;
}
