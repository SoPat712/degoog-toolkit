const PLUGIN_API = `/api/plugin/${encodeURIComponent(__PLUGIN_ID__)}`;
const SETTINGS_URL = `${PLUGIN_API}/settings`;
const COMMANDS_URL = "/api/commands";
const CACHE_TTL_MS = 5 * 60 * 1000;
const HIDDEN_BANG_TRIGGERS = new Set(["autobang", "gif"]);

/** @type {Array<{trigger:string,name:string,description:string,aliases:string[]}> | null} */
let commandCache = null;
let cacheExpiry = 0;
let maxSuggestions = 6;
let debounceTimer = null;
let bangPaintFrame = 0;
let initialized = false;

const escapeHtml = (str) => {
  if (str == null) return "";
  const div = document.createElement("div");
  div.textContent = String(str);
  return div.innerHTML;
};

const escapeAttr = (str) =>
  escapeHtml(str).replace(/"/g, "&quot;").replace(/'/g, "&#039;");

function getSearchBarForInput(input) {
  if (!input) return null;
  return input.closest(".search-bar, .results-search-bar");
}

function getBangInput(target) {
  if (!(target instanceof HTMLElement)) return null;
  if (target.id === "search-input" || target.id === "results-search-input") {
    return target;
  }
  return null;
}

function getDropdownForInput(input) {
  if (!input) return null;
  if (input.id === "search-input") {
    return document.getElementById("ac-dropdown-home");
  }
  if (input.id === "results-search-input") {
    return document.getElementById("ac-dropdown-results");
  }
  return null;
}

function shouldShowBang(input) {
  const value = input?.value ?? "";
  if (!value.startsWith("!")) return false;
  return !value.slice(1).includes(" ");
}

function rememberBangTypedQuery(input) {
  if (!input || !shouldShowBang(input)) return;
  input.dataset.bangTypedQuery = input.value.slice(1).split(" ")[0] || "";
}

function getBangFilterQuery(input) {
  if (!input) return "";
  if (Object.prototype.hasOwnProperty.call(input.dataset, "bangTypedQuery")) {
    return String(input.dataset.bangTypedQuery).toLowerCase();
  }
  return input.value.slice(1).split(" ")[0].toLowerCase();
}

function isBangDropdownActive(dropdown) {
  return dropdown?.dataset?.autoBangActive === "true";
}

function clearBangDropdown(dropdown) {
  if (!dropdown) return;
  dropdown.querySelectorAll(".ac-item--bang").forEach((item) => item.remove());
  dropdown.dataset.autoBangActive = "";
  dropdown.dataset.bangTriggers = "";
}

function hideBangDropdown(dropdown) {
  if (!dropdown || !isBangDropdownActive(dropdown)) return;
  clearBangDropdown(dropdown);
  dropdown.style.display = "none";
  dropdown.parentElement?.classList.remove("ac-open");
}

function setBangInputValue(input, trigger, { trailingSpace = false } = {}) {
  if (!input || !trigger) return;
  input.value = trailingSpace ? `!${trigger} ` : `!${trigger}`;
  const end = input.value.length;
  input.setSelectionRange(end, end);
}

function submitBangInput(input, dropdown) {
  hideBangDropdown(dropdown);
  const form = input.closest("form");
  if (form) {
    if (typeof form.requestSubmit === "function") {
      form.requestSubmit();
    } else {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    }
    return;
  }
  document.getElementById("results-search-btn")?.click();
}

async function fetchCommands() {
  if (commandCache && Date.now() < cacheExpiry) return commandCache;
  try {
    const response = await fetch(COMMANDS_URL, { cache: "no-store" });
    if (!response.ok) return commandCache ?? [];
    const data = await response.json();
    commandCache = getVisibleCommands(data.commands ?? []);
    cacheExpiry = Date.now() + CACHE_TTL_MS;
    return commandCache;
  } catch {
    return commandCache ?? [];
  }
}

function getVisibleCommands(commands) {
  return commands.filter(
    (command) =>
      !HIDDEN_BANG_TRIGGERS.has(String(command.trigger || "").toLowerCase()),
  );
}

function scoreCommand(query, command) {
  const q = query.toLowerCase();
  const trigger = command.trigger.toLowerCase();
  const name = command.name.toLowerCase();
  const aliases = (command.aliases ?? []).map((alias) => alias.toLowerCase());

  if (trigger === q) return 0;
  if (aliases.some((alias) => alias === q)) return 1;
  if (trigger.startsWith(q)) return 10 + trigger.length;
  if (aliases.some((alias) => alias.startsWith(q))) {
    return (
      20 +
      Math.min(...aliases.filter((alias) => alias.startsWith(q)).map((alias) => alias.length))
    );
  }
  if (name.startsWith(q)) return 30 + name.length;

  const triggerIdx = trigger.indexOf(q);
  if (triggerIdx !== -1) return 50 + triggerIdx + trigger.length;

  const nameIdx = name.indexOf(q);
  if (nameIdx !== -1) return 70 + nameIdx + name.length;

  return null;
}

function filterCommands(query, commands) {
  const visible = getVisibleCommands(commands);
  const q = query.toLowerCase();
  if (!q) return visible.slice(0, maxSuggestions);

  const scored = [];
  for (const command of visible) {
    const score = scoreCommand(q, command);
    if (score !== null) scored.push({ command, score });
  }
  scored.sort((left, right) => left.score - right.score);
  return scored.slice(0, maxSuggestions).map((entry) => entry.command);
}

function applyBangSelection(input, dropdown, trigger, { submit = false } = {}) {
  if (!input || !trigger) return;
  setBangInputValue(input, trigger, { trailingSpace: true });
  input.focus();
  if (submit) {
    submitBangInput(input, dropdown);
  } else {
    hideBangDropdown(dropdown);
  }
}

function createBangItemElement(command) {
  const item = document.createElement("div");
  item.className = "ac-item ac-item--bang";
  item.dataset.trigger = command.trigger;
  item.dataset.text = `!${command.trigger}`;
  item.setAttribute("role", "option");
  item.setAttribute("tabindex", "-1");
  item.innerHTML = `<span class="ac-item-icon ac-item-icon--bang" aria-hidden="true"></span>
          <span class="ac-item-copy">
            <span class="ac-item-bang-trigger">!${escapeHtml(command.trigger)}</span>
            <span class="ac-item-bang-name">${escapeHtml(command.name)}</span>
            <span class="ac-item-bang-desc">${escapeHtml(command.description || "")}</span>
          </span>`;
  return item;
}

function updateBangItemElement(item, command) {
  const triggerEl = item.querySelector(".ac-item-bang-trigger");
  const nameEl = item.querySelector(".ac-item-bang-name");
  const descEl = item.querySelector(".ac-item-bang-desc");
  const triggerText = `!${command.trigger}`;
  if (item.dataset.text !== triggerText) {
    item.dataset.text = triggerText;
  }
  if (triggerEl && triggerEl.textContent !== triggerText) {
    triggerEl.textContent = triggerText;
  }
  if (nameEl && nameEl.textContent !== command.name) {
    nameEl.textContent = command.name;
  }
  const description = command.description || "";
  if (descEl && descEl.textContent !== description) {
    descEl.textContent = description;
  }
}

function bindBangItem(item, input, dropdown) {
  if (item.dataset.bangBound === "true") return;
  item.dataset.bangBound = "true";
  item.addEventListener("mousedown", (event) => {
    event.preventDefault();
    applyBangSelection(input, dropdown, item.dataset.trigger, { submit: true });
  });
}

function setActiveBangItem(items, activeIndex) {
  items.forEach((item, index) => {
    const isActive = index === activeIndex;
    item.classList.toggle("ac-item--bang-active", isActive);
    item.classList.toggle("active", isActive);
    item.classList.toggle("ac-active", isActive);
    item.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  if (activeIndex >= 0 && items[activeIndex]) {
    items[activeIndex].scrollIntoView({ block: "nearest" });
  }
}

function renderBangDropdown(commands, input, dropdown, options = {}) {
  if (!dropdown || !input) return;
  if (!shouldShowBang(input)) {
    hideBangDropdown(dropdown);
    return;
  }
  if (!commands.length) {
    hideBangDropdown(dropdown);
    return;
  }

  const nextTriggers = commands.map((command) => command.trigger);
  const nextKey = nextTriggers.join("|");
  const prevKey = dropdown.dataset.bangTriggers || "";
  const wasActive = isBangDropdownActive(dropdown);
  const activeTrigger =
    options.preserveActiveTrigger ||
    dropdown.querySelector(
      ".ac-item--bang.active, .ac-item--bang.ac-active, .ac-item--bang.ac-item--bang-active",
    )?.dataset.trigger ||
    "";

  if (wasActive && nextKey === prevKey && !options.forceRepaint) {
    if (dropdown.style.display !== "block") {
      dropdown.style.display = "block";
      dropdown.parentElement?.classList.add("ac-open");
    }
    if (activeTrigger) {
      const items = dropdown.querySelectorAll(".ac-item--bang");
      const activeIndex = [...items].findIndex(
        (item) => item.dataset.trigger === activeTrigger,
      );
      if (activeIndex >= 0) setActiveBangItem(items, activeIndex);
    }
    return;
  }

  const existingByTrigger = new Map();
  dropdown.querySelectorAll(".ac-item--bang").forEach((item) => {
    if (item.dataset.trigger) existingByTrigger.set(item.dataset.trigger, item);
  });

  dropdown.querySelectorAll(".ac-item:not(.ac-item--bang)").forEach((item) => {
    item.remove();
  });

  for (const command of commands) {
    let item = existingByTrigger.get(command.trigger);
    if (!item) {
      item = createBangItemElement(command);
      bindBangItem(item, input, dropdown);
    } else {
      existingByTrigger.delete(command.trigger);
      updateBangItemElement(item, command);
    }
    dropdown.appendChild(item);
  }

  existingByTrigger.forEach((item) => item.remove());

  dropdown.dataset.bangTriggers = nextKey;
  dropdown.dataset.autoBangActive = "true";
  dropdown.setAttribute("role", "listbox");

  if (dropdown.style.display !== "block") {
    dropdown.style.display = "block";
  }
  dropdown.parentElement?.classList.add("ac-open");

  if (activeTrigger) {
    const items = dropdown.querySelectorAll(".ac-item--bang");
    const activeIndex = [...items].findIndex(
      (item) => item.dataset.trigger === activeTrigger,
    );
    if (activeIndex >= 0) setActiveBangItem(items, activeIndex);
  }
}

function updateBangDropdownSync(input, dropdown, options = {}) {
  if (!input || !dropdown || !commandCache) return false;
  if (!shouldShowBang(input)) return false;
  const filtered = filterCommands(getBangFilterQuery(input), commandCache);
  renderBangDropdown(filtered, input, dropdown, options);
  return true;
}

async function updateBangDropdown(input, dropdown, options = {}) {
  if (!input || !dropdown) return;
  if (!shouldShowBang(input)) {
    hideBangDropdown(dropdown);
    return;
  }

  const commands = await fetchCommands();
  const filtered = filterCommands(getBangFilterQuery(input), commands);
  renderBangDropdown(filtered, input, dropdown, options);
}

function queueBangUpdate(input, dropdown) {
  clearTimeout(debounceTimer);

  if (!shouldShowBang(input)) {
    hideBangDropdown(dropdown);
    return;
  }

  rememberBangTypedQuery(input);

  const repaint = () => {
    if (!shouldShowBang(input)) {
      hideBangDropdown(dropdown);
      return;
    }
    if (!updateBangDropdownSync(input, dropdown)) {
      updateBangDropdown(input, dropdown);
    }
  };

  if (updateBangDropdownSync(input, dropdown)) {
    queueMicrotask(repaint);
    cancelAnimationFrame(bangPaintFrame);
    bangPaintFrame = requestAnimationFrame(repaint);
    return;
  }

  debounceTimer = setTimeout(repaint, 0);
}

function getHighlightedBangItem(dropdown) {
  if (!dropdown || !isBangDropdownActive(dropdown)) return null;
  return (
    dropdown.querySelector(
      '.ac-item--bang.active, .ac-item--bang.ac-active, .ac-item--bang.ac-item--bang-active, .ac-item--bang[aria-selected="true"]',
    ) ?? null
  );
}

function resolveBangTrigger(input, dropdown) {
  const items = dropdown.querySelectorAll(".ac-item--bang");
  if (!items.length) return "";
  const highlighted = getHighlightedBangItem(dropdown);
  return highlighted?.dataset.trigger || items[0]?.dataset.trigger || "";
}

function stopBangKeyEvent(event) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function handleBangKeydown(event, input, dropdown) {
  const items = dropdown.querySelectorAll(".ac-item--bang");
  if (!items.length) return false;

  if (event.key === "Escape") {
    stopBangKeyEvent(event);
    hideBangDropdown(dropdown);
    return true;
  }

  if (event.key === "Tab") {
    const trigger = resolveBangTrigger(input, dropdown);
    if (!trigger) return false;
    stopBangKeyEvent(event);
    applyBangSelection(input, dropdown, trigger, { submit: true });
    return true;
  }

  if (event.key === "Enter") {
    const trigger = resolveBangTrigger(input, dropdown);
    if (!trigger) return false;
    stopBangKeyEvent(event);
    applyBangSelection(input, dropdown, trigger, { submit: true });
    return true;
  }

  return false;
}

function loadSettings() {
  return fetch(SETTINGS_URL)
    .then((response) => (response.ok ? response.json() : null))
    .then((settings) => {
      const value = parseInt(settings?.maxSuggestions, 10);
      if (Number.isFinite(value) && value > 0) maxSuggestions = value;
    })
    .catch(() => {});
}

function bindBangSearchInput(input) {
  if (!(input instanceof HTMLInputElement) || input.dataset.bangKeyBound === "true") {
    return;
  }
  input.dataset.bangKeyBound = "true";

  // Arrow keys: degoog core autocomplete previews via data-text on .ac-item.
  // Capture Enter/Tab/Escape so we submit or dismiss before core only hides the list.
  input.addEventListener(
    "keydown",
    (event) => {
      const dropdown = getDropdownForInput(input);
      if (!dropdown || !isBangDropdownActive(dropdown)) return;
      if (!shouldShowBang(input)) return;
      if (!["Enter", "Tab", "Escape"].includes(event.key)) return;
      handleBangKeydown(event, input, dropdown);
    },
    true,
  );
}

function initAutoBang() {
  if (initialized) return;
  initialized = true;

  loadSettings().then(() => fetchCommands());

  for (const id of ["search-input", "results-search-input"]) {
    const input = document.getElementById(id);
    if (input instanceof HTMLInputElement) {
      bindBangSearchInput(input);
    }
  }

  document.addEventListener("input", (event) => {
    const input = getBangInput(event.target);
    const dropdown = getDropdownForInput(input);
    if (!input || !dropdown) return;
    if (!shouldShowBang(input)) {
      hideBangDropdown(dropdown);
      delete input.dataset.bangTypedQuery;
      return;
    }
    if (event.isTrusted) {
      const items = dropdown.querySelectorAll(".ac-item--bang");
      if (items.length) setActiveBangItem(items, -1);
    }
    queueBangUpdate(input, dropdown);
  });

  document.addEventListener("focusin", (event) => {
    const input = getBangInput(event.target);
    const dropdown = getDropdownForInput(input);
    if (!input || !dropdown || !shouldShowBang(input)) return;
    queueBangUpdate(input, dropdown);
  });

  document.addEventListener(
    "mousedown",
    (event) => {
      if (!(event.target instanceof Node)) return;
      for (const id of ["search-input", "results-search-input"]) {
        const input = document.getElementById(id);
        const dropdown = getDropdownForInput(input);
        const bar = getSearchBarForInput(input);
        if (!input || !dropdown || !bar) continue;
        if (!isBangDropdownActive(dropdown)) continue;
        if (!shouldShowBang(input)) continue;
        if (bar.contains(event.target)) continue;
        hideBangDropdown(dropdown);
      }
    },
    true,
  );

  document.addEventListener("focusout", (event) => {
    const bar =
      event.target instanceof Element
        ? event.target.closest(".search-bar, .results-search-bar")
        : null;
    if (!bar) return;
    requestAnimationFrame(() => {
      if (bar.contains(document.activeElement)) return;
      const dropdown = bar.querySelector(".ac-dropdown");
      const input = bar.querySelector("#search-input, #results-search-input");
      if (
        dropdown instanceof HTMLElement &&
        input instanceof HTMLInputElement &&
        shouldShowBang(input)
      ) {
        hideBangDropdown(dropdown);
      }
    });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAutoBang);
} else {
  initAutoBang();
}
