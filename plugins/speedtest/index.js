let templateHtml = "";
let customServerProfiles = [];

const PLUGIN_NAME = "Speedtest";
const PLUGIN_DESCRIPTION =
  "Minimal internet speed test with selectable servers, latency, download-first flow, and a circular gauge.";
const NATURAL_LANGUAGE_PHRASES = [
  "speed test",
  "internet speed",
  "network speed",
  "wifi speed",
  "connection speed",
  "bandwidth test",
];

const AUTO_SERVER_PROFILE = {
  id: "auto",
  label: "Automatic (lowest latency)",
  auto: true,
};

const DEFAULT_SERVER_PROFILES = [
  {
    id: "new-york",
    label: "New York, United States",
    sponsorName: "Clouvider",
    downloadUrl: "https://nyc.speedtest.clouvider.net/backend/garbage.php",
    uploadUrl: "https://nyc.speedtest.clouvider.net/backend/empty.php",
    pingUrl: "https://nyc.speedtest.clouvider.net/backend/empty.php",
  },
  {
    id: "atlanta",
    label: "Atlanta, United States",
    sponsorName: "Clouvider",
    downloadUrl: "https://atl.speedtest.clouvider.net/backend/garbage.php",
    uploadUrl: "https://atl.speedtest.clouvider.net/backend/empty.php",
    pingUrl: "https://atl.speedtest.clouvider.net/backend/empty.php",
  },
  {
    id: "chicago",
    label: "Chicago, United States",
    sponsorName: "Sharktech",
    downloadUrl: "https://chispeed.sharktech.net/backend/garbage.php",
    uploadUrl: "https://chispeed.sharktech.net/backend/empty.php",
    pingUrl: "https://chispeed.sharktech.net/backend/empty.php",
  },
  {
    id: "los-angeles",
    label: "Los Angeles, United States",
    sponsorName: "Clouvider",
    downloadUrl: "https://la.speedtest.clouvider.net/backend/garbage.php",
    uploadUrl: "https://la.speedtest.clouvider.net/backend/empty.php",
    pingUrl: "https://la.speedtest.clouvider.net/backend/empty.php",
  },
  {
    id: "london",
    label: "London, England",
    sponsorName: "Clouvider",
    downloadUrl: "https://lon.speedtest.clouvider.net/backend/garbage.php",
    uploadUrl: "https://lon.speedtest.clouvider.net/backend/empty.php",
    pingUrl: "https://lon.speedtest.clouvider.net/backend/empty.php",
  },
  {
    id: "frankfurt",
    label: "Frankfurt, Germany",
    sponsorName: "Clouvider",
    downloadUrl: "https://fra.speedtest.clouvider.net/backend/garbage.php",
    uploadUrl: "https://fra.speedtest.clouvider.net/backend/empty.php",
    pingUrl: "https://fra.speedtest.clouvider.net/backend/empty.php",
  },
  {
    id: "amsterdam",
    label: "Amsterdam, Netherlands",
    sponsorName: "Clouvider",
    downloadUrl: "https://ams.speedtest.clouvider.net/backend/garbage.php",
    uploadUrl: "https://ams.speedtest.clouvider.net/backend/empty.php",
    pingUrl: "https://ams.speedtest.clouvider.net/backend/empty.php",
  },
  {
    id: "bangalore",
    label: "Bangalore, India",
    sponsorName: "DigitalOcean",
    downloadUrl: "https://in1.backend.librespeed.org/garbage.php",
    uploadUrl: "https://in1.backend.librespeed.org/empty.php",
    pingUrl: "https://in1.backend.librespeed.org/empty.php",
  },
  {
    id: "singapore",
    label: "Singapore",
    sponsorName: "Salvatore Cahyo",
    downloadUrl: "https://speedtest.dsgroupmedia.com/backend/garbage.php",
    uploadUrl: "https://speedtest.dsgroupmedia.com/backend/empty.php",
    pingUrl: "https://speedtest.dsgroupmedia.com/backend/empty.php",
  },
  {
    id: "tokyo",
    label: "Tokyo, Japan",
    sponsorName: "A573",
    downloadUrl: "https://librespeed.a573.net/backend/garbage.php",
    uploadUrl: "https://librespeed.a573.net/backend/empty.php",
    pingUrl: "https://librespeed.a573.net/backend/empty.php",
  },
];

const sharedSettingsSchema = [
  {
    key: "customServersJson",
    label: "Custom servers (JSON)",
    type: "textarea",
    placeholder:
      '[{"name":"My server","server":"https://example.com/backend/","dlURL":"garbage.php","ulURL":"empty.php","pingURL":"empty.php"}]',
    description:
      "Optional LibreSpeed-style servers appended to the built-in picker. Supports either {name, server, dlURL, ulURL, pingURL} or {label, downloadUrl, uploadUrl, pingUrl}.",
  },
];

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeJsonForScript(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeAbsoluteUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }

  const candidate = raw.startsWith("//") ? `https:${raw}` : raw;

  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol)) {
      return "";
    }

    return url.toString();
  } catch {
    return "";
  }
}

function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

function resolveServerUrl(baseUrl, path) {
  const safeBaseUrl = normalizeAbsoluteUrl(baseUrl);
  if (!safeBaseUrl) {
    return "";
  }

  const safePath = String(path ?? "").trim();
  if (!safePath) {
    return "";
  }

  try {
    return new URL(safePath, ensureTrailingSlash(safeBaseUrl)).toString();
  } catch {
    return "";
  }
}

function normalizeServerProfile(rawProfile) {
  const label = String(rawProfile?.label || rawProfile?.name || "").trim();
  const sponsorName = String(rawProfile?.sponsorName || "").trim();
  const normalizedBaseUrl = normalizeAbsoluteUrl(rawProfile?.server);
  const downloadUrl =
    normalizeAbsoluteUrl(rawProfile?.downloadUrl) ||
    resolveServerUrl(normalizedBaseUrl, rawProfile?.dlURL);
  const uploadUrl =
    normalizeAbsoluteUrl(rawProfile?.uploadUrl) ||
    resolveServerUrl(normalizedBaseUrl, rawProfile?.ulURL);
  const pingUrl =
    normalizeAbsoluteUrl(rawProfile?.pingUrl) ||
    resolveServerUrl(normalizedBaseUrl, rawProfile?.pingURL);
  const id = slugify(rawProfile?.id || label);

  if (!label || !downloadUrl || !uploadUrl || !pingUrl || !id) {
    return null;
  }

  return {
    id,
    label,
    sponsorName,
    auto: false,
    downloadUrl,
    uploadUrl,
    pingUrl,
  };
}

function dedupeProfiles(profiles) {
  const seen = new Set();
  return profiles.filter((profile) => {
    const id = String(profile?.id || "").trim().toLowerCase();
    if (!id || seen.has(id)) {
      return false;
    }

    seen.add(id);
    return true;
  });
}

function parseCustomServerProfiles(rawValue) {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return dedupeProfiles(parsed.map(normalizeServerProfile).filter(Boolean));
  } catch {
    return [];
  }
}

function configureSharedSettings(settings) {
  customServerProfiles = parseCustomServerProfiles(settings?.customServersJson);
}

function getActualServerProfiles() {
  return dedupeProfiles([
    ...DEFAULT_SERVER_PROFILES.map((profile) => ({ ...profile })),
    ...customServerProfiles.map((profile) => ({ ...profile })),
  ]);
}

function getAvailableServerProfiles() {
  return [AUTO_SERVER_PROFILE, ...getActualServerProfiles()];
}

function buildOptionLabel(profile) {
  if (profile.auto) {
    return profile.label;
  }

  return profile.sponsorName
    ? `${profile.label} - ${profile.sponsorName}`
    : profile.label;
}

function buildServerOptionsHtml(selectedId = AUTO_SERVER_PROFILE.id) {
  return getAvailableServerProfiles()
    .map((profile) => {
      const selected = profile.id === selectedId ? ' selected="selected"' : "";
      return `<option value="${escapeHtml(profile.id)}"${selected}>${escapeHtml(
        buildOptionLabel(profile)
      )}</option>`;
    })
    .join("");
}

function buildServerDataJson() {
  return escapeJsonForScript(
    getAvailableServerProfiles().map((profile) => ({
      ...profile,
      optionLabel: buildOptionLabel(profile),
    }))
  );
}

async function loadTemplate(ctx) {
  templateHtml = ctx?.template || "";
  if (!templateHtml && ctx?.readFile) {
    templateHtml = await ctx.readFile("template.html");
  }
}

function shouldTrigger(query) {
  const value = String(query ?? "").trim();
  if (!value) {
    return false;
  }

  return /\b(speed\s*test|speedtest|internet speed|network speed|wifi speed|connection speed|bandwidth test)\b/i.test(
    value
  );
}

function renderCardHtml() {
  if (!templateHtml) {
    return `<div class="speedtest-card"><p>${escapeHtml(PLUGIN_NAME)}</p></div>`;
  }

  return templateHtml
    .replace("{{server_options_html}}", buildServerOptionsHtml())
    .replace("{{server_data_json}}", buildServerDataJson());
}

export const routes = [];

export const slot = {
  id: "speedtest",
  name: PLUGIN_NAME,
  description: PLUGIN_DESCRIPTION,
  position: "at-a-glance",
  slotPositions: ["at-a-glance", "above-results", "knowledge-panel"],
  settingsSchema: sharedSettingsSchema,

  async init(ctx) {
    await loadTemplate(ctx);
  },

  configure: configureSharedSettings,

  trigger(query) {
    return shouldTrigger(query);
  },

  async execute(query, context) {
    if (context?.tab && context.tab !== "all") {
      return { html: "" };
    }

    if (!shouldTrigger(query)) {
      return { html: "" };
    }

    return {
      title: PLUGIN_NAME,
      html: renderCardHtml(),
    };
  },
};

export const slotPlugin = slot;

export const command = {
  name: PLUGIN_NAME,
  description: PLUGIN_DESCRIPTION,
  trigger: "speedtest",
  aliases: ["speed", "bandwidth"],
  naturalLanguagePhrases: NATURAL_LANGUAGE_PHRASES,
  settingsSchema: sharedSettingsSchema,

  async init(ctx) {
    await loadTemplate(ctx);
  },

  configure: configureSharedSettings,

  async execute() {
    return {
      title: PLUGIN_NAME,
      html: renderCardHtml(),
    };
  },
};

export default command;
