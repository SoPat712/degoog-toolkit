// Image & Video Strips: Google-style "Images" and "Videos" rows on the Web tab.
// The slot only renders a hidden placeholder; card.js styles it, then fills it
// from the instance's own image and video engines through same-origin
// /api/search once the web results are on screen, so the strips never hold
// back results.

let template = '<div class="mstrips" data-mstrips-query="{{QUERY}}" hidden>{{SECTIONS}}</div>';
let searchTypes = null;
let typesCache = { at: 0, types: null };
const settings = { images: "auto", videos: "auto" };

const MODES = ["auto", "always", "never"];
const MODE_LABELS = ["When the search asks for them", "On every web search", "Never"];
const TYPES_TTL_MS = 60_000;
const SKELETONS = { images: 7, videos: 4 };
const LABELS = {
  images: {
    title: "{{ t:plugin-media-strips.images }}",
    all: "{{ t:plugin-media-strips.viewAllImages }}",
  },
  videos: {
    title: "{{ t:plugin-media-strips.videos }}",
    all: "{{ t:plugin-media-strips.viewAllVideos }}",
  },
};

const BANG_RX = /(?:^|\s)![^\s!]/;
const URLISH_RX = /:\/\/|^www\.\S|^\S+\.(?:com|net|org|io|dev|app|gov|edu)(?:\/\S*)?$/i;

// Images: words that ask to see something.
const IMAGE_RX =
  /\b(?:pictures?|pics?|photos?|photographs?|images?|imgs?|wallpapers?|logos?|drawings?|diagrams?|memes?|clip ?art|icons|infographics?|illustrations?|sketch(?:es)?|screenshots?|posters?|fan ?art|tattoos?|hairstyles?)\b|\bwhat (?:does|do|did) .+ look like\b/i;
// Tool, file and technical senses of those words ("photo editor", "docker
// image", "png to jpg", "image recognition", "profile picture").
const IMAGE_BLOCK_RX = new RegExp(
  `\\b(?:${[
    "editors?", "editing", "edit", "converters?", "convert", "compress(?:or)?", "resize(?:r)?",
    "crop", "upscal(?:e|er)", "makers?", "generators?", "creator", "remover", "downloader",
    "viewer", "api", "sdk", "docker", "container", "kubernetes", "disk", "iso", "vm",
    "base64", "html", "css", "javascript", "typescript", "php", "sql", "latex", "markdown",
    "alt text", "src", "processing", "recognition", "classification", "segmentation",
    "detection", "dataset", "metadata", "exif", "resolution", "file size", "format",
    "tablet", "software", "app", "apps", "tools?", "printer", "paper", "booth", "frames?",
    "id", "passport", "profile", "picture in picture", "license", "licensing", "copyright",
    "storage", "backup", "recovery", "removal", "near me", "shops?", "stores?", "salons?",
    "prices?", "cost",
  ].join("|")})\\b|\\b(?:png|jpe?g|gif|svg|webp|heic|image|photo|pdf)s?\\s+(?:to|into)\\s+\\w`,
  "i",
);
// Videos: tutorials, previews, music videos and other watch intents.
const VIDEO_RX = new RegExp(
  `^how to \\S|\\b(?:${[
    "tutorials?", "trailers?", "teasers?", "music videos?", "official video", "lyrics? video",
    "highlights", "walkthroughs?", "gameplay", "playthrough", "unboxing", "explained",
    "vlogs?", "asmr", "live ?stream", "speedruns?", "teardown", "full episodes?",
    "documentar(?:y|ies)", "workouts?", "diy", "videos?", "reviews?",
  ].join("|")})\\b`,
  "i",
);
// "video card", "video editor", "mp4 to mp3", "code review", "how to spell".
const VIDEO_BLOCK_RX = new RegExp(
  [
    `\\bvideos?\\s+(?:${[
      "cards?", "games?", "gaming", "editors?", "editing", "edit", "converters?", "convert",
      "compress(?:or)?", "downloader", "download", "calls?", "calling", "chat", "conferenc(?:e|ing)",
      "codecs?", "formats?", "resolution", "players?", "drivers?", "memory", "ram", "output",
      "input", "ports?", "cables?", "recorder", "recording", "encod(?:er|ing)", "streaming",
      "surveillance", "doorbell", "cameras?", "production", "marketing", "agency", "jobs?",
      "size", "length", "file",
    ].join("|")})\\b`,
    `\\b(?:video|mp4|mov|avi|mkv|webm|gif)s?\\s+(?:to|into)\\s+\\w`,
    `\\b(?:${[
      "literature", "peer", "code", "performance", "judicial", "annual", "systematic",
      "employee", "self", "case", "mid-year", "book", "restaurant", "hotel", "product",
      "customer", "google", "yelp", "tripadvisor", "trustpilot",
    ].join("|")})\\s+reviews?\\b`,
    `\\breviews?\\s+(?:${[
      "questions?", "process", "templates?", "forms?", "policy", "guidelines?", "board",
      "sheet", "centers?", "articles?", "papers?", "sites?", "scores?",
    ].join("|")})\\b`,
    `^how to (?:say|spell|pronounce|cancel|unsubscribe|contact|call|email|get to|delete my|deactivate)\\b`,
  ].join("|"),
  "i",
);

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function cleanQuery(query) {
  const text = String(query || "").replace(/\s+/g, " ").trim();
  if (text.length < 2 || text.length > 120 || text.split(" ").length > 12) return "";
  if (BANG_RX.test(text) || URLISH_RX.test(text) || !/\p{L}/u.test(text)) return "";
  return text;
}

// What the query itself asks for, before the per-strip settings apply. A lone
// keyword ("videos", "reviews") names no subject, so it needs a second word.
export function mediaIntent(query) {
  const text = cleanQuery(query);
  if (!text || !text.includes(" ")) return { images: false, videos: false };
  const videos = VIDEO_RX.test(text) && !VIDEO_BLOCK_RX.test(text);
  // Questions and instructions ("how to change profile picture") want
  // answers, not a picture row; "what does … look like" is the exception.
  const question = /^(?:how|why|can|could|should|is|are|do|does|did|when|where|which|who)\b/i.test(text);
  const images = IMAGE_RX.test(text) && !IMAGE_BLOCK_RX.test(text) &&
    (!question || /\blook like\b/i.test(text));
  return { images, videos };
}

export function wantedStrips(query, modes = settings) {
  if (!cleanQuery(query)) return { images: false, videos: false };
  const intent = mediaIntent(query);
  const pick = (kind) => modes[kind] === "always" || (modes[kind] === "auto" && intent[kind]);
  return { images: pick("images"), videos: pick("videos") };
}

// Installed search types, so a strip never asks for a tab with no engines.
async function installedTypes() {
  if (!searchTypes) return null;
  if (typesCache.types && Date.now() - typesCache.at < TYPES_TTL_MS) return typesCache.types;
  try {
    const types = await searchTypes();
    typesCache = { at: Date.now(), types: Array.isArray(types) ? types : null };
  } catch {
    typesCache = { at: Date.now(), types: null };
  }
  return typesCache.types;
}

const icon = (path) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
const ICONS = {
  prev: "M15.4 7.4 14 6l-6 6 6 6 1.4-1.4-4.6-4.6z",
  next: "M8.6 16.6 10 18l6-6-6-6-1.4 1.4 4.6 4.6z",
  arrow: "M12 4 10.6 5.4 16.2 11H4v2h12.2l-5.6 5.6L12 20l8-8z",
};

// Same frame as Top Stories: a heading over a divider, the row, then a
// "View all" pill on a divider line.
function renderSection(kind, query) {
  const href = `search?${new URLSearchParams({ q: query, type: kind })}`;
  const skeleton = Array.from(
    { length: SKELETONS[kind] },
    () => `<li class="mstrips__item mstrips__item--skeleton" aria-hidden="true"><span class="mstrips__skeleton"></span></li>`,
  ).join("");
  const label = LABELS[kind];
  return `<section class="mstrips__strip mstrips__strip--${kind}" data-mstrips-kind="${kind}" aria-label="${label.title}">
    <h2 class="mstrips__title">${label.title}</h2>
    <div class="mstrips__carousel">
      <button type="button" class="mstrips__nav mstrips__nav--prev" data-mstrips-nav="prev" aria-label="{{ t:plugin-media-strips.previous }}" hidden>${icon(ICONS.prev)}</button>
      <ul class="mstrips__track" role="list" aria-busy="true">${skeleton}</ul>
      <button type="button" class="mstrips__nav mstrips__nav--next" data-mstrips-nav="next" aria-label="{{ t:plugin-media-strips.next }}" hidden>${icon(ICONS.next)}</button>
    </div>
    <div class="mstrips__foot">
      <a class="mstrips__all" href="${escapeHtml(href)}" data-mstrips-all="${kind}" aria-label="${label.all}">{{ t:plugin-media-strips.viewAll }}${icon(ICONS.arrow)}</a>
    </div>
  </section>`;
}

// Function replacements keep "$&" and similar sequences in a query literal.
export function renderStrips(query, kinds) {
  const text = cleanQuery(query);
  if (!text || !kinds.length) return "";
  const values = {
    QUERY: escapeHtml(text),
    SECTIONS: kinds.map((kind) => renderSection(kind, text)).join(""),
  };
  return template.replace(/\{\{(QUERY|SECTIONS)\}\}/g, (_, key) => values[key]);
}

export const slot = {
  id: "media-strips",
  name: "Image & Video Strips",
  description: "Adds Google-style image and video rows to web results when a search asks for them.",
  position: "full-width-above-results",
  slotPositions: ["full-width-above-results", "above-results", "below-results"],
  isClientExposed: false,
  settingsSchema: [
    {
      key: "imagesMode",
      label: "Images strip",
      type: "select",
      options: MODES,
      optionLabels: MODE_LABELS,
      default: "auto",
      description:
        "By default the strip appears for searches like 'cat pictures', 'mountain wallpaper' or 'eiffel tower photos'. Each strip runs one extra search on your image engines.",
    },
    {
      key: "videosMode",
      label: "Videos strip",
      type: "select",
      options: MODES,
      optionLabels: MODE_LABELS,
      default: "auto",
      description:
        "By default the strip appears for searches like 'how to tie a tie', 'dune trailer' or 'python tutorial'. Each strip runs one extra search on your video engines.",
    },
  ],

  configure(values = {}) {
    settings.images = MODES.includes(values.imagesMode) ? values.imagesMode : "auto";
    settings.videos = MODES.includes(values.videosMode) ? values.videosMode : "auto";
  },

  init(ctx) {
    if (ctx?.template) template = ctx.template;
    if (typeof ctx?.searchTypes === "function") searchTypes = () => ctx.searchTypes();
    typesCache = { at: 0, types: null };
  },

  trigger(query) {
    const wanted = wantedStrips(query);
    return wanted.images || wanted.videos;
  },

  async execute(query) {
    try {
      const wanted = wantedStrips(query);
      const installed = await installedTypes();
      const kinds = ["images", "videos"].filter(
        (kind) => wanted[kind] && (!installed || installed.includes(kind)),
      );
      return { title: "", html: renderStrips(query, kinds) };
    } catch {
      return { html: "" };
    }
  },
};

export const slotPlugin = slot;
export default slot;
