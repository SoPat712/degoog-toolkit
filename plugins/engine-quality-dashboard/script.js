(() => {
  "use strict";
  const active = new WeakSet();
  const language = document.documentElement.lang || navigator.language || "en";
  const integer = value => new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(value);
  const decimal = value => value == null ? "—" : new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(value);
  const percent = value => value == null ? "—" : `${decimal(value)}%`;
  const duration = value => value == null ? "—" : value >= 1000 ? `${decimal(value / 1000)} s` : `${integer(value)} ms`;
  const percentile = value => value ? `${value.overflow ? ">" : "≤"} ${duration(value.overflow ? 600000 : value.ms)}` : "—";
  const time = value => value ? new Date(value).toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit" }) : "—";
  const date = value => new Date(value).toLocaleString(language, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  };

  function initialize(root) {
    if (active.has(root)) return;
    active.add(root);
    const base = root.dataset.apiBase;
    if (!base || !base.startsWith("/") || base.startsWith("//") || !base.includes("/api/plugin/")) return;
    let dictionaries = {};
    try { dictionaries = JSON.parse(root.dataset.eqI18n || "{}"); } catch {}
    const locale = language.toLowerCase().split("-")[0];
    const lookup = (catalog, key) => key.split(".").reduce((value, part) => value?.[part], catalog);
    const t = (key, values = {}) => String(lookup(dictionaries[locale], key) || lookup(dictionaries.en, key) || key)
      .replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match);
    root.querySelectorAll("[data-eq-text]").forEach(el => { el.textContent = t(el.dataset.eqText); });
    root.querySelectorAll("[data-eq-placeholder]").forEach(el => { el.placeholder = t(el.dataset.eqPlaceholder); });
    root.querySelectorAll("[data-eq-label]").forEach(el => { el.setAttribute("aria-label", t(el.dataset.eqLabel)); });
    const find = selector => root.querySelector(selector);
    const content = find("[data-eq-content]"), notice = find("[data-eq-access]"), locked = find("[data-eq-locked]");
    const exportButton = find("[data-eq-export]"), refreshButton = find("[data-eq-refresh]");
    const typeSelect = find("[data-eq-type]"), sortSelect = find("[data-eq-sort]"), search = find("[data-eq-search]");
    let windowValue = root.dataset.window || "24h", typeValue = "all", snapshot = null, controller, serial = 0;

    function headers() {
      let token;
      try { token = sessionStorage.getItem("degoog-settings-token"); } catch {}
      return { Accept: "application/json", ...(token ? { "x-settings-token": token } : {}) };
    }

    function accessMessage(text, error = false) {
      notice.textContent = text;
      notice.classList.toggle("eq-dashboard__notice--error", error);
      notice.hidden = !text;
    }

    function clearPrivateView(message, showLogin) {
      snapshot = null; content.hidden = true; exportButton.disabled = true;
      find("[data-eq-rows]").replaceChildren(); find("[data-eq-summary]").replaceChildren();
      find("[data-eq-chart]").replaceChildren(); find("[data-eq-saved]").textContent = "";
      locked.hidden = !showLogin; accessMessage(message, !showLogin);
    }

    function metric(label, value, detail) {
      const card = node("div", "eq-dashboard__metric");
      card.append(node("span", "eq-dashboard__metric-label", label), node("strong", "eq-dashboard__metric-value", value), node("span", "eq-dashboard__metric-detail", detail));
      return card;
    }

    function renderSummary(data) {
      const s = data.summary;
      find("[data-eq-summary]").replaceChildren(
        metric(t("liveRequests"), integer(s.live), t("cacheDetail", { count: integer(s.cached) })),
        metric(t("failedRequests"), integer(s.failed), t("failDetail", { rate: percent(s.failRate) })),
        metric(t("averageResponse"), duration(s.avgMs), t("p95Detail", { time: percentile(s.p95) })),
        metric(t("emptyReplies"), integer(s.empty), t("emptyDetail", { rate: percent(s.emptyRate) })),
      );
    }

    function renderChart(data) {
      const hour = 3_600_000;
      const spans = { "1h": 1, "6h": 6, "24h": 24, "48h": 48, "7d": 168 };
      const count = Math.min(spans[data.window] || 24, data.retentionHours);
      const end = Math.floor(data.generatedAt / hour) * hour;
      const start = end - count * hour;
      const map = new Map(data.trend.map(b => [b.at, b]));
      const bars = [];
      // Limit long windows to 48 display bars; stored hourly counters remain exact.
      const step = Math.max(1, Math.ceil((count + 1) / 48));
      for (let at = start; at <= end; at += hour * step) {
        const group = { at, live: 0, failed: 0 };
        for (let offset = 0; offset < step; offset++) {
          const b = map.get(at + offset * hour);
          if (b) { group.live += b.live; group.failed += b.failed; }
        }
        bars.push(group);
      }
      const max = Math.max(1, ...bars.map(b => b.live));
      const elements = bars.map(b => {
        const bar = node("div", "eq-dashboard__bar");
        const label = t("activityBar", { date: date(b.at), count: integer(b.live), failed: integer(b.failed) });
        bar.title = label; bar.setAttribute("aria-label", label); bar.setAttribute("role", "img");
        const failure = node("span", "eq-dashboard__bar-failed"), ok = node("span", "eq-dashboard__bar-ok");
        failure.style.height = `${b.failed / max * 100}%`; ok.style.height = `${(b.live - b.failed) / max * 100}%`;
        bar.append(failure, ok); return bar;
      });
      find("[data-eq-chart]").replaceChildren(...elements);
      find("[data-eq-chart-labels]").replaceChildren(node("span", "", date(start)), node("span", "", t("now")));
    }

    function cell(label, primary, secondary, className = "") {
      const td = node("td", className); td.dataset.label = label;
      td.append(node("span", "", primary));
      if (secondary) td.append(node("span", "eq-dashboard__detail", secondary));
      return td;
    }

    function renderRows() {
      if (!snapshot) return;
      const query = search.value.trim().toLocaleLowerCase();
      const rows = snapshot.rows.filter(r => `${r.name} ${r.type}`.toLocaleLowerCase().includes(query));
      const sorting = sortSelect.value;
      rows.sort((a, b) => {
        if (sorting === "name") return a.name.localeCompare(b.name) || a.type.localeCompare(b.type);
        const diff = sorting === "latency" ? (b.avgMs ?? -1) - (a.avgMs ?? -1) : sorting === "requests" ? b.live - a.live : (b.failRate ?? -1) - (a.failRate ?? -1);
        return diff || b.live - a.live || a.name.localeCompare(b.name);
      });
      const elements = rows.map(r => {
        const tr = node("tr");
        const engine = node("td"); engine.dataset.label = t("engine");
        engine.append(node("span", "eq-dashboard__engine-name", r.name), node("span", "eq-dashboard__detail", `${r.type} · ${t("cacheHits", { count: integer(r.cached) })}`));
        const failures = cell(t("failed"), integer(r.failed), percent(r.failRate), r.failRate >= 25 ? "eq-dashboard__failure--high" : r.failed ? "eq-dashboard__failure--some" : "");
        failures.title = Object.entries(r.statuses).filter(([s]) => s !== "ok").map(([s, n]) => `${t(`statuses.${s}`)}: ${n}`).join("; ") || t("noFailures");
        const last = r.lastFailure;
        const lastCell = node("td"); lastCell.dataset.label = t("latestFailure");
        if (last) {
          lastCell.append(node("span", "eq-dashboard__status", `${t(`statuses.${last.status}`)}${last.httpStatus ? ` · ${last.httpStatus}` : ""}`), node("span", "eq-dashboard__detail", date(last.at)));
        } else lastCell.textContent = "—";
        tr.append(engine, cell(t("liveRequests"), integer(r.live)), failures,
          cell(t("responseTime"), duration(r.avgMs), `p95 ${percentile(r.p95)}`),
          cell(t("results"), t("averageResults", { count: decimal(r.avgResults) }), t("emptyResults", { count: integer(r.empty), rate: percent(r.emptyRate) })), lastCell);
        return tr;
      });
      find("[data-eq-rows]").replaceChildren(...elements);
      find("[data-eq-count]").textContent = t("engineCount", { count: integer(rows.length) });
      const empty = find("[data-eq-empty]"); empty.hidden = rows.length > 0;
      empty.querySelector("h3").textContent = t(query ? "noMatching" : "noCalls");
      empty.querySelector("p").textContent = t(query ? "filterHelp" : "startHelp");
      find(".eq-dashboard__table-wrap").hidden = !rows.length;
    }

    function render(data) {
      snapshot = data; content.hidden = false; locked.hidden = true; exportButton.disabled = false;
      const types = data.types;
      typeSelect.replaceChildren(node("option", "", t("allTypes")), ...types.map(type => { const option = node("option", "", type); option.value = type; return option; }));
      typeSelect.options[0].value = "all"; typeSelect.value = typeValue;
      for (const button of root.querySelectorAll("[data-eq-window]")) button.setAttribute("aria-pressed", String(button.dataset.eqWindow === windowValue));
      renderSummary(data); renderChart(data); renderRows();
      const warnings = [data.storage.error ? t(data.storage.errorCode === "read_error" ? "storageReadError" : "storageWriteError") : "", !data.recording ? t("recordingPaused") : "",
        data.storage.dropped ? t("dropped", { count: integer(data.storage.dropped) }) : "",
        data.windowClamped ? t("retentionLimited", { hours: data.retentionHours }) : ""].filter(Boolean);
      accessMessage(warnings.join(" "), Boolean(data.storage.error || data.storage.dropped));
      find("[data-eq-saved]").textContent = t("historyStatus", { date: date(data.startedAt), saved: data.savedAt ? t("saved", { time: time(data.savedAt) }) : t("notSaved") }) + (data.storage.pending ? ` · ${t("pending")}` : "");
    }

    async function request(download = false) {
      const id = ++serial;
      controller?.abort(); controller = new AbortController();
      const endpoint = `${base}/${download ? "export" : "snapshot"}?${new URLSearchParams({ window: windowValue, type: typeValue })}`;
      refreshButton.disabled = true;
      try {
        const response = await fetch(endpoint, { headers: headers(), credentials: "same-origin", cache: "no-store", redirect: "error", signal: controller.signal });
        if (id !== serial || !root.isConnected) return;
        if (response.status === 401 || response.status === 403) { clearPrivateView("", true); return; }
        if (!response.ok) throw new Error(response.status === 503 ? t("authUnavailable") : t("loadError", { status: response.status }));
        const data = await response.json();
        if (id !== serial || !root.isConnected) return;
        if (download) {
          const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
          const anchor = node("a"); anchor.href = url; anchor.download = "engine-quality.json"; anchor.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } else render(data);
      } catch (error) {
        if (error.name !== "AbortError" && id === serial) clearPrivateView(error.message || t("connectionError"), false);
      } finally { if (id === serial) refreshButton.disabled = false; }
    }

    refreshButton.addEventListener("click", () => void request());
    exportButton.addEventListener("click", () => void request(true));
    root.querySelectorAll("[data-eq-window]").forEach(button => button.addEventListener("click", () => { windowValue = button.dataset.eqWindow; void request(); }));
    typeSelect.addEventListener("change", () => { typeValue = typeSelect.value; void request(); });
    sortSelect.addEventListener("change", renderRows); search.addEventListener("input", renderRows);
    const timer = setInterval(() => {
      if (!root.isConnected) { clearInterval(timer); controller?.abort(); return; }
      if (!document.hidden && find("[data-eq-live]").checked && !refreshButton.disabled) void request();
    }, 10000);
    void request();
  }

  function mount() { document.querySelectorAll(".eq-dashboard").forEach(initialize); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
  window.addEventListener("degoog-results-ready", mount);
  window.addEventListener("degoog-results-settled", mount);
  // Bang output can arrive after the normal results-ready event.
  new MutationObserver(records => {
    for (const record of records) for (const added of record.addedNodes) {
      if (added.nodeType !== Node.ELEMENT_NODE) continue;
      if (added.matches(".eq-dashboard")) initialize(added);
      else if (!added.closest(".eq-dashboard")) added.querySelectorAll(".eq-dashboard").forEach(initialize);
    }
  }).observe(document.body, { childList: true, subtree: true });
})();
