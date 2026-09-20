const MUSICBRAINZ_BASE = "https://musicbrainz.org/ws/2";
const CACHE_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8 * 1000;
const MIN_REQUEST_INTERVAL_MS = 1000;
const USER_AGENT =
  "degoog-toolkit/1.0 (https://github.com/SoPat712/degoog-toolkit)";
const REQUEST_HEADERS = Object.freeze({
  Accept: "application/json",
  "User-Agent": USER_AGENT,
});

let template = "";
let runtimeFetch = (...args) => fetch(...args);
let runtimeContext = null;
let musicCache = null;
let nextMusicBrainzRequestAt = 0;
let musicBrainzQueue = Promise.resolve();

const STOP_TERMS = new Set([
  "album",
  "albums",
  "artist",
  "artists",
  "discography",
  "music",
  "record",
  "records",
  "song",
  "songs",
  "track",
  "tracks",
]);

const PREFIX_PATTERNS = [
  { kind: "artist", pattern: /^!?\s*music\b\s+(.+)$/i },
  { kind: "artist", pattern: /^!?\s*artist\b\s+(.+)$/i },
  { kind: "artist", pattern: /^!?\s*discography\b\s+(.+)$/i },
  { kind: "release-group", pattern: /^!?\s*albums?\b\s+(.+)$/i },
  { kind: "release-group", pattern: /^!?\s*records?\b\s+(.+)$/i },
  { kind: "recording", pattern: /^!?\s*tracks?\b\s+(.+)$/i },
  { kind: "recording", pattern: /^!?\s*songs?\b\s+(.+)$/i },
];

const TRAILING_PATTERNS = [
  { kind: "artist", pattern: /^(.+?)\s+discography\s*[?!.,;:]*$/i },
  { kind: "release-group", pattern: /^(.+?)\s+albums?\s*[?!.,;:]*$/i },
  { kind: "release-group", pattern: /^(.+?)\s+records?\s*[?!.,;:]*$/i },
  { kind: "recording", pattern: /^(.+?)\s+tracks?\s*[?!.,;:]*$/i },
  { kind: "recording", pattern: /^(.+?)\s+songs?\s*[?!.,;:]*$/i },
];

const NON_MUSIC_INTENT =
  /\b(?:books?|isbn|doi|papers?|weather|forecast|temperature|stocks?|prices?|maps?|near\s+me|movies?|tv|recipes?|translate|calculator|convert|define|definition)\b/i;
const NON_MUSIC_QUERY =
  /^(?:about:|atomic\s+number\b|days?\s+(?:since|until)|element\s+\w+\b|flip\s+(?:a\s+)?coin\b|heads\s+or\s+tails\b|hello\s+world\b|how\s+to\b|metronome\b|periodic\s+table\b|play\s+(?:minesweeper|snake|tic[\s-]?tac[\s-]?toe)\b|random\s+number\b|study\b|time\s+(?:at|for|in)\b|what(?:'s|s|\s+is)?\s+(?:the\s+)?time\b|yes\s+or\s+no\b)|^(?:minesweeper|tic[\s-]?tac[\s-]?toe)\s*[?!.,;:]*$|\b(?:algorithm|api|documentation|javascript|python|score|standings|tutorial)\b|\b(?:clock|time|time\s*zone|timezone)\s*[?!.,;:]*$|^-?\d[\d\s.,]*\s*(?:%|percent\b)|^-?\d[\d\s.,]*\s*\S+\s+(?:in|into|to|=)\s+\S+/i;
const RECORDING_RESULT_HOSTS = new Set([
  "azlyrics.com",
  "genius.com",
  "music.youtube.com",
  "musixmatch.com",
  "songlyrics.com",
  "youtube.com",
]);

function createExtensionCache(ctx, namespace, ttlMs) {
  if (typeof ctx?.useCache === "function") return ctx.useCache(namespace, ttlMs);
  return typeof ctx?.createCache === "function" ? ctx.createCache(ttlMs) : null;
}

async function cacheGet(cache, key) {
  return cache ? cache.get(key) : null;
}

async function cacheSet(cache, key, value, ttlMs) {
  if (cache) await cache.set(key, value, ttlMs);
}

function cleanTerm(value) {
  const term = String(value || "")
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (term.length < 2 || term.length > 120) return "";
  if (/^(?:https?:\/\/|www\.)/i.test(term)) return "";
  if (/^[?!.,;:]+$/.test(term)) return "";
  if (STOP_TERMS.has(term.toLowerCase())) return "";
  return term;
}

/** Parse only explicit music intent. Returns { kind, term } or null. */
export function parseMusicQuery(value) {
  const raw = String(value || "").trim();
  if (raw.length < 3 || raw.length > 160) return null;
  if (/^(?:https?:\/\/|www\.)/i.test(raw)) return null;

  for (const { kind, pattern } of PREFIX_PATTERNS) {
    const match = raw.match(pattern);
    if (match) {
      const term = cleanTerm(match[1]);
      return term ? { kind, term } : null;
    }
  }

  for (const { kind, pattern } of TRAILING_PATTERNS) {
    const match = raw.match(pattern);
    if (match) {
      const term = cleanTerm(match[1]);
      return term ? { kind, term } : null;
    }
  }

  return null;
}

function normalizeMusicText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function shouldConsiderMusicResults(value) {
  const raw = String(value || "").trim();
  if (raw.length < 3 || raw.length > 120) return false;
  if (
    /^(?:[a-z][a-z0-9+.-]*:|www\.)|[%#{}[\]<>/=\\]/i.test(raw) ||
    NON_MUSIC_INTENT.test(raw) ||
    NON_MUSIC_QUERY.test(raw)
  ) {
    return false;
  }
  const words = normalizeMusicText(raw).split(/\s+/).filter(Boolean);
  return words.length >= 2 && words.length <= 12;
}

function recordingHintFromResult(result, query) {
  let host = "";
  try {
    host = new URL(String(result?.url || ""))
      .hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  if (!RECORDING_RESULT_HOSTS.has(host)) return null;

  const title = String(result?.title || "")
    .replace(/\s+(?:[-|]\s*)?(?:lyrics?(?:\s*&\s*meaning)?|official\s+(?:audio|video)|audio|video)(?:\s*[-|].*)?$/i, "")
    .replace(/\s+[-|]\s+(?:Genius|AZLyrics(?:\.com)?|YouTube(?: Music)?|Musixmatch|SongLyrics).*$/i, "")
    .trim();
  const match = title.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (!match) return null;

  const artist = match[1].trim();
  const recordingTitle = match[2].trim();
  const normalizedQuery = ` ${normalizeMusicText(query)} `;
  const normalizedTitle = normalizeMusicText(recordingTitle);
  const artistWords = normalizeMusicText(artist).split(/\s+/).filter(Boolean);
  if (
    !normalizedTitle ||
    !normalizedQuery.includes(` ${normalizedTitle} `) ||
    !artistWords.some((word) => normalizedQuery.includes(` ${word} `))
  ) {
    return null;
  }

  return {
    kind: "recording",
    term: `${recordingTitle} ${artist}`,
    recordingTitle,
    artist,
  };
}

function parseMusicResultHint(value, results) {
  if (!shouldConsiderMusicResults(value) || !Array.isArray(results)) return null;
  for (const result of results.slice(0, 8)) {
    const hint = recordingHintFromResult(result, value);
    if (hint) return hint;
  }
  return null;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function validMbid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(value || ""),
  );
}

function artistPageUrl(id) {
  return validMbid(id)
    ? `https://musicbrainz.org/artist/${id}/discography`
    : "";
}

function entityPageUrl(kind, id) {
  if (!validMbid(id)) return "";
  const path = kind === "recording" ? "recording" : "release-group";
  return `https://musicbrainz.org/${path}/${id}`;
}

function signedCoverUrl(groupId, context) {
  if (!validMbid(groupId)) return "";
  const source = `https://coverartarchive.org/release-group/${groupId}/front-250`;
  const signer =
    typeof context?.signProxyUrl === "function"
      ? context
      : runtimeContext && typeof runtimeContext.signProxyUrl === "function"
        ? runtimeContext
        : null;
  if (!signer) return "";
  try {
    const signed = signer.signProxyUrl(source);
    return typeof signed === "string" ? signed : "";
  } catch {
    return "";
  }
}

function musicBrainzPhrase(value) {
  return `"${String(value || "").replace(/([\\"])/g, "\\$1")}"`;
}

function buildSearchUrl(parsed) {
  const { kind, term } = parsed;
  const endpoint =
    kind === "artist"
      ? "artist"
      : kind === "release-group"
        ? "release-group"
        : "recording";
  const field =
    kind === "artist"
      ? "artist"
      : kind === "release-group"
        ? "releasegroup"
        : "recording";
  const url = new URL(`${MUSICBRAINZ_BASE}/${endpoint}`);
  const query =
    kind === "recording" && parsed.recordingTitle && parsed.artist
      ? `recording:${musicBrainzPhrase(parsed.recordingTitle)} AND artist:${musicBrainzPhrase(parsed.artist)}`
      : `${field}:${musicBrainzPhrase(term)}`;
  url.searchParams.set("query", query);
  url.searchParams.set("fmt", "json");
  url.searchParams.set("limit", kind === "artist" ? "5" : "8");
  return url.toString();
}

function fetchMusicBrainz(fetcher, url) {
  // ponytail: process-local queue; use a shared Valkey lease if this plugin is
  // ever deployed across multiple replicas behind one outbound IP.
  const request = musicBrainzQueue.then(async () => {
    const delay = Math.max(0, nextMusicBrainzRequestAt - Date.now());
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    nextMusicBrainzRequestAt = Date.now() + MIN_REQUEST_INTERVAL_MS;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      return await fetcher(url, {
        headers: REQUEST_HEADERS,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  });
  musicBrainzQueue = request.then(
    () => undefined,
    () => undefined,
  );
  return request;
}

function artistCreditHtml(credit) {
  const entries = Array.isArray(credit) ? credit : [];
  const names = entries
    .map((entry) => {
      const artist = entry?.artist || {};
      const name = entry?.name || artist?.name;
      if (!name) return "";
      const href = artistPageUrl(artist.id);
      return href
        ? `<a class="music-artist-link" href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(name)}</a>`
        : escapeHtml(name);
    })
    .filter(Boolean);
  return names.join(", ");
}

function formatYear(value) {
  const match = String(value || "").match(/\b(\d{4})\b/);
  return match ? match[1] : "";
}

function formatLength(value) {
  const milliseconds = Number(value);
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "";
  const seconds = Math.round(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function platformLinks(term) {
  const encoded = encodeURIComponent(term);
  return `<div class="music-links" aria-label="Music services">
    <a class="music-pill" href="https://open.spotify.com/search/${encoded}" target="_blank" rel="noopener"><svg class="music-service-icon music-service-icon-spotify" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg><span>Spotify</span></a>
    <a class="music-pill" href="https://music.apple.com/us/search?term=${encoded}" target="_blank" rel="noopener"><svg class="music-service-icon music-service-icon-apple" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 00-1.877-.726 10.496 10.496 0 00-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026-.747.043-1.49.123-2.193.4-1.336.53-2.3 1.452-2.865 2.78-.192.448-.292.925-.363 1.408-.056.392-.088.785-.1 1.18 0 .032-.007.062-.01.093v12.223c.01.14.017.283.027.424.05.815.154 1.624.497 2.373.65 1.42 1.738 2.353 3.234 2.801.42.127.856.187 1.293.228.555.053 1.11.06 1.667.06h11.03a12.5 12.5 0 001.57-.1c.822-.106 1.596-.35 2.295-.81a5.046 5.046 0 001.88-2.207c.186-.42.293-.87.37-1.324.113-.675.138-1.358.137-2.04-.002-3.8 0-7.595-.003-11.393zm-6.423 3.99v5.712c0 .417-.058.827-.244 1.206-.29.59-.76.962-1.388 1.14-.35.1-.706.157-1.07.173-.95.045-1.773-.6-1.943-1.536a1.88 1.88 0 011.038-2.022c.323-.16.67-.25 1.018-.324.378-.082.758-.153 1.134-.24.274-.063.457-.23.51-.516a.904.904 0 00.02-.193c0-1.815 0-3.63-.002-5.443a.725.725 0 00-.026-.185c-.04-.15-.15-.243-.304-.234-.16.01-.318.035-.475.066-.76.15-1.52.303-2.28.456l-2.325.47-1.374.278c-.016.003-.032.01-.048.013-.277.077-.377.203-.39.49-.002.042 0 .086 0 .13-.002 2.602 0 5.204-.003 7.805 0 .42-.047.836-.215 1.227-.278.64-.77 1.04-1.434 1.233-.35.1-.71.16-1.075.172-.96.036-1.755-.6-1.92-1.544-.14-.812.23-1.685 1.154-2.075.357-.15.73-.232 1.108-.31.287-.06.575-.116.86-.177.383-.083.583-.323.6-.714v-.15c0-2.96 0-5.922.002-8.882 0-.123.013-.25.042-.37.07-.285.273-.448.546-.518.255-.066.515-.112.774-.165.733-.15 1.466-.296 2.2-.444l2.27-.46c.67-.134 1.34-.27 2.01-.403.22-.043.442-.088.663-.106.31-.025.523.17.554.482.008.073.012.148.012.223.002 1.91.002 3.822 0 5.732z"/></svg><span>Apple Music</span></a>
    <a class="music-pill" href="https://www.deezer.com/search/${encoded}" target="_blank" rel="noopener"><svg class="music-service-icon music-service-icon-deezer" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M.693 10.024c.381 0 .693-1.256.693-2.807 0-1.55-.312-2.807-.693-2.807C.312 4.41 0 5.666 0 7.217s.312 2.808.693 2.808ZM21.038 1.56c-.364 0-.684.805-.91 2.096C19.765 1.446 19.184 0 18.526 0c-.78 0-1.464 2.036-1.784 5-.312-2.158-.788-3.536-1.325-3.536-.745 0-1.386 2.704-1.62 6.472-.442-1.932-1.083-3.145-1.793-3.145s-1.35 1.213-1.793 3.145c-.242-3.76-.874-6.463-1.628-6.463-.537 0-1.013 1.378-1.325 3.535C6.938 2.036 6.262 0 5.474 0c-.658 0-1.247 1.447-1.602 3.665-.217-1.291-.546-2.105-.91-2.105-.675 0-1.221 2.807-1.221 6.272 0 3.466.546 6.273 1.221 6.273.277 0 .537-.476.736-1.273.32 2.928.996 4.938 1.776 4.938.606 0 1.143-1.204 1.507-3.11.251 3.622.875 6.195 1.602 6.195.46 0 .875-1.023 1.187-2.677C10.142 21.6 11 24 12.004 24c1.005 0 1.863-2.4 2.235-5.822.312 1.654.727 2.677 1.186 2.677.728 0 1.352-2.573 1.603-6.195.364 1.906.9 3.11 1.507 3.11.78 0 1.455-2.01 1.775-4.938.208.797.46 1.273.737 1.273.675 0 1.22-2.807 1.22-6.273-.008-3.457-.553-6.272-1.23-6.272ZM23.307 10.024c.381 0 .693-1.256.693-2.807 0-1.55-.312-2.807-.693-2.807-.381 0-.693 1.256-.693 2.807s.312 2.808.693 2.808Z"/></svg><span>Deezer</span></a>
    <a class="music-pill" href="https://music.youtube.com/search?q=${encoded}" target="_blank" rel="noopener"><svg class="music-service-icon music-service-icon-youtube" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="12"/><circle cx="12" cy="12" r="6.5" fill="none" stroke="#fff" stroke-width="1.25"/><path fill="#fff" d="m10.2 8.7 5.1 3.3-5.1 3.3z"/></svg><span>YouTube Music</span></a>
  </div>`;
}

function coverHtml(group, context) {
  const imageUrl = signedCoverUrl(group?.id, context);
  if (!imageUrl) return `<div class="music-cover music-cover-empty" aria-hidden="true"></div>`;
  return `<div class="music-cover"><img src="${escapeHtml(imageUrl)}" alt="Cover art for ${escapeHtml(group?.title || "release")}" loading="lazy"></div>`;
}

function releaseGroupHtml(group, context) {
  const title = group?.title || "Untitled release";
  const href = entityPageUrl("release-group", group?.id);
  const titleHtml = href
    ? `<a class="music-release-title" href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(title)}</a>`
    : `<span class="music-release-title">${escapeHtml(title)}</span>`;
  const year = formatYear(group?.["first-release-date"]);
  const type = group?.["primary-type"] || "Release";
  const artists = artistCreditHtml(group?.["artist-credit"]);
  return `<article class="music-release">
    ${coverHtml(group, context)}
    <div class="music-release-copy">
      <div class="music-release-name">${titleHtml}</div>
      <div class="music-meta">${escapeHtml([year, type].filter(Boolean).join(" · "))}</div>
      ${artists ? `<div class="music-byline">${artists}</div>` : ""}
    </div>
  </article>`;
}

function renderArtist(payload, parsed, context) {
  const artists = Array.isArray(payload?.artists) ? payload.artists : [];
  const artist = artists[0];
  if (!artist) return "";
  const name = artist.name || parsed.term;
  const href = artistPageUrl(artist.id);
  const titleHtml = href
    ? `<a class="music-title-link" href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(name)}</a>`
    : escapeHtml(name);
  const details = [artist.type, artist.country, artist.disambiguation]
    .filter(Boolean)
    .join(" · ");
  const groups = Array.isArray(artist["release-groups"])
    ? artist["release-groups"]
    : Array.isArray(artist["release-group-list"])
      ? artist["release-group-list"]
      : [];
  const discography = groups.slice(0, 8).map((group) => releaseGroupHtml(group, context)).join("");
  return `<div class="music-heading">
    <div class="music-kicker">Artist</div>
    <h2 class="music-title">${titleHtml}</h2>
    ${details ? `<div class="music-meta">${escapeHtml(details)}</div>` : ""}
  </div>
  ${discography ? `<section class="music-section"><h3>Discography</h3><div class="music-releases">${discography}</div></section>` : ""}
  ${platformLinks(name)}`;
}

function renderReleaseGroups(payload, context) {
  const groups = Array.isArray(payload?.["release-groups"]) ? payload["release-groups"] : [];
  if (!groups.length) return "";
  return `<div class="music-heading"><div class="music-kicker">Albums</div><h2 class="music-title">Release groups</h2></div>
    <div class="music-releases">${groups.slice(0, 8).map((group) => releaseGroupHtml(group, context)).join("")}</div>
    ${platformLinks(groups[0]?.title || "")}`;
}

function selectRecording(recordings, parsed) {
  const targetTitle = normalizeMusicText(parsed.recordingTitle || parsed.term);
  const targetArtist = normalizeMusicText(parsed.artist);
  const exact = recordings.filter((recording) => {
    if (normalizeMusicText(recording?.title) !== targetTitle) return false;
    if (!targetArtist) return true;
    return (recording?.["artist-credit"] || []).some((credit) =>
      normalizeMusicText(credit?.name || credit?.artist?.name).includes(targetArtist),
    );
  });
  return exact.find((recording) => /album version/i.test(recording?.disambiguation || ""))
    || exact.find((recording) => !recording?.disambiguation)
    || exact[0]
    || recordings[0];
}

function recordingRelease(recording) {
  const releases = Array.isArray(recording?.releases) ? recording.releases : [];
  return releases.find((release) =>
    release?.status === "Official" &&
    release?.["release-group"]?.["primary-type"] === "Album",
  ) || releases.find((release) => release?.["release-group"]?.id) || null;
}

function songCoverHtml(group, title, context) {
  const imageUrl = signedCoverUrl(group?.id, context);
  if (!imageUrl) {
    return `<div class="music-song-cover music-song-cover-empty" aria-hidden="true"><span>♪</span></div>`;
  }
  return `<div class="music-song-cover"><img src="${escapeHtml(imageUrl)}" alt="Cover art for ${escapeHtml(title)}" loading="lazy"></div>`;
}

function songFact(label, value) {
  return value
    ? `<div class="music-fact"><span class="music-fact-label">${escapeHtml(label)}</span><span class="music-fact-value">${value}</span></div>`
    : "";
}

function renderRecordings(payload, parsed, context) {
  const recordings = Array.isArray(payload?.recordings) ? payload.recordings : [];
  if (!recordings.length) return "";
  const recording = selectRecording(recordings, parsed);
  const title = recording?.title || parsed.recordingTitle || parsed.term;
  const artists = artistCreditHtml(recording?.["artist-credit"])
    || escapeHtml(parsed.artist || "");
  const release = recordingRelease(recording);
  const group = release?.["release-group"] || null;
  const albumTitle = group?.title || release?.title || "";
  const albumHref = entityPageUrl("release-group", group?.id);
  const albumHtml = albumHref
    ? `<a class="music-release-title" href="${escapeHtml(albumHref)}" target="_blank" rel="noopener">${escapeHtml(albumTitle)}</a>`
    : escapeHtml(albumTitle);
  const year = formatYear(recording?.["first-release-date"] || release?.date);
  const length = formatLength(recording?.length);
  const tags = (Array.isArray(recording?.tags) ? recording.tags : [])
    .map((tag) => tag?.name)
    .filter(Boolean)
    .slice(0, 3);
  const serviceTerm = [title, parsed.artist || ""].filter(Boolean).join(" ");

  return `<article class="music-song">
    ${songCoverHtml(group, albumTitle || title, context)}
    <div class="music-song-content">
      <div class="music-kicker">Song</div>
      <h2 class="music-song-title">${escapeHtml(title)}</h2>
      ${artists ? `<div class="music-song-subtitle">Song by ${artists}</div>` : ""}
      <div class="music-facts">
        ${songFact("Artist", artists)}
        ${songFact("Album", albumTitle ? albumHtml : "")}
        ${songFact("Released", year ? escapeHtml(year) : "")}
        ${songFact("Duration", length ? escapeHtml(length) : "")}
      </div>
      ${tags.length ? `<div class="music-tags" aria-label="Genres">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
      ${platformLinks(serviceTerm)}
    </div>
  </article>`;
}

function renderRecordingHint(parsed) {
  if (!parsed.recordingTitle || !parsed.artist) return "";
  return `<article class="music-song">
    ${songCoverHtml(null, parsed.recordingTitle, null)}
    <div class="music-song-content">
      <div class="music-kicker">Song</div>
      <h2 class="music-song-title">${escapeHtml(parsed.recordingTitle)}</h2>
      <div class="music-song-subtitle">Song by ${escapeHtml(parsed.artist)}</div>
      ${platformLinks(`${parsed.recordingTitle} ${parsed.artist}`)}
    </div>
  </article>`;
}

function renderPayload(payload, parsed, context) {
  if (parsed.kind === "artist") return renderArtist(payload, parsed, context);
  if (parsed.kind === "release-group") return renderReleaseGroups(payload, context);
  return renderRecordings(payload, parsed, context);
}

function wrapTemplate(content) {
  const source = template || '<div class="music-card">{{content}}</div>';
  return source.replace(/\{\{content\}\}/g, content);
}

export const slot = {
  id: "music",
  name: "Music / Discography",
  description: "Shows song, artist, and album information from MusicBrainz.",
  isClientExposed: false,
  position: "above-results",
  slotPositions: ["above-results", "knowledge-panel"],
  waitForResults: true,

  init(ctx) {
    runtimeContext = ctx || null;
    template = ctx?.template || "";
    if (typeof ctx?.fetch === "function") runtimeFetch = ctx.fetch.bind(ctx);
    musicCache = createExtensionCache(ctx, "music", CACHE_TTL_MS);
  },

  trigger(query) {
    return Boolean(parseMusicQuery(query)) || shouldConsiderMusicResults(query);
  },

  async execute(query, context) {
    const explicit = parseMusicQuery(query);
    const resultHint = parseMusicResultHint(query, context?.results);
    const parsed =
      explicit?.kind === "recording" && resultHint
        ? { ...explicit, recordingTitle: resultHint.recordingTitle, artist: resultHint.artist }
        : explicit || resultHint;
    if (!parsed) return { title: "", html: "" };

    const fallback = renderRecordingHint(parsed);

    const doFetch =
      typeof context?.fetch === "function" ? context.fetch.bind(context) : runtimeFetch;
    if (typeof doFetch !== "function") {
      return { title: "", html: fallback ? wrapTemplate(fallback) : "" };
    }

    try {
      const key = [
        parsed.kind,
        parsed.recordingTitle || parsed.term,
        parsed.artist,
      ].filter(Boolean).join(":").toLowerCase();
      let payload = await cacheGet(musicCache, key);
      if (!payload) {
        const response = await fetchMusicBrainz(
          doFetch,
          buildSearchUrl(parsed),
        );
        if (!response?.ok) {
          return { title: "", html: fallback ? wrapTemplate(fallback) : "" };
        }
        payload = await response.json();
        if (!payload || typeof payload !== "object") {
          return { title: "", html: fallback ? wrapTemplate(fallback) : "" };
        }
        await cacheSet(musicCache, key, payload, CACHE_TTL_MS);
      }

      const content = renderPayload(payload, parsed, context) || fallback;
      return content ? { title: "", html: wrapTemplate(content) } : { title: "", html: "" };
    } catch {
      return { title: "", html: fallback ? wrapTemplate(fallback) : "" };
    }
  },
};

export default slot;
