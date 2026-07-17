(function () {
  let hexToName = {};
  let hexToNamePromise = null;
  const PARSE_CACHE_MAX_ENTRIES = 100;

  function pluginBase() {
    const id = typeof __PLUGIN_ID__ !== "undefined" ? __PLUGIN_ID__ : "color-translator";
    return `/api/plugin/${encodeURIComponent(id)}`;
  }

  function ensureHexToName() {
    if (Object.keys(hexToName).length) return Promise.resolve(hexToName);
    if (!hexToNamePromise) {
      hexToNamePromise = fetch(`${pluginBase()}/color-names`)
        .then((res) => (res.ok ? res.json() : {}))
        .then((map) => {
          hexToName = map || {};
          return hexToName;
        })
        .catch(() => ({}));
    }
    return hexToNamePromise;
  }

  function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }

    return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
  }

  function hslToRgb(h, s, l) {
    h /= 360;
    s /= 100;
    l /= 100;
    let r, g, b;

    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };

      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }

  function rgbToHsb(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h;
    const s = max === 0 ? 0 : d / max;
    const v = max;

    if (max === min) {
      h = 0;
    } else {
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }

    return [Math.round(h * 360), Math.round(s * 100), Math.round(v * 100)];
  }



  function rgbToCmyk(r, g, b) {
    let c = 1 - (r / 255);
    let m = 1 - (g / 255);
    let y = 1 - (b / 255);
    let k = Math.min(c, Math.min(m, y));
    if (k === 1) {
      c = 0;
      m = 0;
      y = 0;
    } else {
      c = (c - k) / (1 - k);
      m = (m - k) / (1 - k);
      y = (y - k) / (1 - k);
    }
    return [
      Math.round(c * 100),
      Math.round(m * 100),
      Math.round(y * 100),
      Math.round(k * 100)
    ];
  }

  function parseHex(hex) {
    let r, g, b, a = 1;
    const cleanHex = hex.startsWith('#') ? hex.slice(1) : hex;
    if (!/^(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(cleanHex)) {
      return null;
    }
    if (cleanHex.length === 3) {
      r = parseInt(cleanHex[0] + cleanHex[0], 16);
      g = parseInt(cleanHex[1] + cleanHex[1], 16);
      b = parseInt(cleanHex[2] + cleanHex[2], 16);
    } else if (cleanHex.length === 4) {
      r = parseInt(cleanHex[0] + cleanHex[0], 16);
      g = parseInt(cleanHex[1] + cleanHex[1], 16);
      b = parseInt(cleanHex[2] + cleanHex[2], 16);
      a = parseInt(cleanHex[3] + cleanHex[3], 16) / 255;
    } else if (cleanHex.length === 6) {
      r = parseInt(cleanHex.slice(0, 2), 16);
      g = parseInt(cleanHex.slice(2, 4), 16);
      b = parseInt(cleanHex.slice(4, 6), 16);
    } else if (cleanHex.length === 8) {
      r = parseInt(cleanHex.slice(0, 2), 16);
      g = parseInt(cleanHex.slice(2, 4), 16);
      b = parseInt(cleanHex.slice(4, 6), 16);
      a = parseInt(cleanHex.slice(6, 8), 16) / 255;
    } else {
      return null;
    }
    return { r, g, b, a: Number(a.toFixed(3)) };
  }

  const parseCache = new Map();

  async function fetchParsedColor(value) {
    const key = value.trim();
    if (!key) return null;
    if (parseCache.has(key)) return parseCache.get(key);

    try {
      const url = `${pluginBase()}/parse?q=${encodeURIComponent(key)}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const parsed = await res.json();
      if (!parsed || parsed.r === undefined) return null;
      parseCache.delete(key);
      parseCache.set(key, parsed);
      while (parseCache.size > PARSE_CACHE_MAX_ENTRIES) {
        parseCache.delete(parseCache.keys().next().value);
      }
      return parsed;
    } catch {
      return null;
    }
  }

  function formatCssHex(r, g, b, a) {
    const hexR = r.toString(16).padStart(2, '0').toUpperCase();
    const hexG = g.toString(16).padStart(2, '0').toUpperCase();
    const hexB = b.toString(16).padStart(2, '0').toUpperCase();
    if (a >= 1) {
      return `#${hexR}${hexG}${hexB}`;
    }
    const hexA = Math.round(a * 255).toString(16).padStart(2, '0').toUpperCase();
    return `#${hexR}${hexG}${hexB}${hexA}`;
  }

  function formatCssRgb(r, g, b, a) {
    if (a >= 1) {
      return `rgb(${r}, ${g}, ${b})`;
    }
    return `rgba(${r}, ${g}, ${b}, ${parseFloat(a.toFixed(3))})`;
  }

  function formatCssRgbPercent(r, g, b, a) {
    const pctR = Math.round((r / 255) * 100);
    const pctG = Math.round((g / 255) * 100);
    const pctB = Math.round((b / 255) * 100);
    if (a >= 1) {
      return `rgb(${pctR}%, ${pctG}%, ${pctB}%)`;
    }
    return `rgba(${pctR}%, ${pctG}%, ${pctB}%, ${parseFloat(a.toFixed(3))})`;
  }

  function formatCssHsl(r, g, b, a) {
    const [h, s, l] = rgbToHsl(r, g, b);
    if (a >= 1) {
      return `hsl(${h}, ${s}%, ${l}%)`;
    }
    return `hsla(${h}, ${s}%, ${l}%, ${parseFloat(a.toFixed(3))})`;
  }

  function formatCssHsv(r, g, b, a) {
    const [h, s, v] = rgbToHsb(r, g, b);
    if (a >= 1) {
      return `hsv(${h}, ${s}%, ${v}%)`;
    }
    return `hsva(${h}, ${s}%, ${v}%, ${parseFloat(a.toFixed(3))})`;
  }

  function formatCmykValues(c, m, y, k) {
    return `cmyk(${c}%, ${m}%, ${y}%, ${k}%)`;
  }

  function formatCmyk(r, g, b, sourceCmyk) {
    if (sourceCmyk) {
      return formatCmykValues(...sourceCmyk);
    }
    const [c, m, y, k] = rgbToCmyk(r, g, b);
    return formatCmykValues(c, m, y, k);
  }

  function formatNamedColor(r, g, b, a) {
    if (a < 1) return "None";
    const hex = formatCssHex(r, g, b, 1).toLowerCase();
    return hexToName[hex] || "None";
  }

  function formatNsCalibratedRgb(r, g, b, a) {
    const red = (r / 255).toFixed(3);
    const green = (g / 255).toFixed(3);
    const blue = (b / 255).toFixed(3);
    return `[NSColor colorWithCalibratedRed:${parseFloat(red)} green:${parseFloat(green)} blue:${parseFloat(blue)} alpha:${parseFloat(a.toFixed(3))}]`;
  }

  function formatNsCalibratedHsb(r, g, b, a) {
    const [h, s, v] = rgbToHsb(r, g, b);
    const hue = (h / 360).toFixed(3);
    const sat = (s / 100).toFixed(3);
    const bri = (v / 100).toFixed(3);
    return `[NSColor colorWithCalibratedHue:${parseFloat(hue)} saturation:${parseFloat(sat)} brightness:${parseFloat(bri)} alpha:${parseFloat(a.toFixed(3))}]`;
  }

  function formatNsDeviceRgb(r, g, b, a) {
    const red = (r / 255).toFixed(3);
    const green = (g / 255).toFixed(3);
    const blue = (b / 255).toFixed(3);
    return `[NSColor colorWithDeviceRed:${parseFloat(red)} green:${parseFloat(green)} blue:${parseFloat(blue)} alpha:${parseFloat(a.toFixed(3))}]`;
  }

  function formatNsDeviceHsb(r, g, b, a) {
    const [h, s, v] = rgbToHsb(r, g, b);
    const hue = (h / 360).toFixed(3);
    const sat = (s / 100).toFixed(3);
    const bri = (v / 100).toFixed(3);
    return `[NSColor colorWithDeviceHue:${parseFloat(hue)} saturation:${parseFloat(sat)} brightness:${parseFloat(bri)} alpha:${parseFloat(a.toFixed(3))}]`;
  }

  function formatUiRgb(r, g, b, a) {
    const red = (r / 255).toFixed(3);
    const green = (g / 255).toFixed(3);
    const blue = (b / 255).toFixed(3);
    return `[UIColor colorWithRed:${parseFloat(red)} green:${parseFloat(green)} blue:${parseFloat(blue)} alpha:${parseFloat(a.toFixed(3))}]`;
  }

  function formatUiHsb(r, g, b, a) {
    const [h, s, v] = rgbToHsb(r, g, b);
    const hue = (h / 360).toFixed(3);
    const sat = (s / 100).toFixed(3);
    const bri = (v / 100).toFixed(3);
    return `[UIColor colorWithHue:${parseFloat(hue)} saturation:${parseFloat(sat)} brightness:${parseFloat(bri)} alpha:${parseFloat(a.toFixed(3))}]`;
  }

  function formatColor(color, type) {
    const { r, g, b, a, sourceCmyk } = color;
    switch (type) {
      case 'hex': return formatCssHex(r, g, b, a);
      case 'rgb': return formatCssRgb(r, g, b, a);
      case 'rgb_percent': return formatCssRgbPercent(r, g, b, a);
      case 'hsl': return formatCssHsl(r, g, b, a);
      case 'hsv': return formatCssHsv(r, g, b, a);
      case 'cmyk': return formatCmyk(r, g, b, sourceCmyk);
      case 'ns_calibrated_rgb': return formatNsCalibratedRgb(r, g, b, a);
      case 'ns_calibrated_hsb': return formatNsCalibratedHsb(r, g, b, a);
      case 'ns_device_rgb': return formatNsDeviceRgb(r, g, b, a);
      case 'ns_device_hsb': return formatNsDeviceHsb(r, g, b, a);
      case 'ui_rgb': return formatUiRgb(r, g, b, a);
      case 'ui_hsb': return formatUiHsb(r, g, b, a);
      default: return '';
    }
  }

  function initWheel(wheel, marker, onChange) {
    let isDragging = false;

    function updateFromEvent(e) {
      const rect = wheel.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      
      let clientX, clientY;
      if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }

      const dx = clientX - cx;
      const dy = clientY - cy;
      
      const dist = Math.sqrt(dx * dx + dy * dy);
      const R = rect.width / 2;
      
      const saturation = Math.min(100, (dist / R) * 100);
      
      let angleDeg = Math.atan2(dx, -dy) * (180 / Math.PI);
      if (angleDeg < 0) {
        angleDeg += 360;
      }
      const hue = angleDeg;

      onChange(hue, saturation);
    }

    function onStart(e) {
      isDragging = true;
      updateFromEvent(e);
      
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onEnd);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onEnd);
      document.addEventListener('touchcancel', onEnd);
      
      e.preventDefault();
    }

    function onMove(e) {
      if (!isDragging) return;
      updateFromEvent(e);
      e.preventDefault();
    }

    function onEnd() {
      isDragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    }

    wheel.addEventListener('mousedown', onStart);
    wheel.addEventListener('touchstart', onStart, { passive: false });
  }

  function init() {
    document.querySelectorAll("[data-color-translator-card]").forEach(initCard);
  }

  function initCard(card) {
    if (card.__colorTranslatorInitialized) return;
    card.__colorTranslatorInitialized = true;

    const hexInput = card.querySelector('[data-clrtr-input="hex"]');
    const initialHex = hexInput ? hexInput.value : '#FF0000';
    let currentColor = parseHex(initialHex) || { r: 255, g: 0, b: 0, a: 1 };
    const sourceCmykAttr = card.getAttribute('data-source-cmyk');
    if (sourceCmykAttr) {
      const parts = sourceCmykAttr.split(',').map((n) => Number(n));
      if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
        currentColor.sourceCmyk = parts;
      }
    }
    let [h, s, l] = rgbToHsl(currentColor.r, currentColor.g, currentColor.b);
    let a = currentColor.a;

    const previewBox = card.querySelector('.clrtr-preview-box');
    const previewBadge = card.querySelector('.clrtr-preview-badge');
    const colorNameSpan = card.querySelector('.clrtr-color-name span');
    const marker = card.querySelector('[data-clrtr-wheel-marker]');
    const wheel = card.querySelector('[data-clrtr-wheel]');
    
    const inputs = {};
    card.querySelectorAll('[data-clrtr-input]').forEach(input => {
      const type = input.getAttribute('data-clrtr-input');
      inputs[type] = input;
    });

    const hueSlider = card.querySelector('[data-clrtr-slider="hue"]');
    const lightnessSlider = card.querySelector('[data-clrtr-slider="lightness"]');
    const opacitySlider = card.querySelector('[data-clrtr-slider="opacity"]');

    function updateColorFromRgb(r, g, b, newAlpha, sourceCmyk) {
      currentColor.r = r;
      currentColor.g = g;
      currentColor.b = b;
      currentColor.a = newAlpha;
      if (sourceCmyk) {
        currentColor.sourceCmyk = sourceCmyk;
      } else {
        delete currentColor.sourceCmyk;
      }
      
      const [newH, newS, newL] = rgbToHsl(r, g, b);
      h = newH;
      s = newS;
      l = newL;
      a = newAlpha;
    }

    function updateColorFromHsl(newH, newS, newL, newAlpha) {
      h = newH;
      s = newS;
      l = newL;
      a = newAlpha;
      
      const [r, g, b] = hslToRgb(h, s, l);
      currentColor.r = r;
      currentColor.g = g;
      currentColor.b = b;
      currentColor.a = a;
      delete currentColor.sourceCmyk;
    }

    function updateUI(source) {
      const rgbCss = formatCssRgb(currentColor.r, currentColor.g, currentColor.b, currentColor.a);
      if (previewBox) {
        previewBox.style.backgroundColor = rgbCss;
      }
      
      const hexCss = formatCssHex(currentColor.r, currentColor.g, currentColor.b, currentColor.a);
      if (previewBadge) {
        previewBadge.textContent = hexCss;
      }

      const nameCss = formatNamedColor(currentColor.r, currentColor.g, currentColor.b, currentColor.a);
      if (colorNameSpan) {
        colorNameSpan.textContent = nameCss;
      }

      for (const [type, input] of Object.entries(inputs)) {
        const val = input === source ? input.value : formatColor(currentColor, type);
        if (input !== source) {
          input.value = val;
        }
        const btn = input.closest('.clrtr-row')?.querySelector('.clrtr-copy-btn');
        if (btn) {
          btn.setAttribute('data-copy', val);
        }
      }

      if (marker) {
        const rad = h * (Math.PI / 180);
        const left = 50 + (s * 0.5 * Math.sin(rad));
        const top = 50 - (s * 0.5 * Math.cos(rad));
        marker.style.left = `${left}%`;
        marker.style.top = `${top}%`;
      }

      if (hueSlider && source !== hueSlider) hueSlider.value = h;
      if (lightnessSlider && source !== lightnessSlider) lightnessSlider.value = l;
      if (opacitySlider && source !== opacitySlider) opacitySlider.value = a;

      if (lightnessSlider) {
        lightnessSlider.style.background = `linear-gradient(to right, #000 0%, hsl(${h}, ${s}%, 50%) 50%, #fff 100%)`;
      }
      if (opacitySlider) {
        opacitySlider.style.backgroundImage = `linear-gradient(to right, transparent, hsl(${h}, ${s}%, ${l}%)), repeating-conic-gradient(#ccc 0 25%, #fff 0 50%)`;
      }
    }

    if (wheel && marker) {
      initWheel(wheel, marker, (newH, newS) => {
        updateColorFromHsl(newH, newS, l, a);
        updateUI(wheel);
      });
    }

    [hueSlider, lightnessSlider, opacitySlider].forEach(slider => {
      if (!slider) return;
      slider.addEventListener('input', () => {
        const type = slider.getAttribute('data-clrtr-slider');
        const val = parseFloat(slider.value);
        if (type === 'hue') {
          h = val;
        } else if (type === 'lightness') {
          l = val;
        } else if (type === 'opacity') {
          a = val;
        }
        updateColorFromHsl(h, s, l, a);
        updateUI(slider);
      });
    });

    let inputParseTimer = null;
    let parseSequence = 0;
    for (const [, input] of Object.entries(inputs)) {
      input.addEventListener('input', () => {
        clearTimeout(inputParseTimer);
        const sequence = ++parseSequence;
        const value = input.value;
        inputParseTimer = setTimeout(async () => {
          const parsed = await fetchParsedColor(value);
          if (sequence === parseSequence && parsed && card.isConnected) {
            updateColorFromRgb(parsed.r, parsed.g, parsed.b, parsed.a, parsed.sourceCmyk);
            updateUI(input);
          }
        }, 120);
      });
      input.addEventListener('blur', () => {
        clearTimeout(inputParseTimer);
        const sequence = ++parseSequence;
        fetchParsedColor(input.value).then((parsed) => {
          if (sequence !== parseSequence || !card.isConnected) return;
          if (parsed) {
            updateColorFromRgb(parsed.r, parsed.g, parsed.b, parsed.a, parsed.sourceCmyk);
          }
          updateUI();
        });
      });
    }

    const copyButtons = card.querySelectorAll(".clrtr-copy-btn");
    copyButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const textToCopy = btn.getAttribute("data-copy");
        if (!textToCopy) return;

        copyText(textToCopy).then(() => {
          btn.classList.add("copied");
          setTimeout(() => {
            btn.classList.remove("copied");
          }, 1500);
        }).catch((err) => {
          console.error("Failed to copy text: ", err);
        });
      });
    });

    updateUI();
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("Copy failed");
  }

  function boot() {
    ensureHexToName().finally(init);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  let initScheduled = false;
  const observer = new MutationObserver((mutations) => {
    const hasRelevantNode = mutations.some((mutation) =>
      Array.from(mutation.addedNodes).some(
        (node) =>
          node instanceof HTMLElement &&
          (node.matches("[data-color-translator-card]") ||
            node.querySelector?.("[data-color-translator-card]")),
      ),
    );
    if (!hasRelevantNode || initScheduled) return;
    initScheduled = true;
    queueMicrotask(() => {
      initScheduled = false;
      ensureHexToName().finally(init);
    });
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
