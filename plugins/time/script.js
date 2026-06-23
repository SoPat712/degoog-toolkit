(function () {
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
    if (card.dataset.timeIntervalId) return;
    const intervalId = window.setInterval(() => tick(card), 1000);
    card.dataset.timeIntervalId = String(intervalId);
  }

  function init() {
    document.querySelectorAll("[data-time-card]").forEach(initCard);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
