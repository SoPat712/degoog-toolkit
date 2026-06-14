(() => {
  const PANEL_SELECTOR = ".sports-slot[data-sports-query]";
  const PLUGIN_API_BASE = `/api/plugin/${encodeURIComponent(__PLUGIN_ID__)}`;
  const REFRESH_ENDPOINT = `${PLUGIN_API_BASE}/refresh`;
  const REFRESH_TIMEOUT_MS = 12_000;

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
    node.textContent = prefix
      ? `${prefix} • ${formatClock(nextSeconds)}`
      : formatClock(nextSeconds);
  }

  function repairBrokenLogos(root) {
    root.querySelectorAll(".sports-slot__team-mark-image").forEach((image) => {
      if (image.dataset.sportsLogoBound === "true") return;
      image.dataset.sportsLogoBound = "true";

      const handleLoad = () => {
        image.closest(".sports-slot__team-mark")?.classList.add(
          "sports-slot__team-mark--logo-ready"
        );
      };

      const handleFailure = () => {
        image.closest(".sports-slot__team-mark")?.classList.remove(
          "sports-slot__team-mark--logo-ready"
        );
        image.remove();
      };

      image.addEventListener("load", handleLoad, { once: true });

      image.addEventListener(
        "error",
        handleFailure,
        { once: true }
      );

      if (image.complete && image.naturalWidth) {
        handleLoad();
      } else if (image.complete && !image.naturalWidth) {
        handleFailure();
      }
    });
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

    const controller =
      typeof AbortController === "function" ? new AbortController() : null;
    const timeout = controller
      ? window.setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS)
      : null;

    try {
      const response = await fetch(
        `${REFRESH_ENDPOINT}?query=${encodeURIComponent(query)}`,
        {
          headers: {
            Accept: "application/json",
          },
          ...(controller ? { signal: controller.signal } : {}),
        }
      );
      if (!response.ok) {
        throw new Error(`Refresh failed (${response.status})`);
      }
      const data = await response.json();
      const cooldownMs = Number(data.retryAfterMs) || refreshMs || 0;

      if (cooldownMs > 0) {
        panel.dataset.nextRefreshAt = String(Date.now() + cooldownMs);
      }

      if (data.html) {
        const wrapper = document.createElement("div");
        wrapper.innerHTML = data.html.trim();
        const nextPanel = wrapper.firstElementChild;
        if (nextPanel) {
          const activeTab = panel.querySelector(".sports-slot__tab--active")?.dataset.tab;
          const activeSubTab = panel.querySelector(".sports-slot__sub-tab--active")?.dataset.subTab;

          panel.replaceWith(nextPanel);
          initPanel(nextPanel);

          if (activeTab) {
            const nextTabBtn = nextPanel.querySelector(`.sports-slot__tab[data-tab="${activeTab}"]`);
            if (nextTabBtn) nextTabBtn.click();
          }
          if (activeSubTab) {
            const nextSubTabBtn = nextPanel.querySelector(`.sports-slot__sub-tab[data-sub-tab="${activeSubTab}"]`);
            if (nextSubTabBtn) nextSubTabBtn.click();
          }
          return;
        }
      }
    } catch {
      panel.dataset.nextRefreshAt = String(Date.now() + refreshMs);
    } finally {
      if (timeout) window.clearTimeout(timeout);
      panel.dataset.refreshing = "false";
      if (document.body.contains(panel)) {
        updateRefreshButton(panel);
      }
    }
  }

  function initPanel(panel) {
    if (!(panel instanceof HTMLElement)) return;
    if (panel.dataset.sportsBound === "true") return;

    panel.dataset.sportsBound = "true";

    if (!panel.dataset.nextRefreshAt) {
      panel.dataset.nextRefreshAt = String(
        Date.now() + Number(panel.dataset.refreshMs || 0)
      );
    }

    const refreshButton = panel.querySelector("[data-sports-refresh]");
    if (refreshButton) {
      refreshButton.addEventListener("click", () => refreshPanel(panel, true));
      updateRefreshButton(panel);
    }

    const initialActiveTab = panel.querySelector(".sports-slot__tab--active")?.dataset.tab;
    if (initialActiveTab) {
      panel.dataset.activeTab = initialActiveTab;
    }

    panel.querySelectorAll(".sports-slot__tab").forEach((tabBtn) => {
      tabBtn.addEventListener("click", () => {
        const tabId = tabBtn.dataset.tab;
        panel.dataset.activeTab = tabId;
        panel.querySelectorAll(".sports-slot__tab").forEach((btn) => {
          btn.classList.toggle("sports-slot__tab--active", btn === tabBtn);
        });
        panel.querySelectorAll(".sports-slot__tab-panel").forEach((panelEl) => {
          if (panelEl.dataset.panel === tabId) {
            panelEl.style.display = "block";
            panelEl.classList.add("sports-slot__tab-panel--active");
          } else {
            panelEl.style.display = "none";
            panelEl.classList.remove("sports-slot__tab-panel--active");
          }
        });
      });
    });

    panel.querySelectorAll(".sports-slot__sub-tab").forEach((subTabBtn) => {
      subTabBtn.addEventListener("click", () => {
        const subTabId = subTabBtn.dataset.subTab;
        panel.querySelectorAll(".sports-slot__sub-tab").forEach((btn) => {
          btn.classList.toggle("sports-slot__sub-tab--active", btn === subTabBtn);
        });
        panel.querySelectorAll(".sports-slot__sub-tab-panel").forEach((panelEl) => {
          if (panelEl.dataset.subPanel === subTabId) {
            panelEl.style.display = "grid";
          } else {
            panelEl.style.display = "none";
          }
        });
      });
    });

    panel.querySelectorAll("img").forEach((img) => {
      img.addEventListener("error", () => {
        img.style.display = "none";
      }, { once: true });
    });

    repairBrokenLogos(panel);

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
    if (root instanceof HTMLElement && root.matches(PANEL_SELECTOR)) {
      initPanel(root);
    }

    root.querySelectorAll?.(PANEL_SELECTOR).forEach(initPanel);
    repairBrokenLogos(root);
  }

  function startObserver() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          initAll(node);
        });
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function boot() {
    initAll();
    startObserver();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
