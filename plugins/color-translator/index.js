let template = "";

const NAMED_COLORS = {
  aliceblue: "#f0f8ff",
  antiquewhite: "#faebd7",
  aqua: "#00ffff",
  aquamarine: "#7fffd4",
  azure: "#f0ffff",
  beige: "#f5f5dc",
  bisque: "#ffe4c4",
  black: "#000000",
  blanchedalmond: "#ffebcd",
  blue: "#0000ff",
  blueviolet: "#8a2be2",
  brown: "#a52a2a",
  burlywood: "#deb887",
  cadetblue: "#5f9ea0",
  chartreuse: "#7fff00",
  chocolate: "#d2691e",
  coral: "#ff7f50",
  cornflowerblue: "#6495ed",
  cornsilk: "#fff8dc",
  crimson: "#dc143c",
  cyan: "#00ffff",
  darkblue: "#00008b",
  darkcyan: "#008b8b",
  darkgoldenrod: "#b8860b",
  darkgray: "#a9a9a9",
  darkgreen: "#006400",
  darkgrey: "#a9a9a9",
  darkkhaki: "#bdb76b",
  darkmagenta: "#8b008b",
  darkolivegreen: "#556b2f",
  darkorange: "#ff8c00",
  darkorchid: "#9932cc",
  darkred: "#8b0000",
  darksalmon: "#e9967a",
  darkseagreen: "#8fbc8f",
  darkslate5a0: "#2f4f4f",
  darkslateblue: "#483d8b",
  darkslategrey: "#2f4f4f",
  darkturquoise: "#00ced1",
  darkviolet: "#9400d3",
  deeppink: "#ff1493",
  deepskyblue: "#00bfff",
  dimgray: "#696969",
  dimgrey: "#696969",
  dodgerblue: "#1e90ff",
  firebrick: "#b22222",
  floralwhite: "#fffaf0",
  forestgreen: "#228b22",
  fuchsia: "#ff00ff",
  gainsboro: "#dcdcdc",
  ghostwhite: "#f8f8ff",
  gold: "#ffd700",
  goldenrod: "#daa520",
  gray: "#808080",
  green: "#008000",
  greenyellow: "#adff2f",
  grey: "#808080",
  honeydew: "#f0fff0",
  hotpink: "#ff69b4",
  indianred: "#cd5c5c",
  indigo: "#4b0082",
  ivory: "#fffff0",
  khaki: "#f0e68c",
  lavender: "#e6e6fa",
  lavenderblush: "#fff0f5",
  lawngreen: "#7cfc00",
  lemonchiffon: "#fffacd",
  lightblue: "#add8e6",
  lightcoral: "#f08080",
  lightcyan: "#e0ffff",
  lightgoldenrodyellow: "#fafad2",
  lightgray: "#d3d3d3",
  lightgreen: "#90ee90",
  lightgrey: "#d3d3d3",
  lightpink: "#ffb6c1",
  lightsalmon: "#ffa07a",
  lightseagreen: "#20b2aa",
  lightskyblue: "#87cefa",
  lightslategrey: "#778899",
  lightyellow: "#ffffe0",
  lime: "#00ff00",
  limegreen: "#32cd32",
  linen: "#faf0e6",
  magenta: "#ff00ff",
  maroon: "#800000",
  mediumaquamarine: "#66cdaa",
  mediumblue: "#0000cd",
  mediumorchid: "#ba55d3",
  mediumpurple: "#9370db",
  mediumseagreen: "#3cb371",
  mediumslateblue: "#7b68ee",
  mediumspringgreen: "#00fa9a",
  mediumturquoise: "#48d1cc",
  mediumvioletred: "#c71585",
  midnightblue: "#191970",
  mintcream: "#f5fffa",
  mistyrose: "#ffe4e1",
  moccasin: "#ffe4b5",
  navajowhite: "#ffdead",
  navy: "#000080",
  oldlace: "#fdf5e6",
  olive: "#808000",
  olivedrab: "#6b8e23",
  orange: "#ffa500",
  orangered: "#ff4500",
  orchid: "#da70d6",
  palegoldenrod: "#eee8aa",
  palegreen: "#98fb98",
  paleturquoise: "#afeeee",
  palevioletred: "#db7093",
  papayawhip: "#ffefd5",
  peachpuff: "#ffdab9",
  peru: "#cd853f",
  pink: "#ffc0cb",
  plum: "#dda0dd",
  powderblue: "#b0e0e6",
  purple: "#800080",
  rebeccapurple: "#663399",
  red: "#ff0000",
  rosybrown: "#bc8f8f",
  royalblue: "#4169e1",
  saddlebrown: "#8b4513",
  salmon: "#fa8072",
  sandybrown: "#f4a460",
  seagreen: "#2e8b57",
  seashell: "#fff5ee",
  sienna: "#a0522d",
  silver: "#c0c0c0",
  skyblue: "#87ceeb",
  slateblue: "#6a5acd",
  slategrey: "#708090",
  snow: "#fffafa",
  springgreen: "#00ff7f",
  steelblue: "#4682b4",
  tan: "#d2b48c",
  teal: "#008080",
  thistle: "#d8bfd8",
  tomato: "#ff6347",
  turquoise: "#40e0d0",
  violet: "#ee82ee",
  wheat: "#f5deb3",
  white: "#ffffff",
  whitesmoke: "#f5f5f5",
  yellow: "#ffff00",
  yellowgreen: "#9acd32"
};

const HEX_TO_NAME = {};
for (const [name, hex] of Object.entries(NAMED_COLORS)) {
  HEX_TO_NAME[hex.toLowerCase()] = name;
}

const FALLBACK_TEMPLATE = `<div class="clrtr-card" data-color-translator-card>
  <div class="clrtr-panel">
    <div class="clrtr-preview-container">
      <div class="clrtr-preview-box" style="background-color: {{color_css}}">
        <div class="clrtr-preview-overlay">
          <div class="clrtr-overlay-title">Color Info</div>
          <div class="clrtr-overlay-item">Hex: {{color_hex}}</div>
          <div class="clrtr-overlay-item">RGB: {{color_rgb}}</div>
          <div class="clrtr-overlay-item">HSL: {{color_hsl}}</div>
        </div>
        <div class="clrtr-preview-badge">
          {{color_hex}}
        </div>
      </div>
      <div class="clrtr-color-name">
        Name: <span>{{color_name}}</span>
      </div>
    </div>
    
    <div class="clrtr-translations">
      <!-- CSS Hexadecimal -->
      <div class="clrtr-row">
        <span class="clrtr-label">CSS Hex</span>
        <div class="clrtr-value-container">
          <input type="text" readonly class="clrtr-value" value="{{color_hex}}">
          <button class="clrtr-copy-btn" data-copy="{{color_hex}}" aria-label="Copy CSS Hex">
            <svg class="clrtr-copy-icon" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
            <svg class="clrtr-check-icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          </button>
        </div>
      </div>

      <!-- CSS RGB -->
      <div class="clrtr-row">
        <span class="clrtr-label">CSS RGB</span>
        <div class="clrtr-value-container">
          <input type="text" readonly class="clrtr-value" value="{{color_rgb}}">
          <button class="clrtr-copy-btn" data-copy="{{color_rgb}}" aria-label="Copy CSS RGB">
            <svg class="clrtr-copy-icon" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
            <svg class="clrtr-check-icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          </button>
        </div>
      </div>

      <!-- CSS RGB Percent -->
      <div class="clrtr-row">
        <span class="clrtr-label">CSS RGB %</span>
        <div class="clrtr-value-container">
          <input type="text" readonly class="clrtr-value" value="{{color_rgb_percent}}">
          <button class="clrtr-copy-btn" data-copy="{{color_rgb_percent}}" aria-label="Copy CSS RGB Percent">
            <svg class="clrtr-copy-icon" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
            <svg class="clrtr-check-icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          </button>
        </div>
      </div>

      <!-- CSS HSL -->
      <div class="clrtr-row">
        <span class="clrtr-label">CSS HSL</span>
        <div class="clrtr-value-container">
          <input type="text" readonly class="clrtr-value" value="{{color_hsl}}">
          <button class="clrtr-copy-btn" data-copy="{{color_hsl}}" aria-label="Copy CSS HSL">
            <svg class="clrtr-copy-icon" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
            <svg class="clrtr-check-icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          </button>
        </div>
      </div>

      <!-- CSS Named Color -->
      <div class="clrtr-row">
        <span class="clrtr-label">CSS Named Color</span>
        <div class="clrtr-value-container">
          <input type="text" readonly class="clrtr-value" value="{{color_name}}">
          <button class="clrtr-copy-btn" data-copy="{{color_name}}" aria-label="Copy CSS Named Color" {{color_name_disabled}}>
            <svg class="clrtr-copy-icon" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
            <svg class="clrtr-check-icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          </button>
        </div>
      </div>

      <!-- NSColor Calibrated RGB -->
      <div class="clrtr-row">
        <span class="clrtr-label">NSColor Calibrated RGB</span>
        <div class="clrtr-value-container">
          <input type="text" readonly class="clrtr-value" value="{{color_ns_calibrated_rgb}}">
          <button class="clrtr-copy-btn" data-copy="{{color_ns_calibrated_rgb}}" aria-label="Copy NSColor Calibrated RGB">
            <svg class="clrtr-copy-icon" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
            <svg class="clrtr-check-icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          </button>
        </div>
      </div>

      <!-- NSColor Calibrated HSB -->
      <div class="clrtr-row">
        <span class="clrtr-label">NSColor Calibrated HSB</span>
        <div class="clrtr-value-container">
          <input type="text" readonly class="clrtr-value" value="{{color_ns_calibrated_hsb}}">
          <button class="clrtr-copy-btn" data-copy="{{color_ns_calibrated_hsb}}" aria-label="Copy NSColor Calibrated HSB">
            <svg class="clrtr-copy-icon" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
            <svg class="clrtr-check-icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          </button>
        </div>
      </div>

      <!-- NSColor Device RGB -->
      <div class="clrtr-row">
        <span class="clrtr-label">NSColor Device RGB</span>
        <div class="clrtr-value-container">
          <input type="text" readonly class="clrtr-value" value="{{color_ns_device_rgb}}">
          <button class="clrtr-copy-btn" data-copy="{{color_ns_device_rgb}}" aria-label="Copy NSColor Device RGB">
            <svg class="clrtr-copy-icon" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
            <svg class="clrtr-check-icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          </button>
        </div>
      </div>

      <!-- NSColor Device HSB -->
      <div class="clrtr-row">
        <span class="clrtr-label">NSColor Device HSB</span>
        <div class="clrtr-value-container">
          <input type="text" readonly class="clrtr-value" value="{{color_ns_device_hsb}}">
          <button class="clrtr-copy-btn" data-copy="{{color_ns_device_hsb}}" aria-label="Copy NSColor Device HSB">
            <svg class="clrtr-copy-icon" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
            <svg class="clrtr-check-icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          </button>
        </div>
      </div>

      <!-- UIColor RGB -->
      <div class="clrtr-row">
        <span class="clrtr-label">UIColor RGB</span>
        <div class="clrtr-value-container">
          <input type="text" readonly class="clrtr-value" value="{{color_ui_rgb}}">
          <button class="clrtr-copy-btn" data-copy="{{color_ui_rgb}}" aria-label="Copy UIColor RGB">
            <svg class="clrtr-copy-icon" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
            <svg class="clrtr-check-icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          </button>
        </div>
      </div>

      <!-- UIColor HSB -->
      <div class="clrtr-row">
        <span class="clrtr-label">UIColor HSB</span>
        <div class="clrtr-value-container">
          <input type="text" readonly class="clrtr-value" value="{{color_ui_hsb}}">
          <button class="clrtr-copy-btn" data-copy="{{color_ui_hsb}}" aria-label="Copy UIColor HSB">
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

function hsbToRgb(h, s, b) {
  h /= 360;
  s /= 100;
  b /= 100;
  
  let r = 0, g = 0, bl = 0;
  
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = b * (1 - s);
  const q = b * (1 - f * s);
  const t = b * (1 - (1 - f) * s);
  
  switch (i % 6) {
    case 0: r = b; g = t; bl = p; break;
    case 1: r = q; g = b; bl = p; break;
    case 2: r = p; g = b; bl = t; break;
    case 3: r = p; g = q; bl = b; break;
    case 4: r = t; g = p; bl = b; break;
    case 5: r = b; g = p; bl = q; break;
  }
  
  return [Math.round(r * 255), Math.round(g * 255), Math.round(bl * 255)];
}

function parseHex(hex) {
  let r, g, b, a = 1;
  const cleanHex = hex.startsWith('#') ? hex.slice(1) : hex;
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

function parseComponent(val, max) {
  if (val.endsWith('%')) {
    return Math.round((parseFloat(val) / 100) * max);
  }
  return Math.round(parseFloat(val));
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function parseColor(query) {
  let q = query.trim().toLowerCase();
  
  // Strip leading prefixes
  q = q.replace(/^!(?:color-translator|color|translate-color)\s+/i, '');
  q = q.replace(/^color\s+/i, '');
  q = q.trim();

  if (!q) return null;

  // 1. Named color
  if (NAMED_COLORS[q]) {
    return parseHex(NAMED_COLORS[q]);
  }

  // 2. Hex color (with or without #)
  const hexMatch = q.match(/^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hexMatch) {
    const rawHex = hexMatch[1];
    const startsWithHash = q.startsWith('#');
    const hasAlphaChar = /[a-f]/i.test(rawHex);
    const hasColorPrefix = query.trim().toLowerCase().startsWith('color ') || query.trim().toLowerCase().startsWith('!color');
    if (startsWithHash || hasAlphaChar || hasColorPrefix) {
      if (rawHex.length === 3 || rawHex.length === 4 || rawHex.length === 6 || rawHex.length === 8) {
        return parseHex(rawHex);
      }
    }
  }

  // 3. RGB / RGBA with parenthesis
  const rgbMatch = q.match(/rgba?\(\s*([0-9.]+%?)\s*,\s*([0-9.]+%?)\s*,\s*([0-9.]+%?)\s*(?:,\s*([0-9.]+)\s*)?\)/i);
  if (rgbMatch) {
    const r = parseComponent(rgbMatch[1], 255);
    const g = parseComponent(rgbMatch[2], 255);
    const b = parseComponent(rgbMatch[3], 255);
    const a = rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1;
    if (r !== null && g !== null && b !== null && !isNaN(a)) {
      return { r: clamp(r, 0, 255), g: clamp(g, 0, 255), b: clamp(b, 0, 255), a: clamp(a, 0, 1) };
    }
  }

  // 4. HSL / HSLA with parenthesis
  const hslMatch = q.match(/hsla?\(\s*([0-9.]+)\s*,\s*([0-9.]+)%?\s*,\s*([0-9.]+)%?\s*(?:,\s*([0-9.]+)\s*)?\)/i);
  if (hslMatch) {
    const h = parseFloat(hslMatch[1]);
    const s = parseFloat(hslMatch[2]);
    const l = parseFloat(hslMatch[3]);
    const a = hslMatch[4] !== undefined ? parseFloat(hslMatch[4]) : 1;
    if (!isNaN(h) && !isNaN(s) && !isNaN(l) && !isNaN(a)) {
      const [r, g, b] = hslToRgb(h, s, l);
      return { r, g, b, a: clamp(a, 0, 1) };
    }
  }

  // 5. HSB / HSV / HSBA / HSVA with parenthesis
  const hsbMatch = q.match(/hs[bv]a?\(\s*([0-9.]+)\s*,\s*([0-9.]+)%?\s*,\s*([0-9.]+)%?\s*(?:,\s*([0-9.]+)\s*)?\)/i);
  if (hsbMatch) {
    const h = parseFloat(hsbMatch[1]);
    const s = parseFloat(hsbMatch[2]);
    const b = parseFloat(hsbMatch[3]);
    const a = hsbMatch[4] !== undefined ? parseFloat(hsbMatch[4]) : 1;
    if (!isNaN(h) && !isNaN(s) && !isNaN(b) && !isNaN(a)) {
      const [r, g, bVal] = hsbToRgb(h, s, b);
      return { r, g, b: bVal, a: clamp(a, 0, 1) };
    }
  }

  // 6. Objective-C UIColor/NSColor RGB
  const objcRgbMatch = q.match(/(?:ui|ns)color\s+colorwith(?:calibrated|device)?red\s*:\s*([0-9.]+)\s+green\s*:\s*([0-9.]+)\s+blue\s*:\s*([0-9.]+)(?:\s+alpha\s*:\s*([0-9.]+))?/i);
  if (objcRgbMatch) {
    const r = Math.round(parseFloat(objcRgbMatch[1]) * 255);
    const g = Math.round(parseFloat(objcRgbMatch[2]) * 255);
    const b = Math.round(parseFloat(objcRgbMatch[3]) * 255);
    const a = objcRgbMatch[4] !== undefined ? parseFloat(objcRgbMatch[4]) : 1;
    return { r: clamp(r, 0, 255), g: clamp(g, 0, 255), b: clamp(b, 0, 255), a: clamp(a, 0, 1) };
  }

  // 7. Objective-C UIColor/NSColor HSB
  const objcHsbMatch = q.match(/(?:ui|ns)color\s+colorwith(?:calibrated|device)?hue\s*:\s*([0-9.]+)\s+saturation\s*:\s*([0-9.]+)\s+brightness\s*:\s*([0-9.]+)(?:\s+alpha\s*:\s*([0-9.]+))?/i);
  if (objcHsbMatch) {
    const h = parseFloat(objcHsbMatch[1]) * 360;
    const s = parseFloat(objcHsbMatch[2]) * 100;
    const b = parseFloat(objcHsbMatch[3]) * 100;
    const a = objcHsbMatch[4] !== undefined ? parseFloat(objcHsbMatch[4]) : 1;
    const [r, g, bVal] = hsbToRgb(h, s, b);
    return { r, g, b: bVal, a: clamp(a, 0, 1) };
  }

  // 8. Loose label matches for RGB
  const looseRgbMatch = q.match(/red\s*[:\s]\s*([0-9.]+)(?:%|\b)\s*green\s*[:\s]\s*([0-9.]+)(?:%|\b)\s*blue\s*[:\s]\s*([0-9.]+)(?:%|\b)(?:\s*alpha\s*[:\s]\s*([0-9.]+))?/i);
  if (looseRgbMatch) {
    const isPct = looseRgbMatch[0].includes('%');
    const r = parseComponent(looseRgbMatch[1] + (isPct ? '%' : ''), 255);
    const g = parseComponent(looseRgbMatch[2] + (isPct ? '%' : ''), 255);
    const b = parseComponent(looseRgbMatch[3] + (isPct ? '%' : ''), 255);
    const a = looseRgbMatch[4] !== undefined ? parseFloat(looseRgbMatch[4]) : 1;
    if (r !== null && g !== null && b !== null && !isNaN(a)) {
      return { r: clamp(r, 0, 255), g: clamp(g, 0, 255), b: clamp(b, 0, 255), a: clamp(a, 0, 1) };
    }
  }

  // 9. Loose label matches for HSB
  const looseHsbMatch = q.match(/hue\s*[:\s]\s*([0-9.]+)(?:%|\b)\s*saturation\s*[:\s]\s*([0-9.]+)(?:%|\b)\s*(?:brightness|value)\s*[:\s]\s*([0-9.]+)(?:%|\b)(?:\s*alpha\s*[:\s]\s*([0-9.]+))?/i);
  if (looseHsbMatch) {
    const h = parseFloat(looseHsbMatch[1]);
    const s = parseFloat(looseHsbMatch[2]);
    const b = parseFloat(looseHsbMatch[3]);
    const a = looseHsbMatch[4] !== undefined ? parseFloat(looseHsbMatch[4]) : 1;
    if (!isNaN(h) && !isNaN(s) && !isNaN(b) && !isNaN(a)) {
      const [r, g, bVal] = hsbToRgb(h, s, b);
      return { r, g, b: bVal, a: clamp(a, 0, 1) };
    }
  }

  // 10. Space separated components: e.g. rgb 30 144 255
  const spaceRgbMatch = q.match(/^rgba?\s+([0-9.]+%?)\s+([0-9.]+%?)\s+([0-9.]+%?)(?:\s+([0-9.]+))?$/i);
  if (spaceRgbMatch) {
    const r = parseComponent(spaceRgbMatch[1], 255);
    const g = parseComponent(spaceRgbMatch[2], 255);
    const b = parseComponent(spaceRgbMatch[3], 255);
    const a = spaceRgbMatch[4] !== undefined ? parseFloat(spaceRgbMatch[4]) : 1;
    if (r !== null && g !== null && b !== null && !isNaN(a)) {
      return { r: clamp(r, 0, 255), g: clamp(g, 0, 255), b: clamp(b, 0, 255), a: clamp(a, 0, 1) };
    }
  }

  // 11. Space separated HSL: e.g. hsl 210 100 56
  const spaceHslMatch = q.match(/^hsla?\s+([0-9.]+)\s+([0-9.]+)%?\s+([0-9.]+)%?(?:\s+([0-9.]+))?$/i);
  if (spaceHslMatch) {
    const h = parseFloat(spaceHslMatch[1]);
    const s = parseFloat(spaceHslMatch[2]);
    const l = parseFloat(spaceHslMatch[3]);
    const a = spaceHslMatch[4] !== undefined ? parseFloat(spaceHslMatch[4]) : 1;
    if (!isNaN(h) && !isNaN(s) && !isNaN(l) && !isNaN(a)) {
      const [r, g, b] = hslToRgb(h, s, l);
      return { r, g, b, a: clamp(a, 0, 1) };
    }
  }

  // 12. Space separated HSB: e.g. hsb 210 100 56
  const spaceHsbMatch = q.match(/^hs[bv]a?\s+([0-9.]+)\s+([0-9.]+)%?\s+([0-9.]+)%?(?:\s+([0-9.]+))?$/i);
  if (spaceHsbMatch) {
    const h = parseFloat(spaceHsbMatch[1]);
    const s = parseFloat(spaceHsbMatch[2]);
    const b = parseFloat(spaceHsbMatch[3]);
    const a = spaceHsbMatch[4] !== undefined ? parseFloat(spaceHsbMatch[4]) : 1;
    if (!isNaN(h) && !isNaN(s) && !isNaN(b) && !isNaN(a)) {
      const [r, g, bVal] = hsbToRgb(h, s, b);
      return { r, g, b: bVal, a: clamp(a, 0, 1) };
    }
  }

  return null;
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

function renderColorCard(color) {
  const cssHex = formatCssHex(color.r, color.g, color.b, color.a);
  const cssRgb = formatCssRgb(color.r, color.g, color.b, color.a);
  const cssRgbPercent = formatCssRgbPercent(color.r, color.g, color.b, color.a);
  const cssHsl = formatCssHsl(color.r, color.g, color.b, color.a);
  const cssName = formatNamedColor(color.r, color.g, color.b, color.a);
  
  const placeholders = {
    color_css: cssRgb,
    color_hex: cssHex,
    color_rgb: cssRgb,
    color_rgb_percent: cssRgbPercent,
    color_hsl: cssHsl,
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
  slotPositions: ["above-results", "at-a-glance", "knowledge-panel"],
  
  init(ctx) {
    template = ctx.template || FALLBACK_TEMPLATE;
  },

  trigger(query) {
    return Boolean(parseColor(query));
  },

  async execute(query, context) {
    if (context?.tab && context.tab !== "all") return { title: "", html: "" };
    const color = parseColor(query);
    if (!color) return { title: "", html: "" };
    return renderColorCard(color);
  }
};

export const slotPlugin = slot;
export default slot;
