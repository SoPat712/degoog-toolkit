(() => {
  const PANEL_SELECTOR = ".sports-slot[data-sports-query]";
  const REFRESH_ENDPOINT = "/api/plugin/sports-slot/refresh";

  function formatClock(seconds) {
    const safe = Math.max(0, Number(seconds) || 0);
    const minutes = Math.floor(safe / 60);
    const remaining = String(safe % 60).padStart(2, "0");
    return `${minutes}:${remaining}`;
  }

  function formatCountdown(ms) {
    return Math.max(1, Math.ceil(ms / 1000));
  }

  function updateRefreshButton(panel) {
    const button = panel.querySelector("[data-sports-refresh]");
    if (!button) return;

    const nextRefreshAt = Number(panel.dataset.nextRefreshAt || 0);
    const remaining = nextRefreshAt - Date.now();

    if (remaining > 0) {
      button.disabled = true;
      button.textContent = `Refresh (${formatCountdown(remaining)}s)`;
      return;
    }

    button.disabled = false;
    button.textContent = "Refresh";
  }

  function updateLiveClock(panel) {
    const node = panel.querySelector("[data-live-status]");
    if (!node) return;

    const seconds = Number(node.dataset.liveSeconds);
    if (!Number.isFinite(seconds)) return;

    const prefix = node.dataset.livePrefix || "";
    const nextSeconds = Math.max(0, seconds - 1);
    node.dataset.liveSeconds = String(nextSeconds);
    node.textContent = prefix ? `${prefix} • ${formatClock(nextSeconds)}` : formatClock(nextSeconds);
  }

  async function refreshPanel(panel, manual = false) {
    const query = panel.dataset.sportsQuery;
    if (!query || panel.dataset.refreshing === "true") return;

    const refreshMs = Number(panel.dataset.refreshMs || 0);
    const nextRefreshAt = Number(panel.dataset.nextRefreshAt || 0);
    if (manual && nextRefreshAt > Date.now()) {
      updateRefreshButton(panel);
      return;
    }

    panel.dataset.refreshing = "true";
    const button = panel.querySelector("[data-sports-refresh]");
    if (button) {
      button.disabled = true;
      button.textContent = "Refreshing...";
    }

    try {
      const response = await fetch(
        `${REFRESH_ENDPOINT}?query=${encodeURIComponent(query)}`,
        {
          headers: {
            Accept: "application/json",
          },
        }
      );
      const data = await response.json();
      const cooldownMs =
        Number(data.retryAfterMs) || refreshMs || 0;

      if (cooldownMs > 0) {
        panel.dataset.nextRefreshAt = String(Date.now() + cooldownMs);
      }

      if (data.html) {
        const wrapper = document.createElement("div");
        wrapper.innerHTML = data.html.trim();
        const nextPanel = wrapper.firstElementChild;
        if (nextPanel) {
          panel.replaceWith(nextPanel);
          initPanel(nextPanel);
          return;
        }
      }
    } catch {
      panel.dataset.nextRefreshAt = String(Date.now() + refreshMs);
    } finally {
      panel.dataset.refreshing = "false";
      if (document.body.contains(panel)) {
        updateRefreshButton(panel);
      }
    }
  }

  function initPanel(panel) {
    if (panel.dataset.sportsBound === "true") return;
    panel.dataset.sportsBound = "true";
    panel.dataset.nextRefreshAt = String(
      Date.now() + Number(panel.dataset.refreshMs || 0)
    );

    const refreshButton = panel.querySelector("[data-sports-refresh]");
    if (refreshButton) {
      refreshButton.addEventListener("click", () => refreshPanel(panel, true));
      updateRefreshButton(panel);
    }

    panel.querySelectorAll(".sports-slot__team-mark-image").forEach((image) => {
      image.addEventListener(
        "error",
        () => {
          image.remove();
        },
        { once: true }
      );
    });

    const ticker = window.setInterval(() => {
      if (!document.body.contains(panel)) {
        window.clearInterval(ticker);
        return;
      }

      updateRefreshButton(panel);

      if (panel.dataset.sportsLive === "true") {
        updateLiveClock(panel);

        const nextRefreshAt = Number(panel.dataset.nextRefreshAt || 0);
        if (
          panel.dataset.sportsProvider === "balldontlie" &&
          nextRefreshAt > 0 &&
          Date.now() >= nextRefreshAt
        ) {
          refreshPanel(panel, false);
        }
      }
    }, 1000);
  }

  function initAll(root = document) {
    root.querySelectorAll(PANEL_SELECTOR).forEach(initPanel);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initAll());
  } else {
    initAll();
  }
})();
