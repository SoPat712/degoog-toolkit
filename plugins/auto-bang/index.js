let maxSuggestions = 6;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

const command = {
  name: "Auto Bang",
  description:
    "Type ! in the search box to get instant bang command suggestions in the autocomplete dropdown.",
  isClientExposed: false,
  trigger: "autobang",

  settingsSchema: [
    {
      key: "maxSuggestions",
      label: "Max suggestions",
      type: "select",
      options: ["1", "2", "4", "6", "8", "10"],
      default: "6",
      description: "How many bang commands to show in the autocomplete dropdown.",
    },
  ],

  configure(settings = {}) {
    const value = parseInt(settings.maxSuggestions, 10);
    maxSuggestions = Number.isFinite(value) && value > 0 ? value : 6;
  },

  execute() {
    return {
      title: "Auto Bang",
      html: `<div class="command-result auto-bang-help">
        <p class="result-snippet">{{ t:plugin-auto-bang.help }}</p>
      </div>`,
    };
  },
};

export default command;

export const routes = [
  {
    method: "get",
    path: "settings",
    handler: async () => jsonResponse({ maxSuggestions }),
  },
];
