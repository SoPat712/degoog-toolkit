// ── State ─────────────────────────────────────────────────────────────────────
let tmdbApiKey = "";
let omdbApiKey = "";
let jellyfinUrl = "";
let jellyfinApiKey = "";
let template = "";

// ── Constants ─────────────────────────────────────────────────────────────────
const IMAGE_BASE = "https://image.tmdb.org/t/p";
const JELLYFIN_LOGO =
  "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons@refs/heads/main/svg/jellyfin.svg";

// ── URL Patterns ──────────────────────────────────────────────────────────────
const TMDB_PATTERN = /themoviedb\.org\/(movie|tv|person)\/(\d+)/;
const IMDB_TITLE_PATTERN = /imdb\.com\/title\/(tt\d+)/;
const IMDB_NAME_PATTERN = /imdb\.com\/name\/(nm\d+)/;
const ALLOCINE_FILM_PATTERN =
  /allocine\.fr\/film\/fichefilm[^?]*\?.*?cfilm=(\d+)|allocine\.fr\/film\/fichefilm_gen_cfilm=(\d+)/;
const ALLOCINE_SERIES_PATTERN =
  /allocine\.fr\/series\/ficheerie[^?]*\?.*?cserie=(\d+)|allocine\.fr\/series\/ficheerie_gen_cserie=(\d+)/;
const ALLOCINE_PERSON_PATTERN = /allocine\.fr\/personne\//;

// ── Natural Language Activation ───────────────────────────────────────────────
// Media-intent keywords boost confidence when the query also looks like a title.
const MEDIA_KEYWORDS =
  /\b(movie|film|show|series|cast|actor|actress|director|season|episode|trailer|anime|manga|tv|imdb|tmdb|netflix|hulu|streaming|watch|rating|review|screenplay|box\s?office|filmography|remake|sequel|prequel|dubbed|subbed|ost|soundtrack)\b/i;

// Natural query of the form "<title> cast" → treat as a cast lookup for <title>.
const CAST_PATTERN = /^(.+?)\s+cast\s*$/i;

// Queries that clearly aren't about a movie/TV/person. Short-circuit early.
const NON_MEDIA_PATTERN =
  /^(how\s|what\s(is|are|does|do)\s(a|an|the)?\s?(best\s)?(way|method|difference|meaning|purpose|reason)|why\s|where\s(can|do|is)|when\s(did|does|is|was)|can\si|should\si|how\sto|define\s|weather|recipe|price\sof|buy\s|download\s|install\s|code\s|error\s|fix\s|debug\s|www\.|https?:)/i;

const _hasMediaIntent = (query) => {
  if (MEDIA_KEYWORDS.test(query)) return true;
  if (CAST_PATTERN.test(query)) return true;
  return false;
};

// Similarity between user query and a candidate title (0..1).
const _titleSimilarity = (query, title) => {
  const q = (query || "").toLowerCase().trim();
  const t = (title || "").toLowerCase().trim();
  if (!q || !t) return 0;
  if (t === q) return 1;
  if (t.startsWith(q) || q.startsWith(t)) return 0.9;
  const qWords = q.split(/\s+/);
  const tWords = t.split(/\s+/);
  const matches = qWords.filter((w) => tWords.includes(w)).length;
  return matches / Math.max(qWords.length, tWords.length);
};

// Confidence gate so we don't show random stuff for ambiguous queries.
const _isConfidentMatch = (query, result, mediaIntent) => {
  if (!result) return false;
  const sim = _titleSimilarity(query, result.title || result.name);
  const pop = result.popularity || 0;

  if (sim >= 1 && pop >= 5) return true;
  if (sim >= 0.9 && pop >= 15) return true;
  if (sim >= 0.7 && pop >= 40) return true;
  if (mediaIntent && sim >= 0.9) return true;
  if (mediaIntent && sim >= 0.7 && pop >= 10) return true;
  return false;
};

const _stripMediaKeywords = (query) => {
  return query
    .replace(MEDIA_KEYWORDS, "")
    .replace(/\s{2,}/g, " ")
    .trim();
};

const _parseQuery = (query) => {
  const q = (query || "").trim();
  const castMatch = q.match(CAST_PATTERN);
  if (castMatch) return { intent: "cast", term: castMatch[1].trim() };
  return { intent: "search", term: q };
};

// ── Utilities ─────────────────────────────────────────────────────────────────
const _esc = (s) => {
  if (typeof s !== "string") return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
};

const _imgUrl = (path, size) => {
  if (!path || typeof path !== "string") return "";
  const p = path.trim();
  if (!p) return "";
  return `${IMAGE_BASE}/${size}${p.startsWith("/") ? p : "/" + p}`;
};

// Use callback replacement to avoid issues with $ in content (lyrics-style)
const _render = (data) => {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] ?? "");
};

const _formatRuntime = (mins) => {
  if (!mins) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
};

const _ratingStr = (vote) => {
  if (!vote) return "";
  return `${Math.round(vote * 10) / 10}\u202F/\u202F10`;
};

// ── TMDB API ──────────────────────────────────────────────────────────────────
const _tmdb = async (path, ctx) => {
  const base = "https://api.themoviedb.org/3";
  const sep = path.includes("?") ? "&" : "?";
  const url = `${base}/${path}${sep}api_key=${encodeURIComponent(tmdbApiKey)}&language=en-US`;
  const fetchFn = ctx?.fetch || fetch;
  const res = await fetchFn(url);
  if (!res.ok) return null;
  return res.json();
};

// OMDb (Open Movie Database) — optional; supplies IMDb + Rotten Tomatoes when
// TMDB external_ids includes an IMDb id. https://www.omdbapi.com/
const _omdbFetch = async (query, ctx) => {
  if (!omdbApiKey) return null;
  try {
    const fetchFn = ctx?.fetch || fetch;
    const u = new URL("https://www.omdbapi.com/");
    u.searchParams.set("apikey", omdbApiKey);
    u.searchParams.set("r", "json");
    if (query.i) {
      u.searchParams.set("i", String(query.i));
    } else if (query.t) {
      u.searchParams.set("t", String(query.t));
      if (query.y) u.searchParams.set("y", String(query.y));
      if (query.type) u.searchParams.set("type", String(query.type));
    } else {
      return null;
    }
    const res = await fetchFn(u.toString());
    if (!res.ok) return null;
    const json = await res.json();
    if (!json || json.Response === "False") return null;
    return json;
  } catch {
    return null;
  }
};

const _parseOmdbRatings = (data) => {
  if (!data || !Array.isArray(data.Ratings)) return null;
  let imdb = null;
  let rottenTomatoes = null;
  for (const r of data.Ratings) {
    if (r.Source === "Internet Movie Database") imdb = r.Value || null;
    if (r.Source === "Rotten Tomatoes") rottenTomatoes = r.Value || null;
  }
  if (!imdb && !rottenTomatoes) return null;
  return { imdb, rottenTomatoes };
};

// ── URL Detection ─────────────────────────────────────────────────────────────
const _detectFromResults = (results) => {
  if (!Array.isArray(results)) return null;

  let imdbTitle = null;
  let imdbName = null;
  let allocineFilm = null;
  let allocineSeries = null;
  let allocinePerson = false;

  for (const r of results) {
    const url = typeof r.url === "string" ? r.url : "";

    // TMDB has highest priority — return immediately on first hit
    const tmdbMatch = url.match(TMDB_PATTERN);
    if (tmdbMatch) {
      return { source: "tmdb", type: tmdbMatch[1], id: tmdbMatch[2] };
    }

    if (!imdbTitle) {
      const m = url.match(IMDB_TITLE_PATTERN);
      if (m) imdbTitle = { source: "imdb_title", imdbId: m[1] };
    }
    if (!imdbName) {
      const m = url.match(IMDB_NAME_PATTERN);
      if (m) imdbName = { source: "imdb_name", imdbId: m[1] };
    }
    if (!allocineFilm) {
      const m = url.match(ALLOCINE_FILM_PATTERN);
      if (m)
        allocineFilm = { source: "allocine_film", allocineId: m[1] || m[2] };
    }
    if (!allocineSeries) {
      const m = url.match(ALLOCINE_SERIES_PATTERN);
      if (m)
        allocineSeries = {
          source: "allocine_series",
          allocineId: m[1] || m[2],
        };
    }
    if (!allocinePerson && ALLOCINE_PERSON_PATTERN.test(url)) {
      allocinePerson = true;
    }
  }

  // Return by priority: IMDB > Allocine
  if (imdbTitle) return imdbTitle;
  if (imdbName) return imdbName;
  if (allocineFilm) return allocineFilm;
  if (allocineSeries) return allocineSeries;
  if (allocinePerson) return { source: "allocine_person" };

  return null;
};

// ── Entity Resolution ─────────────────────────────────────────────────────────
const _resolveEntity = async (detected, query, ctx) => {
  try {
    // Direct TMDB URL
    if (detected.source === "tmdb") {
      return { type: detected.type, id: parseInt(detected.id, 10) };
    }

    // IMDB title → find movie or TV
    if (detected.source === "imdb_title") {
      const data = await _tmdb(
        `find/${encodeURIComponent(detected.imdbId)}?external_source=imdb_id`,
        ctx,
      );
      const movie = (data?.movie_results || [])[0];
      const tv = (data?.tv_results || [])[0];
      const result = movie || tv;
      if (!result) return null;
      return { type: movie ? "movie" : "tv", id: result.id };
    }

    // IMDB name → find person
    if (detected.source === "imdb_name") {
      const data = await _tmdb(
        `find/${encodeURIComponent(detected.imdbId)}?external_source=imdb_id`,
        ctx,
      );
      const person = (data?.person_results || [])[0];
      if (!person) return null;
      return { type: "person", id: person.id };
    }

    // Allocine film — try allocine_id lookup, then fall back to query search
    if (detected.source === "allocine_film") {
      if (detected.allocineId) {
        const data = await _tmdb(
          `find/${encodeURIComponent(detected.allocineId)}?external_source=allocine_id`,
          ctx,
        );
        const movie = (data?.movie_results || [])[0];
        const tv = (data?.tv_results || [])[0];
        const result = movie || tv;
        if (result) return { type: movie ? "movie" : "tv", id: result.id };
      }
      // Fallback to query search
      const multi = await _tmdb(
        `search/multi?query=${encodeURIComponent(query)}`,
        ctx,
      );
      const item = (multi?.results || []).find(
        (r) => r.media_type === "movie" || r.media_type === "tv",
      );
      if (!item) return null;
      return { type: item.media_type, id: item.id };
    }

    // Allocine series — same pattern
    if (detected.source === "allocine_series") {
      if (detected.allocineId) {
        const data = await _tmdb(
          `find/${encodeURIComponent(detected.allocineId)}?external_source=allocine_id`,
          ctx,
        );
        const tv = (data?.tv_results || [])[0];
        const movie = (data?.movie_results || [])[0];
        const result = tv || movie;
        if (result) return { type: tv ? "tv" : "movie", id: result.id };
      }
      const multi = await _tmdb(
        `search/multi?query=${encodeURIComponent(query)}`,
        ctx,
      );
      const item = (multi?.results || []).find(
        (r) => r.media_type === "tv" || r.media_type === "movie",
      );
      if (!item) return null;
      return { type: item.media_type, id: item.id };
    }

    // Allocine person page or generic fallback — query search
    const multi = await _tmdb(
      `search/multi?query=${encodeURIComponent(query)}`,
      ctx,
    );
    const results = multi?.results || [];
    const person = results.find((r) => r.media_type === "person");
    const media = results.find(
      (r) => r.media_type === "movie" || r.media_type === "tv",
    );
    const first = person || media;
    if (!first) return null;
    return { type: first.media_type, id: first.id };
  } catch {
    return null;
  }
};

// Fallback: resolve an entity directly from the natural-language query by
// querying TMDB's multi-search and applying a confidence gate.
const _resolveFromQuery = async (query, ctx) => {
  const { intent, term } = _parseQuery(query);
  if (!term) return null;

  const searchTerm = _stripMediaKeywords(term) || term;
  const mediaIntent = _hasMediaIntent(query);

  try {
    const multi = await _tmdb(
      `search/multi?query=${encodeURIComponent(searchTerm)}`,
      ctx,
    );
    const results = (multi?.results || []).filter(
      (r) =>
        r &&
        (r.media_type === "movie" ||
          r.media_type === "tv" ||
          r.media_type === "person"),
    );
    if (results.length === 0) return null;

    // "X cast" → prefer a movie/tv match for X.
    if (intent === "cast") {
      const item = results.find(
        (r) => r.media_type === "movie" || r.media_type === "tv",
      );
      if (item && _isConfidentMatch(searchTerm, item, true)) {
        return { type: item.media_type, id: item.id };
      }
    }

    // Person match (e.g. "emma stone").
    const person = results.find((r) => r.media_type === "person");
    if (person && _isConfidentMatch(searchTerm, person, mediaIntent)) {
      return { type: "person", id: person.id };
    }

    // Movie / TV match (e.g. "la la land").
    const media = results.find(
      (r) => r.media_type === "movie" || r.media_type === "tv",
    );
    if (media && _isConfidentMatch(searchTerm, media, mediaIntent)) {
      return { type: media.media_type, id: media.id };
    }

    return null;
  } catch {
    return null;
  }
};

// ── Jellyfin ──────────────────────────────────────────────────────────────────
const _jellyfinSearch = async (title, ctx) => {
  if (!jellyfinUrl || !jellyfinApiKey || !title) return null;
  try {
    const fetchFn = ctx?.fetch || fetch;
    const url =
      `${jellyfinUrl}/Items` +
      `?SearchTerm=${encodeURIComponent(title)}` +
      `&Recursive=true&Limit=3&IncludeItemTypes=Movie,Series&Fields=ImageTags`;
    const res = await fetchFn(url, {
      headers: { "X-MediaBrowser-Token": jellyfinApiKey },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data?.Items || [])[0] || null;
  } catch {
    return null;
  }
};

const _buildJellyfinCard = (item, opts) => {
  if (!item) return "";
  const href = _esc(`${jellyfinUrl}/web/index.html#!/details?id=${item.Id}`);
  const cardCls = "tmdb-jf-card tmdb-jf-card--compact";
  return (
    `<a href="${href}" target="_blank" rel="noopener" class="${cardCls}" aria-label="Watch in Jellyfin">` +
    `<img class="tmdb-jf-logo" src="${_esc(JELLYFIN_LOGO)}" alt="" loading="lazy" width="18" height="18">` +
    `<span class="tmdb-jf-btn">Watch in Jellyfin</span>` +
    `</a>`
  );
};

const _pickTrailerKey = (videos) => {
  const list = Array.isArray(videos?.results) ? videos.results : [];
  if (!list.length) return "";
  const youtube = list.filter((v) => v && v.site === "YouTube" && v.key);
  if (!youtube.length) return "";
  const rank = (v) => {
    const type = String(v.type || "").toLowerCase();
    const name = String(v.name || "").toLowerCase();
    if (type === "trailer" && v.official) return 0;
    if (type === "trailer") return 1;
    if (type === "teaser") return 2;
    if (name.includes("trailer")) return 3;
    return 4;
  };
  youtube.sort((a, b) => rank(a) - rank(b));
  return String(youtube[0].key || "");
};

const _buildTrailerEmbed = (trailerKey, titleText) => {
  const key = String(trailerKey || "").trim();
  if (!key) return "";
  const safeTitle = _esc(titleText || "Trailer");
  const src = _esc(`https://www.youtube-nocookie.com/embed/${key}?rel=0&modestbranding=1`);
  return (
    `<div class="tmdb-trailer">` +
    `<iframe class="tmdb-trailer-frame" src="${src}" title="${safeTitle} trailer" ` +
    `loading="lazy" referrerpolicy="strict-origin-when-cross-origin" ` +
    `allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" ` +
    `allowfullscreen></iframe>` +
    `</div>`
  );
};

// ── HTML Builders ─────────────────────────────────────────────────────────────

const _buildMetaGrid = (items) => {
  const cells = items
    .filter(([, v]) => v)
    .map(
      ([label, value]) =>
        `<div class="tmdb-meta-cell">` +
        `<span class="tmdb-meta-label">${_esc(label)}</span>` +
        `<span class="tmdb-meta-value">${_esc(String(value))}</span>` +
        `</div>`,
    )
    .join("");
  return cells ? `<div class="tmdb-meta-grid">${cells}</div>` : "";
};

const _buildImageCombo = (poster, bd1, bd2, bd3) => {
  const posterClean = (poster && String(poster).trim()) || "";
  const bdList = [bd1, bd2, bd3]
    .map((b) => (b && String(b).trim()) || "")
    .filter(Boolean);
  const imgs = posterClean ? [posterClean, ...bdList] : [...bdList];

  const imgHtml = (src, cls) => {
    if (!src || !String(src).trim()) return "";
    return (
      `<img src="${_esc(src)}" alt="" loading="lazy" ` +
      `class="tmdb-combo-img ${cls}" data-tmdb-modal-src="${_esc(src)}" ` +
      `role="button" tabindex="0" aria-label="View image" ` +
      `onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'tmdb-combo-placeholder'}))">`
    );
  };

  if (imgs.length === 0) {
    return (
      `<div class="tmdb-img-combo tmdb-img-combo--empty">` +
      `<div class="tmdb-combo-placeholder"></div>` +
      `</div>`
    );
  }

  const n = imgs.length;

  if (n === 1) {
    return (
      `<div class="tmdb-img-combo tmdb-img-combo--single" data-tmdb-img-count="1">` +
      imgHtml(imgs[0], "tmdb-combo-poster") +
      `</div>`
    );
  }

  if (n === 2) {
    return (
      `<div class="tmdb-img-combo tmdb-img-combo--double" data-tmdb-img-count="2">` +
      imgHtml(imgs[0], "tmdb-combo-poster") +
      imgHtml(imgs[1], "tmdb-combo-backdrop") +
      `</div>`
    );
  }

  if (n === 3 && posterClean) {
    const sideImgs = imgs
      .slice(1)
      .map((b) => imgHtml(b, "tmdb-combo-backdrop"))
      .join("");
    return (
      `<div class="tmdb-img-combo tmdb-img-combo--triple" data-tmdb-img-count="3">` +
      `<div class="tmdb-img-main">${imgHtml(posterClean, "tmdb-combo-poster")}</div>` +
      `<div class="tmdb-img-side">${sideImgs}</div>` +
      `</div>`
    );
  }

  if (n === 3) {
    return (
      `<div class="tmdb-img-combo tmdb-img-combo--triple tmdb-img-combo--triple-no-poster" data-tmdb-img-count="3">` +
      imgs
        .map((s, i) =>
          imgHtml(s, i === 0 ? "tmdb-combo-poster" : "tmdb-combo-backdrop"),
        )
        .join("") +
      `</div>`
    );
  }

  return (
    `<div class="tmdb-img-combo tmdb-img-combo--quad" data-tmdb-img-count="4">` +
    imgs.slice(0, 4).map((s) => imgHtml(s, "tmdb-combo-tile")).join("") +
    `</div>`
  );
};

const _buildCastStrip = (cast) => {
  if (!Array.isArray(cast) || cast.length === 0) return "";
  return cast
    .slice(0, 20)
    .map((c) => {
      const name = _esc(c.name || "");
      const character = c.character ? _esc(c.character) : "";
      const photoUrl = _imgUrl(c.profile_path, "w185");
      const imgHtml = photoUrl
        ? `<img src="${_esc(photoUrl)}" alt="" loading="lazy" class="tmdb-cast-photo" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
        : "";
      const initial = _esc((c.name || "").trim().charAt(0).toUpperCase());
      const fallback = `<span class="tmdb-cast-initial"${imgHtml ? ' style="display:none"' : ""}>${initial}</span>`;
      // Clickable when we have a TMDB person id — script.js handles the nav.
      const clickable = typeof c.id === "number" && c.id > 0;
      const navAttrs = clickable
        ? ` data-tmdb-nav="person" data-tmdb-id="${c.id}" data-tmdb-name="${name}" role="button" tabindex="0"`
        : "";
      const cls = clickable
        ? "tmdb-cast-card tmdb-cast-card--clickable"
        : "tmdb-cast-card";
      return (
        `<div class="${cls}"${navAttrs}>` +
        `<div class="tmdb-cast-photo-wrap">${imgHtml}${fallback}</div>` +
        `<span class="tmdb-cast-name">${name}</span>` +
        (character ? `<span class="tmdb-cast-char">${character}</span>` : "") +
        `</div>`
      );
    })
    .join("");
};

const _buildCastAccordion = (cast, label) => {
  const strip = _buildCastStrip(cast);
  if (!strip) return "";
  const meta = `${cast.length} ${cast.length === 1 ? "person" : "people"}`;
  return (
    `<details class="tmdb-accordion">` +
    `<summary class="tmdb-accordion-summary">${_esc(label)}<span class="tmdb-accordion-meta">${_esc(meta)}</span></summary>` +
    `<div class="tmdb-accordion-body">` +
    `<div class="tmdb-cast-scroll"><div class="tmdb-cast-strip">${strip}</div></div>` +
    `</div>` +
    `</details>`
  );
};

// Renders the episode list for a season. Returned by the `season` route and
// injected into the right-column TV panel episodes slot.
// Each episode card is a link to its TMDB page.
const _renderEpisodes = (seasonData, tvId) => {
  const episodes = Array.isArray(seasonData?.episodes)
    ? seasonData.episodes
    : [];
  if (episodes.length === 0) {
    return `<p class="tmdb-episodes-empty">No episodes listed.</p>`;
  }
  const resolvedTvId =
    tvId != null && tvId !== "" ? tvId : seasonData?.show_id || "";
  const items = episodes
    .map((ep) => {
      const num = ep.episode_number;
      const seasonNum =
        ep.season_number != null ? ep.season_number : seasonData?.season_number;
      const name = _esc(
        ep.name || (num != null ? `Episode ${num}` : "Episode"),
      );
      const air = ep.air_date || "";
      const runtime = ep.runtime ? _formatRuntime(ep.runtime) : "";
      const rating = ep.vote_average ? _ratingStr(ep.vote_average) : "";
      const stillUrl = _imgUrl(ep.still_path, "w300");
      const stillHtml = stillUrl
        ? `<img src="${_esc(stillUrl)}" alt="" loading="lazy" class="tmdb-episode-still">`
        : `<div class="tmdb-episode-still tmdb-episode-still--empty"></div>`;
      const overview = ep.overview ? _esc(ep.overview) : "";
      const meta = [air, runtime, rating].filter(Boolean).join(" \u00B7 ");
      const numLabel = num != null ? `E${num}` : "";
      const canLink = resolvedTvId && seasonNum != null && num != null;
      const href = canLink
        ? _esc(
            `https://www.themoviedb.org/tv/${resolvedTvId}/season/${seasonNum}/episode/${num}`,
          )
        : "";
      const openTag = canLink
        ? `<a href="${href}" target="_blank" rel="noopener" class="tmdb-episode tmdb-episode--clickable">`
        : `<div class="tmdb-episode">`;
      const closeTag = canLink ? `</a>` : `</div>`;
      return (
        openTag +
        `<div class="tmdb-episode-thumb">${stillHtml}</div>` +
        `<div class="tmdb-episode-body">` +
        `<div class="tmdb-episode-header">` +
        (numLabel
          ? `<span class="tmdb-episode-num">${_esc(numLabel)}</span>`
          : "") +
        `<span class="tmdb-episode-title">${name}</span>` +
        `</div>` +
        (meta ? `<div class="tmdb-episode-meta">${_esc(meta)}</div>` : "") +
        (overview ? `<p class="tmdb-episode-overview">${overview}</p>` : "") +
        `</div>` +
        closeTag
      );
    })
    .join("");
  return `<div class="tmdb-episodes-list">${items}</div>`;
};

const _buildSeasonsRail = (details) => {
  const seasons = details?.seasons;
  if (!Array.isArray(seasons) || seasons.length === 0) return "";
  const relevant = seasons.filter((s) => s.season_number > 0);
  if (relevant.length === 0) return "";
  const firstSeason = relevant[0];
  const tabs = relevant
    .map((season, idx) => {
      const seasonNum = season.season_number;
      const label = _esc(season.name || `Season ${seasonNum}`);
      const epCount = season.episode_count || 0;
      const meta = _esc(
        epCount ? `${epCount} episode${epCount !== 1 ? "s" : ""}` : "",
      );
      const overview = _esc(season.overview || "");
      return (
        `<button type="button" class="tmdb-season-tab${idx === 0 ? " is-active" : ""}" ` +
        `data-tmdb-season-tab data-tmdb-season-tv="${details.id}" ` +
        `data-tmdb-season-number="${seasonNum}" data-tmdb-season-overview="${overview}" ` +
        `aria-selected="${idx === 0 ? "true" : "false"}">` +
        `<span class="tmdb-season-tab-label">${label}</span>` +
        (meta ? `<span class="tmdb-season-tab-meta">${meta}</span>` : "") +
        `</button>`
      );
    })
    .join("");
  const initialOverview = _esc(firstSeason.overview || "");
  const count = relevant.length;
  return (
    `<div class="tmdb-seasons-rail" data-tmdb-seasons-rail data-tmdb-season-tv="${details.id}">` +
    `<div class="tmdb-seasons-nav">` +
    `<button type="button" class="tmdb-season-scroll-btn" data-tmdb-season-scroll="left" aria-label="Scroll seasons left">\u2039</button>` +
    `<div class="tmdb-seasons-strip" data-tmdb-seasons-strip role="tablist" aria-label="Seasons and episodes, ${count} season${count !== 1 ? "s" : ""}">` +
    tabs +
    `</div>` +
    `<button type="button" class="tmdb-season-scroll-btn" data-tmdb-season-scroll="right" aria-label="Scroll seasons right">\u203A</button>` +
    `</div>` +
    `<div class="tmdb-season-detail">` +
    `<p class="tmdb-season-overview${initialOverview ? "" : " tmdb-season-overview--empty"}" data-tmdb-season-overview>${initialOverview}</p>` +
    `<div class="tmdb-episodes" data-tmdb-episodes data-tmdb-season-tv="${details.id}" data-tmdb-season-active="${firstSeason.season_number}" aria-live="polite"></div>` +
    `</div>` +
    `</div>`
  );
};

const _buildFilmStrip = (items) => {
  if (!items || items.length === 0) return "";
  return items
    .slice(0, 24)
    .map((m) => {
      const title = _esc(m.title || m.name || "");
      const year = (m.release_date || m.first_air_date || "").slice(0, 4);
      const posterUrl = _imgUrl(m.poster_path, "w185");
      const posterHtml = posterUrl
        ? `<img src="${_esc(posterUrl)}" alt="" loading="lazy" class="tmdb-film-img">`
        : `<span class="tmdb-film-placeholder">${_esc((title || "?").charAt(0))}</span>`;
      const href = _esc(
        `https://www.themoviedb.org/${m.media_type || "movie"}/${m.id}`,
      );
      return (
        `<a href="${href}" target="_blank" rel="noopener" class="tmdb-film-card">` +
        `<div class="tmdb-film-poster">${posterHtml}</div>` +
        `<span class="tmdb-film-title">${title}</span>` +
        `<span class="tmdb-film-year">${_esc(year)}</span>` +
        `</a>`
      );
    })
    .join("");
};

const _buildFilmographySection = (label, items) => {
  if (!items || items.length === 0) return "";
  return (
    `<h4 class="tmdb-section-heading">${_esc(label)}</h4>` +
    `<div class="tmdb-filmography-scroll">` +
    `<div class="tmdb-filmography-strip">${_buildFilmStrip(items)}</div>` +
    `</div>`
  );
};

// ── Tab Wrapper ───────────────────────────────────────────────────────────────
const _wrapTabs = (tabs) => {
  if (tabs.length === 1) return tabs[0].panel;
  const tabButtons = tabs
    .map(
      (t, i) =>
        `<button class="tmdb-tab-btn${i === 0 ? " tmdb-tab-btn--active" : ""}" ` +
        `onclick="(function(btn){` +
        `btn.closest('.tmdb-tabs').querySelectorAll('.tmdb-tab-btn').forEach(function(b){b.classList.remove('tmdb-tab-btn--active')});` +
        `btn.classList.add('tmdb-tab-btn--active');` +
        `btn.closest('.tmdb-tabs').querySelectorAll('.tmdb-tab-panel').forEach(function(p,j){p.style.display=j===${i}?'block':'none'})` +
        `})(this)">${_esc(t.label)}</button>`,
    )
    .join("");
  const tabPanels = tabs
    .map(
      (t, i) =>
        `<div class="tmdb-tab-panel"${i !== 0 ? ' style="display:none"' : ""}>${t.panel}</div>`,
    )
    .join("");
  return `<div class="tmdb-tabs"><div class="tmdb-tab-bar">${tabButtons}</div>${tabPanels}</div>`;
};

// ── Entity Renderers ──────────────────────────────────────────────────────────

const _renderPerson = (details, images, credits) => {
  const name = _esc(details.name || "");
  const knownFor = _esc(details.known_for_department || "");
  const birthday = _esc(details.birthday || "");
  const birthplace = _esc(details.place_of_birth || "");

  // Only use photos that exist — don't pad with empty slots
  const profiles = (images?.profiles || []).slice(0, 3);
  const photoGrid = profiles
    .filter((img) => img && img.file_path)
    .map((img) => {
      const src = _esc(_imgUrl(img.file_path, "w185"));
      const fullSrc = _esc(_imgUrl(img.file_path, "original"));
      return (
        `<div class="tmdb-person-photo">` +
        `<img src="${src}" alt="" loading="lazy" class="tmdb-person-photo-img" ` +
        `data-tmdb-modal-src="${fullSrc}" role="button" tabindex="0" aria-label="View image" ` +
        `onerror="this.closest('.tmdb-person-photo').style.display='none'">` +
        `</div>`
      );
    })
    .join("");

  const metaGrid = _buildMetaGrid([
    ["Known For", knownFor],
    ["Birthday", birthday],
    ["Birthplace", birthplace],
  ]);

  const bio = typeof details.biography === "string" ? details.biography : "";
  const bioExcerpt =
    bio.length > 420 ? bio.slice(0, 420).replace(/\s\S+$/, "") + "\u2026" : bio;
  const bioHtml = bioExcerpt
    ? `<p class="tmdb-plot">${_esc(bioExcerpt)}</p>`
    : "";
  const tmdbHref = _esc(`https://www.themoviedb.org/person/${details.id}`);

  const overviewPanel =
    `<div class="tmdb-overview">` +
    `<div class="tmdb-person-grid">${photoGrid}</div>` +
    `<div class="tmdb-person-info">` +
    metaGrid +
    bioHtml +
    `</div>` +
    `</div>`;

  // Filmography tab: separate movies and TV by media_type
  const allCast = credits?.cast || [];
  const movieCast = allCast
    .filter((c) => c.media_type === "movie" && c.title && c.release_date)
    .sort((a, b) => (b.release_date || "").localeCompare(a.release_date || ""));
  const tvCast = allCast
    .filter(
      (c) =>
        c.media_type === "tv" &&
        c.name &&
        (c.first_air_date || c.episode_count),
    )
    .sort((a, b) =>
      (b.first_air_date || "").localeCompare(a.first_air_date || ""),
    );

  const filmographyPanel =
    _buildFilmographySection("Movies", movieCast) +
    _buildFilmographySection("TV Shows", tvCast);

  const tabs = [{ label: "Overview", panel: overviewPanel }];
  if (filmographyPanel)
    tabs.push({ label: "Films & TV", panel: filmographyPanel });

  const nameHeader =
    `<div class="tmdb-panel-header">` +
    `<a href="${tmdbHref}" target="_blank" rel="noopener" class="tmdb-title-link">` +
    `<h3 class="tmdb-title">${name}</h3>` +
    `</a>` +
    `</div>`;

  return (
    `<div class="tmdb-panel" data-tmdb-label="${name}">` +
    nameHeader +
    _wrapTabs(tabs) +
    `</div>`
  );
};

const _buildRatingsHtml = (opts) => {
  const {
    voteAverage,
    voteCount,
    imdb,
    rottenTomatoes,
    letterboxdHref,
  } = opts;

  const parts = [];

  if (voteAverage != null && Number(voteAverage) >= 0.1) {
    const score = parseFloat(voteAverage).toFixed(1);
    const voteTitle =
      typeof voteCount === "number" && voteCount > 0
        ? ` title="${_esc(`${voteCount.toLocaleString("en-US")} TMDB votes`)}"`
        : "";
    parts.push(
      `<div class="tmdb-rating-item"${voteTitle}>` +
        `<span class="tmdb-rating-badge tmdb-rating-badge--tmdb">TMDB</span>` +
        `<span class="tmdb-rating-score">${score}</span>` +
        `<span class="tmdb-rating-unit">\u202f/10</span>` +
        `</div>`,
    );
  }

  if (imdb) {
    const rawImdb = String(imdb).trim();
    if (rawImdb.toUpperCase() !== "N/A") {
      const m = rawImdb.match(/^([\d.]+)\s*\/\s*10$/i);
      const scoreInner = m
        ? `<span class="tmdb-rating-score">${_esc(m[1])}</span><span class="tmdb-rating-unit">\u202f/10</span>`
        : `<span class="tmdb-rating-score">${_esc(rawImdb)}</span>`;
      parts.push(
        `<div class="tmdb-rating-item">` +
          `<span class="tmdb-rating-badge tmdb-rating-badge--imdb">IMDb</span>` +
          scoreInner +
          `</div>`,
      );
    }
  }

  if (rottenTomatoes) {
    const rt = String(rottenTomatoes).trim();
    if (rt.toUpperCase() !== "N/A") {
      parts.push(
        `<div class="tmdb-rating-item">` +
          `<span class="tmdb-rating-badge tmdb-rating-badge--rt">Tomatometer</span>` +
          `<span class="tmdb-rating-score tmdb-rating-score--rt">${_esc(rt)}</span>` +
          `</div>`,
      );
    }
  }

  if (letterboxdHref) {
    parts.push(
      `<a href="${_esc(letterboxdHref)}" target="_blank" rel="noopener" class="tmdb-rating-item tmdb-rating-item--link" title="Letterboxd (community scores are on the site; there is no public rating API)">` +
        `<span class="tmdb-rating-badge tmdb-rating-badge--letterboxd">Letterboxd</span>` +
        `<span class="tmdb-rating-external">Open \u2192</span>` +
        `</a>`,
    );
  }

  if (parts.length === 0) return "";
  return `<div class="tmdb-ratings">${parts.join("")}</div>`;
};

const _renderMovie = (
  details,
  credits,
  images,
  jellyfinItem,
  omdbRatings,
  trailerKey,
) => {
  const title = _esc(details.title || details.name || "");
  const year = _esc((details.release_date || "").slice(0, 4));
  const overview = details.overview || "";
  const tmdbHref = _esc(`https://www.themoviedb.org/movie/${details.id}`);

  const poster = _imgUrl(
    details.poster_path || (images?.posters || [])[0]?.file_path || "",
    "w500",
  );
  const backdrops = (images?.backdrops || [])
    .slice(0, 3)
    .map((b) => _imgUrl(b.file_path, "w780"));
  const imageCombo = _buildImageCombo(
    poster,
    backdrops[0] || "",
    backdrops[1] || "",
    backdrops[2] || "",
  );

  const directors = (credits?.crew || [])
    .filter((c) => c.job === "Director")
    .map((c) => c.name)
    .join(", ");
  const genres = (details.genres || []).map((g) => g.name).join(", ");
  const runtime = _formatRuntime(details.runtime);
  const subtitleParts = [genres, runtime].filter(Boolean);
  const subtitleHtml = subtitleParts.length
    ? `<div class="tmdb-subtitle">${_esc(subtitleParts.join(" \u00b7 "))}</div>`
    : "";

  const ratingsHtml = _buildRatingsHtml({
    voteAverage: details.vote_average,
    voteCount: details.vote_count,
    imdb: omdbRatings?.imdb,
    rottenTomatoes: omdbRatings?.rottenTomatoes,
    letterboxdHref: `https://letterboxd.com/tmdb/${details.id}/`,
  });
  const directorHtml = directors
    ? `<div class="tmdb-hero-director">` +
      `<span class="tmdb-hero-director-label">Directed by</span> ` +
      _esc(directors) +
      `</div>`
    : "";

  const plotHtml = overview ? `<p class="tmdb-plot">${_esc(overview)}</p>` : "";
  const trailerHtml = _buildTrailerEmbed(trailerKey, details.title || details.name || "");

  const cast = credits?.cast || [];
  const castStrip = _buildCastStrip(cast);
  const castSection = castStrip
    ? `<div class="tmdb-section">` +
      `<div class="tmdb-section-heading">Cast` +
      (cast.length
        ? ` <span class="tmdb-section-count">${Math.min(cast.length, 20)} people</span>`
        : "") +
      `</div>` +
      `<div class="tmdb-cast-scroll"><div class="tmdb-cast-strip">${castStrip}</div></div>` +
      `</div>`
    : "";

  const jellyfinCard = _buildJellyfinCard(jellyfinItem);
  const labelText = `${title}${year ? ` (${year})` : ""}`;

  return (
    `<div class="tmdb-panel" data-tmdb-label="${labelText}">` +
    `<div class="tmdb-header">` +
    `<div class="tmdb-header-primary">` +
    `<div class="tmdb-header-title-row">` +
    `<a href="${tmdbHref}" target="_blank" rel="noopener" class="tmdb-title-link">` +
    `<h3 class="tmdb-title">${title}${year ? ` <span class="tmdb-year">(${year})</span>` : ""}</h3>` +
    `</a>` +
    (jellyfinCard || "") +
    `</div>` +
    subtitleHtml +
    `</div>` +
    `</div>` +
    `<div class="tmdb-hero">` +
    `<div class="tmdb-hero-media">${imageCombo}</div>` +
    `<div class="tmdb-hero-info">` +
    trailerHtml +
    ratingsHtml +
    directorHtml +
    plotHtml +
    `</div>` +
    `</div>` +
    castSection +
    `</div>`
  );
};

const _renderTv = (
  details,
  credits,
  images,
  jellyfinItem,
  omdbRatings,
) => {
  const name = _esc(details.name || "");
  const year = _esc((details.first_air_date || "").slice(0, 4));
  const overview = details.overview || "";
  const tmdbHref = _esc(`https://www.themoviedb.org/tv/${details.id}`);

  const poster = _imgUrl(
    details.poster_path || (images?.posters || [])[0]?.file_path || "",
    "w500",
  );
  const backdrops = (images?.backdrops || [])
    .slice(0, 3)
    .map((b) => _imgUrl(b.file_path, "w780"));
  const imageCombo = _buildImageCombo(
    poster,
    backdrops[0] || "",
    backdrops[1] || "",
    backdrops[2] || "",
  );

  const createdBy = (details.created_by || []).map((c) => c.name).join(", ");
  const genres = (details.genres || []).map((g) => g.name).join(", ");
  const seasons = details.number_of_seasons
    ? `${details.number_of_seasons} season${details.number_of_seasons !== 1 ? "s" : ""}`
    : "";
  const status = details.status || "";
  const subtitleParts = [genres, seasons, status].filter(Boolean);
  const subtitleHtml = subtitleParts.length
    ? `<div class="tmdb-subtitle">${_esc(subtitleParts.join(" \u00b7 "))}</div>`
    : "";

  const ratingsHtml = _buildRatingsHtml({
    voteAverage: details.vote_average,
    voteCount: details.vote_count,
    imdb: omdbRatings?.imdb,
    rottenTomatoes: omdbRatings?.rottenTomatoes,
    letterboxdHref: null,
  });
  const creatorHtml = createdBy
    ? `<div class="tmdb-hero-director">` +
      `<span class="tmdb-hero-director-label">Created by</span> ` +
      _esc(createdBy) +
      `</div>`
    : "";

  const plotHtml = overview ? `<p class="tmdb-plot">${_esc(overview)}</p>` : "";

  const cast = credits?.cast || [];
  const castStrip = _buildCastStrip(cast);
  const castSection = castStrip
    ? `<div class="tmdb-section">` +
      `<div class="tmdb-section-heading">Cast` +
      (cast.length
        ? ` <span class="tmdb-section-count">${Math.min(cast.length, 20)} people</span>`
        : "") +
      `</div>` +
      `<div class="tmdb-cast-scroll"><div class="tmdb-cast-strip">${castStrip}</div></div>` +
      `</div>`
    : "";

  const seasonsAccordion = _buildSeasonsRail(details);
  const seasonCount =
    details?.seasons?.filter((s) => s.season_number > 0).length || 0;
  const jellyfinCard = _buildJellyfinCard(jellyfinItem);
  const labelText = `${name}${year ? ` (${year})` : ""}`;

  const seasonsRail =
    seasonsAccordion && seasonCount > 0
      ? `<aside class="tmdb-tv-rail">` +
        `<div class="tmdb-rail-heading">` +
        `<span class="tmdb-rail-title">Episodes</span>` +
        `</div>` +
        seasonsAccordion +
        `</aside>`
      : "";

  const tvMain =
    `<div class="tmdb-tv-main">` +
    `<div class="tmdb-hero">` +
    `<div class="tmdb-hero-media">${imageCombo}</div>` +
    `<div class="tmdb-hero-info">` +
    ratingsHtml +
    creatorHtml +
    plotHtml +
    `</div>` +
    `</div>` +
    castSection +
    `</div>`;

  return (
    `<div class="tmdb-panel tmdb-panel--tv" data-tmdb-label="${labelText}">` +
    `<div class="tmdb-header">` +
    `<div class="tmdb-header-primary">` +
    `<div class="tmdb-header-title-row">` +
    `<a href="${tmdbHref}" target="_blank" rel="noopener" class="tmdb-title-link">` +
    `<h3 class="tmdb-title">${name}${year ? ` <span class="tmdb-year">(${year})</span>` : ""}</h3>` +
    `</a>` +
    (jellyfinCard || "") +
    `</div>` +
    subtitleHtml +
    `</div>` +
    `</div>` +
    (seasonsRail ? `<div class="tmdb-tv-body">${tvMain}${seasonsRail}</div>` : tvMain) +
    `</div>`
  );
};

// ── Panel Builders (shared between slot execute() and plugin routes) ──────────
const _buildMoviePanel = async (id, ctx) => {
  const details = await _tmdb(`movie/${id}`, ctx);
  if (!details) return null;
  const [credits, images, jellyfinItem, ext, videos] = await Promise.all([
    _tmdb(`movie/${id}/credits`, ctx),
    _tmdb(`movie/${id}/images?include_image_language=en,null`, ctx),
    jellyfinUrl && jellyfinApiKey
      ? _jellyfinSearch(details.title || details.original_title || "", ctx)
      : Promise.resolve(null),
    _tmdb(`movie/${id}/external_ids`, ctx),
    _tmdb(`movie/${id}/videos`, ctx),
  ]);
  let omdbRatings = null;
  if (omdbApiKey && ext?.imdb_id) {
    const raw = await _omdbFetch({ i: ext.imdb_id }, ctx);
    omdbRatings = _parseOmdbRatings(raw);
  }
  return {
    title: details.title || "Movie",
    html: _renderMovie(
      details,
      credits,
      images,
      jellyfinItem,
      omdbRatings,
      _pickTrailerKey(videos),
    ),
  };
};

const _buildTvPanel = async (id, ctx) => {
  const details = await _tmdb(`tv/${id}`, ctx);
  if (!details) return null;
  const [credits, images, jellyfinItem, ext] = await Promise.all([
    _tmdb(`tv/${id}/credits`, ctx),
    _tmdb(`tv/${id}/images?include_image_language=en,null`, ctx),
    jellyfinUrl && jellyfinApiKey
      ? _jellyfinSearch(details.name || details.original_name || "", ctx)
      : Promise.resolve(null),
    _tmdb(`tv/${id}/external_ids`, ctx),
  ]);
  let omdbRatings = null;
  if (omdbApiKey && ext?.imdb_id) {
    const raw = await _omdbFetch({ i: ext.imdb_id }, ctx);
    omdbRatings = _parseOmdbRatings(raw);
  }
  return {
    title: details.name || "TV Show",
    html: _renderTv(
      details,
      credits,
      images,
      jellyfinItem,
      omdbRatings,
    ),
  };
};

const _buildPersonPanel = async (id, ctx) => {
  const [details, images, credits] = await Promise.all([
    _tmdb(`person/${id}`, ctx),
    _tmdb(`person/${id}/images`, ctx),
    _tmdb(`person/${id}/combined_credits`, ctx),
  ]);
  if (!details) return null;
  return {
    title: details.name || "Actor",
    html: _renderPerson(details, images, credits),
  };
};

// Fetches a single TV season's episode list and renders it. Powers the
// lazy-load inside the season accordion on the TV panel.
const _buildSeasonPanel = async (tvId, seasonNumber, ctx) => {
  const data = await _tmdb(`tv/${tvId}/season/${seasonNumber}`, ctx);
  if (!data) return null;
  return {
    title: data.name || `Season ${seasonNumber}`,
    html: _renderEpisodes(data, tvId),
  };
};

// ── Plugin Routes ─────────────────────────────────────────────────────────────
// Client-side navigation (cast card → person, etc.) fetches these routes to
// swap the slot contents without a full page reload. See script.js.
const _entityHandler = (builder) => async (request) => {
  try {
    const url = new URL(request.url);
    const idRaw = url.searchParams.get("id") || "";
    const id = parseInt(idRaw, 10);
    if (!id || Number.isNaN(id)) {
      return new Response(JSON.stringify({ error: "Missing or invalid id" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    }
    if (!tmdbApiKey) {
      return new Response(
        JSON.stringify({ error: "TMDB API key not configured" }),
        {
          status: 503,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
        },
      );
    }
    const panel = await builder(id, undefined);
    if (!panel) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    }
    return new Response(JSON.stringify(panel), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Internal error",
        detail: String(err && err.message),
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      },
    );
  }
};

// Dedicated handler for the season route — it takes two query params (tv, season)
// rather than a single id, so it doesn't fit the generic _entityHandler shape.
const _seasonHandler = async (request) => {
  const jsonHeaders = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
  try {
    const url = new URL(request.url);
    const tvRaw = url.searchParams.get("tv") || "";
    const seasonRaw = url.searchParams.get("season") || "";
    const tvId = parseInt(tvRaw, 10);
    const seasonNumber = parseInt(seasonRaw, 10);
    if (!tvId || Number.isNaN(tvId) || Number.isNaN(seasonNumber)) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid tv/season" }),
        { status: 400, headers: jsonHeaders },
      );
    }
    if (!tmdbApiKey) {
      return new Response(
        JSON.stringify({ error: "TMDB API key not configured" }),
        { status: 503, headers: jsonHeaders },
      );
    }
    const panel = await _buildSeasonPanel(tvId, seasonNumber);
    if (!panel) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: jsonHeaders,
      });
    }
    return new Response(JSON.stringify(panel), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Internal error",
        detail: String(err && err.message),
      }),
      { status: 500, headers: jsonHeaders },
    );
  }
};

export const routes = [
  {
    path: "movie",
    method: "get",
    handler: _entityHandler((id, ctx) => _buildMoviePanel(id, ctx)),
  },
  {
    path: "tv",
    method: "get",
    handler: _entityHandler((id, ctx) => _buildTvPanel(id, ctx)),
  },
  {
    path: "person",
    method: "get",
    handler: _entityHandler((id, ctx) => _buildPersonPanel(id, ctx)),
  },
  {
    path: "season",
    method: "get",
    handler: _seasonHandler,
  },
];

// ── Slot Export ───────────────────────────────────────────────────────────────
export const slot = {
  id: "tmdb-trankil",
  name: "TMDB",
  description:
    'Shows rich info panels for movies, TV shows, and actors. Activates on natural-language queries (e.g. "la la land", "emma stone") and on TMDB, IMDB, or Allocine links in search results.',
  position: "above-results",
  // Needed so ctx.results is populated for URL-based detection (TMDB/IMDB/Allocine
  // links in the organic search results). Natural-language activation still works
  // without results, but this lets the URL shortcut fire when available.
  waitForResults: true,

  settingsSchema: [
    {
      key: "apiKey",
      label: "TMDB API Key",
      type: "password",
      required: true,
      secret: true,
      placeholder: "Get a free key at themoviedb.org/settings/api",
      description:
        "Required to fetch movie, TV, and actor information. Get a free key at https://www.themoviedb.org/settings/api",
    },
    {
      key: "jellyfinUrl",
      label: "Jellyfin URL",
      type: "url",
      required: false,
      placeholder: "https://your-jellyfin-server.com",
      description:
        "Optional. When set alongside a Jellyfin API key, adds a link card when the media is found in your Jellyfin library.",
    },
    {
      key: "jellyfinApiKey",
      label: "Jellyfin API Key",
      type: "password",
      required: false,
      secret: true,
      placeholder: "Your Jellyfin API key",
      description:
        "Optional. Required together with the Jellyfin URL to enable library integration.",
    },
    {
      key: "omdbApiKey",
      label: "OMDb API key",
      type: "password",
      required: false,
      secret: true,
      placeholder: "Free key at omdbapi.com",
      description:
        "Optional. When set, loads IMDb user rating and Rotten Tomatoes Tomatometer from OMDb using the title’s IMDb id from TMDB. Free key: https://www.omdbapi.com/apikey.aspx. Letterboxd does not publish aggregate ratings via a public API; for films, a Letterboxd link is shown next to scores.",
    },
  ],

  async init(ctx) {
    // Support both ctx.template (set by host) and manual readFile
    template = ctx.template || "";
    if (!template && ctx.readFile) {
      template = await ctx.readFile("template.html");
    }
  },

  configure(settings) {
    tmdbApiKey = (settings?.apiKey || "").trim();
    omdbApiKey = (settings?.omdbApiKey || "").trim();
    jellyfinUrl = (settings?.jellyfinUrl || "").replace(/\/+$/, "").trim();
    jellyfinApiKey = (settings?.jellyfinApiKey || "").trim();
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
    if (!tmdbApiKey) return { html: "" };
    if (NON_MEDIA_PATTERN.test(q)) return { html: "" };

    try {
      // 1) Fast path: detect a TMDB/IMDB/Allocine URL in the organic results.
      let entity = null;
      const detected = _detectFromResults(ctx?.results);
      if (detected) {
        entity = await _resolveEntity(detected, q, ctx);
      }

      // 2) Fallback: natural-language match against TMDB search with a
      //    confidence gate so we don't show noise for ambiguous queries.
      if (!entity) {
        entity = await _resolveFromQuery(q, ctx);
      }

      if (!entity) return { html: "" };

      const { type, id } = entity;

      let panel = null;
      if (type === "person") panel = await _buildPersonPanel(id, ctx);
      else if (type === "movie") panel = await _buildMoviePanel(id, ctx);
      else if (type === "tv") panel = await _buildTvPanel(id, ctx);

      if (!panel) return { html: "" };

      return {
        html: _render({ content: panel.html }),
      };
    } catch {
      return { html: "" };
    }
  },
};

export default { slot };
