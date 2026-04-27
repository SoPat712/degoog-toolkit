(function () {
  "use strict";

  // ────────────────────────────────────────────────
  // Icons — hero (big animated) and small (days/tabs)
  // ────────────────────────────────────────────────

  const ICONS_HERO = {
    sun() {
      return (
        '<div class="wxs-ani-sun"><svg width="80" height="80" viewBox="0 0 56 56" fill="none">' +
        '<circle cx="28" cy="28" r="11" fill="#f59e0b" opacity=".9"/>' +
        '<g style="animation:wxs-spin 14s linear infinite;transform-origin:28px 28px">' +
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
        '<div class="wxs-ani-sun"><svg width="80" height="80" viewBox="0 0 56 56" fill="none">' +
        '<path d="M38 32c-8 0-14-6-14-14 0-2 .4-4 1-5.8C16.5 13.5 10 20.6 10 29c0 9.4 7.6 17 17 17 7 0 13-4.3 15.6-10.4-1.5.3-3 .4-4.6.4z" fill="#e5e7eb" opacity=".9"/>' +
        '<circle cx="15" cy="14" r="1.4" fill="#e5e7eb" opacity=".7"/>' +
        '<circle cx="46" cy="18" r="1" fill="#e5e7eb" opacity=".6"/>' +
        '<circle cx="49" cy="40" r="1.2" fill="#e5e7eb" opacity=".5"/>' +
        "</svg></div>"
      );
    },
    partly() {
      return (
        '<div class="wxs-ani-float"><div style="position:relative;width:86px;height:72px">' +
        '<div style="position:absolute;top:4px;left:6px;width:30px;height:30px;border-radius:50%;background:#f59e0b;opacity:.85"></div>' +
        '<div style="position:absolute;bottom:6px;left:14px;right:2px;height:30px;background:var(--text-secondary);opacity:.55;border-radius:16px"></div>' +
        '<div style="position:absolute;width:28px;height:28px;background:var(--text-secondary);opacity:.55;border-radius:50%;bottom:18px;left:16px"></div>' +
        '<div style="position:absolute;width:22px;height:22px;background:var(--text-secondary);opacity:.55;border-radius:50%;bottom:20px;left:38px"></div>' +
        "</div></div>"
      );
    },
    cloud() {
      return (
        '<div class="wxs-ani-float"><div style="position:relative;width:88px;height:60px">' +
        '<div style="position:absolute;bottom:2px;left:0;right:0;height:30px;background:var(--text-secondary);opacity:.55;border-radius:16px"></div>' +
        '<div style="position:absolute;width:30px;height:30px;background:var(--text-secondary);opacity:.55;border-radius:50%;bottom:14px;left:10px"></div>' +
        '<div style="position:absolute;width:24px;height:24px;background:var(--text-secondary);opacity:.55;border-radius:50%;bottom:16px;left:34px"></div>' +
        "</div></div>"
      );
    },
    fog() {
      return (
        '<div class="wxs-ani-float"><div style="position:relative;width:88px;height:70px">' +
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
        '<div class="wxs-ani-float"><div style="position:relative;width:88px;height:78px">' +
        '<div style="position:absolute;top:4px;left:0;right:0;height:28px;background:var(--text-secondary);opacity:.55;border-radius:14px"></div>' +
        '<div style="position:absolute;width:28px;height:28px;background:var(--text-secondary);opacity:.55;border-radius:50%;top:-6px;left:12px"></div>' +
        '<div style="position:absolute;width:22px;height:22px;background:var(--text-secondary);opacity:.55;border-radius:50%;top:-2px;left:36px"></div>' +
        '<div style="position:absolute;bottom:4px;left:6px;right:6px;height:26px">' +
        '<div class="wxs-drop" style="left:8px;height:11px;animation-delay:0s"></div>' +
        '<div class="wxs-drop" style="left:22px;height:14px;animation-delay:.25s"></div>' +
        '<div class="wxs-drop" style="left:38px;height:10px;animation-delay:.1s"></div>' +
        '<div class="wxs-drop" style="left:54px;height:12px;animation-delay:.45s"></div>' +
        '<div class="wxs-drop" style="left:70px;height:11px;animation-delay:.2s"></div>' +
        "</div></div></div>"
      );
    },
    snow() {
      return (
        '<div class="wxs-ani-float"><div style="position:relative;width:88px;height:78px">' +
        '<div style="position:absolute;top:4px;left:0;right:0;height:28px;background:var(--text-secondary);opacity:.5;border-radius:14px"></div>' +
        '<div style="position:absolute;width:28px;height:28px;background:var(--text-secondary);opacity:.5;border-radius:50%;top:-6px;left:12px"></div>' +
        '<div style="position:absolute;width:22px;height:22px;background:var(--text-secondary);opacity:.5;border-radius:50%;top:-2px;left:36px"></div>' +
        '<div style="position:absolute;bottom:6px;left:6px;right:6px;height:22px">' +
        '<div class="wxs-flake" style="left:10px;animation-delay:0s"></div>' +
        '<div class="wxs-flake" style="left:28px;animation-delay:.4s"></div>' +
        '<div class="wxs-flake" style="left:46px;animation-delay:.2s"></div>' +
        '<div class="wxs-flake" style="left:64px;animation-delay:.6s"></div>' +
        "</div></div></div>"
      );
    },
    storm() {
      return (
        '<div class="wxs-ani-float"><div style="position:relative;width:88px;height:82px">' +
        '<div style="position:absolute;top:4px;left:0;right:0;height:28px;background:var(--text-secondary);opacity:.6;border-radius:14px"></div>' +
        '<div style="position:absolute;width:28px;height:28px;background:var(--text-secondary);opacity:.6;border-radius:50%;top:-6px;left:12px"></div>' +
        '<div style="position:absolute;width:22px;height:22px;background:var(--text-secondary);opacity:.6;border-radius:50%;top:-2px;left:36px"></div>' +
        '<div style="position:absolute;bottom:4px;left:50%;transform:translateX(-50%)">' +
        '<svg class="wxs-bolt" width="22" height="32" viewBox="0 0 18 26" fill="none"><path d="M11 2L3 14h7l-3 10 10-14h-7z" fill="#f59e0b" stroke="#f59e0b" stroke-width="1" stroke-linejoin="round"/></svg>' +
        "</div></div></div>"
      );
    },
  };

  function smallIconSvg(type, size) {
    const s = size || 22;
    const sec = "var(--text-secondary)";
    if (type === "sun") {
      return (
        '<svg width="' +
        s +
        '" height="' +
        s +
        '" viewBox="0 0 20 20" fill="none">' +
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
        '<svg width="' +
        s +
        '" height="' +
        s +
        '" viewBox="0 0 20 20" fill="none">' +
        '<path d="M14 11.5c-3 0-5.5-2.5-5.5-5.5 0-.8.2-1.5.5-2.2A6.5 6.5 0 1016.2 14c-.7.3-1.5.5-2.2.5z" fill="#e5e7eb" opacity=".9"/>' +
        "</svg>"
      );
    }
    if (type === "partly") {
      return (
        '<svg width="' +
        s +
        '" height="' +
        s +
        '" viewBox="0 0 20 20" fill="none">' +
        '<circle cx="7" cy="7.5" r="3.6" fill="#f59e0b" opacity=".8"/>' +
        '<ellipse cx="11.5" cy="12.5" rx="6" ry="3.8" fill="' +
        sec +
        '" opacity=".6"/>' +
        '<ellipse cx="7" cy="11.5" rx="4.8" ry="3.2" fill="' +
        sec +
        '" opacity=".5"/>' +
        "</svg>"
      );
    }
    if (type === "cloud") {
      return (
        '<svg width="' +
        s +
        '" height="' +
        s +
        '" viewBox="0 0 20 20" fill="none">' +
        '<ellipse cx="7" cy="10.5" rx="4.8" ry="3.2" fill="' +
        sec +
        '" opacity=".55"/>' +
        '<ellipse cx="12" cy="9.5" rx="5.6" ry="3.8" fill="' +
        sec +
        '" opacity=".7"/>' +
        "</svg>"
      );
    }
    if (type === "fog") {
      return (
        '<svg width="' +
        s +
        '" height="' +
        s +
        '" viewBox="0 0 20 20" fill="none">' +
        '<ellipse cx="10" cy="7.5" rx="6" ry="3.2" fill="' +
        sec +
        '" opacity=".55"/>' +
        '<line x1="3" y1="12" x2="17" y2="12" stroke="' +
        sec +
        '" stroke-width="1.3" stroke-linecap="round" opacity=".7"/>' +
        '<line x1="5" y1="15" x2="15" y2="15" stroke="' +
        sec +
        '" stroke-width="1.3" stroke-linecap="round" opacity=".5"/>' +
        '<line x1="4" y1="18" x2="13" y2="18" stroke="' +
        sec +
        '" stroke-width="1.3" stroke-linecap="round" opacity=".4"/>' +
        "</svg>"
      );
    }
    if (type === "rain") {
      return (
        '<svg width="' +
        s +
        '" height="' +
        s +
        '" viewBox="0 0 20 20" fill="none">' +
        '<ellipse cx="7" cy="8.5" rx="4.5" ry="3" fill="' +
        sec +
        '" opacity=".55"/>' +
        '<ellipse cx="12" cy="7.5" rx="5.5" ry="3.5" fill="' +
        sec +
        '" opacity=".7"/>' +
        '<line x1="7" y1="13" x2="5.5" y2="17" stroke="#60a5fa" stroke-width="1.6" stroke-linecap="round"/>' +
        '<line x1="11" y1="13" x2="9.5" y2="17" stroke="#60a5fa" stroke-width="1.6" stroke-linecap="round"/>' +
        '<line x1="15" y1="13" x2="13.5" y2="17" stroke="#60a5fa" stroke-width="1.6" stroke-linecap="round"/>' +
        "</svg>"
      );
    }
    if (type === "snow") {
      return (
        '<svg width="' +
        s +
        '" height="' +
        s +
        '" viewBox="0 0 20 20" fill="none">' +
        '<ellipse cx="7" cy="8.5" rx="4.5" ry="3" fill="' +
        sec +
        '" opacity=".55"/>' +
        '<ellipse cx="12" cy="7.5" rx="5.5" ry="3.5" fill="' +
        sec +
        '" opacity=".7"/>' +
        '<circle cx="6.5" cy="15" r="1.3" fill="#bfdbfe"/>' +
        '<circle cx="10.5" cy="17" r="1.3" fill="#bfdbfe"/>' +
        '<circle cx="14" cy="15" r="1.3" fill="#bfdbfe"/>' +
        "</svg>"
      );
    }
    if (type === "storm") {
      return (
        '<svg width="' +
        s +
        '" height="' +
        s +
        '" viewBox="0 0 20 20" fill="none">' +
        '<ellipse cx="7" cy="7.5" rx="4.5" ry="3" fill="' +
        sec +
        '" opacity=".6"/>' +
        '<ellipse cx="12" cy="6.5" rx="5.5" ry="3.5" fill="' +
        sec +
        '" opacity=".75"/>' +
        '<path d="M11 10.5l-3 5h3l-2 4 5-6h-3z" fill="#f59e0b"/>' +
        "</svg>"
      );
    }
    return "";
  }

  // ────────────────────────────────────────────────
  // Chart rendering
  // ────────────────────────────────────────────────

  const CHART_META = {
    temp: {
      label: "Temperature",
      sub: "Hourly",
      kind: "line",
      key: "temp",
      altKey: "feels",
      altLabel: "Feels like",
      color: "#f59e0b",
      showAlt: true,
    },
    precip: {
      label: "Precipitation",
      sub: "Chance of precipitation, hourly",
      kind: "bar",
      key: "precipProb",
      color: "#60a5fa",
      yMax: 100,
      yMin: 0,
      suffix: "%",
    },
    wind: {
      label: "Wind",
      sub: "Wind speed · gusts",
      kind: "line",
      key: "wind",
      altKey: "gusts",
      altLabel: "Gusts",
      color: "#4285f4",
      showAlt: true,
    },
    humidity: {
      label: "Humidity",
      sub: "Relative humidity, hourly",
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
    const pad = Math.max(1, (max - min) * 0.15);
    return { min: Math.floor(min - pad), max: Math.ceil(max + pad) };
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

    // Clear
    chartEl.innerHTML = "";
    legendEl.innerHTML = "";

    if (!primary.length) {
      chartEl.textContent = "";
      return;
    }

    const W = 640;
    const H = 170;
    const padL = 16;
    const padR = 16;
    const padT = 24;
    const padB = 26;

    const svg = svgEl("svg", {
      viewBox: "0 0 " + W + " " + H,
      preserveAspectRatio: "none",
    });

    // Determine Y range
    const series = [primary];
    if (alt && alt.length && meta.showAlt) series.push(alt);
    let min = Infinity;
    let max = -Infinity;
    series.forEach((s) =>
      s.forEach((v) => {
        if (v < min) min = v;
        if (v > max) max = v;
      }),
    );

    let yMin, yMax;
    if (typeof meta.yMin === "number" && typeof meta.yMax === "number") {
      yMin = meta.yMin;
      yMax = meta.yMax;
    } else {
      const r = niceRange(min, max);
      yMin = r.min;
      yMax = r.max;
    }
    if (yMax === yMin) yMax = yMin + 1;

    const xStep = (W - padL - padR) / Math.max(1, primary.length - 1);
    const yScale = (v) =>
      padT + (H - padT - padB) * (1 - (v - yMin) / (yMax - yMin));

    // Grid lines (3 horizontal)
    const gridGroup = svgEl("g", { class: "wxs-chart-grid" });
    for (let i = 0; i <= 3; i++) {
      const y = padT + ((H - padT - padB) * i) / 3;
      const line = svgEl("line", {
        x1: padL,
        x2: W - padR,
        y1: y,
        y2: y,
      });
      gridGroup.appendChild(line);
    }
    svg.appendChild(gridGroup);

    // Bars or lines
    const suffix = meta.suffix || unitsInfo.defaultSuffix(tab);

    if (meta.kind === "bar") {
      const barGroup = svgEl("g");
      const hitGroup = svgEl("g");
      const availW = W - padL - padR;
      const barW = Math.max(2, (availW / primary.length) * 0.7);
      const hitW = Math.max(barW, availW / primary.length);
      for (let i = 0; i < primary.length; i++) {
        const v = primary[i];
        const x = padL + i * xStep;
        const y = yScale(Math.max(yMin, v));
        const h = Math.max(0, H - padB - y);
        const rect = svgEl("rect", {
          class: "wxs-chart-bar",
          x: (x - barW / 2).toFixed(2),
          y: y.toFixed(2),
          width: barW.toFixed(2),
          height: h.toFixed(2),
          rx: 2,
          fill: meta.color,
          opacity: v > 0 ? 0.78 : 0.2,
        });
        barGroup.appendChild(rect);

        // Invisible full-height hit zone so zero/low bars still respond to hover
        const hit = svgEl("rect", {
          class: "wxs-chart-marker",
          x: (x - hitW / 2).toFixed(2),
          y: padT,
          width: hitW.toFixed(2),
          height: (H - padT - padB).toFixed(2),
          fill: "transparent",
          "pointer-events": "all",
          "data-i": i,
        });
        hitGroup.appendChild(hit);
      }
      svg.appendChild(barGroup);
      svg.appendChild(hitGroup);
    } else {
      // Area + line for primary
      const primaryPts = primary.map((v, i) => ({
        x: padL + i * xStep,
        y: yScale(v),
      }));
      const linePath = buildPath(primaryPts);
      const areaPath =
        linePath +
        " L " +
        primaryPts[primaryPts.length - 1].x.toFixed(2) +
        " " +
        (H - padB) +
        " L " +
        primaryPts[0].x.toFixed(2) +
        " " +
        (H - padB) +
        " Z";

      svg.appendChild(
        svgEl("path", {
          class: "wxs-chart-area",
          d: areaPath,
          fill: meta.color,
          stroke: "none",
        }),
      );
      svg.appendChild(
        svgEl("path", {
          class: "wxs-chart-line",
          d: linePath,
          stroke: meta.color,
        }),
      );

      if (alt && alt.length && meta.showAlt) {
        const altPts = alt.map((v, i) => ({
          x: padL + i * xStep,
          y: yScale(v),
        }));
        const altPath = buildPath(altPts);
        svg.appendChild(
          svgEl("path", {
            class: "wxs-chart-line",
            d: altPath,
            stroke: meta.color,
            "stroke-opacity": 0.45,
            "stroke-dasharray": "4 4",
          }),
        );
      }

      // Markers (smaller, fewer to avoid clutter — every other point)
      const markerGroup = svgEl("g");
      const step = primary.length > 18 ? 3 : 2;
      for (let i = 0; i < primary.length; i++) {
        const showLabel = i === 0 || i === primary.length - 1 || i % step === 0;
        const x = padL + i * xStep;
        const y = yScale(primary[i]);
        if (showLabel) {
          const txt = svgEl("text", {
            class: "wxs-chart-label",
            x: x,
            y: y - 8,
          });
          txt.textContent = Math.round(primary[i]) + "";
          markerGroup.appendChild(txt);
        }
        // Invisible hit circle for tooltip — full-height so vertical hovering works too
        const hit = svgEl("rect", {
          class: "wxs-chart-marker",
          x: (x - xStep / 2).toFixed(2),
          y: padT,
          width: xStep.toFixed(2),
          height: (H - padT - padB).toFixed(2),
          fill: "transparent",
          "pointer-events": "all",
          "data-i": i,
        });
        markerGroup.appendChild(hit);
        // Visible dot
        const dot = svgEl("circle", {
          class: "wxs-chart-point",
          cx: x,
          cy: y,
          r: 2.5,
          stroke: meta.color,
          "data-i": i,
        });
        markerGroup.appendChild(dot);
      }
      svg.appendChild(markerGroup);
    }

    // X axis labels (every ~3 hours)
    const axisGroup = svgEl("g", { class: "wxs-chart-axis" });
    const labelStep = labels.length > 12 ? 3 : 2;
    for (let i = 0; i < labels.length; i++) {
      if (i % labelStep !== 0 && i !== labels.length - 1) continue;
      const x = padL + i * xStep;
      const t = svgEl("text", {
        x: x,
        y: H - 8,
        "text-anchor": "middle",
      });
      t.textContent = labels[i];
      axisGroup.appendChild(t);
    }
    svg.appendChild(axisGroup);

    chartEl.appendChild(svg);
    // Re-attach the tooltip so it survives innerHTML clears between renders
    chartEl.appendChild(tooltipEl);
    tooltipEl.classList.remove("wxs-tt-visible");

    // Legend
    const legendItems = [];
    legendItems.push(
      '<span><i style="background:' +
        meta.color +
        '"></i>' +
        meta.label +
        "</span>",
    );
    if (alt && alt.length && meta.showAlt) {
      legendItems.push(
        '<span><i style="background:' +
          meta.color +
          ';opacity:.45"></i>' +
          meta.altLabel +
          "</span>",
      );
    }
    legendEl.innerHTML = legendItems.join("");

    // Tooltip interactions
    const hits = chartEl.querySelectorAll(".wxs-chart-marker[data-i]");
    let highlightEl = null;

    function clearHighlight() {
      if (highlightEl && highlightEl.parentNode) {
        highlightEl.parentNode.removeChild(highlightEl);
      }
      highlightEl = null;
    }

    function drawHighlight(i) {
      clearHighlight();
      const x = padL + i * xStep;
      if (meta.kind === "bar") {
        // Outline the bar being hovered
        highlightEl = svgEl("line", {
          x1: x,
          x2: x,
          y1: padT,
          y2: H - padB,
          stroke: meta.color,
          "stroke-opacity": 0.3,
          "stroke-width": 1,
          "stroke-dasharray": "2 3",
          "pointer-events": "none",
        });
      } else {
        const y = yScale(primary[i]);
        highlightEl = svgEl("g", { "pointer-events": "none" });
        const guide = svgEl("line", {
          x1: x,
          x2: x,
          y1: padT,
          y2: H - padB,
          stroke: meta.color,
          "stroke-opacity": 0.25,
          "stroke-width": 1,
          "stroke-dasharray": "2 3",
        });
        const ring = svgEl("circle", {
          cx: x,
          cy: y,
          r: 5,
          fill: meta.color,
          stroke: "var(--bg, #111)",
          "stroke-width": 2,
        });
        highlightEl.appendChild(guide);
        highlightEl.appendChild(ring);
      }
      svg.appendChild(highlightEl);
    }

    function show(i) {
      const v = primary[i];
      const tLabel = labels[i] || "";
      const primaryLabel = meta.kind === "bar" ? meta.label : meta.label;
      const altLine =
        alt && alt.length && meta.showAlt
          ? '<div class="wxs-tt-row"><span class="wxs-tt-key">' +
            meta.altLabel +
            "</span><strong>" +
            fmtVal(alt[i], tab, unitsInfo) +
            "</strong></div>"
          : "";
      tooltipEl.innerHTML =
        '<span class="wxs-tt-label">' +
        tLabel +
        "</span>" +
        '<div class="wxs-tt-row"><span class="wxs-tt-key">' +
        primaryLabel +
        "</span><strong>" +
        fmtVal(v, tab, unitsInfo) +
        "</strong></div>" +
        altLine;

      const xPct = ((padL + i * xStep) / W) * 100;
      // Clamp so the tooltip doesn't spill off the edges
      const clamped = Math.max(8, Math.min(92, xPct));
      tooltipEl.style.left = clamped + "%";
      tooltipEl.style.top = "0px";
      tooltipEl.classList.add("wxs-tt-visible");

      drawHighlight(i);
    }

    function hide() {
      tooltipEl.classList.remove("wxs-tt-visible");
      clearHighlight();
    }

    hits.forEach((el) => {
      el.addEventListener("mouseenter", () => {
        const i = parseInt(el.getAttribute("data-i"), 10);
        if (!isNaN(i)) show(i);
      });
      el.addEventListener("mousemove", () => {
        const i = parseInt(el.getAttribute("data-i"), 10);
        if (!isNaN(i)) show(i);
      });
    });
    chartEl.addEventListener("mouseleave", hide);
  }

  function fmtVal(v, tab, unitsInfo) {
    if (v == null || isNaN(v)) return "—";
    if (tab === "temp") return Math.round(v) + unitsInfo.tempUnit;
    if (tab === "precip") return Math.round(v) + "%";
    if (tab === "wind") return fmtSmall(v) + " " + unitsInfo.windUnit;
    if (tab === "humidity") return Math.round(v) + "%";
    return String(v);
  }

  function fmtSmall(n) {
    if (!isFinite(n)) return "0";
    if (Math.abs(n) >= 100) return String(Math.round(n));
    if (Math.abs(n) >= 10) return n.toFixed(0);
    return n.toFixed(1);
  }

  // ────────────────────────────────────────────────
  // Hero icon helper
  // ────────────────────────────────────────────────

  function setHeroIcon(slotEl, type, isDay) {
    let icon = type;
    if (!ICONS_HERO[icon]) icon = "cloud";
    // If clear sky at night, swap to moon
    if (type === "sun" && isDay === false) icon = "moon";
    slotEl.innerHTML = ICONS_HERO[icon]();
  }

  // ────────────────────────────────────────────────
  // Init per wrap
  // ────────────────────────────────────────────────

  function initWrap(wrap) {
    if (wrap.dataset.wxsInit) return;
    wrap.dataset.wxsInit = "1";

    let payload;
    try {
      payload = JSON.parse(wrap.dataset.wxsPayload || "{}");
    } catch (e) {
      console.warn("[weather-slot] bad payload", e);
      return;
    }

    const days = payload.days || [];
    if (!days.length) return;

    const unitsInfo = {
      tempUnit: payload.tempUnit || "°C",
      windUnit: payload.windUnit || "km/h",
      pressureUnit: payload.pressureUnit || "hPa",
      precipUnit: payload.precipUnit || "mm",
      defaultSuffix(tab) {
        if (tab === "temp") return this.tempUnit;
        if (tab === "wind") return " " + this.windUnit;
        return "";
      },
    };

    const heroIconSlot = wrap.querySelector("[data-wxs-icon-slot]");
    const tempEl = wrap.querySelector("[data-wxs-temp]");
    const tempUnitEl = wrap.querySelector("[data-wxs-temp-unit]");
    const descEl = wrap.querySelector("[data-wxs-desc]");
    const feelsEl = wrap.querySelector("[data-wxs-feels]");
    const precipProbEl = wrap.querySelector("[data-wxs-precip-prob]");
    const humidityEl = wrap.querySelector("[data-wxs-humidity]");
    const humidityDetailEl = wrap.querySelector("[data-wxs-humidity-detail]");
    const windEl = wrap.querySelector("[data-wxs-wind]");
    const gustsEl = wrap.querySelector("[data-wxs-gusts]");
    const pressureEl = wrap.querySelector("[data-wxs-pressure]");
    const uvEl = wrap.querySelector("[data-wxs-uv]");
    const uvLevelEl = wrap.querySelector("[data-wxs-uv-level]");
    const visibilityEl = wrap.querySelector("[data-wxs-visibility]");
    const dewEl = wrap.querySelector("[data-wxs-dew]");
    const cloudsEl = wrap.querySelector("[data-wxs-clouds]");
    const precipNowEl = wrap.querySelector("[data-wxs-precip-now]");
    const sunriseEl = wrap.querySelector("[data-wxs-sunrise]");
    const sunsetEl = wrap.querySelector("[data-wxs-sunset]");
    const sunDotEl = wrap.querySelector("[data-wxs-sun-dot]");
    const hiEl = wrap.querySelector("[data-wxs-hi]");
    const loEl = wrap.querySelector("[data-wxs-lo]");
    const dayLabelEl = wrap.querySelector("[data-wxs-day-label]");
    const daysEl = wrap.querySelector("[data-wxs-days]");
    const chartEl = wrap.querySelector("[data-wxs-chart]");
    const chartTitleEl = wrap.querySelector("[data-wxs-chart-title]");
    const chartSubEl = wrap.querySelector("[data-wxs-chart-sub]");
    const chartLegendEl = wrap.querySelector("[data-wxs-chart-legend]");
    const tabsEl = wrap.querySelector("[data-wxs-tabs]");

    if (!chartEl || !daysEl) return;

    // Tooltip
    const tooltipEl = document.createElement("div");
    tooltipEl.className = "wxs-chart-tooltip";
    chartEl.style.position = "relative";
    chartEl.appendChild(tooltipEl);

    let activeTab = "temp";
    let activeDay = 0;
    const isDayNow = wrap.dataset.wxsIsDay === "1";

    // Initial hero icon
    if (heroIconSlot) {
      setHeroIcon(heroIconSlot, wrap.dataset.wxsIcon || "cloud", isDayNow);
    }

    // Build day tiles
    function buildDays() {
      daysEl.innerHTML = days
        .map((d, i) => {
          const precipClass =
            d.precipProb > 0
              ? "wxs-day-precip"
              : "wxs-day-precip wxs-day-precip-zero";
          const precipHtml =
            '<div class="' +
            precipClass +
            '">' +
            '<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true"><path d="M5 0.5c1.7 2.5 3 4.4 3 6a3 3 0 1 1-6 0c0-1.6 1.3-3.5 3-6z"/></svg>' +
            "<span>" +
            d.precipProb +
            "%</span>" +
            "</div>";
          return (
            '<div class="wxs-day' +
            (i === 0 ? " wxs-day-active" : "") +
            '" data-i="' +
            i +
            '" title="' +
            d.longName +
            " · " +
            d.desc +
            '">' +
            '<div class="wxs-day-name">' +
            d.name +
            "</div>" +
            '<div class="wxs-day-icon">' +
            smallIconSvg(d.icon, 28) +
            "</div>" +
            '<div class="wxs-day-hi">' +
            d.hi +
            "°</div>" +
            '<div class="wxs-day-lo">' +
            d.lo +
            "°</div>" +
            precipHtml +
            "</div>"
          );
        })
        .join("");

      daysEl.querySelectorAll(".wxs-day").forEach((el) => {
        el.addEventListener("click", () => {
          const i = parseInt(el.getAttribute("data-i"), 10);
          selectDay(i);
        });
      });
    }

    function updateHero(i) {
      const d = days[i];
      const isToday = i === 0;
      const cur = payload.current || {};

      if (tempEl) tempEl.textContent = isToday ? cur.temp : d.hi;
      if (tempUnitEl) tempUnitEl.textContent = unitsInfo.tempUnit;
      if (descEl) descEl.textContent = d.desc;
      if (dayLabelEl) {
        if (isToday) {
          dayLabelEl.textContent = cur.nowLabel;
        } else {
          // Build a "Monday, November 26" style label for future days
          const futureDate = new Date();
          futureDate.setDate(futureDate.getDate() + i);
          let formatted;
          try {
            formatted = futureDate.toLocaleDateString([], {
              weekday: "long",
              month: "long",
              day: "numeric",
            });
          } catch (e) {
            formatted = d.longName;
          }
          dayLabelEl.textContent = formatted;
        }
      }

      if (feelsEl)
        feelsEl.textContent =
          (isToday ? cur.feels : d.feelsHi) + unitsInfo.tempUnit;

      if (hiEl) hiEl.textContent = d.hi + "°";
      if (loEl) loEl.textContent = d.lo + "°";

      if (precipProbEl) precipProbEl.textContent = d.precipProb + "%";

      // Humidity / Wind: for today show current, otherwise average
      const hum = d.hourly && avgArr(d.hourly.humidity);
      const wnd = d.hourly && avgArr(d.hourly.wind);

      if (humidityEl)
        humidityEl.textContent =
          (isToday ? cur.humidity : Math.round(hum)) + "%";
      if (humidityDetailEl)
        humidityDetailEl.textContent =
          (isToday ? cur.humidity : Math.round(hum)) + "%";

      if (windEl)
        windEl.textContent =
          (isToday ? cur.wind : fmtSmall(wnd)) +
          " " +
          unitsInfo.windUnit +
          (isToday && cur.windDir ? " " + cur.windDir : "");

      if (gustsEl)
        gustsEl.textContent =
          (isToday ? cur.gusts : d.gustsMax) + " " + unitsInfo.windUnit;

      if (pressureEl && isToday)
        pressureEl.textContent = cur.pressure + " " + unitsInfo.pressureUnit;

      if (uvEl) uvEl.textContent = isToday ? cur.uv : d.uvMax;
      if (uvLevelEl && isToday) uvLevelEl.textContent = cur.uvLevel || "";

      if (visibilityEl && isToday)
        visibilityEl.textContent = cur.visibility || "—";
      if (dewEl && isToday)
        dewEl.textContent = cur.dewPoint + unitsInfo.tempUnit;
      if (cloudsEl && isToday) cloudsEl.textContent = cur.clouds + "%";
      if (precipNowEl)
        precipNowEl.textContent = isToday
          ? cur.precipNow + " " + unitsInfo.precipUnit
          : d.precipSum + " " + unitsInfo.precipUnit;

      // Sunrise/sunset
      if (sunriseEl) sunriseEl.textContent = d.srStr;
      if (sunsetEl) sunsetEl.textContent = d.ssStr;
      if (sunDotEl) {
        const pct = d.sunPct;
        sunDotEl.style.left = pct + "%";
        const topPct = sunArcTop(pct);
        sunDotEl.style.top = topPct + "%";
      }

      // Hero icon: for today use current iconType, otherwise day's icon
      if (heroIconSlot) {
        const iconType = isToday ? wrap.dataset.wxsIcon || d.icon : d.icon;
        setHeroIcon(heroIconSlot, iconType, isToday ? isDayNow : true);
      }

      // Animate fade
      if (tempEl) {
        tempEl.style.animation = "none";
        void tempEl.offsetWidth;
        tempEl.style.animation = "wxs-fadein 0.3s ease";
      }
    }

    function sunArcTop(pct) {
      // Map 0..100 along quadratic arc that sits roughly between 10% (edges) and 90% (peak)
      const t = pct / 100;
      // The svg path is: M 10 55 Q 100 -20 190 55. Height = 60 units.
      // Evaluate quadratic: y = (1-t)^2 * 55 + 2(1-t)t*(-20) + t^2 * 55
      const y = (1 - t) * (1 - t) * 55 + 2 * (1 - t) * t * -20 + t * t * 55;
      // Convert to percentage of 60 (track height)
      return Math.max(0, Math.min(100, (y / 60) * 100));
    }

    function avgArr(arr) {
      if (!arr || !arr.length) return 0;
      let sum = 0;
      let n = 0;
      for (const v of arr) {
        if (isFinite(v)) {
          sum += v;
          n++;
        }
      }
      return n ? sum / n : 0;
    }

    function selectDay(i) {
      if (i < 0 || i >= days.length) return;
      activeDay = i;
      daysEl.querySelectorAll(".wxs-day").forEach((el) => {
        const idx = parseInt(el.getAttribute("data-i"), 10);
        el.classList.toggle("wxs-day-active", idx === i);
      });
      updateHero(i);
      renderActiveChart();
    }

    function renderActiveChart() {
      const day = days[activeDay];
      if (!day) return;
      const meta = CHART_META[activeTab];
      if (chartTitleEl)
        chartTitleEl.textContent = meta.label + " · " + day.longName;
      if (chartSubEl) chartSubEl.textContent = meta.sub;
      renderChart(chartEl, tooltipEl, chartLegendEl, day, activeTab, unitsInfo);
    }

    // Tabs
    if (tabsEl) {
      tabsEl.querySelectorAll(".wxs-tab").forEach((btn) => {
        btn.addEventListener("click", () => {
          const tab = btn.getAttribute("data-tab");
          if (!CHART_META[tab]) return;
          activeTab = tab;
          tabsEl.querySelectorAll(".wxs-tab").forEach((b) => {
            b.classList.toggle("wxs-tab-active", b === btn);
          });
          renderActiveChart();
        });
      });
    }

    buildDays();
    updateHero(0);
    renderActiveChart();
  }

  function scan() {
    document
      .querySelectorAll(".wxs-wrap:not([data-wxs-init])")
      .forEach(initWrap);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scan);
  } else {
    scan();
  }

  new MutationObserver(scan).observe(document.body, {
    childList: true,
    subtree: true,
  });
})();
