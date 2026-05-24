(function () {
  const PERIOD_LABELS = {
    "1d": "1D",
    "5d": "5D",
    "1mo": "1M",
    "6mo": "6M",
    ytd: "YTD",
    max: "Max",
  };
  const PLUGIN_API_BASE =
    typeof __PLUGIN_ID__ === "undefined"
      ? ""
      : `/api/plugin/${encodeURIComponent(__PLUGIN_ID__)}`;
  const chartCache = new Map();
  const chartInFlight = new Map();

  function chartKey(symbol, period) {
    return `${symbol}|${period}`;
  }

  function chartUrl(symbol, period) {
    const params = new URLSearchParams({ symbol, period });
    return `${PLUGIN_API_BASE}/chart?${params.toString()}`;
  }

  function formatPrice(value, priceHint) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "";
    const hint = Number(priceHint);
    const decimals = Number.isFinite(hint)
      ? Math.max(0, Math.min(6, hint))
      : Math.abs(number) < 1
        ? 4
        : Math.abs(number) < 10
          ? 3
          : 2;
    return number.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  async function fetchChart(symbol, period) {
    const key = chartKey(symbol, period);
    if (chartCache.has(key)) return chartCache.get(key);
    if (chartInFlight.has(key)) return chartInFlight.get(key);

    const request = (async () => {
      const response = await fetch(chartUrl(symbol, period));
      if (!response.ok) return null;
      const payload = await response.json();
      if (!payload?.ok || !Array.isArray(payload.points)) return null;
      chartCache.set(key, payload);
      return payload;
    })();

    chartInFlight.set(key, request);
    try {
      return await request;
    } catch {
      return null;
    } finally {
      chartInFlight.delete(key);
    }
  }

  function setActivePeriod(chart, period) {
    chart.querySelectorAll(".stocks-period").forEach((button) => {
      const active = button.dataset.period === period;
      button.classList.toggle("stocks-period--active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function setLoading(body, stats, period) {
    if (body) {
      body.innerHTML = `<div class="stocks-chart-loading">Loading ${escapeHtml(
        PERIOD_LABELS[period] || period,
      )}</div>`;
    }
    if (stats) stats.textContent = "";
  }

  function setEmpty(body, stats) {
    if (body) {
      body.innerHTML = '<div class="stocks-sparkline-empty">No chart data</div>';
    }
    if (stats) stats.textContent = "";
  }

  function updateTrendClass(card, change) {
    card.classList.remove("stocks-card-up", "stocks-card-down", "stocks-card-flat");
    if (change > 0) card.classList.add("stocks-card-up");
    else if (change < 0) card.classList.add("stocks-card-down");
    else card.classList.add("stocks-card-flat");
  }

  function renderChart(card, body, stats, payload) {
    const points = payload.points
      .map((point) => ({
        price: Number(point.price),
        time: Number(point.time || 0),
      }))
      .filter((point) => Number.isFinite(point.price));

    if (!body || points.length < 2) {
      setEmpty(body, stats);
      return;
    }

    const prices = points.map((point) => point.price);
    const first = prices[0];
    const last = prices[prices.length - 1];
    const low = Math.min(...prices);
    const high = Math.max(...prices);
    const change = last - first;
    const changePercent = first ? (change / first) * 100 : 0;
    updateTrendClass(card, change);

    const W = body.clientWidth || 320;
    const H = body.clientHeight || 212;
    const padL = 52, padR = 10, padT = 15, padB = 20;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;
    const span = high - low || Math.max(Math.abs(high), 1) * 0.01;

    const coords = points.map((point, index) => {
      const x = padL + (index / (points.length - 1)) * chartW;
      const y = padT + chartH - ((point.price - low) / span) * chartH;
      return [x, y];
    });

    const path = coords.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
    const area = `${path} L ${coords[coords.length - 1][0].toFixed(2)} ${(padT + chartH).toFixed(2)} L ${coords[0][0].toFixed(2)} ${(padT + chartH).toFixed(2)} Z`;
    const label = escapeHtml(payload.label || PERIOD_LABELS[payload.period] || "");

    body.innerHTML = "";
    body.style.position = "relative";

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.setAttribute("class", "stocks-sparkline");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `${label} price chart`);
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");

    const defs = document.createElementNS(svgNS, "defs");
    const grad = document.createElementNS(svgNS, "linearGradient");
    grad.setAttribute("id", "stocks-grad");
    grad.setAttribute("x1", "0");
    grad.setAttribute("y1", "0");
    grad.setAttribute("x2", "0");
    grad.setAttribute("y2", "1");
    const stop1 = document.createElementNS(svgNS, "stop");
    stop1.setAttribute("offset", "0%");
    stop1.setAttribute("stop-color", "var(--stocks-line)");
    stop1.setAttribute("stop-opacity", "0.3");
    const stop2 = document.createElementNS(svgNS, "stop");
    stop2.setAttribute("offset", "100%");
    stop2.setAttribute("stop-color", "var(--stocks-line)");
    stop2.setAttribute("stop-opacity", "0");
    grad.appendChild(stop1);
    grad.appendChild(stop2);
    defs.appendChild(grad);
    svg.appendChild(defs);

    /* ── Grid lines + Y-axis price labels ── */
    const priceHint = payload.priceHint;
    for (let gi = 0; gi < 4; gi++) {
      const frac = gi / 3;
      const yVal = low + frac * span;
      const yPx = padT + chartH - frac * chartH;

      const gridLine = document.createElementNS(svgNS, "line");
      gridLine.setAttribute("x1", padL);
      gridLine.setAttribute("y1", yPx.toFixed(2));
      gridLine.setAttribute("x2", W - padR);
      gridLine.setAttribute("y2", yPx.toFixed(2));
      gridLine.setAttribute("class", "stocks-chart-grid-line");
      svg.appendChild(gridLine);

      const yLabel = document.createElementNS(svgNS, "text");
      yLabel.setAttribute("x", (padL - 8).toFixed(2));
      yLabel.setAttribute("y", (yPx + 4).toFixed(2));
      yLabel.setAttribute("class", "stocks-chart-y-label");
      yLabel.setAttribute("text-anchor", "end");
      yLabel.textContent = formatPrice(yVal, priceHint);
      svg.appendChild(yLabel);
    }

    /* ── X-axis time labels ── */
    const xLabelCount = 5;
    const xStep = Math.max(1, Math.floor(points.length / xLabelCount));
    for (let xi = 0; xi < points.length; xi += xStep) {
      const xLabel = document.createElementNS(svgNS, "text");
      xLabel.setAttribute("x", coords[xi][0].toFixed(2));
      xLabel.setAttribute("y", (H - 4).toFixed(2));
      xLabel.setAttribute("class", "stocks-chart-x-label");
      xLabel.setAttribute("text-anchor", "middle");
      xLabel.textContent = points[xi].time
        ? new Date(points[xi].time * 1000).toLocaleString("en-US", { hour: "numeric", minute: "2-digit" })
        : "";
      svg.appendChild(xLabel);
    }
    /* Show last label only if it won't overlap the previous one */
    const lastIdx = points.length - 1;
    const prevStepIdx = lastIdx - (lastIdx % xStep);
    const minGap = 60;
    if (lastIdx % xStep !== 0 && (coords[lastIdx][0] - coords[prevStepIdx][0]) >= minGap) {
      const lastXLabel = document.createElementNS(svgNS, "text");
      lastXLabel.setAttribute("x", coords[lastIdx][0].toFixed(2));
      lastXLabel.setAttribute("y", (H - 4).toFixed(2));
      lastXLabel.setAttribute("class", "stocks-chart-x-label");
      lastXLabel.setAttribute("text-anchor", "middle");
      lastXLabel.textContent = points[lastIdx].time
        ? new Date(points[lastIdx].time * 1000).toLocaleString("en-US", { hour: "numeric", minute: "2-digit" })
        : "";
      svg.appendChild(lastXLabel);
    }

    const areaEl = document.createElementNS(svgNS, "path");
    areaEl.setAttribute("d", area);
    areaEl.setAttribute("class", "stocks-sparkline-area");
    areaEl.setAttribute("fill", "url(#stocks-grad)");
    svg.appendChild(areaEl);

    const lineEl = document.createElementNS(svgNS, "path");
    lineEl.setAttribute("d", path);
    lineEl.setAttribute("class", "stocks-sparkline-line");
    svg.appendChild(lineEl);

    const lastPoint = coords[coords.length - 1];
    const dotEl = document.createElementNS(svgNS, "circle");
    dotEl.setAttribute("cx", lastPoint[0].toFixed(2));
    dotEl.setAttribute("cy", lastPoint[1].toFixed(2));
    dotEl.setAttribute("r", "3");
    dotEl.setAttribute("class", "stocks-sparkline-dot");
    svg.appendChild(dotEl);



    const hlGroup = document.createElementNS(svgNS, "g");
    hlGroup.setAttribute("class", "stocks-chart-hl");
    hlGroup.style.display = "none";
    const hlLine = document.createElementNS(svgNS, "line");
    hlLine.setAttribute("x1", "0");
    hlLine.setAttribute("y1", padT);
    hlLine.setAttribute("x2", "0");
    hlLine.setAttribute("y2", padT + chartH);
    hlLine.setAttribute("class", "stocks-chart-hl-line");
    const hlDot = document.createElementNS(svgNS, "circle");
    hlDot.setAttribute("cx", "0");
    hlDot.setAttribute("cy", "0");
    hlDot.setAttribute("r", "4");
    hlDot.setAttribute("class", "stocks-chart-hl-dot");
    hlGroup.appendChild(hlLine);
    hlGroup.appendChild(hlDot);
    svg.appendChild(hlGroup);

    const hitW = chartW / points.length;
    for (let hi = 0; hi < points.length; hi++) {
      const hitRect = document.createElementNS(svgNS, "rect");
      hitRect.setAttribute("x", (coords[hi][0] - hitW / 2).toFixed(2));
      hitRect.setAttribute("y", padT);
      hitRect.setAttribute("width", hitW.toFixed(2));
      hitRect.setAttribute("height", chartH);
      hitRect.setAttribute("class", "stocks-chart-hit");
      hitRect.setAttribute("data-i", hi);
      svg.appendChild(hitRect);
    }

    body.appendChild(svg);

    let tooltip = body.querySelector(".stocks-chart-tooltip");
    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.className = "stocks-chart-tooltip";
      body.appendChild(tooltip);
    }
    tooltip.style.display = "none";

    function showTooltip(i) {
      hlGroup.style.display = "";
      hlLine.setAttribute("x1", coords[i][0].toFixed(2));
      hlLine.setAttribute("x2", coords[i][0].toFixed(2));
      hlDot.setAttribute("cx", coords[i][0].toFixed(2));
      hlDot.setAttribute("cy", coords[i][1].toFixed(2));

      const priceHint = payload.priceHint;
      const dateStr = new Date(points[i].time * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
      tooltip.innerHTML = '<div class="stocks-tt-date">' + dateStr + '</div>' +
                          '<div class="stocks-tt-price">' + escapeHtml(formatPrice(points[i].price, priceHint)) + '</div>';
      
      tooltip.style.display = "";
      tooltip.classList.add("stocks-chart-tooltip--visible");

      const bodyRect = body.getBoundingClientRect();
      const svgRect = svg.getBoundingClientRect();
      const scaleX = svgRect.width / W;
      const pixelX = svgRect.left - bodyRect.left + coords[i][0] * scaleX;
      const ttW = tooltip.offsetWidth || 100;
      let left = pixelX - ttW / 2;
      if (left < 0) left = 0;
      if (left + ttW > bodyRect.width) left = bodyRect.width - ttW;
      tooltip.style.left = left + "px";
      tooltip.style.top = "0px";
    }

    function hideTooltip() {
      hlGroup.style.display = "none";
      tooltip.style.display = "none";
      tooltip.classList.remove("stocks-chart-tooltip--visible");
    }

    svg.querySelectorAll(".stocks-chart-hit").forEach((rect) => {
      rect.addEventListener("mouseenter", (e) => showTooltip(parseInt(rect.getAttribute("data-i"), 10)));
      rect.addEventListener("mousemove", (e) => showTooltip(parseInt(rect.getAttribute("data-i"), 10)));
    });
    body.addEventListener("mouseleave", hideTooltip);

    if (stats) {
      const priceHint = payload.priceHint;
      const sign = change >= 0 ? "+" : "";
      const trendClass =
        change >= 0 ? "stocks-chart-stat-value--up" : "stocks-chart-stat-value--down";
      stats.innerHTML = `
        <div class="stocks-chart-stat">
          <span class="stocks-chart-stat-label">Low</span>
          <span class="stocks-chart-stat-value">${escapeHtml(formatPrice(low, priceHint))}</span>
        </div>
        <div class="stocks-chart-stat">
          <span class="stocks-chart-stat-label">High</span>
          <span class="stocks-chart-stat-value">${escapeHtml(formatPrice(high, priceHint))}</span>
        </div>
        <div class="stocks-chart-stat">
          <span class="stocks-chart-stat-label">Last</span>
          <span class="stocks-chart-stat-value">${escapeHtml(formatPrice(last, priceHint))}</span>
        </div>
        <div class="stocks-chart-stat">
          <span class="stocks-chart-stat-label">Change</span>
          <span class="stocks-chart-stat-value ${trendClass}">${sign}${changePercent.toFixed(2)}%</span>
        </div>
      `;
    }
  }

  function initCard(card) {
    if (card.dataset.stocksChartInit) return;
    card.dataset.stocksChartInit = "1";

    const chart = card.querySelector(".stocks-chart");
    const body = card.querySelector(".stocks-chart-body");
    const stats = card.querySelector(".stocks-chart-stats");
    const symbol = chart?.dataset.symbol || card.dataset.symbol || "";
    if (!chart || !body || !symbol || !PLUGIN_API_BASE) return;

    chart.querySelectorAll(".stocks-period").forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        button.classList.contains("stocks-period--active") ? "true" : "false",
      );
      button.addEventListener("click", async () => {
        const period = button.dataset.period || "1d";
        setActivePeriod(chart, period);
        setLoading(body, stats, period);
        const payload = await fetchChart(symbol, period);
        if (!payload) {
          setEmpty(body, stats);
          return;
        }
        renderChart(card, body, stats, payload);
      });
    });

    // Silently fetch and render the active period on load to enable hover
    (async () => {
      const activeBtn = chart.querySelector(".stocks-period--active");
      const period = activeBtn ? activeBtn.dataset.period : "1d";
      const payload = await fetchChart(symbol, period);
      if (payload) {
        renderChart(card, body, stats, payload);
      }
    })();
  }

  function scan() {
    document
      .querySelectorAll(".stocks-card:not([data-stocks-chart-init])")
      .forEach(initCard);
  }

  function start() {
    scan();
    new MutationObserver(scan).observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
})();
