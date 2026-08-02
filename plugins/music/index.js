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
  /\b(?:books?|isbn|doi|papers?|weather|forecast|stocks?|prices?|maps?|near\s+me|movies?|tv|recipes?|translate|calculator|convert|define|definition)\b/i;
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
  if (/^(?:https?:\/\/|www\.)/i.test(raw) || NON_MUSIC_INTENT.test(raw)) return false;
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
    <a class="music-pill" href="https://open.spotify.com/search/${encoded}" target="_blank" rel="noopener">Spotify</a>
    <a class="music-pill" href="https://music.apple.com/us/search?term=${encoded}" target="_blank" rel="noopener">Apple Music</a>
    <a class="music-pill" href="https://www.deezer.com/search/${encoded}" target="_blank" rel="noopener">Deezer</a>
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
  position: "full-width-above-results",
  slotPositions: ["full-width-above-results", "knowledge-panel"],
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
