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

function buildSearchUrl(kind, term) {
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
  url.searchParams.set("query", `${field}:${term}`);
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
  return `<div class="music-links" aria-label="Listen elsewhere">
    <a class="music-pill" href="https://music.apple.com/us/search?term=${encoded}" target="_blank" rel="noopener">Apple Music</a>
    <a class="music-pill" href="https://www.deezer.com/search/${encoded}" target="_blank" rel="noopener">Deezer</a>
    <a class="music-pill" href="https://open.spotify.com/search/${encoded}" target="_blank" rel="noopener">Spotify</a>
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
  ${discography ? `<section class="music-section"><h3>Discography</h3><div class="music-releases">${discography}</div></section>` : `<p class="music-note">Open the artist name for the full discography.</p>`}
  ${platformLinks(name)}`;
}

function renderReleaseGroups(payload, context) {
  const groups = Array.isArray(payload?.["release-groups"]) ? payload["release-groups"] : [];
  if (!groups.length) return "";
  return `<div class="music-heading"><div class="music-kicker">Albums</div><h2 class="music-title">Release groups</h2></div>
    <div class="music-releases">${groups.slice(0, 8).map((group) => releaseGroupHtml(group, context)).join("")}</div>
    ${platformLinks(groups[0]?.title || "")}`;
}

function renderRecordings(payload, context) {
  const recordings = Array.isArray(payload?.recordings) ? payload.recordings : [];
  if (!recordings.length) return "";
  const rows = recordings.slice(0, 8).map((recording) => {
    const title = recording?.title || "Untitled track";
    const href = entityPageUrl("recording", recording?.id);
    const titleHtml = href
      ? `<a class="music-release-title" href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(title)}</a>`
      : `<span class="music-release-title">${escapeHtml(title)}</span>`;
    const artists = artistCreditHtml(recording?.["artist-credit"]);
    const length = formatLength(recording?.length);
    return `<article class="music-track"><div><div class="music-release-name">${titleHtml}</div>${artists ? `<div class="music-byline">${artists}</div>` : ""}</div><span class="music-meta">${escapeHtml(length)}</span></article>`;
  }).join("");
  return `<div class="music-heading"><div class="music-kicker">Tracks</div><h2 class="music-title">Recording matches</h2></div><div class="music-tracks">${rows}</div>${platformLinks(recordings[0]?.title || "")}`;
}

function renderPayload(payload, parsed, context) {
  if (parsed.kind === "artist") return renderArtist(payload, parsed, context);
  if (parsed.kind === "release-group") return renderReleaseGroups(payload, context);
  return renderRecordings(payload, context);
}

function wrapTemplate(content) {
  const source = template || '<div class="music-card">{{content}}</div>';
  return source.replace(/\{\{content\}\}/g, content);
}

export const slot = {
  id: "music",
  name: "Music / Discography",
  description: "Shows MusicBrainz artist, album, and track matches for explicit music searches.",
  isClientExposed: false,
  position: "full-width-above-results",
  slotPositions: ["full-width-above-results", "knowledge-panel"],

  init(ctx) {
    runtimeContext = ctx || null;
    template = ctx?.template || "";
    if (typeof ctx?.fetch === "function") runtimeFetch = ctx.fetch.bind(ctx);
    musicCache = createExtensionCache(ctx, "music", CACHE_TTL_MS);
  },

  trigger(query) {
    return Boolean(parseMusicQuery(query));
  },

  async execute(query, context) {
    const parsed = parseMusicQuery(query);
    if (!parsed) return { title: "", html: "" };

    const doFetch =
      typeof context?.fetch === "function" ? context.fetch.bind(context) : runtimeFetch;
    if (typeof doFetch !== "function") return { title: "", html: "" };

    try {
      const key = `${parsed.kind}:${parsed.term.toLowerCase()}`;
      let payload = await cacheGet(musicCache, key);
      if (!payload) {
        const response = await fetchMusicBrainz(
          doFetch,
          buildSearchUrl(parsed.kind, parsed.term),
        );
        if (!response?.ok) return { title: "", html: "" };
        payload = await response.json();
        if (!payload || typeof payload !== "object") return { title: "", html: "" };
        await cacheSet(musicCache, key, payload, CACHE_TTL_MS);
      }

      const content = renderPayload(payload, parsed, context);
      return content ? { title: "", html: wrapTemplate(content) } : { title: "", html: "" };
    } catch {
      return { title: "", html: "" };
    }
  },
};

export default slot;
