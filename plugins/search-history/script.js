const HISTORY_API = "/api/plugin/search-history";
const HISTORY_LIST_URL = `${HISTORY_API}/list?limit=10`;

const CLOCK_ICON =
  "<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' aria-hidden='true'><circle cx='12' cy='12' r='10'/><path d='M12 6v6l4 2'/></svg>";
const TRASH_ICON =
  "<svg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' aria-hidden='true'><path d='M3 6h18v2l-2 14H5L3 8V6z'/><path d='M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2'/><path d='M10 11v6'/><path d='M14 11v6'/></svg>";

const escapeHtml = (str) => {
  if (str == null) return "";
  const s = String(str);
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
};

function renderHistoryDropdown(entries, input, dropdown) {
  if (!dropdown || !input) return;
  dropdown.innerHTML = entries
    .map(
      (item) =>
        `<div class="ac-item ac-item--history" data-entry="${escapeHtml(item.entry)}" data-id="${escapeHtml(String(item.id))}" role="button" tabindex="0">
          <span class="ac-item-icon ac-item-icon--clock" aria-hidden="true">${CLOCK_ICON}</span>
          <span class="ac-item-text">${escapeHtml(item.entry)}</span>
          <button type="button" class="ac-item-delete" data-id="${escapeHtml(String(item.id))}" aria-label="Delete">${TRASH_ICON}</button>
        </div>`,
    )
    .join("");
  dropdown.style.display = entries.length ? "block" : "none";
  if (dropdown.parentElement) {
    if (entries.length) {
      dropdown.parentElement.classList.add("ac-open");
    } else {
      dropdown.parentElement.classList.remove("ac-open");
    }
  }

  dropdown.querySelectorAll(".ac-item--history").forEach((el) => {
    const textEl = el.querySelector(".ac-item-text");
    const deleteBtn = el.querySelector(".ac-item-delete");
    const entry = el.dataset.entry;
    const id = el.dataset.id;

    if (textEl) {
      textEl.addEventListener("mousedown", (e) => {
        e.preventDefault();
        input.value = entry;
        dropdown.style.display = "none";
        if (dropdown.parentElement) {
          dropdown.parentElement.classList.remove("ac-open");
        }
        const form = input.closest("form");
        if (form) {
          form.requestSubmit
            ? form.requestSubmit()
            : form.dispatchEvent(new Event("submit", { cancelable: true }));
          return;
        }
        const resultsBtn = document.getElementById("results-search-btn");
        if (resultsBtn) resultsBtn.click();
      });
    }

    if (deleteBtn) {
      deleteBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        fetch(`${HISTORY_API}/delete?id=${encodeURIComponent(id)}`, {
          method: "GET",
        })
          .then(() => fetch(HISTORY_LIST_URL))
          .then((r) => r.json())
          .then((list) =>
            renderHistoryDropdown(
              Array.isArray(list) ? list : [],
              input,
              dropdown,
            ),
          )
          .catch(() => {});
      });
    }
  });
}

function fetchAndShowHistory(input, dropdown) {
  if (!input || !dropdown) return;
  if (input.value.trim() !== "") return;
  fetch(HISTORY_LIST_URL)
    .then((r) => r.json())
    .then((list) => {
      if (input.value.trim() === "") {
        renderHistoryDropdown(Array.isArray(list) ? list : [], input, dropdown);
      }
    })
    .catch(() => {});
}

function appendHistory(entry) {
  const q = (entry || "").trim();
  if (!q) return;
  if (q === "!history" || q.startsWith("!history ")) return;
  const payload = JSON.stringify({ entry: q });

  // Prefer sendBeacon: survives the pagehide/navigation that follows
  // form submits and button clicks on search (full-page navigations
  // via navigateToSearch or form GET submit would otherwise abort a
  // plain fetch before the POST is sent).
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    try {
      const blob = new Blob([payload], {
        type: "application/json;charset=UTF-8",
      });
      if (navigator.sendBeacon(`${HISTORY_API}/append`, blob)) return;
    } catch {}
  }

  // Fallback: keepalive fetch so the request isn't aborted on unload.
  try {
    fetch(`${HISTORY_API}/append`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // ignore
  }
}

function bindInputFocus(input, dropdown) {
  if (!input || !dropdown) return;
  input.addEventListener("focus", () => fetchAndShowHistory(input, dropdown));
  // When the field is cleared while focused (e.g. backspace), show history without blur/refocus.
  input.addEventListener("input", () => {
    if (input.value.trim() === "") {
      fetchAndShowHistory(input, dropdown);
    }
  });
}

function bindHomeForm(form, input) {
  if (!form || !input) return;
  // Use capture so we fire before degoog's own submit handler that
  // calls preventDefault() and navigates via window.location.href.
  form.addEventListener(
    "submit",
    () => {
      appendHistory(input.value);
    },
    true,
  );
}

function bindResultsControls(input, btn) {
  if (!input) return;
  if (btn) {
    btn.addEventListener(
      "click",
      () => {
        appendHistory(input.value);
      },
      true,
    );
  }
  input.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Enter") appendHistory(input.value);
    },
    true,
  );
}

let bound = false;

function initSearchHistory() {
  if (bound) return;

  const searchInput = document.getElementById("search-input");
  const resultsInput = document.getElementById("results-search-input");
  const dropdownHome = document.getElementById("ac-dropdown-home");
  const dropdownResults = document.getElementById("ac-dropdown-results");
  const formHome = document.getElementById("search-form-home");
  const resultsBtn = document.getElementById("results-search-btn");

  // Each page (home vs results) only renders ONE of these input pairs.
  // Bail only when neither is present — otherwise attach to whichever
  // side is available so entries get persisted on either page.
  if (!searchInput && !resultsInput) return;

  bound = true;

  bindInputFocus(searchInput, dropdownHome);
  bindInputFocus(resultsInput, dropdownResults);

  bindHomeForm(formHome, searchInput);
  bindResultsControls(resultsInput, resultsBtn);
}

function tryInit() {
  initSearchHistory();
  if (bound) return;
  // degoog renders page templates client-side (renderPageTemplates),
  // so the search inputs may appear shortly after DOMContentLoaded.
  // Observe and retry until we've bound once.
  const observer = new MutationObserver(() => {
    initSearchHistory();
    if (bound) observer.disconnect();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  // Safety net: stop observing after 10s regardless.
  setTimeout(() => observer.disconnect(), 10000);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", tryInit);
} else {
  tryInit();
}
