// ── State ─────────────────────────────────────────────────────────────────────
let tmdbApiKey = "";
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

const _buildJellyfinCard = (item) => {
  if (!item) return "";
  const title = _esc(String(item.Name || ""));
  const year = item.ProductionYear ? ` (${item.ProductionYear})` : "";
  const href = _esc(`${jellyfinUrl}/web/index.html#!/details?id=${item.Id}`);
  return (
    `<a href="${href}" target="_blank" rel="noopener" class="tmdb-jf-card">` +
    `<img class="tmdb-jf-logo" src="${_esc(JELLYFIN_LOGO)}" alt="Jellyfin" loading="lazy">` +
    `<span class="tmdb-jf-title">${title}${_esc(year)}</span>` +
    `<span class="tmdb-jf-btn">View in Jellyfin</span>` +
    `</a>`
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

const _buildImageCombo = (poster, bd1, bd2) => {
  const posterHtml = poster
    ? `<img src="${_esc(poster)}" alt="" loading="lazy" class="tmdb-combo-img tmdb-combo-poster">`
    : `<div class="tmdb-combo-placeholder"></div>`;
  const b1Html = bd1
    ? `<img src="${_esc(bd1)}" alt="" loading="lazy" class="tmdb-combo-img tmdb-combo-backdrop">`
    : `<div class="tmdb-combo-placeholder"></div>`;
  const b2Html = bd2
    ? `<img src="${_esc(bd2)}" alt="" loading="lazy" class="tmdb-combo-img tmdb-combo-backdrop">`
    : `<div class="tmdb-combo-placeholder"></div>`;
  return (
    `<div class="tmdb-img-combo">` +
    `<div class="tmdb-img-main">${posterHtml}</div>` +
    `<div class="tmdb-img-side">${b1Html}${b2Html}</div>` +
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
      return (
        `<div class="tmdb-cast-card">` +
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

const _buildSeasonAccordion = (season, tvId) => {
  const name = _esc(season.name || `Season ${season.season_number}`);
  const epCount = season.episode_count || 0;
  const airYear = (season.air_date || "").slice(0, 4);
  const overview = season.overview ? _esc(season.overview) : "";
  const posterHtml = season.poster_path
    ? `<img src="${_esc(_imgUrl(season.poster_path, "w92"))}" alt="" loading="lazy" class="tmdb-season-poster">`
    : "";
  const meta = _esc(
    [airYear, `${epCount} episode${epCount !== 1 ? "s" : ""}`]
      .filter(Boolean)
      .join("\u00A0·\u00A0"),
  );
  const href = _esc(
    `https://www.themoviedb.org/tv/${tvId}/season/${season.season_number}`,
  );
  return (
    `<details class="tmdb-accordion">` +
    `<summary class="tmdb-accordion-summary">${name}<span class="tmdb-accordion-meta">${meta}</span></summary>` +
    `<div class="tmdb-accordion-body">` +
    `<div class="tmdb-season-row">` +
    posterHtml +
    `<div class="tmdb-season-info">` +
    (overview ? `<p class="tmdb-season-overview">${overview}</p>` : "") +
    `<a href="${href}" target="_blank" rel="noopener" class="tmdb-ext-link">View episodes on TMDB →</a>` +
    `</div>` +
    `</div>` +
    `</div>` +
    `</details>`
  );
};

const _buildSeasonsAccordion = (details) => {
  const seasons = details?.seasons;
  if (!Array.isArray(seasons) || seasons.length === 0) return "";
  const relevant = seasons.filter((s) => s.season_number > 0);
  const seasonHtml = relevant
    .map((s) => _buildSeasonAccordion(s, details.id))
    .join("");
  if (!seasonHtml) return "";
  const count = relevant.length;
  return (
    `<details class="tmdb-accordion" open>` +
    `<summary class="tmdb-accordion-summary">Episodes<span class="tmdb-accordion-meta">${count} season${count !== 1 ? "s" : ""}</span></summary>` +
    `<div class="tmdb-accordion-body">${seasonHtml}</div>` +
    `</details>`
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

  // 3 portrait profile photos — pad with nulls if fewer than 3
  const profiles = [...(images?.profiles || [])].slice(0, 3);
  while (profiles.length < 3) profiles.push(null);
  const photoGrid = profiles
    .map((img) => {
      if (img && img.file_path) {
        const src = _esc(_imgUrl(img.file_path, "w185"));
        return `<div class="tmdb-person-photo"><img src="${src}" alt="" loading="lazy" class="tmdb-person-photo-img"></div>`;
      }
      return `<div class="tmdb-person-photo tmdb-person-photo--empty"></div>`;
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
    `<a href="${tmdbHref}" target="_blank" rel="noopener" class="tmdb-ext-link">View on TMDB \u2192</a>` +
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

  return _wrapTabs(tabs);
};

const _renderMovie = (details, credits, images, jellyfinItem) => {
  const title = _esc(details.title || details.name || "");
  const year = _esc((details.release_date || "").slice(0, 4));
  const overview = details.overview || "";
  const tmdbHref = _esc(`https://www.themoviedb.org/movie/${details.id}`);

  // Image combo: poster + up to 2 backdrops
  const poster = _imgUrl(
    details.poster_path || (images?.posters || [])[0]?.file_path || "",
    "w342",
  );
  const backdrops = (images?.backdrops || [])
    .slice(0, 2)
    .map((b) => _imgUrl(b.file_path, "w780"));
  const imageCombo = _buildImageCombo(
    poster,
    backdrops[0] || "",
    backdrops[1] || "",
  );

  // Metadata
  const directors = (credits?.crew || [])
    .filter((c) => c.job === "Director")
    .map((c) => c.name)
    .join(", ");
  const genres = (details.genres || []).map((g) => g.name).join(", ");
  const runtime = _formatRuntime(details.runtime);
  const rating = _ratingStr(details.vote_average);
  const production = (details.production_companies || [])
    .slice(0, 2)
    .map((c) => c.name)
    .join(", ");

  const metaGrid = _buildMetaGrid([
    ["Director", directors],
    ["Release Date", details.release_date || ""],
    ["Runtime", runtime],
    ["Rating", rating],
  ]);

  const plotHtml = overview ? `<p class="tmdb-plot">${_esc(overview)}</p>` : "";
  const cast = credits?.cast || [];
  const castAccordion = _buildCastAccordion(cast, "Cast");
  const jellyfinCard = _buildJellyfinCard(jellyfinItem);

  return (
    `<div class="tmdb-overview">` +
    imageCombo +
    `<div class="tmdb-info-block">` +
    `<h3 class="tmdb-title">${title}${year ? ` <span class="tmdb-year">(${year})</span>` : ""}</h3>` +
    metaGrid +
    plotHtml +
    `<a href="${tmdbHref}" target="_blank" rel="noopener" class="tmdb-ext-link">View on TMDB \u2192</a>` +
    `</div>` +
    `</div>` +
    castAccordion +
    (jellyfinCard ? `<div class="tmdb-jf-wrap">${jellyfinCard}</div>` : "")
  );
};

const _renderTv = (details, credits, images, jellyfinItem) => {
  const name = _esc(details.name || "");
  const year = _esc((details.first_air_date || "").slice(0, 4));
  const overview = details.overview || "";
  const tmdbHref = _esc(`https://www.themoviedb.org/tv/${details.id}`);

  // Image combo
  const poster = _imgUrl(
    details.poster_path || (images?.posters || [])[0]?.file_path || "",
    "w342",
  );
  const backdrops = (images?.backdrops || [])
    .slice(0, 2)
    .map((b) => _imgUrl(b.file_path, "w780"));
  const imageCombo = _buildImageCombo(
    poster,
    backdrops[0] || "",
    backdrops[1] || "",
  );

  // Metadata
  const createdBy = (details.created_by || []).map((c) => c.name).join(", ");
  const genres = (details.genres || []).map((g) => g.name).join(", ");
  const rating = _ratingStr(details.vote_average);
  const seasons = details.number_of_seasons
    ? String(details.number_of_seasons)
    : "";
  const episodes = details.number_of_episodes
    ? String(details.number_of_episodes)
    : "";
  const status = details.status || "";

  const metaGrid = _buildMetaGrid([
    ["Created By", createdBy],
    ["First Aired", details.first_air_date || ""],
    ["Seasons", seasons],
    ["Episodes", episodes],
  ]);

  const plotHtml = overview ? `<p class="tmdb-plot">${_esc(overview)}</p>` : "";
  const seasonsAccordion = _buildSeasonsAccordion(details);
  const cast = credits?.cast || [];
  const castAccordion = _buildCastAccordion(cast, "Distribution");
  const jellyfinCard = _buildJellyfinCard(jellyfinItem);

  return (
    `<div class="tmdb-overview">` +
    imageCombo +
    `<div class="tmdb-info-block">` +
    `<h3 class="tmdb-title">${name}${year ? ` <span class="tmdb-year">(${year})</span>` : ""}</h3>` +
    metaGrid +
    plotHtml +
    `<a href="${tmdbHref}" target="_blank" rel="noopener" class="tmdb-ext-link">View on TMDB \u2192</a>` +
    `</div>` +
    `</div>` +
    seasonsAccordion +
    castAccordion +
    (jellyfinCard ? `<div class="tmdb-jf-wrap">${jellyfinCard}</div>` : "")
  );
};

// ── Slot Export ───────────────────────────────────────────────────────────────
export const slot = {
  id: "tmdb-trankil",
  name: "TMDB",
  description:
    "Shows rich info panels for movies, TV shows, and actors when TMDB, IMDB, or Allocine links appear in search results.",
  position: "above-results",
  slotPositions: ["above-results", "below-results"],

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
    jellyfinUrl = (settings?.jellyfinUrl || "").replace(/\/+$/, "").trim();
    jellyfinApiKey = (settings?.jellyfinApiKey || "").trim();
  },

  trigger(query) {
    const q = query.trim();
    return q.length >= 2 && q.length <= 150;
  },

  async execute(query, ctx) {
    if (query.length < 6 || query.length > 150) return { html: "" };
    if (!tmdbApiKey) return { html: "" };

    const results = ctx?.results;
    const detected = _detectFromResults(results);
    if (!detected) return { html: "" };

    try {
      const entity = await _resolveEntity(detected, query.trim(), ctx);
      if (!entity) return { html: "" };

      const { type, id } = entity;

      if (type === "person") {
        const [details, images, credits] = await Promise.all([
          _tmdb(`person/${id}`, ctx),
          _tmdb(`person/${id}/images`, ctx),
          _tmdb(`person/${id}/combined_credits`, ctx),
        ]);
        if (!details) return { html: "" };
        const content = _renderPerson(details, images, credits);
        return { title: details.name || "Actor", html: _render({ content }) };
      }

      if (type === "movie") {
        const details = await _tmdb(`movie/${id}`, ctx);
        if (!details) return { html: "" };
        const [credits, images, jellyfinItem] = await Promise.all([
          _tmdb(`movie/${id}/credits`, ctx),
          _tmdb(`movie/${id}/images?include_image_language=en,null`, ctx),
          jellyfinUrl && jellyfinApiKey
            ? _jellyfinSearch(
                details.title || details.original_title || "",
                ctx,
              )
            : Promise.resolve(null),
        ]);
        const content = _renderMovie(details, credits, images, jellyfinItem);
        return { title: details.title || "Movie", html: _render({ content }) };
      }

      if (type === "tv") {
        const details = await _tmdb(`tv/${id}`, ctx);
        if (!details) return { html: "" };
        const [credits, images, jellyfinItem] = await Promise.all([
          _tmdb(`tv/${id}/credits`, ctx),
          _tmdb(`tv/${id}/images?include_image_language=en,null`, ctx),
          jellyfinUrl && jellyfinApiKey
            ? _jellyfinSearch(details.name || details.original_name || "", ctx)
            : Promise.resolve(null),
        ]);
        const content = _renderTv(details, credits, images, jellyfinItem);
        return { title: details.name || "TV Show", html: _render({ content }) };
      }

      return { html: "" };
    } catch {
      return { html: "" };
    }
  },
};

export default { slot };
