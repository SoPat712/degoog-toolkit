import { parseColor, parseColorForTrigger } from "./color-parse.js";
import { HEX_TO_NAME } from "./named-colors.js";

let template = "";

const FALLBACK_TEMPLATE = `<div class="clrtr-card" data-color-translator-card data-source-cmyk="{{source_cmyk}}">
  <div class="clrtr-panel">
    <div class="clrtr-preview-container">
      <div class="clrtr-preview-box" style="background-color: {{color_css}}">
        <div class="clrtr-preview-badge">
          {{color_hex}}
        </div>
      </div>
      <div class="clrtr-color-name">
        Name: <span>{{color_name}}</span>
      </div>

      <!-- Color Picker section -->
      <div class="clrtr-picker-section">
        <div class="clrtr-wheel" data-clrtr-wheel>
          <div class="clrtr-wheel-marker" data-clrtr-wheel-marker></div>
        </div>
        
        <div class="clrtr-sliders">
          <div class="clrtr-slider-row">
            <span class="clrtr-slider-label">Hue</span>
            <input type="range" min="0" max="360" value="0" class="clrtr-slider clrtr-hue-slider" data-clrtr-slider="hue">
          </div>
          <div class="clrtr-slider-row">
            <span class="clrtr-slider-label">Lightness</span>
            <input type="range" min="0" max="100" value="50" class="clrtr-slider clrtr-lightness-slider" data-clrtr-slider="lightness">
          </div>
          <div class="clrtr-slider-row">
            <span class="clrtr-slider-label">Alpha</span>
            <input type="range" min="0" max="1" step="0.01" value="1" class="clrtr-slider clrtr-opacity-slider" data-clrtr-slider="opacity">
          </div>
        </div>
      </div>
    </div>
    
    <div class="clrtr-translations">
      <!-- CSS Hexadecimal -->
      <div class="clrtr-row">
        <span class="clrtr-label">CSS Hex</span>
        <div class="clrtr-value-container">
          <input type="text" class="clrtr-value" value="{{color_hex}}" data-clrtr-input="hex">
          <button type="button" class="clrtr-copy-btn" data-copy="{{color_hex}}" aria-label="Copy CSS Hex">
            <svg class="clrtr-copy-icon" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
            <svg class="clrtr-check-icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          </button>
        </div>
      </div>

      <!-- CSS RGB -->
      <div class="clrtr-row">
        <span class="clrtr-label">CSS RGB</span>
        <div class="clrtr-value-container">
          <input type="text" class="clrtr-value" value="{{color_rgb}}" data-clrtr-input="rgb">
          <button type="button" class="clrtr-copy-btn" data-copy="{{color_rgb}}" aria-label="Copy CSS RGB">
            <svg class="clrtr-copy-icon" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
            <svg class="clrtr-check-icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          </button>
        </div>
      </div>

      <!-- CSS RGB Percent -->
      <div class="clrtr-row">
        <span class="clrtr-label">CSS RGB %</span>
        <div class="clrtr-value-container">
          <input type="text" class="clrtr-value" value="{{color_rgb_percent}}" data-clrtr-input="rgb_percent">
          <button type="button" class="clrtr-copy-btn" data-copy="{{color_rgb_percent}}" aria-label="Copy CSS RGB Percent">
            <svg class="clrtr-copy-icon" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
            <svg class="clrtr-check-icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          </button>
        </div>
      </div>

      <!-- CSS HSL -->
      <div class="clrtr-row">
        <span class="clrtr-label">CSS HSL</span>
        <div class="clrtr-value-container">
          <input type="text" class="clrtr-value" value="{{color_hsl}}" data-clrtr-input="hsl">
          <button type="button" class="clrtr-copy-btn" data-copy="{{color_hsl}}" aria-label="Copy CSS HSL">
            <svg class="clrtr-copy-icon" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
            <svg class="clrtr-check-icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          </button>
        </div>
      </div>

      <!-- CSS HSV -->
      <div class="clrtr-row">
        <span class="clrtr-label">CSS HSB/HSV</span>
        <div class="clrtr-value-container">
          <input type="text" class="clrtr-value" value="{{color_hsv}}" data-clrtr-input="hsv">
          <button type="button" class="clrtr-copy-btn" data-copy="{{color_hsv}}" aria-label="Copy CSS HSB/HSV">
            <svg class="clrtr-copy-icon" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
            <svg class="clrtr-check-icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          </button>
        </div>
      </div>

      <!-- CMYK -->
      <div class="clrtr-row">
        <span class="clrtr-label">CMYK</span>
        <div class="clrtr-value-container">
          <input type="text" class="clrtr-value" value="{{color_cmyk}}" data-clrtr-input="cmyk">
          <button type="button" class="clrtr-copy-btn" data-copy="{{color_cmyk}}" aria-label="Copy CMYK">
            <svg class="clrtr-copy-icon" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
            <svg class="clrtr-check-icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          </button>
        </div>
      </div>

      <!-- NSColor Calibrated RGB -->
      <div class="clrtr-row">
        <span class="clrtr-label">NSColor Calibrated RGB</span>
        <div class="clrtr-value-container">
          <input type="text" class="clrtr-value" value="{{color_ns_calibrated_rgb}}" data-clrtr-input="ns_calibrated_rgb">
          <button type="button" class="clrtr-copy-btn" data-copy="{{color_ns_calibrated_rgb}}" aria-label="Copy NSColor Calibrated RGB">
            <svg class="clrtr-copy-icon" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
            <svg class="clrtr-check-icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          </button>
        </div>
      </div>

      <!-- NSColor Calibrated HSB -->
      <div class="clrtr-row">
        <span class="clrtr-label">NSColor Calibrated HSB</span>
        <div class="clrtr-value-container">
          <input type="text" class="clrtr-value" value="{{color_ns_calibrated_hsb}}" data-clrtr-input="ns_calibrated_hsb">
          <button type="button" class="clrtr-copy-btn" data-copy="{{color_ns_calibrated_hsb}}" aria-label="Copy NSColor Calibrated HSB">
            <svg class="clrtr-copy-icon" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
            <svg class="clrtr-check-icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          </button>
        </div>
      </div>

      <!-- NSColor Device RGB -->
      <div class="clrtr-row">
        <span class="clrtr-label">NSColor Device RGB</span>
        <div class="clrtr-value-container">
          <input type="text" class="clrtr-value" value="{{color_ns_device_rgb}}" data-clrtr-input="ns_device_rgb">
          <button type="button" class="clrtr-copy-btn" data-copy="{{color_ns_device_rgb}}" aria-label="Copy NSColor Device RGB">
            <svg class="clrtr-copy-icon" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
            <svg class="clrtr-check-icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          </button>
        </div>
      </div>

      <!-- NSColor Device HSB -->
      <div class="clrtr-row">
        <span class="clrtr-label">NSColor Device HSB</span>
        <div class="clrtr-value-container">
          <input type="text" class="clrtr-value" value="{{color_ns_device_hsb}}" data-clrtr-input="ns_device_hsb">
          <button type="button" class="clrtr-copy-btn" data-copy="{{color_ns_device_hsb}}" aria-label="Copy NSColor Device HSB">
            <svg class="clrtr-copy-icon" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
            <svg class="clrtr-check-icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          </button>
        </div>
      </div>

      <!-- UIColor RGB -->
      <div class="clrtr-row">
        <span class="clrtr-label">UIColor RGB</span>
        <div class="clrtr-value-container">
          <input type="text" class="clrtr-value" value="{{color_ui_rgb}}" data-clrtr-input="ui_rgb">
          <button type="button" class="clrtr-copy-btn" data-copy="{{color_ui_rgb}}" aria-label="Copy UIColor RGB">
            <svg class="clrtr-copy-icon" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
            <svg class="clrtr-check-icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          </button>
        </div>
      </div>

      <!-- UIColor HSB -->
      <div class="clrtr-row">
        <span class="clrtr-label">UIColor HSB</span>
        <div class="clrtr-value-container">
          <input type="text" class="clrtr-value" value="{{color_ui_hsb}}" data-clrtr-input="ui_hsb">
          <button type="button" class="clrtr-copy-btn" data-copy="{{color_ui_hsb}}" aria-label="Copy UIColor HSB">
            <svg class="clrtr-copy-icon" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
            <svg class="clrtr-check-icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          </button>
        </div>
      </div>
      
    </div>
  </div>
</div>`;

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
  return HEX_TO_NAME[hex] || "None";
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

function replacePlaceholders(templateStr, data) {
  let result = templateStr;
  for (const [key, value] of Object.entries(data)) {
    result = result.split(`{{${key}}}`).join(_esc(value));
  }
  return result;
}

function _esc(str) {
  if (str === undefined || str === null) return "";
  return String(str)
    .split("&").join("&amp;")
    .split("<").join("&lt;")
    .split(">").join("&gt;")
    .split('"').join("&quot;")
    .split("'").join("&#039;");
}

function renderColorCard(color, _context) {
  const cssHex = formatCssHex(color.r, color.g, color.b, color.a);
  const cssRgb = formatCssRgb(color.r, color.g, color.b, color.a);
  const cssRgbPercent = formatCssRgbPercent(color.r, color.g, color.b, color.a);
  const cssHsl = formatCssHsl(color.r, color.g, color.b, color.a);
  const cssHsv = formatCssHsv(color.r, color.g, color.b, color.a);
  const cssCmyk = formatCmyk(color.r, color.g, color.b, color.sourceCmyk);
  const cssName = formatNamedColor(color.r, color.g, color.b, color.a);
  const sourceCmyk = color.sourceCmyk ? color.sourceCmyk.join(",") : "";
  
  const placeholders = {
    color_css: cssRgb,
    color_hex: cssHex,
    color_rgb: cssRgb,
    color_rgb_percent: cssRgbPercent,
    color_hsl: cssHsl,
    color_hsv: cssHsv,
    color_cmyk: cssCmyk,
    source_cmyk: sourceCmyk,
    color_name: cssName,
    color_name_disabled: cssName === "None" ? "disabled" : "",
    color_ns_calibrated_rgb: formatNsCalibratedRgb(color.r, color.g, color.b, color.a),
    color_ns_calibrated_hsb: formatNsCalibratedHsb(color.r, color.g, color.b, color.a),
    color_ns_device_rgb: formatNsDeviceRgb(color.r, color.g, color.b, color.a),
    color_ns_device_hsb: formatNsDeviceHsb(color.r, color.g, color.b, color.a),
    color_ui_rgb: formatUiRgb(color.r, color.g, color.b, color.a),
    color_ui_hsb: formatUiHsb(color.r, color.g, color.b, color.a)
  };

  const html = replacePlaceholders(template || FALLBACK_TEMPLATE, placeholders);
  return { title: "", html };
}

export const slot = {
  id: "color-translator",
  name: "Color Translator",
  description: "Translates hex, RGB/RGBA, HSL/HSLA, HSB/HSV, UIColor, and NSColor formats.",
  isClientExposed: false,
  position: "above-results",
  slotPositions: ["above-results", "knowledge-panel"],
  
  init(ctx) {
    template = ctx.template || FALLBACK_TEMPLATE;
  },

  trigger(query) {
    return Boolean(parseColorForTrigger(query));
  },

  async execute(query, context) {
    if (context?.tab && context.tab !== "all") return { title: "", html: "" };
    const color = parseColorForTrigger(query);
    if (!color) return { title: "", html: "" };
    return renderColorCard(color, context);
  }
};

export const slotPlugin = slot;

export const routes = [
  {
    method: "get",
    path: "parse",
    handler: (request) => {
      const url = new URL(request.url);
      const q = url.searchParams.get("q") ?? "";
      const color = parseColor(q);
      return new Response(JSON.stringify(color), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        }
      });
    }
  },
  {
    method: "get",
    path: "color-names",
    handler: () => new Response(JSON.stringify(HEX_TO_NAME), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=86400"
      }
    })
  }
];

export default slot;
