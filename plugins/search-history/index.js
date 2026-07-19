let maxEntries = 1000;

const command = {
  name: "Search history",
  description:
    "Stores search history in this browser with timestamps; !history shows a deletable list.",
  isClientExposed: false,
  trigger: "history",
  aliases: [],

  settingsSchema: [
    {
      key: "maxEntries",
      label: "Max entries",
      type: "number",
      default: "1000",
      min: "1",
      max: "100000",
      step: "1",
      description:
        "Maximum number of history entries to keep per browser/device (oldest removed when exceeded).",
    },
  ],

  configure(settings = {}) {
    const n = parseInt(settings.maxEntries, 10);
    maxEntries = Number.isFinite(n) && n > 0 ? Math.min(100000, n) : 1000;
  },

  async execute() {
    return {
      title: "",
      html: `<div id="history-plugin-root" class="search-history-result command-result" data-max-entries="${maxEntries}"><div class="no-results">Loading...</div></div>`,
      totalPages: 1,
    };
  },
};

export default command;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export const routes = [
  {
    method: "get",
    path: "config",
    handler: async () => jsonResponse({ maxEntries }),
  },
];
