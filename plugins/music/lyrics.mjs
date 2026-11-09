import { normalizeMusicText } from "./result-hints.mjs";

const LRCLIB_BASE = "https://lrclib.net/api";
const LYRICS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 24 * 60 * 60 * 1000;
const LRCLIB_TIMEOUT_MS = 5000;
const MAX_LINES = 400;
export const PREVIEW_LINES = 6;
const USER_AGENT = "degoog-toolkit/1.0 (https://github.com/SoPat712/degoog-toolkit)";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Plain lyric lines from an LRCLIB record; synced lyrics lose their timestamps. */
export function lyricsLines(record) {
  if (!record || record.instrumental) return [];
  const plain = typeof record.plainLyrics === "string" ? record.plainLyrics : "";
  const text = plain.trim() ? plain : String(record.syncedLyrics || "").replace(/^(?:\s*\[[^\]]*\])+[ \t]?/gm, "");
  const lines = [];
  for (const line of text.replace(/\r\n?/g, "\n").split("\n").map((value) => value.trim())) {
    if (!line && (!lines.length || !lines[lines.length - 1])) continue;
    lines.push(line);
  }
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines.slice(0, MAX_LINES);
}

/** Returns { status, data }; throws on network errors so failures are never cached as misses. */
async function lrclib(fetcher, path, params) {
  const url = new URL(`${LRCLIB_BASE}/${path}`);
  for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, String(value));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LRCLIB_TIMEOUT_MS);
  try {
    const response = await fetcher(url.toString(), {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    if (response?.status === 404) return { status: 404, data: null };
    if (!response?.ok) throw new Error(`LRCLIB ${response?.status}`);
    return { status: 200, data: await response.json() };
  } finally {
    clearTimeout(timer);
  }
}

async function cachedSearch(fetcher, cache, params) {
  const key = `lrclib-search:${JSON.stringify(params)}`;
  const cached = cache ? await cache.get(key) : null;
  if (Array.isArray(cached?.records)) return cached.records;
  const { data } = await lrclib(fetcher, "search", params);
  const records = Array.isArray(data) ? data : [];
  if (cache) await cache.set(key, { records }, MISS_TTL_MS);
  return records;
}

const sameText = (a, b) => normalizeMusicText(a) === normalizeMusicText(b);

/**
 * Lyrics for a recording: LRCLIB's signature match first (title, artist, album,
 * duration within ±2 s), then a title-and-artist search. Returns the matched
 * record's album and duration with its lines, or null.
 */
export async function findLyricsRecord({ title, artist, album = "", duration = 0 }, fetcher, cache) {
  if (!title || !artist || typeof fetcher !== "function") return null;
  const seconds = Number(duration) >= 1 && Number(duration) <= 3600 ? Math.round(Number(duration)) : 0;
  const key = `lyrics:${[title, artist, album].map(normalizeMusicText).join(":")}:${seconds}`;
  const cached = cache ? await cache.get(key) : null;
  if (Array.isArray(cached?.lines)) {
    return cached.lines.length
      ? { title: cached.title || title, artist: cached.artist || artist, album: cached.album || "", duration: cached.duration || 0, lines: cached.lines }
      : null;
  }

  let lines = [];
  let match = null;
  const exact = await lrclib(fetcher, "get", { track_name: title, artist_name: artist, album_name: album, duration: seconds });
  if (exact.status === 200) {
    lines = lyricsLines(exact.data);
    match = exact.data;
  }
  if (!lines.length && !exact.data?.instrumental) {
    const records = await cachedSearch(fetcher, cache, { track_name: title, artist_name: artist });
    const artistKey = normalizeMusicText(artist);
    match = records
      .filter((record) => sameText(record?.trackName, title) && ` ${normalizeMusicText(record?.artistName)} `.includes(` ${artistKey} `))
      .filter((record) => lyricsLines(record).length)
      .sort((a, b) => (seconds ? Math.abs((Number(a.duration) || 0) - seconds) - Math.abs((Number(b.duration) || 0) - seconds) : 0))[0];
    lines = lyricsLines(match);
  }
  // LRCLIB's spelling of the asked-for names, when it is the same song and artist.
  const found = {
    title: sameText(match?.trackName, title) ? match.trackName.trim() : title,
    artist: sameText(match?.artistName, artist) ? match.artistName.trim() : artist,
    album: typeof match?.albumName === "string" ? match.albumName.trim() : "",
    duration: Number(match?.duration) > 0 ? Math.round(Number(match.duration)) : 0,
    lines,
  };
  if (cache) await cache.set(key, found, lines.length ? LYRICS_TTL_MS : MISS_TTL_MS);
  return lines.length ? found : null;
}

/** Lyric lines for a recording, or null. */
export async function findLyrics(signature, fetcher, cache) {
  return (await findLyricsRecord(signature, fetcher, cache))?.lines ?? null;
}

/**
 * Song and artist for a lyrics query that named no artist the results could
 * confirm. "mirrors justin timberlake" must equal an LRCLIB title plus artist;
 * a bare title needs one artist to clearly dominate the records with that exact
 * title, so covers and same-named songs make it abstain.
 */
export async function lyricsIdentity(term, fetcher, cache) {
  const wanted = normalizeMusicText(term);
  if (!wanted || typeof fetcher !== "function") return null;
  const withLyrics = (record) => record?.trackName && record?.artistName && lyricsLines(record).length;

  const records = (await cachedSearch(fetcher, cache, { q: term })).filter(withLyrics);
  const combined = records.find((record) => [
    `${record.trackName} ${record.artistName}`,
    `${record.artistName} ${record.trackName}`,
    `${record.trackName} by ${record.artistName}`,
  ].some((candidate) => normalizeMusicText(candidate) === wanted));
  if (combined) return { recordingTitle: combined.trackName, artist: combined.artistName };

  const titled = (await cachedSearch(fetcher, cache, { track_name: term }))
    .filter((record) => withLyrics(record) && normalizeMusicText(record.trackName) === wanted);
  const counts = new Map();
  for (const record of titled) {
    const artistKey = normalizeMusicText(record.artistName);
    const entry = counts.get(artistKey) || { count: 0, record };
    entry.count += 1;
    counts.set(artistKey, entry);
  }
  const [top, second] = [...counts.values()].sort((a, b) => b.count - a.count);
  if (!top || top.count < 3 || top.count < 3 * (second?.count || 0) || top.count * 2 < titled.length) return null;
  return { recordingTitle: top.record.trackName, artist: top.record.artistName };
}

/** The lyrics block: a few lines with "Show more", or everything when `open`. */
export function lyricsSectionHtml(lines, { id, open = false, src = "" } = {}) {
  const body = (lines || []).map((line, index) => {
    const extra = index >= PREVIEW_LINES ? " music-lyrics-extra" : "";
    return line
      ? `<span class="music-lyrics-line${extra}">${escapeHtml(line)}</span>`
      : `<span class="music-lyrics-break${extra}" aria-hidden="true"></span>`;
  }).join("");
  const more = !src && (lines || []).length <= PREVIEW_LINES ? " hidden" : "";
  return `<section class="music-lyrics"${open ? " data-music-lyrics-open" : ""}${src ? ` data-music-lyrics-src="${escapeHtml(src)}" hidden` : ""} aria-label="{{ t:plugin-music.lyrics }}">
      <h3 class="music-lyrics-title">{{ t:plugin-music.lyrics }}</h3>
      <div class="music-lyrics-text" id="${escapeHtml(id)}">${body}</div>
      <button type="button" class="music-lyrics-toggle" data-music-lyrics-toggle aria-controls="${escapeHtml(id)}" aria-expanded="${open ? "true" : "false"}" data-more="{{ t:plugin-music.showMore }}" data-less="{{ t:plugin-music.showLess }}"${more}>${open ? "{{ t:plugin-music.showLess }}" : "{{ t:plugin-music.showMore }}"}</button>
      <div class="music-lyrics-source">{{ t:plugin-music.lyricsFrom }} <a href="https://lrclib.net/" target="_blank" rel="noopener">LRCLIB</a></div>
    </section>`;
}
