export const normalizeMusicText = (value) => String(value || "")
  .normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim();

const SOUNDCLOUD_NON_TRACKS = new Set([
  "albums", "charts", "discover", "feed", "following", "followers", "likes",
  "popular-tracks", "reposts", "search", "sets", "stations", "stream", "tags", "tracks", "you",
]);

/** Infer a recording only from a track URL and a title that agrees with the query. */
export function streamingRecordingHint(result, query) {
  let url;
  try { url = new URL(result?.url); } catch { return null; }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.port) return null;
  if (typeof result.title !== "string" || result.title.length > 500) return null;
  const host = url.hostname.replace(/^www\./, "");
  const text = result.title.replace(/\p{Cf}/gu, "").trim();
  let match;
  if (host === "open.spotify.com" && /^\/(?:intl-[a-z]{2}\/)?track\/[a-zA-Z0-9]{22}\/?$/.test(url.pathname)) {
    match = text.replace(/\s+[|–—-]\s+Spotify\s*$/i, "")
      .match(/^(.+?)\s+[-–—]\s+(?:song(?:\s+(?:and|with)\s+lyrics)?|track)\s+by\s+(.+)$/i);
  } else if (host === "music.apple.com" && (
    /^\/[a-z]{2}\/song\/(?:[^/]+\/)?\d+\/?$/i.test(url.pathname) ||
    (/^\/[a-z]{2}\/album\/(?:[^/]+\/)?\d+\/?$/i.test(url.pathname) && /^\d+$/.test(url.searchParams.get("i") || ""))
  )) {
    match = text.replace(/\s+[|–—-]\s+Apple\s+Music\s*$/i, "")
      .match(/^(.+?)\s+[-–—]\s+song(?:\s+(?:and|with)\s+lyrics)?\s+by\s+(.+)$/i);
  } else if (host === "soundcloud.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length !== 2 || parts.some((part) => SOUNDCLOUD_NON_TRACKS.has(part.toLowerCase()))) return null;
    match = text.replace(/\s+\|\s+(?:Listen\b.*|SoundCloud)\s*$/i, "")
      .match(/^Stream\s+(.+)\s+by\s+(.+)$/i);
  }
  if (!match) return null;
  const recordingTitle = match[1].trim();
  const artist = match[2].trim();
  if (recordingTitle.length > 160 || artist.length > 160) return null;
  const q = normalizeMusicText(query);
  if (!q || !normalizeMusicText(artist) || ![recordingTitle, `${recordingTitle} ${artist}`,
    `${recordingTitle} by ${artist}`, `${artist} ${recordingTitle}`]
    .some((candidate) => normalizeMusicText(candidate) === q)) return null;
  return { kind: "recording", term: `${recordingTitle} ${artist}`, recordingTitle, artist, fromStreamingResult: true };
}

/** An artist name compared without a leading "the": Wikipedia writes "(Beatles album)". */
export const artistKey = (name) => normalizeMusicText(name).replace(/^the /, "");

const parseUrl = (value) => {
  try { return new URL(String(value || "")); } catch { return null; }
};

/** "Hello (Adele song)" → { base: "hello", qualifier: "adele song" }, from the article URL. */
function wikipediaArticle(result) {
  const url = parseUrl(result?.url);
  if (!url || !/(?:^|\.)wikipedia\.org$/.test(url.hostname) || !url.pathname.startsWith("/wiki/")) return null;
  let title;
  try { title = decodeURIComponent(url.pathname.slice(6)).replace(/_/g, " "); } catch { return null; }
  const match = title.match(/^(.+?)\s*\(([^()]+)\)$/);
  return { base: artistKey(match ? match[1] : title), qualifier: match ? normalizeMusicText(match[2]) : "" };
}

/** A Wikipedia article on the artist's work: "25 (Adele album)", "Taylor Swift (album)", "Radiohead discography". */
function isWikipediaWork(article, name) {
  if (!article.qualifier) return new RegExp(`^${name} (?:\\S+ )?discography$`).test(article.base);
  const work = article.qualifier.match(/^(?:(.+) )?(?:album|ep|single|song)$/);
  return Boolean(work) && (work[1] ? artistKey(work[1]) === name : article.base === name);
}

/** An artist page on a music service whose title names the artist. */
function isServiceArtistPage(result, name) {
  const url = parseUrl(result?.url);
  if (!url || url.protocol !== "https:") return false;
  const host = url.hostname.replace(/^www\./, "");
  const page = (host === "open.spotify.com" && /^\/(?:intl-[a-z]{2}\/)?artist\/[a-zA-Z0-9]{22}\/?$/.test(url.pathname)) ||
    (host === "music.apple.com" && /^\/[a-z]{2}\/artist\/(?:[^/]+\/)?\d+\/?$/i.test(url.pathname)) ||
    (host === "music.youtube.com" && /^\/(?:channel\/[\w-]+|@[\w.-]+)\/?$/.test(url.pathname)) ||
    (host === "genius.com" && /^\/artists\/[^/]+\/?$/.test(url.pathname));
  return page && ` ${artistKey(result.title)} `.includes(` ${name} `);
}

/**
 * Whether the top results are about a musician named exactly `query`: three of
 * the top twenty are Wikipedia articles on the artist's songs, albums or
 * discography, or artist pages on music services, one of them in the top ten.
 * When Wikipedia files anyone by that name under a qualifier ("Queen (band)",
 * "Yes (band)"), the bare name means something else too, so it abstains.
 */
export function resultsNameArtist(query, results) {
  const name = artistKey(query);
  if (!name || !Array.isArray(results)) return false;
  const top = results.slice(0, 20);
  if (top.map(wikipediaArticle).some((article) => article?.base === name && article.qualifier &&
    article.qualifier !== "disambiguation" && !isWikipediaWork(article, name))) return false;
  // One article in two languages or on the mobile site counts once.
  const evidence = new Map();
  top.forEach((result, index) => {
    const article = wikipediaArticle(result);
    const key = article ? isWikipediaWork(article, name) && `${article.base} (${article.qualifier})`
      : isServiceArtistPage(result, name) && new URL(result.url).hostname;
    if (key && !evidence.has(key)) evidence.set(key, index);
  });
  return evidence.size >= 3 && Math.min(...evidence.values()) < 10;
}
