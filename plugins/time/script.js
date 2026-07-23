(function () {
  "use strict";

  const CARD_SELECTOR = "[data-time-card]";
  const liveCards = new Set();
  let tickIntervalId = 0;

  function formatClock(date, timezone, hour12Mode) {
    const opts = {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
    };
    if (hour12Mode === "true") opts.hour12 = true;
    else if (hour12Mode === "false") opts.hour12 = false;
    return date.toLocaleTimeString(undefined, opts);
  }

  function formatDateLine(date, timezone) {
    const dateStr = date.toLocaleDateString(undefined, {
      timeZone: timezone,
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    let offset = "";
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        timeZoneName: "shortOffset",
      }).formatToParts(date);
      offset = parts.find((part) => part.type === "timeZoneName")?.value || "";
    } catch {}
    return offset ? `${dateStr} (${offset})` : dateStr;
  }

  function tick(card) {
    const timezone = card.dataset.timezone;
    if (!timezone) return;
    const hour12Mode = card.dataset.hour12 || "auto";
    const now = new Date();
    const clock = card.querySelector("[data-time-clock]");
    const date = card.querySelector("[data-time-date]");
    if (clock) clock.textContent = formatClock(now, timezone, hour12Mode);
    if (date) date.textContent = formatDateLine(now, timezone);
  }

  function initCard(card) {
    tick(card);
    if (card.dataset.timeLive !== "true") return;
    liveCards.add(card);
    ensureTicker();
  }

  function pruneAndTick() {
    liveCards.forEach((card) => {
      if (!card.isConnected) {
        liveCards.delete(card);
        return;
      }
      tick(card);
    });

    if (!liveCards.size && tickIntervalId) {
      window.clearInterval(tickIntervalId);
      tickIntervalId = 0;
    }
  }

  function ensureTicker() {
    if (tickIntervalId || !liveCards.size) return;
    tickIntervalId = window.setInterval(pruneAndTick, 1000);
  }

  function scan(root) {
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) {
      return;
    }

    if (root.matches?.(CARD_SELECTOR)) initCard(root);
    root.querySelectorAll?.(CARD_SELECTOR).forEach(initCard);
  }

  function init() {
    scan(document);

    const observer = new MutationObserver((records) => {
      records.forEach((record) => {
        record.addedNodes.forEach(scan);
      });
      pruneAndTick();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    window.addEventListener(
      "pagehide",
      () => {
        observer.disconnect();
        liveCards.clear();
        if (tickIntervalId) window.clearInterval(tickIntervalId);
        tickIntervalId = 0;
      },
      { once: true },
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
