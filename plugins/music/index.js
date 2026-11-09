import { findLyrics, lyricsIdentity, lyricsSectionHtml } from "./lyrics.mjs";
import { normalizeMusicText, streamingRecordingHint } from "./result-hints.mjs";

const MUSICBRAINZ_BASE = "https://musicbrainz.org/ws/2";
const CACHE_TTL_MS = 10 * 60 * 1000;
const DISCOGRAPHY_TTL_MS = 24 * 60 * 60 * 1000;
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
let lyricsRoute = "";
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

// Words that form everyday compounds with a keyword: "world record", "photo album",
// "race track". They block the whole term and, for that keyword, its last word.
const RECORD_COMPOUNDS = new Set([
  "academic", "arrest", "birth", "court", "criminal", "death", "dental", "driving",
  "employment", "financial", "guinness", "health", "hospital", "marriage", "medical",
  "military", "patient", "personal", "police", "public", "school", "student", "tax",
  "track", "vital", "world",
]);
const ALBUM_COMPOUNDS = new Set([
  "baby", "camera", "digital", "family", "memory", "photo", "photos", "picture",
  "pictures", "scrapbook", "shared", "stamp", "sticker", "wedding",
]);
const TRACK_COMPOUNDS = new Set([
  "bike", "bmx", "dirt", "fast", "fitness", "habit", "kart", "period", "race", "racing",
  "rail", "railroad", "running", "ski", "sleep", "train", "ups",
]);
// A whole term that is a topic rather than a name: "record player", "music theory",
// "love songs".
const NON_MUSIC_TERMS = new Set([
  ...RECORD_COMPOUNDS, ...ALBUM_COMPOUNDS, ...TRACK_COMPOUNDS,
  "app", "apps", "box", "classes", "degree", "download", "education", "festival",
  "festivals", "flight", "history", "industry", "label", "labels", "lesson", "lessons",
  "license", "licensing", "lighting", "management", "notation", "order", "pants",
  "player", "players", "portfolio", "production", "residency", "saw", "screen", "shop",
  "stand", "statement", "store", "streaming", "studio", "suit", "teacher", "theory",
  "therapy", "video", "videos",
  "best", "birthday", "christmas", "funny", "greatest", "happy", "high", "kids", "latest",
  "love", "low", "new", "party", "popular", "sad", "top", "workout",
]);
// Words that make the rest of a prefix query a topic, not a name: "songs about rain".
const NON_MUSIC_LEADS = new Set([
  "about", "by", "for", "from", "like", "of", "that", "to", "with", "without",
]);
// After "track" or "record" used as a verb: "track my package", "record a call".
const NON_MUSIC_VERB_LEADS = new Set([
  "a", "an", "and", "android", "audio", "call", "calls", "changes", "expenses", "flight",
  "flights", "gameplay", "her", "his", "iphone", "it", "location", "mac", "me", "meeting",
  "my", "order", "orders", "our", "pc", "phone", "podcast", "screen", "someone",
  "spending", "steps", "their", "this", "video", "voice", "webcam", "windows", "your",
  "zoom",
]);
// A trailing term that ends mid-phrase: "off the record", "back on track".
const NON_MUSIC_TAILS = new Set([
  "a", "an", "and", "back", "keep", "lose", "my", "of", "off", "on", "the", "your",
]);
const NON_MUSIC_TOKENS =
  /\b(?:packages?|parcels?|shipments?|fedex|usps|dhl|tracking|delivery)\b/i;

// `verb` marks keywords that are also everyday verbs ("track my order").
const PREFIX_PATTERNS = [
  { kind: "artist", pattern: /^!?\s*music\b\s+(.+)$/i },
  { kind: "artist", pattern: /^!?\s*artist\b\s+(.+)$/i },
  { kind: "artist", pattern: /^!?\s*discography\b\s+(.+)$/i },
  { kind: "release-group", pattern: /^!?\s*albums?\b\s+(.+)$/i },
  { kind: "release-group", pattern: /^!?\s*records?\b\s+(.+)$/i, verb: true },
  { kind: "recording", pattern: /^!?\s*tracks?\b\s+(.+)$/i, verb: true },
  { kind: "recording", pattern: /^!?\s*songs?\b\s+(.+)$/i },
];

const TRAILING_PATTERNS = [
  { kind: "artist", pattern: /^(.+?)\s+discography\s*[?!.,;:]*$/i },
  { kind: "release-group", pattern: /^(.+?)\s+albums?\s*[?!.,;:]*$/i, compounds: ALBUM_COMPOUNDS },
  { kind: "release-group", pattern: /^(.+?)\s+records?\s*[?!.,;:]*$/i, compounds: RECORD_COMPOUNDS },
  { kind: "recording", pattern: /^(.+?)\s+tracks?\s*[?!.,;:]*$/i, compounds: TRACK_COMPOUNDS },
  { kind: "recording", pattern: /^(.+?)\s+songs?\s*[?!.,;:]*$/i },
];

// "mirrors lyrics", "lyrics to bohemian rhapsody", "hello adele song lyrics".
const LYRICS_PATTERNS = [
  /^!?\s*lyrics\s+(?:(?:to|for|of|from)\s+)?(?:the\s+song\s+)?(.+)$/i,
  /^(.+?)\s+(?:song\s+)?lyrics\s*[?!.,;:]*$/i,
];
// Lyrics in general, lyric sites and tools rather than one song.
const NON_SONG_LYRICS =
  /\b(?:apps?|azlyrics|chords?|download|finder|generator|genius|ideas?|lyrics?|maker|meanings?|musixmatch|pdf|printable|prompts?|quiz|rap|rhymes?|search|sheet|sites?|songs|tabs|template|translations?|translator|videos?|websites?|writers?|writing|write)\b/i;

const NON_MUSIC_INTENT =
  /\b(?:books?|isbn|doi|papers?|weather|forecast|temperature|stocks?|prices?|maps?|near\s+me|movies?|tv|recipes?|translate|calculator|convert|define|definition)\b/i;
const NON_MUSIC_QUERY =
  /^(?:about:|atomic\s+number\b|days?\s+(?:since|until)|element\s+\w+\b|flip\s+(?:a\s+)?coin\b|heads\s+or\s+tails\b|hello\s+world\b|how\s+to\b|metronome\b|periodic\s+table\b|play\s+(?:minesweeper|snake|tic[\s-]?tac[\s-]?toe)\b|random\s+number\b|study\b|time\s+(?:at|for|in)\b|what(?:'s|s|\s+is)?\s+(?:the\s+)?time\b|yes\s+or\s+no\b)|^(?:minesweeper|tic[\s-]?tac[\s-]?toe)\s*[?!.,;:]*$|\b(?:algorithm|api|documentation|javascript|python|score|standings|tutorial)\b|\b(?:clock|time|time\s*zone|timezone)\s*[?!.,;:]*$|^-?\d[\d\s.,]*\s*(?:%|percent\b)|^-?\d[\d\s.,]*\s*\S+\s+(?:in|into|to|=)\s+\S+/i;

function isNonMusicTerm(term, { compounds, trailing = false, verb = false } = {}) {
  const words = normalizeMusicText(term).split(/\s+/).filter(Boolean);
  if (!words.length || NON_MUSIC_TERMS.has(words.join(" "))) return true;
  if (NON_MUSIC_TOKENS.test(term)) return true;
  // "track 1Z5R89390357567127" is a parcel: ten or more characters, eight of them digits.
  const compact = term.replace(/[\s-]+/g, "");
  if (/^[a-z0-9]{10,}$/i.test(compact) && (compact.match(/\d/g) || []).length >= 8) return true;
  const last = words[words.length - 1];
  if (trailing) return NON_MUSIC_TAILS.has(last) || Boolean(compounds?.has(last));
  return NON_MUSIC_LEADS.has(words[0]) || (verb && NON_MUSIC_VERB_LEADS.has(words[0]));
}

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
  if (NON_MUSIC_INTENT.test(raw) || NON_MUSIC_QUERY.test(raw)) return null;

  for (const pattern of LYRICS_PATTERNS) {
    const match = raw.match(pattern);
    if (match) {
      const term = cleanTerm(match[1]);
      return term && !NON_SONG_LYRICS.test(term) && !isNonMusicTerm(term)
        ? { kind: "recording", term, lyrics: true }
        : null;
    }
  }

  for (const { kind, pattern, verb } of PREFIX_PATTERNS) {
    const match = raw.match(pattern);
    if (match) {
      const term = cleanTerm(match[1]);
      return term && !isNonMusicTerm(term, { verb }) ? { kind, term } : null;
    }
  }

  for (const { kind, pattern, compounds } of TRAILING_PATTERNS) {
    const match = raw.match(pattern);
    if (match) {
      const term = cleanTerm(match[1]);
      return term && !isNonMusicTerm(term, { compounds, trailing: true }) ? { kind, term } : null;
    }
  }

  return null;
}

function shouldConsiderMusicResults(value) {
  const raw = String(value || "").trim();
  if (raw.length < 3 || raw.length > 120) return false;
  if (
    /^(?:!|[a-z][a-z0-9+.-]*:|www\.)|[%#{}[\]<>/=\\]/i.test(raw) ||
    NON_MUSIC_INTENT.test(raw) ||
    NON_MUSIC_QUERY.test(raw)
  ) {
    return false;
  }
  const words = normalizeMusicText(raw).split(/\s+/).filter(Boolean);
  return words.length >= 1 && words.length <= 12;
}

// `titleOnly` (lyrics queries) accepts a result whose song title is the whole
// query; otherwise the query must also name one of the artist's words.
function recordingHintFromResult(result, query, { titleOnly = false } = {}) {
  const streaming = streamingRecordingHint(result, query);
  if (streaming) return streaming;
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
  if (titleOnly) {
    if (!normalizedTitle || !artistWords.length || normalizedTitle !== normalizeMusicText(query)) return null;
  } else if (
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

export function parseMusicResultHint(value, results, options) {
  if (!shouldConsiderMusicResults(value) || !Array.isArray(results)) return null;
  const hints = results.slice(0, 8).map((result) => recordingHintFromResult(result, value, options)).filter(Boolean);
  const identities = new Set(hints.map((hint) => JSON.stringify([
    normalizeMusicText(hint.recordingTitle), normalizeMusicText(hint.artist),
  ])));
  return identities.size === 1 ? hints.find((hint) => hint.fromStreamingResult) || hints[0] : null;
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

// Artist search results carry no release groups, so browse them by MBID.
function buildReleaseGroupsUrl(artistId) {
  const url = new URL(`${MUSICBRAINZ_BASE}/release-group`);
  url.searchParams.set("artist", artistId);
  url.searchParams.set("type", "album|ep");
  url.searchParams.set("release-group-status", "website-default");
  url.searchParams.set("fmt", "json");
  url.searchParams.set("limit", "100");
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

async function cachedMusicBrainz(fetcher, key, url, ttlMs = CACHE_TTL_MS) {
  const cached = await cacheGet(musicCache, key);
  if (cached) return cached;
  const response = await fetchMusicBrainz(fetcher, url);
  if (!response?.ok) return null;
  const payload = await response.json();
  if (!payload || typeof payload !== "object") return null;
  await cacheSet(musicCache, key, payload, ttlMs);
  return payload;
}

/** Studio albums first, then EPs, newest first; live and compilation sets only as a fallback. */
function selectDiscography(groups) {
  const list = (Array.isArray(groups) ? groups : []).filter((group) => validMbid(group?.id));
  const studio = list.filter((group) => !(group["secondary-types"] || []).length);
  const rank = (group) => ({ Album: 0, EP: 1 })[group["primary-type"]] ?? 2;
  return (studio.length ? studio : list)
    .sort((a, b) => rank(a) - rank(b) ||
      String(b["first-release-date"] || "").localeCompare(String(a["first-release-date"] || "")))
    .slice(0, 8);
}

async function artistDiscography(payload, fetcher) {
  const id = payload?.artists?.[0]?.id;
  if (!validMbid(id)) return [];
  try {
    const browse = await cachedMusicBrainz(
      fetcher, `release-groups:${id}`, buildReleaseGroupsUrl(id), DISCOGRAPHY_TTL_MS,
    );
    return selectDiscography(browse?.["release-groups"]);
  } catch {
    return [];
  }
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
  return `<div class="music-links" aria-label="{{ t:plugin-music.services }}">
    <a class="music-pill" href="https://open.spotify.com/search/${encoded}" target="_blank" rel="noopener"><svg class="music-service-icon music-service-icon-spotify" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg><span>Spotify</span></a>
    <a class="music-pill" href="https://music.apple.com/us/search?term=${encoded}" target="_blank" rel="noopener"><svg class="music-service-icon music-service-icon-apple" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 00-1.877-.726 10.496 10.496 0 00-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026-.747.043-1.49.123-2.193.4-1.336.53-2.3 1.452-2.865 2.78-.192.448-.292.925-.363 1.408-.056.392-.088.785-.1 1.18 0 .032-.007.062-.01.093v12.223c.01.14.017.283.027.424.05.815.154 1.624.497 2.373.65 1.42 1.738 2.353 3.234 2.801.42.127.856.187 1.293.228.555.053 1.11.06 1.667.06h11.03a12.5 12.5 0 001.57-.1c.822-.106 1.596-.35 2.295-.81a5.046 5.046 0 001.88-2.207c.186-.42.293-.87.37-1.324.113-.675.138-1.358.137-2.04-.002-3.8 0-7.595-.003-11.393zm-6.423 3.99v5.712c0 .417-.058.827-.244 1.206-.29.59-.76.962-1.388 1.14-.35.1-.706.157-1.07.173-.95.045-1.773-.6-1.943-1.536a1.88 1.88 0 011.038-2.022c.323-.16.67-.25 1.018-.324.378-.082.758-.153 1.134-.24.274-.063.457-.23.51-.516a.904.904 0 00.02-.193c0-1.815 0-3.63-.002-5.443a.725.725 0 00-.026-.185c-.04-.15-.15-.243-.304-.234-.16.01-.318.035-.475.066-.76.15-1.52.303-2.28.456l-2.325.47-1.374.278c-.016.003-.032.01-.048.013-.277.077-.377.203-.39.49-.002.042 0 .086 0 .13-.002 2.602 0 5.204-.003 7.805 0 .42-.047.836-.215 1.227-.278.64-.77 1.04-1.434 1.233-.35.1-.71.16-1.075.172-.96.036-1.755-.6-1.92-1.544-.14-.812.23-1.685 1.154-2.075.357-.15.73-.232 1.108-.31.287-.06.575-.116.86-.177.383-.083.583-.323.6-.714v-.15c0-2.96 0-5.922.002-8.882 0-.123.013-.25.042-.37.07-.285.273-.448.546-.518.255-.066.515-.112.774-.165.733-.15 1.466-.296 2.2-.444l2.27-.46c.67-.134 1.34-.27 2.01-.403.22-.043.442-.088.663-.106.31-.025.523.17.554.482.008.073.012.148.012.223.002 1.91.002 3.822 0 5.732z"/></svg><span>Apple Music</span></a>
    <a class="music-pill" href="https://www.deezer.com/search/${encoded}" target="_blank" rel="noopener"><svg class="music-service-icon music-service-icon-deezer" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M.693 10.024c.381 0 .693-1.256.693-2.807 0-1.55-.312-2.807-.693-2.807C.312 4.41 0 5.666 0 7.217s.312 2.808.693 2.808ZM21.038 1.56c-.364 0-.684.805-.91 2.096C19.765 1.446 19.184 0 18.526 0c-.78 0-1.464 2.036-1.784 5-.312-2.158-.788-3.536-1.325-3.536-.745 0-1.386 2.704-1.62 6.472-.442-1.932-1.083-3.145-1.793-3.145s-1.35 1.213-1.793 3.145c-.242-3.76-.874-6.463-1.628-6.463-.537 0-1.013 1.378-1.325 3.535C6.938 2.036 6.262 0 5.474 0c-.658 0-1.247 1.447-1.602 3.665-.217-1.291-.546-2.105-.91-2.105-.675 0-1.221 2.807-1.221 6.272 0 3.466.546 6.273 1.221 6.273.277 0 .537-.476.736-1.273.32 2.928.996 4.938 1.776 4.938.606 0 1.143-1.204 1.507-3.11.251 3.622.875 6.195 1.602 6.195.46 0 .875-1.023 1.187-2.677C10.142 21.6 11 24 12.004 24c1.005 0 1.863-2.4 2.235-5.822.312 1.654.727 2.677 1.186 2.677.728 0 1.352-2.573 1.603-6.195.364 1.906.9 3.11 1.507 3.11.78 0 1.455-2.01 1.775-4.938.208.797.46 1.273.737 1.273.675 0 1.22-2.807 1.22-6.273-.008-3.457-.553-6.272-1.23-6.272ZM23.307 10.024c.381 0 .693-1.256.693-2.807 0-1.55-.312-2.807-.693-2.807-.381 0-.693 1.256-.693 2.807s.312 2.808.693 2.808Z"/></svg><span>Deezer</span></a>
    <a class="music-pill" href="https://music.youtube.com/search?q=${encoded}" target="_blank" rel="noopener"><svg class="music-service-icon music-service-icon-youtube" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="12"/><circle cx="12" cy="12" r="6.5" fill="none" stroke="#fff" stroke-width="1.25"/><path fill="#fff" d="m10.2 8.7 5.1 3.3-5.1 3.3z"/></svg><span>YouTube Music</span></a>
  </div>`;
}

function coverHtml(group, context) {
  const imageUrl = signedCoverUrl(group?.id, context);
  if (!imageUrl) return `<div class="music-cover music-cover-empty" aria-hidden="true"></div>`;
  return `<div class="music-cover"><img src="${escapeHtml(imageUrl)}" alt="{{ t:plugin-music.cover }} ${escapeHtml(group?.title || "{{ t:plugin-music.release }}")}" loading="lazy"></div>`;
}

function releaseGroupHtml(group, context) {
  const title = group?.title || "{{ t:plugin-music.untitled }}";
  const href = entityPageUrl("release-group", group?.id);
  const titleHtml = href
    ? `<a class="music-release-title" href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(title)}</a>`
    : `<span class="music-release-title">${escapeHtml(title)}</span>`;
  const year = formatYear(group?.["first-release-date"]);
  const type = group?.["primary-type"] || "{{ t:plugin-music.release }}";
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

function renderArtist(payload, parsed, context, groups) {
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
  const discography = groups.map((group) => releaseGroupHtml(group, context)).join("");
  return `<div class="music-heading">
    <div class="music-kicker">{{ t:plugin-music.artist }}</div>
    <h2 class="music-title">${titleHtml}</h2>
    ${details ? `<div class="music-meta">${escapeHtml(details)}</div>` : ""}
  </div>
  ${discography ? `<section class="music-section"><h3>{{ t:plugin-music.discography }}</h3><div class="music-releases">${discography}</div></section>` : ""}
  ${platformLinks(name)}`;
}

function renderReleaseGroups(payload, context) {
  const groups = Array.isArray(payload?.["release-groups"]) ? payload["release-groups"] : [];
  if (!groups.length) return "";
  return `<div class="music-heading"><div class="music-kicker">{{ t:plugin-music.albums }}</div><h2 class="music-title">{{ t:plugin-music.releaseGroups }}</h2></div>
    <div class="music-releases">${groups.slice(0, 8).map((group) => releaseGroupHtml(group, context)).join("")}</div>
    ${platformLinks(groups[0]?.title || "")}`;
}

function selectRecording(recordings, parsed) {
  const targetTitle = normalizeMusicText(parsed.recordingTitle || parsed.term);
  const targetArtist = normalizeMusicText(parsed.artist);
  const exact = recordings.filter((recording) => {
    if (normalizeMusicText(recording?.title) !== targetTitle) return false;
    if (!targetArtist) return true;
    const names = (recording?.["artist-credit"] || []).map((credit) => credit?.name || credit?.artist?.name || "");
    return parsed.fromStreamingResult
      ? normalizeMusicText(names.join(" ")) === targetArtist || names.some((name) => normalizeMusicText(name) === targetArtist)
      : names.some((name) => normalizeMusicText(name).includes(targetArtist));
  });
  return exact.find((recording) => /album version/i.test(recording?.disambiguation || ""))
    || exact.find((recording) => !recording?.disambiguation)
    || exact[0]
    || null;
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
  return `<div class="music-song-cover"><img src="${escapeHtml(imageUrl)}" alt="{{ t:plugin-music.cover }} ${escapeHtml(title)}" loading="lazy"></div>`;
}

function songFact(label, value) {
  return value
    ? `<div class="music-fact"><span class="music-fact-label">${escapeHtml(label)}</span><span class="music-fact-value">${value}</span></div>`
    : "";
}

/** What LRCLIB needs to match this recording: title, lead artist, album, seconds. */
function lyricsSignature(recording, parsed) {
  const credit = Array.isArray(recording?.["artist-credit"]) ? recording["artist-credit"][0] : null;
  const release = recordingRelease(recording);
  return {
    title: recording?.title || parsed.recordingTitle || parsed.term,
    artist: credit?.name || credit?.artist?.name || parsed.artist || "",
    album: release?.["release-group"]?.title || release?.title || "",
    duration: Number(recording?.length) > 0 ? Math.round(Number(recording.length) / 1000) : 0,
  };
}

function lyricsRouteSrc(signature) {
  if (!lyricsRoute || !signature.title || !signature.artist) return "";
  const params = new URLSearchParams({ track: signature.title, artist: signature.artist });
  if (signature.album) params.set("album", signature.album);
  if (signature.duration) params.set("duration", String(signature.duration));
  return `${lyricsRoute}?${params}`;
}

// Lyrics queries embed the lyrics open; other song cards load them from the
// plugin route after the card shows, so LRCLIB never delays the card.
function lyricsHtml(recording, parsed, lyrics) {
  const id = `music-lyrics-${validMbid(recording?.id) ? recording.id : "song"}`;
  if (parsed.lyrics) return lyrics?.length ? lyricsSectionHtml(lyrics, { id, open: true }) : "";
  const src = lyricsRouteSrc(lyricsSignature(recording, parsed));
  return src ? lyricsSectionHtml([], { id, src }) : "";
}

function renderRecordings(payload, parsed, context, lyrics) {
  const recordings = Array.isArray(payload?.recordings) ? payload.recordings : [];
  if (!recordings.length) return "";
  const recording = selectRecording(recordings, parsed);
  if (!recording) return "";
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
      <div class="music-kicker">{{ t:plugin-music.song }}</div>
      <h2 class="music-song-title">${escapeHtml(title)}</h2>
      ${artists ? `<div class="music-song-subtitle">{{ t:plugin-music.songBy }} ${artists}</div>` : ""}
      <div class="music-facts">
        ${songFact("{{ t:plugin-music.artist }}", artists)}
        ${songFact("{{ t:plugin-music.album }}", albumTitle ? albumHtml : "")}
        ${songFact("{{ t:plugin-music.released }}", year ? escapeHtml(year) : "")}
        ${songFact("{{ t:plugin-music.duration }}", length ? escapeHtml(length) : "")}
      </div>
      ${tags.length ? `<div class="music-tags" aria-label="{{ t:plugin-music.genres }}">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
      ${platformLinks(serviceTerm)}
    </div>
  </article>
  ${lyricsHtml(recording, parsed, lyrics)}`;
}

function renderPayload(payload, parsed, context, groups, lyrics) {
  if (parsed.kind === "artist") return renderArtist(payload, parsed, context, groups);
  if (parsed.kind === "release-group") return renderReleaseGroups(payload, context);
  return renderRecordings(payload, parsed, context, lyrics);
}

/** For a lyrics query without an artist: "song by artist", lyric-site results, then LRCLIB. */
async function lyricsQueryIdentity(parsed, results, fetcher) {
  const byArtist = parsed.term.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byArtist) return { recordingTitle: byArtist[1].trim(), artist: byArtist[2].trim() };
  const hint = parseMusicResultHint(parsed.term, results, { titleOnly: true });
  if (hint) return hint;
  return lyricsIdentity(parsed.term, fetcher, musicCache);
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
  position: "full-width-above-results",
  slotPositions: ["full-width-above-results", "knowledge-panel"],
  waitForResults: true,

  init(ctx) {
    runtimeContext = ctx || null;
    template = ctx?.template || "";
    if (typeof ctx?.fetch === "function") runtimeFetch = ctx.fetch.bind(ctx);
    musicCache = createExtensionCache(ctx, "music", CACHE_TTL_MS);
    lyricsRoute = typeof ctx?.routeUrl === "function" ? ctx.routeUrl("lyrics") : "";
  },

  trigger(query) {
    return Boolean(parseMusicQuery(query)) || shouldConsiderMusicResults(query);
  },

  async execute(query, context) {
    const explicit = parseMusicQuery(query);
    const resultHint = !explicit || explicit.kind === "recording"
      ? parseMusicResultHint(explicit?.term || query, context?.results)
      : null;
    let parsed =
      explicit?.kind === "recording" && resultHint
        ? { ...explicit, ...resultHint }
        : explicit || resultHint;
    if (!parsed) return { title: "", html: "" };

    const doFetch =
      typeof context?.fetch === "function" ? context.fetch.bind(context) : runtimeFetch;
    if (typeof doFetch !== "function") return { title: "", html: "" };

    // Result titles alone are not evidence of a song: render only a MusicBrainz match.
    try {
      if (parsed.lyrics && !(parsed.recordingTitle && parsed.artist)) {
        const identity = await lyricsQueryIdentity(parsed, context?.results, doFetch);
        if (!identity) return { title: "", html: "" };
        parsed = { ...parsed, ...identity };
      }
      const key = [
        parsed.kind,
        parsed.recordingTitle || parsed.term,
        parsed.artist,
      ].filter(Boolean).join(":").toLowerCase();
      const payload = await cachedMusicBrainz(doFetch, key, buildSearchUrl(parsed));
      if (!payload) return { title: "", html: "" };
      const groups = parsed.kind === "artist" ? await artistDiscography(payload, doFetch) : [];
      const recording = parsed.lyrics ? selectRecording(payload.recordings || [], parsed) : null;
      const lyrics = recording
        ? await findLyrics(lyricsSignature(recording, parsed), doFetch, musicCache).catch(() => null)
        : null;
      const content = renderPayload(payload, parsed, context, groups, lyrics);
      return content ? { title: "", html: wrapTemplate(content) } : { title: "", html: "" };
    } catch {
      return { title: "", html: "" };
    }
  },
};

const jsonResponse = (body, status, cacheControl = "no-store") => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": cacheControl },
});

// Song cards fetch their lyrics here after rendering; only LRCLIB is contacted.
export const routes = [
  {
    method: "get",
    path: "lyrics",
    rateLimit: true,
    handler: async (request) => {
      const params = new URL(request.url).searchParams;
      const read = (name) => String(params.get(name) || "").trim().slice(0, 200);
      const signature = { title: read("track"), artist: read("artist"), album: read("album"), duration: Number(params.get("duration")) || 0 };
      if (!signature.title || !signature.artist) return jsonResponse({ lines: [] }, 400);
      try {
        const lines = await findLyrics(signature, runtimeFetch, musicCache);
        return lines ? jsonResponse({ lines }, 200, "public, max-age=86400") : jsonResponse({ lines: [] }, 404);
      } catch {
        return jsonResponse({ lines: [] }, 502);
      }
    },
  },
];

export default slot;
