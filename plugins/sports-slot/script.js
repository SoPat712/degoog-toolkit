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

  function updateRefreshTrigger(panel) {
    const isRefreshing = panel.dataset.refreshing === "true";

    panel.querySelectorAll("[data-sports-refresh-control]").forEach((control) => {
      control.classList.toggle("sports-slot__live-control--refreshing", isRefreshing);
    });

    panel.querySelectorAll("[data-sports-refresh-trigger]").forEach((trigger) => {
      trigger.setAttribute("aria-busy", isRefreshing ? "true" : "false");
    });
  }

  function updateLiveClock(panel) {
    panel.querySelectorAll("[data-live-status]").forEach((node) => {
      const seconds = Number(node.dataset.liveSeconds);
      if (!Number.isFinite(seconds)) return;

      const prefix = node.dataset.livePrefix || "";
      const nextSeconds = Math.max(0, seconds - 1);
      node.dataset.liveSeconds = String(nextSeconds);
      const label = prefix
        ? `${prefix} • ${formatClock(nextSeconds)}`
        : formatClock(nextSeconds);
      const textNode = node.querySelector(".sports-slot__live-status-text");
      if (textNode) {
        textNode.textContent = label;
        return;
      }

      node.textContent = label;
    });
  }

  function repairPlayerAvatars(root) {
    root
      .querySelectorAll(".sports-slot__pitch-player-image, .sports-slot__lineup-bench-image")
      .forEach((image) => {
        if (image.dataset.sportsAvatarBound === "true") return;
        image.dataset.sportsAvatarBound = "true";

        const avatar =
          image.closest(".sports-slot__pitch-player-avatar") ||
          image.closest(".sports-slot__lineup-bench-item");

        const handleLoad = () => {
          if (avatar?.classList.contains("sports-slot__pitch-player-avatar")) {
            avatar.classList.add("sports-slot__pitch-player-avatar--ready");
          } else if (avatar?.classList.contains("sports-slot__lineup-bench-item")) {
            avatar.classList.add("sports-slot__lineup-bench-item--ready");
          }
        };

        const handleFailure = () => {
          if (avatar?.classList.contains("sports-slot__pitch-player-avatar")) {
            avatar.classList.remove("sports-slot__pitch-player-avatar--ready");
            if (!avatar.querySelector(".sports-slot__pitch-player-initials")) {
              const initials = document.createElement("span");
              initials.className = "sports-slot__pitch-player-initials";
              initials.textContent = avatar.dataset.jersey || "?";
              image.replaceWith(initials);
            } else {
              image.remove();
            }
            return;
          }

          image.remove();
        };

        image.addEventListener("load", handleLoad, { once: true });
        image.addEventListener("error", handleFailure, { once: true });

        if (image.complete && image.naturalWidth) {
          handleLoad();
        } else if (image.complete && !image.naturalWidth) {
          handleFailure();
        }
      });
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

  function collectStatState(panel) {
    const stats = new Map();

    panel.querySelectorAll("[data-stat-key]").forEach((row) => {
      const homeBar = row.querySelector(".sports-slot__stat-bar--home");
      const awayBar = row.querySelector(".sports-slot__stat-bar--away");
      const homeVal = row.querySelector(".sports-slot__stat-val--home");
      const awayVal = row.querySelector(".sports-slot__stat-val--away");

      stats.set(row.dataset.statKey, {
        homeWidth:
          homeBar?.style.width ||
          `${homeBar?.dataset.statHomePct || 50}%`,
        awayWidth:
          awayBar?.style.width ||
          `${awayBar?.dataset.statAwayPct || 50}%`,
        homeText: homeVal?.textContent?.trim() || "",
        awayText: awayVal?.textContent?.trim() || "",
      });
    });

    return stats;
  }

  function formatAnimatedStatValue(value, template = "") {
    const rounded = Math.round(value * 10) / 10;
    const display = Number.isInteger(rounded)
      ? String(Math.round(rounded))
      : rounded.toFixed(1);

    if (String(template).includes("%")) return `${display}%`;
    return display;
  }

  function animateStatValue(node, fromText, toText, duration = 650) {
    if (!node || fromText === toText) return;

    const fromNum = parseFloat(String(fromText).replace(/[^\d.]/g, ""));
    const toNum = parseFloat(String(toText).replace(/[^\d.]/g, ""));

    if (!Number.isFinite(fromNum) || !Number.isFinite(toNum) || fromNum === toNum) {
      node.textContent = toText;
      return;
    }

    const start = performance.now();
    const step = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      const value = fromNum + (toNum - fromNum) * eased;
      node.textContent = formatAnimatedStatValue(value, toText);

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        node.textContent = toText;
      }
    };

    requestAnimationFrame(step);
  }

  function animateStatBars(panel, previousStats) {
    if (!previousStats?.size) return;

    panel.querySelectorAll("[data-stat-key]").forEach((row) => {
      const previous = previousStats.get(row.dataset.statKey);
      if (!previous) return;

      const homeBar = row.querySelector(".sports-slot__stat-bar--home");
      const awayBar = row.querySelector(".sports-slot__stat-bar--away");
      const homeVal = row.querySelector(".sports-slot__stat-val--home");
      const awayVal = row.querySelector(".sports-slot__stat-val--away");

      if (homeBar) {
        const targetWidth = homeBar.style.width;
        homeBar.style.width = previous.homeWidth;
        requestAnimationFrame(() => {
          homeBar.style.width = targetWidth;
        });
      }

      if (awayBar) {
        const targetWidth = awayBar.style.width;
        awayBar.style.width = previous.awayWidth;
        requestAnimationFrame(() => {
          awayBar.style.width = targetWidth;
        });
      }

      animateStatValue(homeVal, previous.homeText, homeVal?.textContent?.trim() || "");
      animateStatValue(awayVal, previous.awayText, awayVal?.textContent?.trim() || "");
    });
  }

  function collectTimelineKeys(panel) {
    return new Set(
      [...panel.querySelectorAll("[data-timeline-key]")].map(
        (node) => node.dataset.timelineKey,
      ),
    );
  }

  function collectPenaltyShotKeys(panel) {
    return new Set(
      [...panel.querySelectorAll("[data-penalty-shot-key]")].map(
        (node) => node.dataset.penaltyShotKey,
      ),
    );
  }

  function prefersReducedMotion() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  }

  function markNewNodes(nodes, className) {
    if (!nodes.length) return;
    requestAnimationFrame(() => {
      for (const node of nodes) {
        node.classList.add(className);
      }
    });
  }

  function animateNewPenaltyShots(panel, previousKeys) {
    if (!previousKeys?.size) return;

    const newShots = [...panel.querySelectorAll("[data-penalty-shot-key]")].filter(
      (node) => !previousKeys.has(node.dataset.penaltyShotKey),
    );
    markNewNodes(newShots, "sports-slot__penalty-shot--enter");
  }

  function measureInsertedTimelineHeight(newEvents) {
    const first = newEvents[0];
    const last = newEvents[newEvents.length - 1];
    if (!first || !last) return 0;

    const firstTop = first.offsetTop;
    const lastBottom = last.offsetTop + last.offsetHeight;
    return Math.max(0, lastBottom - firstTop);
  }

  function animateNewTimelineEvents(panel, previousKeys, previousScrollTop = 0) {
    if (!previousKeys?.size) return;

    const newEvents = [...panel.querySelectorAll("[data-timeline-key]")].filter(
      (node) => !previousKeys.has(node.dataset.timelineKey),
    );
    if (!newEvents.length) return;

    const isTimelineActive =
      panel.dataset.activeTab === "timeline" ||
      panel.querySelector(".sports-slot__tab--active")?.dataset.tab === "timeline";
    const timelineBody = panel.querySelector(".sports-slot__timeline-body");
    const eventsContainer = panel.querySelector(".sports-slot__timeline-events");

    if (
      !isTimelineActive ||
      !(timelineBody instanceof HTMLElement) ||
      !(eventsContainer instanceof HTMLElement) ||
      prefersReducedMotion()
    ) {
      markNewNodes(newEvents, "sports-slot__timeline-event--enter");
      return;
    }

    const insertedHeight = measureInsertedTimelineHeight(newEvents);
    if (insertedHeight <= 0) {
      markNewNodes(newEvents, "sports-slot__timeline-event--enter");
      return;
    }

    const previousTop = Number(previousScrollTop) || 0;
    const wasNearTop = previousTop <= 16;

    if (!wasNearTop) {
      timelineBody.scrollTop = previousTop + insertedHeight;
      markNewNodes(newEvents, "sports-slot__timeline-event--enter");
      return;
    }

    eventsContainer.style.transition = "none";
    eventsContainer.style.transform = `translateY(-${insertedHeight}px)`;
    eventsContainer.style.willChange = "transform";

    requestAnimationFrame(() => {
      markNewNodes(newEvents, "sports-slot__timeline-event--enter");

      requestAnimationFrame(() => {
        eventsContainer.style.transition = "transform 460ms cubic-bezier(0.2, 0.82, 0.2, 1)";
        eventsContainer.style.transform = "translateY(0)";

        const cleanup = () => {
          eventsContainer.style.transition = "";
          eventsContainer.style.transform = "";
          eventsContainer.style.willChange = "";
          eventsContainer.removeEventListener("transitionend", cleanup);
        };

        eventsContainer.addEventListener("transitionend", cleanup, { once: true });
      });
    });
  }

  function restoreScrollPosition(scrollY) {
    if (!Number.isFinite(scrollY)) return;
    window.scrollTo(0, scrollY);
  }

  function getTimelineBodyScroll(panel) {
    const body = panel.querySelector(".sports-slot__timeline-body");
    return body instanceof HTMLElement ? body.scrollTop : null;
  }

  function restoreTimelineBodyScroll(panel, scrollTop) {
    if (!Number.isFinite(scrollTop)) return;
    const body = panel.querySelector(".sports-slot__timeline-body");
    if (body instanceof HTMLElement) {
      body.scrollTop = scrollTop;
    }
  }

  function buildRefreshParams(panel, browseOverrides = {}) {
    const params = new URLSearchParams();
    params.set("query", panel.dataset.sportsQuery || "");

    const focusEventId =
      browseOverrides.focusEventId !== undefined
        ? browseOverrides.focusEventId
        : panel.dataset.sportsFocusEventId || "";
    const defaultEventId = panel.dataset.sportsDefaultEventId || "";

    if (focusEventId) params.set("eventId", focusEventId);
    if (defaultEventId) params.set("defaultEventId", defaultEventId);

    return params;
  }

  async function refreshPanel(panel, _manual = false, browseOverrides = {}) {
    const query = panel.dataset.sportsQuery;
    if (!query || panel.dataset.refreshing === "true") return;

    const refreshMs = Number(panel.dataset.refreshMs || 0);


    panel.dataset.refreshing = "true";
    updateRefreshTrigger(panel);

    const controller =
      typeof AbortController === "function" ? new AbortController() : null;
    const timeout = controller
      ? window.setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS)
      : null;

    try {
      const params = buildRefreshParams(panel, browseOverrides);
      const response = await fetch(`${REFRESH_ENDPOINT}?${params.toString()}`, {
          headers: {
            Accept: "application/json",
          },
          ...(controller ? { signal: controller.signal } : {}),
        },
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
          const scrollY = window.scrollY;
          const timelineScrollTop = getTimelineBodyScroll(panel);
          const timelineKeys = collectTimelineKeys(panel);
          const penaltyKeys = collectPenaltyShotKeys(panel);
          const statState = collectStatState(panel);

          panel.replaceWith(nextPanel);
          initPanel(nextPanel);
          restoreScrollPosition(scrollY);

          if (activeTab) {
            const nextTabBtn = nextPanel.querySelector(`.sports-slot__tab[data-tab="${activeTab}"]`);
            if (nextTabBtn) nextTabBtn.click();
          }
          if (activeSubTab) {
            const nextSubTabBtn = nextPanel.querySelector(`.sports-slot__sub-tab[data-sub-tab="${activeSubTab}"]`);
            if (nextSubTabBtn) nextSubTabBtn.click();
          }

          restoreScrollPosition(scrollY);
          restoreTimelineBodyScroll(nextPanel, timelineScrollTop);
          animateNewTimelineEvents(nextPanel, timelineKeys, timelineScrollTop);
          animateNewPenaltyShots(nextPanel, penaltyKeys);
          animateStatBars(nextPanel, statState);
          return;
        }
      }
    } catch {
      panel.dataset.nextRefreshAt = String(Date.now() + refreshMs);
    } finally {
      if (timeout) window.clearTimeout(timeout);
      panel.dataset.refreshing = "false";
      if (document.body.contains(panel)) {
        updateRefreshTrigger(panel);
      }
    }
  }

  function bindRefreshTrigger(panel) {
    if (panel.dataset.sportsRefreshDelegated === "true") return;
    panel.dataset.sportsRefreshDelegated = "true";

    panel.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-sports-refresh-trigger]");
      if (!trigger || !panel.contains(trigger)) return;
      if (panel.dataset.refreshing === "true") return;
      event.preventDefault();
      refreshPanel(panel, true);
    });

    panel.addEventListener("keydown", (event) => {
      const trigger = event.target.closest("[data-sports-refresh-trigger]");
      if (!trigger || !panel.contains(trigger)) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      if (panel.dataset.refreshing === "true") return;
      refreshPanel(panel, true);
    });
  }

  function bindMatchBrowsing(panel) {
    panel.querySelectorAll("[data-sports-match-id]").forEach((card) => {
      card.addEventListener("click", () => {
        const matchId = card.dataset.sportsMatchId;
        if (!matchId || matchId === panel.dataset.sportsFocusEventId) return;
        refreshPanel(panel, true, { focusEventId: matchId });
      });

      card.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        card.click();
      });
    });

    const latestButton = panel.querySelector("[data-sports-latest]");
    latestButton?.addEventListener("click", () => {
      refreshPanel(panel, true, { focusEventId: "" });
    });
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

    if (panel.dataset.refreshable === "true") {
      bindRefreshTrigger(panel);
      updateRefreshTrigger(panel);
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

    repairBrokenLogos(panel);
    repairPlayerAvatars(panel);
    bindMatchBrowsing(panel);

    const ticker = window.setInterval(() => {
      if (!document.body.contains(panel)) {
        window.clearInterval(ticker);
        return;
      }

      updateRefreshTrigger(panel);

      if (panel.dataset.sportsLive === "true") {
        updateLiveClock(panel);

        const refreshMs = Number(panel.dataset.refreshMs || 0);
        const nextRefreshAt = Number(panel.dataset.nextRefreshAt || 0);
        if (
          panel.dataset.refreshable === "true" &&
          refreshMs > 0 &&
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
    repairPlayerAvatars(root);
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
