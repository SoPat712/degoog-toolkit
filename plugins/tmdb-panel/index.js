// ── TMDB Panel — compact knowledge-panel / sidebar slot ─────────────────────
// Companion to the main TMDB plugin. Renders a compact sidebar card for
// movies, TV shows, and actors. Uses the main plugin's stored API key by
// sharing settingsId: "slot-tmdb-trankil".

let _apiKey = "";
const _IMAGE_BASE = "https://image.tmdb.org/t/p/";

// ── Shared patterns (mirrored from main tmdb plugin) ─────────────────────────
const TMDB_PATTERN =
  /themoviedb\.org\/(movie|tv|person)\/(\d+)/i;
const IMDB_TITLE_PATTERN = /imdb\.com\/title\/(tt\d+)/i;
const IMDB_NAME_PATTERN = /imdb\.com\/name\/(nm\d+)/i;
const MEDIA_KEYWORDS =
  /\b(movie|film|series|show|actor|actress|director|cast|watch|trailer|season|episode|imdb|rotten|letterboxd)\b/i;
const NON_MEDIA_PATTERN =
  /^(weather|temperature|forecast|convert|currency|score|sports|standings|results|news|stock|price|recipe|how to|tutorial|code|programming|syntax|define|meaning|translate|calculator|map|directions)\b/i;

// ── Helpers ──────────────────────────────────────────────────────────────────
const _spEsc = (s) =>
  String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const _spImg = (path, size) => {
  if (!path) return "";
  const p = path.startsWith("http") ? path : `${_IMAGE_BASE}${size}${path}`;
  return _spEsc(p);
};

const _spFmt = (mins) => {
  if (!mins) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
};

async function _spFetch(endpoint, ctx) {
  const base = "https://api.themoviedb.org/3/";
  const sep = endpoint.includes("?") ? "&" : "?";
  const url = `${base}${endpoint}${sep}api_key=${_apiKey}`;
  const fetchFn = ctx?.fetch || fetch;
  const res = await fetchFn(url);
  if (!res.ok) return null;
  return res.json();
}

// ── URL-based detection from search results ───────────────────────────────────
function _spDetectFromResults(results) {
  if (!Array.isArray(results)) return null;
  for (const r of results) {
    const url = r.url || "";
    const tmdbMatch = TMDB_PATTERN.exec(url);
    if (tmdbMatch) return { source: "tmdb", type: tmdbMatch[1], id: tmdbMatch[2] };
    const imdbTitle = IMDB_TITLE_PATTERN.exec(url);
    if (imdbTitle) return { source: "imdb", imdbId: imdbTitle[1], type: "movie_or_tv" };
    const imdbName = IMDB_NAME_PATTERN.exec(url);
    if (imdbName) return { source: "imdb_name", imdbId: imdbName[1], type: "person" };
  }
  return null;
}

// ── NLP query resolution (simplified) ────────────────────────────────────────
async function _spResolveQuery(query, ctx) {
  const q = (query || "").trim().toLowerCase();
  if (q.length < 2) return null;

  // Strip media keywords for a cleaner search term
  const cleanQ = query
    .replace(/\b(movie|film|series|show|watch|trailer|actor|actress|director)\b/gi, "")
    .trim();
  const searchTerm = cleanQ || query;

  const multi = await _spFetch(`search/multi?query=${encodeURIComponent(searchTerm)}&page=1`, ctx);
  if (!multi?.results?.length) return null;

  // Pick the best match: exact/partial title match with decent popularity
  const mediaItems = multi.results.filter(
    (r) => (r.media_type === "movie" || r.media_type === "tv" || r.media_type === "person") && r.popularity > 2,
  );
  if (!mediaItems.length) return null;

  const qLow = query.toLowerCase().replace(/\s+/g, " ").trim();
  const exact = mediaItems.find((r) => {
    const t = ((r.title || r.name || "").toLowerCase());
    return t === qLow || t.startsWith(qLow);
  });
  const item = exact || mediaItems[0];
  return { type: item.media_type, id: String(item.id) };
}

// ── Resolve detected entity ───────────────────────────────────────────────────
async function _spResolveDetected(detected, ctx) {
  if (!detected) return null;

  if (detected.source === "tmdb") {
    return { type: detected.type, id: detected.id };
  }

  if (detected.source === "imdb" || detected.source === "imdb_name") {
    const type = detected.type === "person" ? "person" : "movie_or_tv";
    if (type === "person") {
      const res = await _spFetch(`find/${detected.imdbId}?external_source=imdb_id`, ctx);
      const person = res?.person_results?.[0];
      if (person) return { type: "person", id: String(person.id) };
    } else {
      const res = await _spFetch(`find/${detected.imdbId}?external_source=imdb_id`, ctx);
      const movie = res?.movie_results?.[0];
      const tv = res?.tv_results?.[0];
      const item = movie || tv;
      if (item) return { type: movie ? "movie" : "tv", id: String(item.id) };
    }
  }
  return null;
}

// ── Compact renderers ─────────────────────────────────────────────────────────
const _spRatingHtml = (voteAverage) => {
  if (!voteAverage || voteAverage < 0.1) return "";
  const score = parseFloat(voteAverage).toFixed(1);
  return (
    `<div class="tmdb-sp-rating">` +
    `<span class="tmdb-sp-rating-badge">IMDb</span>` +
    `<span class="tmdb-sp-rating-score">${score}</span>` +
    `<span class="tmdb-sp-rating-unit">\u202f/10</span>` +
    `</div>`
  );
};

const _spFactRow = (label, value) =>
  value
    ? `<div class="tmdb-sp-fact-row">` +
      `<span class="tmdb-sp-fact-label">${_spEsc(label)}</span>` +
      `<span class="tmdb-sp-fact-value">${_spEsc(String(value))}</span>` +
      `</div>`
    : "";

const _spRenderMovie = (details, credits) => {
  const title = _spEsc(details.title || details.name || "");
  const year = _spEsc((details.release_date || "").slice(0, 4));
  const overview = details.overview || "";
  const tmdbHref = _spEsc(`https://www.themoviedb.org/movie/${details.id}`);
  const posterUrl = _spImg(details.poster_path, "w185");
  const genres = (details.genres || []).map((g) => g.name).join(", ");
  const runtime = _spFmt(details.runtime);
  const director = (credits?.crew || [])
    .filter((c) => c.job === "Director")
    .map((c) => c.name)
    .join(", ");
  const overviewShort =
    overview.length > 240
      ? overview.slice(0, 240).replace(/\s\S+$/, "") + "\u2026"
      : overview;
  const subParts = [genres, runtime].filter(Boolean);

  return (
    `<div class="tmdb-sp-panel">` +
    `<div class="tmdb-sp-header">` +
    `<a href="${tmdbHref}" target="_blank" rel="noopener" class="tmdb-sp-title-link">` +
    `<h4 class="tmdb-sp-title">${title}` +
    (year ? ` <span class="tmdb-sp-year">(${year})</span>` : "") +
    `</h4></a>` +
    (subParts.length ? `<div class="tmdb-sp-sub">${_spEsc(subParts.join(" \u00b7 "))}</div>` : "") +
    `</div>` +
    `<div class="tmdb-sp-body">` +
    (posterUrl ? `<img src="${posterUrl}" alt="" loading="lazy" class="tmdb-sp-poster">` : "") +
    `<div class="tmdb-sp-info">` +
    _spRatingHtml(details.vote_average) +
    (overviewShort ? `<p class="tmdb-sp-overview">${_spEsc(overviewShort)}</p>` : "") +
    `</div>` +
    `</div>` +
    (director ? _spFactRow("Director", director) : "") +
    _spFactRow("Genre", genres) +
    _spFactRow("Released", (details.release_date || "").slice(0, 10)) +
    `<a href="${tmdbHref}" target="_blank" rel="noopener" class="tmdb-sp-link">View on TMDB \u2192</a>` +
    `</div>`
  );
};

const _spRenderTv = (details, credits) => {
  const name = _spEsc(details.name || "");
  const year = _spEsc((details.first_air_date || "").slice(0, 4));
  const overview = details.overview || "";
  const tmdbHref = _spEsc(`https://www.themoviedb.org/tv/${details.id}`);
  const posterUrl = _spImg(details.poster_path, "w185");
  const genres = (details.genres || []).map((g) => g.name).join(", ");
  const createdBy = (details.created_by || []).map((c) => c.name).join(", ");
  const seasons = details.number_of_seasons
    ? `${details.number_of_seasons} season${details.number_of_seasons !== 1 ? "s" : ""}`
    : "";
  const overviewShort =
    overview.length > 240
      ? overview.slice(0, 240).replace(/\s\S+$/, "") + "\u2026"
      : overview;
  const subParts = [genres, seasons].filter(Boolean);

  return (
    `<div class="tmdb-sp-panel">` +
    `<div class="tmdb-sp-header">` +
    `<a href="${tmdbHref}" target="_blank" rel="noopener" class="tmdb-sp-title-link">` +
    `<h4 class="tmdb-sp-title">${name}` +
    (year ? ` <span class="tmdb-sp-year">(${year})</span>` : "") +
    `</h4></a>` +
    (subParts.length ? `<div class="tmdb-sp-sub">${_spEsc(subParts.join(" \u00b7 "))}</div>` : "") +
    `</div>` +
    `<div class="tmdb-sp-body">` +
    (posterUrl ? `<img src="${posterUrl}" alt="" loading="lazy" class="tmdb-sp-poster">` : "") +
    `<div class="tmdb-sp-info">` +
    _spRatingHtml(details.vote_average) +
    (overviewShort ? `<p class="tmdb-sp-overview">${_spEsc(overviewShort)}</p>` : "") +
    `</div>` +
    `</div>` +
    (createdBy ? _spFactRow("Created by", createdBy) : "") +
    _spFactRow("Genre", genres) +
    _spFactRow("First aired", (details.first_air_date || "").slice(0, 10)) +
    (details.number_of_episodes ? _spFactRow("Episodes", String(details.number_of_episodes)) : "") +
    `<a href="${tmdbHref}" target="_blank" rel="noopener" class="tmdb-sp-link">View on TMDB \u2192</a>` +
    `</div>`
  );
};

const _spRenderPerson = (details, credits) => {
  const name = _spEsc(details.name || "");
  const knownFor = _spEsc(details.known_for_department || "");
  const birthday = _spEsc(details.birthday || "");
  const tmdbHref = _spEsc(`https://www.themoviedb.org/person/${details.id}`);
  const photoUrl = _spImg(details.profile_path, "w185");
  const bio = typeof details.biography === "string" ? details.biography : "";
  const bioShort =
    bio.length > 220
      ? bio.slice(0, 220).replace(/\s\S+$/, "") + "\u2026"
      : bio;
  const knownForMovies = (credits?.cast || [])
    .filter((c) => c.media_type === "movie" && c.title)
    .slice(0, 3)
    .map((c) => _spEsc(c.title || ""))
    .join(", ");

  return (
    `<div class="tmdb-sp-panel">` +
    `<div class="tmdb-sp-header">` +
    `<a href="${tmdbHref}" target="_blank" rel="noopener" class="tmdb-sp-title-link">` +
    `<h4 class="tmdb-sp-title">${name}</h4>` +
    `</a>` +
    (knownFor ? `<div class="tmdb-sp-sub">${knownFor}</div>` : "") +
    `</div>` +
    `<div class="tmdb-sp-body">` +
    (photoUrl ? `<img src="${photoUrl}" alt="" loading="lazy" class="tmdb-sp-poster tmdb-sp-poster--person">` : "") +
    `<div class="tmdb-sp-info">` +
    (bioShort ? `<p class="tmdb-sp-overview">${_spEsc(bioShort)}</p>` : "") +
    `</div>` +
    `</div>` +
    (birthday ? _spFactRow("Born", birthday) : "") +
    (knownForMovies ? _spFactRow("Known for", knownForMovies) : "") +
    `<a href="${tmdbHref}" target="_blank" rel="noopener" class="tmdb-sp-link">View on TMDB \u2192</a>` +
    `</div>`
  );
};

// ── Slot export ───────────────────────────────────────────────────────────────
export const slot = {
  id: "tmdb-sidebar",
  name: "TMDB Panel",
  description:
    "Compact sidebar card for movies, TV shows, and actors. Appears in the knowledge panel position alongside the main TMDB slot.",
  position: "knowledge-panel",
  slotPositions: ["knowledge-panel", "above-sidebar"],
  waitForResults: true,
  // Share the main TMDB slot's stored settings (API key, etc.)
  settingsId: "slot-tmdb-trankil",

  configure(settings) {
    _apiKey = (settings?.apiKey || "").trim();
  },

  trigger(query) {
    const q = (query || "").trim();
    if (q.length < 2 || q.length > 150) return false;
    if (NON_MEDIA_PATTERN.test(q)) return false;
    return true;
  },

  async execute(query, ctx) {
    const q = (query || "").trim();
    if (q.length < 2 || q.length > 150) return { html: "" };
    if (!_apiKey) return { html: "" };
    if (NON_MEDIA_PATTERN.test(q)) return { html: "" };

    try {
      // 1) URL-based detection from search results
      let entity = null;
      const detected = _spDetectFromResults(ctx?.results);
      if (detected) {
        entity = await _spResolveDetected(detected, ctx);
      }

      // 2) NLP fallback
      if (!entity) {
        entity = await _spResolveQuery(q, ctx);
      }

      if (!entity) return { html: "" };

      const { type, id } = entity;
      let html = "";

      if (type === "movie") {
        const [details, credits] = await Promise.all([
          _spFetch(`movie/${id}`, ctx),
          _spFetch(`movie/${id}/credits`, ctx),
        ]);
        if (!details) return { html: "" };
        html = _spRenderMovie(details, credits);
      } else if (type === "tv") {
        const [details, credits] = await Promise.all([
          _spFetch(`tv/${id}`, ctx),
          _spFetch(`tv/${id}/credits`, ctx),
        ]);
        if (!details) return { html: "" };
        html = _spRenderTv(details, credits);
      } else if (type === "person") {
        const [details, credits] = await Promise.all([
          _spFetch(`person/${id}`, ctx),
          _spFetch(`person/${id}/combined_credits`, ctx),
        ]);
        if (!details) return { html: "" };
        html = _spRenderPerson(details, credits);
      }

      if (!html) return { html: "" };
      return { html };
    } catch {
      return { html: "" };
    }
  },
};
