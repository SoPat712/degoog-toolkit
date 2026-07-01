(function () {
  "use strict";

  const ICONS_HERO = {
    sun() {
      return (
        '<div class="weather-ani-sun"><svg width="80" height="80" viewBox="0 0 56 56" fill="none">' +
        '<circle cx="28" cy="28" r="11" fill="#f59e0b" opacity=".9"/>' +
        '<g style="animation:weather-spin 14s linear infinite;transform-origin:28px 28px">' +
        '<line x1="28" y1="5" x2="28" y2="11" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" opacity=".7"/>' +
        '<line x1="28" y1="45" x2="28" y2="51" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" opacity=".7"/>' +
        '<line x1="5" y1="28" x2="11" y2="28" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" opacity=".7"/>' +
        '<line x1="45" y1="28" x2="51" y2="28" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" opacity=".7"/>' +
        '<line x1="12" y1="12" x2="16" y2="16" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" opacity=".55"/>' +
        '<line x1="40" y1="40" x2="44" y2="44" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" opacity=".55"/>' +
        '<line x1="44" y1="12" x2="40" y2="16" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" opacity=".55"/>' +
        '<line x1="12" y1="44" x2="16" y2="40" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" opacity=".55"/>' +
        "</g></svg></div>"
      );
    },
    moon() {
      return (
        '<div class="weather-ani-sun"><svg width="80" height="80" viewBox="0 0 56 56" fill="none">' +
        '<path d="M38 32c-8 0-14-6-14-14 0-2 .4-4 1-5.8C16.5 13.5 10 20.6 10 29c0 9.4 7.6 17 17 17 7 0 13-4.3 15.6-10.4-1.5.3-3 .4-4.6.4z" fill="#e5e7eb" opacity=".9"/>' +
        '<circle cx="15" cy="14" r="1.4" fill="#e5e7eb" opacity=".7"/>' +
        '<circle cx="46" cy="18" r="1" fill="#e5e7eb" opacity=".6"/>' +
        '<circle cx="49" cy="40" r="1.2" fill="#e5e7eb" opacity=".5"/>' +
        "</svg></div>"
      );
    },
    partly() {
      return (
        '<div class="weather-ani-float"><div style="position:relative;width:86px;height:72px">' +
        '<div style="position:absolute;top:4px;left:6px;width:30px;height:30px;border-radius:50%;background:#f59e0b;opacity:.85"></div>' +
        '<div style="position:absolute;bottom:6px;left:14px;right:2px;height:30px;background:var(--text-secondary);opacity:.55;border-radius:16px"></div>' +
        '<div style="position:absolute;width:28px;height:28px;background:var(--text-secondary);opacity:.55;border-radius:50%;bottom:18px;left:16px"></div>' +
        '<div style="position:absolute;width:22px;height:22px;background:var(--text-secondary);opacity:.55;border-radius:50%;bottom:20px;left:38px"></div>' +
        "</div></div>"
      );
    },
    cloud() {
      return (
        '<div class="weather-ani-float"><div style="position:relative;width:88px;height:60px">' +
        '<div style="position:absolute;bottom:2px;left:0;right:0;height:30px;background:var(--text-secondary);opacity:.55;border-radius:16px"></div>' +
        '<div style="position:absolute;width:30px;height:30px;background:var(--text-secondary);opacity:.55;border-radius:50%;bottom:14px;left:10px"></div>' +
        '<div style="position:absolute;width:24px;height:24px;background:var(--text-secondary);opacity:.55;border-radius:50%;bottom:16px;left:34px"></div>' +
        "</div></div>"
      );
    },
    fog() {
      return (
        '<div class="weather-ani-float"><div style="position:relative;width:88px;height:70px">' +
        '<div style="position:absolute;top:4px;left:0;right:0;height:28px;background:var(--text-secondary);opacity:.5;border-radius:14px"></div>' +
        '<div style="position:absolute;width:26px;height:26px;background:var(--text-secondary);opacity:.5;border-radius:50%;top:2px;left:12px"></div>' +
        '<div style="position:absolute;width:22px;height:22px;background:var(--text-secondary);opacity:.5;border-radius:50%;top:4px;left:36px"></div>' +
        '<div style="position:absolute;left:6px;right:6px;bottom:22px;height:3px;border-radius:2px;background:var(--text-secondary);opacity:.45"></div>' +
        '<div style="position:absolute;left:14px;right:14px;bottom:12px;height:3px;border-radius:2px;background:var(--text-secondary);opacity:.35"></div>' +
        '<div style="position:absolute;left:8px;right:20px;bottom:2px;height:3px;border-radius:2px;background:var(--text-secondary);opacity:.3"></div>' +
        "</div></div>"
      );
    },
    rain() {
      return (
        '<div class="weather-ani-float"><div style="position:relative;width:88px;height:78px">' +
        '<div style="position:absolute;top:4px;left:0;right:0;height:28px;background:var(--text-secondary);opacity:.55;border-radius:14px"></div>' +
        '<div style="position:absolute;width:28px;height:28px;background:var(--text-secondary);opacity:.55;border-radius:50%;top:-6px;left:12px"></div>' +
        '<div style="position:absolute;width:22px;height:22px;background:var(--text-secondary);opacity:.55;border-radius:50%;top:-2px;left:36px"></div>' +
        '<div style="position:absolute;bottom:4px;left:6px;right:6px;height:26px">' +
        '<div class="weather-drop" style="left:8px;height:11px;animation-delay:0s"></div>' +
        '<div class="weather-drop" style="left:22px;height:14px;animation-delay:.25s"></div>' +
        '<div class="weather-drop" style="left:38px;height:10px;animation-delay:.1s"></div>' +
        '<div class="weather-drop" style="left:54px;height:12px;animation-delay:.45s"></div>' +
        '<div class="weather-drop" style="left:70px;height:11px;animation-delay:.2s"></div>' +
        "</div></div></div>"
      );
    },
    snow() {
      return (
        '<div class="weather-ani-float"><div style="position:relative;width:88px;height:78px">' +
        '<div style="position:absolute;top:4px;left:0;right:0;height:28px;background:var(--text-secondary);opacity:.5;border-radius:14px"></div>' +
        '<div style="position:absolute;width:28px;height:28px;background:var(--text-secondary);opacity:.5;border-radius:50%;top:-6px;left:12px"></div>' +
        '<div style="position:absolute;width:22px;height:22px;background:var(--text-secondary);opacity:.5;border-radius:50%;top:-2px;left:36px"></div>' +
        '<div style="position:absolute;bottom:6px;left:6px;right:6px;height:22px">' +
        '<div class="weather-flake" style="left:10px;animation-delay:0s"></div>' +
        '<div class="weather-flake" style="left:28px;animation-delay:.4s"></div>' +
        '<div class="weather-flake" style="left:46px;animation-delay:.2s"></div>' +
        '<div class="weather-flake" style="left:64px;animation-delay:.6s"></div>' +
        "</div></div></div>"
      );
    },
    storm() {
      return (
        '<div class="weather-ani-float"><div style="position:relative;width:88px;height:82px">' +
        '<div style="position:absolute;top:4px;left:0;right:0;height:28px;background:var(--text-secondary);opacity:.6;border-radius:14px"></div>' +
        '<div style="position:absolute;width:28px;height:28px;background:var(--text-secondary);opacity:.6;border-radius:50%;top:-6px;left:12px"></div>' +
        '<div style="position:absolute;width:22px;height:22px;background:var(--text-secondary);opacity:.6;border-radius:50%;top:-2px;left:36px"></div>' +
        '<div style="position:absolute;bottom:4px;left:50%;transform:translateX(-50%)">' +
        '<svg class="weather-bolt" width="22" height="32" viewBox="0 0 18 26" fill="none"><path d="M11 2L3 14h7l-3 10 10-14h-7z" fill="#f59e0b" stroke="#f59e0b" stroke-width="1" stroke-linejoin="round"/></svg>' +
        "</div></div></div>"
      );
    },
  };

  function smallIconSvg(type, size) {
    const s = size || 22;
    const sec = "var(--text-secondary)";
    if (type === "sun") {
      return (
        '<svg width="' + s + '" height="' + s + '" viewBox="0 0 20 20" fill="none">' +
        '<circle cx="10" cy="10" r="4.5" fill="#f59e0b" opacity=".9"/>' +
        '<g stroke="#f59e0b" stroke-width="1.4" stroke-linecap="round">' +
        '<line x1="10" y1="1.5" x2="10" y2="3.5"/>' +
        '<line x1="10" y1="16.5" x2="10" y2="18.5"/>' +
        '<line x1="1.5" y1="10" x2="3.5" y2="10"/>' +
        '<line x1="16.5" y1="10" x2="18.5" y2="10"/>' +
        '<line x1="4" y1="4" x2="5.5" y2="5.5"/>' +
        '<line x1="14.5" y1="14.5" x2="16" y2="16"/>' +
        '<line x1="16" y1="4" x2="14.5" y2="5.5"/>' +
        '<line x1="5.5" y1="14.5" x2="4" y2="16"/>' +
        "</g></svg>"
      );
    }
    if (type === "moon") {
      return (
        '<svg width="' + s + '" height="' + s + '" viewBox="0 0 20 20" fill="none">' +
        '<path d="M14 11.5c-3 0-5.5-2.5-5.5-5.5 0-.8.2-1.5.5-2.2A6.5 6.5 0 1016.2 14c-.7.3-1.5.5-2.2.5z" fill="#e5e7eb" opacity=".9"/>' +
        "</svg>"
      );
    }
    if (type === "partly") {
      return (
        '<svg width="' + s + '" height="' + s + '" viewBox="0 0 20 20" fill="none">' +
        '<circle cx="7" cy="7.5" r="3.6" fill="#f59e0b" opacity=".8"/>' +
        '<ellipse cx="11.5" cy="12.5" rx="6" ry="3.8" fill="' + sec + '" opacity=".6"/>' +
        '<ellipse cx="7" cy="11.5" rx="4.8" ry="3.2" fill="' + sec + '" opacity=".5"/>' +
        "</svg>"
      );
    }
    if (type === "cloud") {
      return (
        '<svg width="' + s + '" height="' + s + '" viewBox="0 0 20 20" fill="none">' +
        '<ellipse cx="7" cy="10.5" rx="4.8" ry="3.2" fill="' + sec + '" opacity=".55"/>' +
        '<ellipse cx="12" cy="9.5" rx="5.6" ry="3.8" fill="' + sec + '" opacity=".7"/>' +
        "</svg>"
      );
    }
    if (type === "fog") {
      return (
        '<svg width="' + s + '" height="' + s + '" viewBox="0 0 20 20" fill="none">' +
        '<ellipse cx="10" cy="7.5" rx="6" ry="3.2" fill="' + sec + '" opacity=".55"/>' +
        '<line x1="3" y1="12" x2="17" y2="12" stroke="' + sec + '" stroke-width="1.3" stroke-linecap="round" opacity=".7"/>' +
        '<line x1="5" y1="15" x2="15" y2="15" stroke="' + sec + '" stroke-width="1.3" stroke-linecap="round" opacity=".5"/>' +
        '<line x1="4" y1="18" x2="13" y2="18" stroke="' + sec + '" stroke-width="1.3" stroke-linecap="round" opacity=".4"/>' +
        "</svg>"
      );
    }
    if (type === "rain") {
      return (
        '<svg width="' + s + '" height="' + s + '" viewBox="0 0 20 20" fill="none">' +
        '<ellipse cx="7" cy="8.5" rx="4.5" ry="3" fill="' + sec + '" opacity=".55"/>' +
        '<ellipse cx="12" cy="7.5" rx="5.5" ry="3.5" fill="' + sec + '" opacity=".7"/>' +
        '<line x1="7" y1="13" x2="5.5" y2="17" stroke="#60a5fa" stroke-width="1.6" stroke-linecap="round"/>' +
        '<line x1="11" y1="13" x2="9.5" y2="17" stroke="#60a5fa" stroke-width="1.6" stroke-linecap="round"/>' +
        '<line x1="15" y1="13" x2="13.5" y2="17" stroke="#60a5fa" stroke-width="1.6" stroke-linecap="round"/>' +
        "</svg>"
      );
    }
    if (type === "snow") {
      return (
        '<svg width="' + s + '" height="' + s + '" viewBox="0 0 20 20" fill="none">' +
        '<ellipse cx="7" cy="8.5" rx="4.5" ry="3" fill="' + sec + '" opacity=".55"/>' +
        '<ellipse cx="12" cy="7.5" rx="5.5" ry="3.5" fill="' + sec + '" opacity=".7"/>' +
        '<circle cx="6.5" cy="15" r="1.3" fill="#bfdbfe"/>' +
        '<circle cx="10.5" cy="17" r="1.3" fill="#bfdbfe"/>' +
        '<circle cx="14" cy="15" r="1.3" fill="#bfdbfe"/>' +
        "</svg>"
      );
    }
    if (type === "storm") {
      return (
        '<svg width="' + s + '" height="' + s + '" viewBox="0 0 20 20" fill="none">' +
        '<ellipse cx="7" cy="7.5" rx="4.5" ry="3" fill="' + sec + '" opacity=".6"/>' +
        '<ellipse cx="12" cy="6.5" rx="5.5" ry="3.5" fill="' + sec + '" opacity=".75"/>' +
        '<path d="M11 10.5l-3 5h3l-2 4 5-6h-3z" fill="#f59e0b"/>' +
        "</svg>"
      );
    }
    return "";
  }

  const WEATHER_LANG_DICT = {
    en: {
      temp: "Temperature",
      precip: "Precipitation",
      wind: "Wind",
      humidity: "Humidity",
      feelsLike: "Feels like",
      hourly: "Hourly",
      hourlyPrecipSub: "Chance of precipitation, hourly",
      hourlyWindSub: "Wind speed · gusts",
      gusts: "Gusts",
      hourlyHumSub: "Relative humidity, hourly",
      hourlySub: "24-hour forecast"
    }
  };

  function wc(key) {
    var attrName = "data-t-" + key.replace(/([A-Z])/g, "-$1").toLowerCase();
    var el = document.querySelector("[data-weather-payload]");
    return (el && el.getAttribute(attrName)) || WEATHER_LANG_DICT["en"][key] || key;
  }

  const CHART_META = {
    temp: {
      get label() { return wc("temp"); },
      get sub() { return wc("hourly"); },
      kind: "line",
      key: "temp",
      altKey: "feels",
      get altLabel() { return wc("feelsLike"); },
      color: "#f59e0b",
      showAlt: true,
    },
    precip: {
      get label() { return wc("precip"); },
      get sub() { return wc("hourlyPrecipSub"); },
      kind: "bar",
      key: "precipProb",
      color: "#60a5fa",
      yMax: 100,
      yMin: 0,
      suffix: "%",
    },
    wind: {
      get label() { return wc("wind"); },
      get sub() { return wc("hourlyWindSub"); },
      kind: "line",
      key: "wind",
      altKey: "gusts",
      get altLabel() { return wc("gusts"); },
      color: "#4285f4",
      showAlt: true,
    },
    humidity: {
      get label() { return wc("humidity"); },
      get sub() { return wc("hourlyHumSub"); },
      kind: "line",
      key: "humidity",
      color: "#34d399",
      suffix: "%",
      yMax: 100,
      yMin: 0,
    },
  };

  function svgEl(name, attrs) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", name);
    if (attrs) {
      for (const k in attrs) el.setAttribute(k, attrs[k]);
    }
    return el;
  }

  function niceRange(min, max) {
    if (!isFinite(min) || !isFinite(max)) return { min: 0, max: 1 };
    if (min === max) {
      return { min: min - 1, max: max + 1 };
    }
    const span = max - min;
    const topPad = Math.max(1, span * 0.08);
    const bottomPad = Math.max(1, span * 0.06);
    return { min: Math.floor(min - bottomPad), max: Math.ceil(max + topPad) };
  }

  function buildPath(points) {
    if (!points.length) return "";
    let d = "M " + points[0].x.toFixed(2) + " " + points[0].y.toFixed(2);
    for (let i = 1; i < points.length; i++) {
      const p0 = points[i - 1];
      const p1 = points[i];
      const cx = (p0.x + p1.x) / 2;
      d +=
        " C " +
        cx.toFixed(2) +
        " " +
        p0.y.toFixed(2) +
        ", " +
        cx.toFixed(2) +
        " " +
        p1.y.toFixed(2) +
        ", " +
        p1.x.toFixed(2) +
        " " +
        p1.y.toFixed(2);
    }
    return d;
  }

  function renderChart(chartEl, tooltipEl, legendEl, day, tab, unitsInfo) {
    const meta = CHART_META[tab] || CHART_META.temp;
    const hourly = day.hourly || {};
    const labels = hourly.labels || [];
    const primary = hourly[meta.key] || [];
    const alt = meta.altKey ? hourly[meta.altKey] || [] : null;

    chartEl.innerHTML = "";
    legendEl.innerHTML = "";

    if (!primary.length) {
      chartEl.textContent = "";
      return;
    }

    const W = 640;
    const H = chartEl.offsetHeight > 0 ? chartEl.offsetHeight : 140;
    const padL = 16;
    const padR = 16;
    const padT = 14;
    const padB = 26;

    const viewportW =
      typeof window !== "undefined" && window.innerWidth
        ? window.innerWidth
        : 1024;
    const isNarrow = viewportW <= 560;
    const visibleHoursOnMobile = 6;
    const pxPerHourMobile = Math.max(
      45,
      Math.floor((viewportW - 32) / visibleHoursOnMobile)
    );
    const renderW = isNarrow ? pxPerHourMobile * 24 + padL + padR : W;

    const svg = svgEl("svg", {
      width: "100%",
      height: "100%",
      viewBox: "0 0 " + renderW + " " + H,
      preserveAspectRatio: "none",
    });

    const activeW = renderW - padL - padR;
    const activeH = H - padT - padB;
    const stepX = activeW / 23;

    let minVal = Math.min(...primary);
    let maxVal = Math.max(...primary);
    if (alt) {
      minVal = Math.min(minVal, ...alt);
      maxVal = Math.max(maxVal, ...alt);
    }

    const limits =
      meta.yMax !== undefined
        ? { min: meta.yMin ?? 0, max: meta.yMax }
        : niceRange(minVal, maxVal);
    const rangeY = limits.max - limits.min || 1;

    const scaleY = (v) =>
      padT + activeH - ((v - limits.min) / rangeY) * activeH;

    const mainPoints = primary.map((v, i) => ({
      x: padL + i * stepX,
      y: scaleY(v),
      val: v,
    }));
    const altPoints = alt
      ? alt.map((v, i) => ({ x: padL + i * stepX, y: scaleY(v), val: v }))
      : null;

    if (meta.kind === "bar") {
      const barW = Math.max(4, Math.min(18, stepX * 0.45));
      mainPoints.forEach((p) => {
        const barH = padT + activeH - p.y;
        if (barH > 1) {
          const rect = svgEl("rect", {
            x: p.x - barW / 2,
            y: p.y,
            width: barW,
            height: barH,
            fill: meta.color,
            rx: 2,
            opacity: 0.75,
          });
          svg.appendChild(rect);
        }
      });
    } else {
      if (altPoints && meta.showAlt) {
        const altPath = svgEl("path", {
          d: buildPath(altPoints),
          fill: "none",
          stroke: "var(--text-secondary)",
          "stroke-width": 1.5,
          "stroke-dasharray": "3,3",
          opacity: 0.65,
        });
        svg.appendChild(altPath);
      }

      const mainPath = svgEl("path", {
        d: buildPath(mainPoints),
        fill: "none",
        stroke: meta.color,
        "stroke-width": 2.5,
      });
      svg.appendChild(mainPath);

      mainPoints.forEach((p, idx) => {
        if (idx % 2 === 0) {
          const dot = svgEl("circle", {
            cx: p.x,
            cy: p.y,
            r: 3,
            fill: meta.color,
            stroke: "var(--bg, Canvas)",
            "stroke-width": 1,
          });
          svg.appendChild(dot);
        }
      });
    }

    labels.forEach((lbl, i) => {
      if (i % 2 === 0) {
        const x = padL + i * stepX;
        const text = svgEl("text", {
          x: x,
          y: H - 8,
          "font-size": 10,
          "text-anchor": "middle",
          fill: "var(--text-secondary)",
        });
        text.textContent = lbl;
        svg.appendChild(text);
      }
    });

    const triggerOverlay = svgEl("rect", {
      x: 0,
      y: 0,
      width: renderW,
      height: H,
      fill: "transparent",
      style: "cursor:crosshair",
    });
    svg.appendChild(triggerOverlay);
    chartEl.appendChild(svg);

    function showTooltip(xPos) {
      const rect = chartEl.getBoundingClientRect();
      const scrollL = chartEl.scrollLeft;
      const xInSvg = xPos - rect.left + scrollL;
      const i = Math.max(
        0,
        Math.min(23, Math.round((xInSvg - padL) / stepX))
      );
      const p = mainPoints[i];
      if (!p) return;

      const lbl = labels[i] || "";
      const suf = meta.suffix || unitsInfo.tempUnit || "";
      let html =
        '<div style="font-weight:600;font-size:0.75rem;margin-bottom:2px;color:var(--text-secondary)">' +
        lbl +
        "</div>";
      html +=
        '<div style="font-size:0.8rem;color:var(--text-primary)">' +
        meta.label +
        ": <strong>" +
        Math.round(p.val) +
        suf +
        "</strong></div>";

      if (altPoints && altPoints[i] && meta.showAlt) {
        html +=
          '<div style="font-size:0.8rem;color:var(--text-secondary)">' +
          meta.altLabel +
          ": <strong>" +
          Math.round(altPoints[i].val) +
          suf +
          "</strong></div>";
      }

      tooltipEl.innerHTML = html;
      tooltipEl.style.display = "block";

      const tWidth = tooltipEl.offsetWidth;
      const tHeight = tooltipEl.offsetHeight;
      const wrapRect = chartEl.parentNode.getBoundingClientRect();
      const leftPx = p.x - scrollL - tWidth / 2 + padL;
      const topPx = p.y - tHeight - 8;

      tooltipEl.style.left =
        Math.max(4, Math.min(wrapRect.width - tWidth - 4, leftPx)) + "px";
      tooltipEl.style.top = Math.max(4, topPx) + "px";
    }

    triggerOverlay.addEventListener("mousemove", (e) => showTooltip(e.clientX));
    triggerOverlay.addEventListener("touchstart", (e) => {
      if (e.touches && e.touches[0]) showTooltip(e.touches[0].clientX);
    });

    chartEl.addEventListener("mouseleave", () => {
      tooltipEl.style.display = "none";
    });

    const l1 = document.createElement("div");
    l1.className = "weather-legend-item";
    l1.innerHTML =
      '<span class="weather-legend-line" style="background:' +
      meta.color +
      '"></span>' +
      meta.label;
    legendEl.appendChild(l1);

    if (altPoints && meta.showAlt) {
      const l2 = document.createElement("div");
      l2.className = "weather-legend-item";
      l2.innerHTML =
        '<span class="weather-legend-line weather-legend-dashed" style="border-color:var(--text-secondary)"></span>' +
        meta.altLabel;
      legendEl.appendChild(l2);
    }
  }

  function initWeatherSlot(card) {
    if (card._wxsInit) return;

    const payloadRaw = card.dataset.weatherPayload;
    if (!payloadRaw) return;

    let payload;
    try {
      payload = JSON.parse(payloadRaw);
    } catch (e) {
      return;
    }

    let activeDayIndex = 0;
    let activeTab = "temp";

    const heroIconSlot = card.querySelector("[data-weather-icon-slot]");
    const heroTemp = card.querySelector("[data-weather-temp]");
    const heroFeels = card.querySelector("[data-weather-feels]");
    const heroPrecipProb = card.querySelector("[data-weather-precip-prob]");
    const heroHumidity = card.querySelector("[data-weather-humidity]");
    const heroWind = card.querySelector("[data-weather-wind]");
    const heroDayLabel = card.querySelector("[data-weather-day-label]");
    const heroDesc = card.querySelector("[data-weather-desc]");
    const heroHi = card.querySelector("[data-weather-hi]");
    const heroLo = card.querySelector("[data-weather-lo]");

    const gustsVal = card.querySelector("[data-weather-gusts]");
    const pressureVal = card.querySelector("[data-weather-pressure]");
    const uvVal = card.querySelector("[data-weather-uv]");
    const uvLevelVal = card.querySelector("[data-weather-uv-level]");
    const visibilityVal = card.querySelector("[data-weather-visibility]");
    const dewVal = card.querySelector("[data-weather-dew]");
    const cloudsVal = card.querySelector("[data-weather-clouds]");
    const precipNowVal = card.querySelector("[data-weather-precip-now]");
    const humDetailVal = card.querySelector("[data-weather-humidity-detail]");

    const sunriseVal = card.querySelector("[data-weather-sunrise]");
    const sunriseRel = card.querySelector("[data-weather-sunrise-relative]");
    const sunsetVal = card.querySelector("[data-weather-sunset]");
    const sunsetRel = card.querySelector("[data-weather-sunset-relative]");
    const sunTrack = card.querySelector(".weather-sun-track");
    const sunArc = card.querySelector("[data-weather-sun-arc]");
    const sunDot = card.querySelector("[data-weather-sun-dot]");

    const moonRow = card.querySelector("[data-weather-moon-row]");
    const moonPhase = card.querySelector("[data-weather-moon-phase]");
    const moonIllum = card.querySelector("[data-weather-moon-illum]");
    const moonriseVal = card.querySelector("[data-weather-moonrise]");
    const moonriseRel = card.querySelector("[data-weather-moon-relative]");
    const moonsetVal = card.querySelector("[data-weather-moonset]");
    const moonsetRel = card.querySelector("[data-weather-moonset-relative]");
    const moonApexVal = card.querySelector("[data-weather-moon-apex]");
    const moonApexWrap = card.querySelector("[data-weather-moon-apex-wrap]");
    const moonTrack = card.querySelector(".weather-moon-track");
    const moonArc = card.querySelector("[data-weather-moon-arc]");
    const moonDot = card.querySelector("[data-weather-moon-dot]");

    const daysTrack = card.querySelector("[data-weather-days]");
    const tabsRow = card.querySelector("[data-weather-tabs]");
    const chartEl = card.querySelector("[data-weather-chart]");
    const legendEl = card.querySelector("[data-weather-chart-legend]");

    const tooltipEl = document.createElement("div");
    tooltipEl.className = "weather-chart-tooltip";
    chartEl.parentNode.appendChild(tooltipEl);

    const unitsInfo = {
      tempUnit: payload.tempUnit,
      windUnit: payload.windUnit,
      pressureUnit: payload.pressureUnit,
      precipUnit: payload.precipUnit,
    };

    function mapAstroPoint(trackEl, pathEl, pct) {
      const svg = pathEl?.ownerSVGElement;
      if (!trackEl || !pathEl || !svg) return null;

      const len = pathEl.getTotalLength();
      if (!len) return null;

      const clamped = Math.max(0, Math.min(100, Number(pct) || 0));
      const pt = pathEl.getPointAtLength((clamped / 100) * len);
      const vb = svg.viewBox.baseVal;
      if (!vb.width || !vb.height) return null;

      const trackRect = trackEl.getBoundingClientRect();
      const svgRect = svg.getBoundingClientRect();
      if (!trackRect.width || !svgRect.width) return null;

      const scale = Math.min(svgRect.width / vb.width, svgRect.height / vb.height);
      const renderedW = vb.width * scale;
      const renderedH = vb.height * scale;
      const padX = (svgRect.width - renderedW) / 2;
      const padY = svgRect.height - renderedH;

      return {
        left: svgRect.left + padX + pt.x * scale - trackRect.left,
        top: svgRect.top + padY + pt.y * scale - trackRect.top,
      };
    }

    function setAstroArcProgress(arcEl, pct) {
      if (!arcEl) return;
      const clamped = Math.max(0, Math.min(100, Number(pct) || 0));
      const dashOffset = 200 - (200 * clamped) / 100;
      arcEl.style.setProperty("--weather-arc-target", String(dashOffset));
    }

    function setAstroDotPosition(trackEl, dotEl, pathEl, pct) {
      const pos = mapAstroPoint(trackEl, pathEl, pct);
      if (!pos || !dotEl) return;
      dotEl.style.left = pos.left + "px";
      dotEl.style.top = pos.top + "px";
    }

    function syncAstroTracks() {
      const sunPath = sunTrack?.querySelector(".weather-astro-arc-bg");
      if (sunTrack && sunDot && sunPath && !sunDot.hidden) {
        setAstroDotPosition(
          sunTrack,
          sunDot,
          sunPath,
          sunDot.dataset.pct || payload.sun?.pct || 0,
        );
      }
      const moonPath = moonTrack?.querySelector(".weather-astro-arc-bg");
      if (moonTrack && moonDot && moonPath && !moonDot.hidden) {
        setAstroDotPosition(moonTrack, moonDot, moonPath, moonDot.dataset.pct || 0);
      }
    }

    function updateHero(day) {
      const icon = day.icon || "cloud";
      if (heroIconSlot) {
        const renderHero = ICONS_HERO[icon] || ICONS_HERO.cloud;
        heroIconSlot.innerHTML = renderHero();
      }

      if (heroTemp) heroTemp.textContent = activeDayIndex === 0 ? payload.current.temp : day.hi;
      if (heroFeels) heroFeels.textContent = (activeDayIndex === 0 ? payload.current.feels : day.feelsHi) + unitsInfo.tempUnit;
      if (heroPrecipProb) heroPrecipProb.textContent = (activeDayIndex === 0 ? payload.current.precipProb : day.precipProb) + "%";
      if (heroHumidity) heroHumidity.textContent = (activeDayIndex === 0 ? payload.current.humidity : day.hourly.humidity[12]) + "%";
      if (heroWind) heroWind.textContent = (activeDayIndex === 0 ? payload.current.wind : day.windMax) + " " + unitsInfo.windUnit + " " + (activeDayIndex === 0 ? payload.current.windDir : day.windDirDom);

      if (heroDayLabel) heroDayLabel.textContent = day.longName;
      if (heroDesc) heroDesc.textContent = day.desc;
      if (heroHi) heroHi.textContent = day.hi + "°";
      if (heroLo) heroLo.textContent = day.lo + "°";

      if (gustsVal) gustsVal.textContent = (activeDayIndex === 0 ? payload.current.gusts : day.gustsMax) + " " + unitsInfo.windUnit;
      if (pressureVal) pressureVal.textContent = (activeDayIndex === 0 ? payload.current.pressure : day.hourly.temp[12] ? payload.current.pressure : "—") + " " + unitsInfo.pressureUnit;
      if (uvVal) uvVal.textContent = activeDayIndex === 0 ? payload.current.uv : day.uvMax;
      if (uvLevelVal) uvLevelVal.textContent = activeDayIndex === 0 ? payload.current.uvLevel : "";

      if (visibilityVal) visibilityVal.textContent = activeDayIndex === 0 ? payload.current.visibility : "—";
      if (dewVal) dewVal.textContent = (activeDayIndex === 0 ? payload.current.dewPoint : day.lo) + unitsInfo.tempUnit;
      if (cloudsVal) cloudsVal.textContent = (activeDayIndex === 0 ? payload.current.clouds : day.hourly.clouds[12]) + "%";
      if (precipNowVal) precipNowVal.textContent = (activeDayIndex === 0 ? payload.current.precipNow : day.precipSum) + " " + unitsInfo.precipUnit;
      if (humDetailVal) humDetailVal.textContent = (activeDayIndex === 0 ? payload.current.humidity : day.hourly.humidity[12]) + "%";

      if (sunriseVal) sunriseVal.textContent = day.srStr;
      if (sunriseRel) sunriseRel.textContent = activeDayIndex === 0 ? day.srRelative : "";
      if (sunsetVal) sunsetVal.textContent = day.ssStr;
      if (sunsetRel) sunsetRel.textContent = activeDayIndex === 0 ? day.ssRelative : "";

      if (sunArc && sunDot && sunTrack) {
        const sunPath = sunTrack.querySelector(".weather-astro-arc-bg");
        if (activeDayIndex === 0 && sunPath) {
          const pct = Math.min(100, Math.max(0, payload.sun.pct));
          setAstroArcProgress(sunArc, pct);
          sunDot.dataset.pct = String(pct);
          const sunState = payload.sun.isUp
            ? "up"
            : pct >= 100
              ? "set"
              : "pre";
          sunTrack.dataset.sunState = sunState;
          if (sunState === "pre" && pct <= 0) {
            sunDot.hidden = true;
          } else {
            setAstroDotPosition(sunTrack, sunDot, sunPath, pct);
            sunDot.hidden = false;
          }
        } else {
          sunDot.hidden = true;
          sunTrack.removeAttribute("data-sun-state");
          setAstroArcProgress(sunArc, 0);
        }
      }

      if (moonRow && day.moon && day.moon.show) {
        moonRow.style.display = "block";
        if (moonPhase) moonPhase.textContent = day.moon.phaseLabel;
        if (moonIllum) moonIllum.textContent = day.moon.illuminationLabel;
        if (moonriseVal) moonriseVal.textContent = day.moon.riseStr;
        if (moonriseRel) moonriseRel.textContent = activeDayIndex === 0 ? day.moon.riseRelative : "";
        if (moonsetVal) moonsetVal.textContent = day.moon.setStr;
        if (moonsetRel) moonsetRel.textContent = activeDayIndex === 0 ? day.moon.setRelative : "";
        const apexStr = day.moon.apexStr;
        const showApex =
          activeDayIndex === 0 && apexStr && apexStr !== "—" && apexStr !== "-";
        if (moonApexWrap) {
          moonApexWrap.hidden = !showApex;
        }
        if (moonApexVal && showApex) moonApexVal.textContent = apexStr;

        setAstroArcProgress(moonArc, 100);

        const moonPath = moonTrack?.querySelector(".weather-astro-arc-bg");
        if (moonDot && moonTrack && moonPath) {
          if (activeDayIndex === 0 && day.moon.isUp) {
            const pct = Math.min(100, Math.max(0, day.moon.nowPct));
            moonDot.dataset.pct = String(pct);
            setAstroDotPosition(moonTrack, moonDot, moonPath, pct);
            moonDot.hidden = false;
          } else {
            moonDot.hidden = true;
          }
        }
      } else if (moonRow) {
        moonRow.style.display = "none";
        if (moonApexWrap) moonApexWrap.hidden = true;
        setAstroArcProgress(moonArc, 0);
      }

      requestAnimationFrame(syncAstroTracks);

      renderChart(chartEl, tooltipEl, legendEl, day, activeTab, unitsInfo);
    }

    if (daysTrack && Array.isArray(payload.days)) {
      daysTrack.innerHTML = payload.days
        .map((day, idx) => {
          const activeClass = idx === 0 ? "weather-day-card-active" : "";
          const icon = day.icon || "cloud";
          return (
            '<button class="weather-day-card ' + activeClass + '" type="button" data-day="' + idx + '">' +
            '<span class="weather-day-name">' + day.name + "</span>" +
            '<span class="weather-day-ico">' + smallIconSvg(icon, 20) + "</span>" +
            '<span class="weather-day-temps">' +
            '<span class="weather-day-hi">' + day.hi + "°</span>" +
            '<span class="weather-day-lo">' + day.lo + "°</span>" +
            "</span>" +
            "</button>"
          );
        })
        .join("");

      daysTrack.querySelectorAll("[data-day]").forEach((btn) => {
        btn.addEventListener("click", () => {
          daysTrack
            .querySelectorAll(".weather-day-card")
            .forEach((b) => b.classList.remove("weather-day-card-active"));
          btn.classList.add("weather-day-card-active");
          activeDayIndex = parseInt(btn.dataset.day, 10);
          const dayData = payload.days[activeDayIndex];
          if (dayData) updateHero(dayData);
        });
      });
    }

    if (tabsRow) {
      tabsRow.querySelectorAll("[data-tab]").forEach((btn) => {
        btn.addEventListener("click", () => {
          tabsRow
            .querySelectorAll(".weather-tab")
            .forEach((b) => b.classList.remove("weather-tab-active"));
          btn.classList.add("weather-tab-active");
          activeTab = btn.dataset.tab;
          const dayData = payload.days[activeDayIndex];
          if (dayData) {
            renderChart(chartEl, tooltipEl, legendEl, dayData, activeTab, unitsInfo);
          }
        });
      });
    }

    const firstDay = payload.days[0];
    if (firstDay) updateHero(firstDay);

    if (!card._wxsResizeBound) {
      card._wxsResizeBound = true;
      window.addEventListener("resize", syncAstroTracks, { passive: true });
      requestAnimationFrame(syncAstroTracks);
    }

    card._wxsInit = true;
  }

  function scan() {
    document.querySelectorAll(".weather-result").forEach(initWeatherSlot);
  }

  scan();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scan, { once: true });
  }

  function observeWeatherSlots() {
    new MutationObserver(scan).observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  if (document.body) {
    observeWeatherSlots();
  } else {
    document.addEventListener("DOMContentLoaded", observeWeatherSlots, {
      once: true,
    });
  }
})();
