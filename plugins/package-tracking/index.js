import {
  UNIVERSAL_TRACKER,
  formatTrackingNumber,
  parseTrackingQuery,
  universalUrl,
} from "./tracking-numbers.js";

export { parseTrackingQuery } from "./tracking-numbers.js";

let template = "";

const BOX_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2.5 3.5 7v10l8.5 4.5 8.5-4.5V7L12 2.5Zm0 2.26L18.06 8 12 11.24 5.94 8 12 4.76ZM5.5 9.68l5.5 2.94v6.5l-5.5-2.92V9.68Zm7.5 9.44v-6.5l5.5-2.94v6.52L13 19.12Z"/></svg>';
const COPY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 7V4.5A1.5 1.5 0 0 1 9.5 3h10A1.5 1.5 0 0 1 21 4.5v10a1.5 1.5 0 0 1-1.5 1.5H17v2.5a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 4 18.5v-10A1.5 1.5 0 0 1 5.5 7H8Zm2 0h5.5A1.5 1.5 0 0 1 17 8.5V14h2V5h-9v2Zm-4 2v9h9V9H6Z"/></svg>';
const OPEN_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42L17.59 5H14V3ZM5 5h6v2H5v12h12v-6h2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/></svg>';

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function countryName(code, locale) {
  try {
    const name = new Intl.DisplayNames([locale || "en", "en"], { type: "region" }).of(code);
    return name && name !== code ? name : code;
  } catch {
    return code;
  }
}

function carrierTitle(carrier, locale) {
  if (carrier.name) return escapeHtml(carrier.name);
  return `{{ t:plugin-package-tracking.postalService }} · ${escapeHtml(countryName(carrier.country, locale))}`;
}

function trackPill(name, url, primary) {
  return `<a class="pkgtrack-pill${primary ? " pkgtrack-pill-primary" : ""}" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${OPEN_ICON}<span>{{ t:plugin-package-tracking.trackOn }} ${escapeHtml(name)}</span></a>`;
}

/** The card for a parsed query; only the first carrier gets the filled pill. */
export function renderTrackingCard(parsed, locale) {
  const [first, ...others] = parsed.carriers;
  const display = formatTrackingNumber(parsed.number);
  const universal = universalUrl(parsed.number);
  const actions = [
    first.url ? trackPill(first.name, first.url, true) : "",
    trackPill(UNIVERSAL_TRACKER, universal, !first.url),
  ].join("");
  const alternatives = others.length
    ? `<div class="pkgtrack-alternatives">
        <div class="pkgtrack-note">{{ t:plugin-package-tracking.ambiguous }}</div>
        <div class="pkgtrack-actions">${others.map((carrier) => trackPill(carrier.name, carrier.url, false)).join("")}</div>
      </div>`
    : "";
  const content = `<div class="pkgtrack-head">
      <div class="pkgtrack-icon">${BOX_ICON}</div>
      <div class="pkgtrack-heading">
        <div class="pkgtrack-kicker">{{ t:plugin-package-tracking.kicker }}</div>
        <h2 class="pkgtrack-carrier">${carrierTitle(first, locale)}</h2>
        <div class="pkgtrack-number-row">
          <span class="pkgtrack-number" translate="no">${escapeHtml(display)}</span>
          <button type="button" class="pkgtrack-copy" data-pkgtrack-copy="${escapeHtml(parsed.number)}" data-pkgtrack-copied="{{ t:plugin-package-tracking.copied }}" aria-label="{{ t:plugin-package-tracking.copyLabel }}">${COPY_ICON}<span>{{ t:plugin-package-tracking.copy }}</span></button>
        </div>
      </div>
    </div>
    <div class="pkgtrack-actions">${actions}</div>
    ${alternatives}
    <div class="pkgtrack-foot">{{ t:plugin-package-tracking.note }}</div>`;
  const source = template || '<div class="pkgtrack-card" data-pkgtrack-card>{{content}}</div>';
  return source.replace(/\{\{content\}\}/g, content);
}

export const slot = {
  id: "package-tracking",
  name: "Package Tracking",
  description: "Recognizes UPS, USPS, FedEx, DHL Express, Amazon and international postal tracking numbers offline.",
  isClientExposed: false,
  position: "full-width-above-results",
  slotPositions: ["full-width-above-results", "knowledge-panel"],

  init(ctx) {
    template = ctx?.template || "";
  },

  trigger(query) {
    return Boolean(parseTrackingQuery(query));
  },

  async execute(query, context) {
    const parsed = parseTrackingQuery(query);
    if (!parsed) return { title: "", html: "" };
    return { title: "", html: renderTrackingCard(parsed, context?.locale) };
  },
};

export const slotPlugin = slot;
export default slot;
