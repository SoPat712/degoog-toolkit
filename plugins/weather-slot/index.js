let template = "";

const settings = {
  // Default to imperial units for brand-new installs. Existing saved
  // preferences still win because `configure(s)` below only falls back to
  // these defaults when the stored value is undefined/empty/invalid.
  units: "fahrenheit",
  windUnit: "mph",
  pressureUnit: "mmHg",
  precipUnit: "inch",
  timeFormat: "auto",
  // Mirrors the "Natural language" toggle degoog auto-injects when a
  // command declares `naturalLanguagePhrases`. Defaults on to match the
  // auto-toggle's default. The companion slot consults this before firing
  // its trailing-keyword regex so disabling the toggle disables ALL
  // no-`!` triggering, not just the prefix-matched cases.
  naturalLanguage: true,
};

const WMO_DESC = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Foggy",
  48: "Icy fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Heavy freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Rain showers",
  81: "Rain showers",
  82: "Heavy showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm & hail",
  99: "Thunderstorm & hail",
};

const WMO_ICON = {
  0: "sun",
  1: "sun",
  2: "partly",
  3: "cloud",
  45: "fog",
  48: "fog",
  51: "rain",
  53: "rain",
  55: "rain",
  56: "rain",
  57: "rain",
  61: "rain",
  63: "rain",
  65: "rain",
  66: "rain",
  67: "rain",
  71: "snow",
  73: "snow",
  75: "snow",
  77: "snow",
  80: "rain",
  81: "rain",
  82: "rain",
  85: "snow",
  86: "snow",
  95: "storm",
  96: "storm",
  99: "storm",
};

const PRESSURE_LABEL = {
  hPa: "hPa",
  kPa: "kPa",
  mmHg: "mmHg",
  inHg: "inHg",
};

const WIND_LABEL = {
  kmh: "km/h",
  mph: "mph",
  ms: "m/s",
  kn: "kn",
};

const PRECIP_LABEL = {
  mm: "mm",
  inch: "in",
};

// Leading natural-language phrases that should route to this plugin.
// Same list previously declared via the command's `naturalLanguagePhrases`;
// now the slot's own trigger() checks them manually because degoog's
// client-side natural-language matcher only runs for commands.
const NATURAL_LANGUAGE_PHRASES = [
  "weather in",
  "weather for",
  "weather at",
  "what's the weather in",
  "what is the weather in",
  "how's the weather in",
  "whats the weather in",
  "forecast for",
  "forecast in",
  "temperature in",
  "temperature at",
  "is it raining in",
  "is it snowing in",
  "погода в",
  "погода у",
  "прогноз для",
  "прогноз погоди в",
  "яка погода в",
  "яка погода у",
  "weather today in",
  "weather tomorrow in",
];

// Bang prefixes the slot should accept (mirrors the old command's trigger +
// aliases). Also used by execute() to strip the prefix off the query before
// parsing the city out.
const BANG_PREFIX_RX = /^!(weather|forecast|погода|прогноз|метео)\b\s*/i;

// Regex used for trailing-keyword matching ("rome weather", "london forecast
// today"). Kept loose; the slot's trigger() does further checks to make sure
// there's an actual location token in the query.
const WEATHER_KEYWORD_RX =
  /\b(weather|forecast|temperature|погода|прогноз|метео)\b/i;

const LOCATION_STRIP_RX =
  /\b(weather|forecast|temperature|today|tomorrow|in|for|at|the|погода|прогноз|метео|в|у|для)\b/gi;

const slotDef = {
  id: "weather",
  name: "Weather",
  description:
    "Shows current weather, interactive charts, and a 7-day forecast with animated icons. Usage: !weather <city>, or natural queries like 'weather in rome' and 'rome weather'.",
  position: "above-results",

  settingsSchema: [
    {
      key: "units",
      label: "Temperature units",
      type: "select",
      options: ["celsius", "fahrenheit"],
      description: "Unit for temperature display.",
    },
    {
      key: "windUnit",
      label: "Wind speed units",
      type: "select",
      options: ["kmh", "mph", "ms", "kn"],
      description:
        "Unit for wind speed. kmh = km/h, mph = miles/hour, ms = m/s, kn = knots.",
    },
    {
      key: "pressureUnit",
      label: "Pressure units",
      type: "select",
      options: ["hPa", "kPa", "mmHg", "inHg"],
      description: "Unit for atmospheric pressure.",
    },
    {
      key: "precipUnit",
      label: "Precipitation units",
      type: "select",
      options: ["mm", "inch"],
      description: "Unit for precipitation amounts.",
    },
    {
      key: "timeFormat",
      label: "Time format",
      type: "select",
      options: ["auto", "24h", "12h"],
      description: "How to display times. 'auto' follows the browser locale.",
    },
  ],

  init(ctx) {
    template = ctx.template;
  },

  trigger(query) {
    const q = String(query || "").trim();
    if (q.length < 2 || q.length > 200) return false;

    // Always accept our bang prefixes — this is the "bang is an addition
    // to the slot" behavior the user wants. Works even if degoog's core
    // has no matching command registered for these triggers.
    if (BANG_PREFIX_RX.test(q)) return true;

    // Everything below is natural-language matching. Respect the
    // auto-injected Natural language toggle: when the user turns it off,
    // only bang-prefixed queries should fire the plugin.
    if (!settings.naturalLanguage) return false;

    const lower = q.toLowerCase();

    // Leading phrase match ("weather in rome", "forecast for paris", etc.)
    for (const phrase of NATURAL_LANGUAGE_PHRASES) {
      const p = phrase.toLowerCase();
      if (lower === p || lower.startsWith(p + " ")) return true;
    }

    // First-word trigger/alias fallback ("weather rome", "forecast paris",
    // Russian/Ukrainian equivalents).
    const firstWord = lower.split(/\s+/)[0];
    if (
      firstWord === "weather" ||
      firstWord === "forecast" ||
      firstWord === "погода" ||
      firstWord === "метео"
    ) {
      // Require at least one more word so bare "weather" doesn't trigger.
      if (lower.includes(" ")) return true;
    }

    // Trailing-keyword / anywhere-in-query match ("rome weather",
    // "london forecast today", "paris temperature tomorrow"). Needs at
    // least one non-keyword token left after stripping the weather words
    // and fillers, so "weather today" alone doesn't trigger.
    if (WEATHER_KEYWORD_RX.test(q)) {
      const remainder = q
        .replace(LOCATION_STRIP_RX, " ")
        .replace(/[?!.,;:]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (remainder.length >= 2) return true;
    }

    return false;
  },

  configure(s) {
    // Defaults flipped to imperial: unset/invalid stored values fall back
    // to fahrenheit / mph / mmHg / inch / 12h. An explicit saved value in
    // the other unit still wins so existing users keep their preferences.
    settings.units = s?.units === "celsius" ? "celsius" : "fahrenheit";
    settings.windUnit = ["kmh", "mph", "ms", "kn"].includes(s?.windUnit)
      ? s.windUnit
      : "mph";
    settings.pressureUnit = ["hPa", "kPa", "mmHg", "inHg"].includes(
      s?.pressureUnit,
    )
      ? s.pressureUnit
      : "mmHg";
    settings.precipUnit = s?.precipUnit === "mm" ? "mm" : "inch";
    settings.timeFormat = ["auto", "24h", "12h"].includes(s?.timeFormat)
      ? s.timeFormat
      : "auto";
    // degoog auto-injects a `naturalLanguage` toggle because this command
    // declares `naturalLanguagePhrases`. Treat unset/null/empty as the
    // default (true); only an explicit false value disables the companion
    // slot's trailing-keyword matching.
    const raw = s?.naturalLanguage;
    settings.naturalLanguage =
      raw === undefined || raw === null || raw === ""
        ? true
        : raw === true || raw === "true";
  },

  async execute(args, context) {
    // Only render on the "all" tab
    if (context?.tab && context.tab !== "all") return { html: "" };

    // Slot receives the full user query (bang and all); strip the bang
    // prefix up front so the rest of the parser doesn't have to know
    // about it.
    const city = String(args || "")
      .replace(BANG_PREFIX_RX, "")
      .replace(
        /^(what'?s?\s+the\s+|how'?s?\s+the\s+|is\s+it\s+(raining|snowing)\s+in\s+|weather\s+(today|tomorrow)\s+)/i,
        "",
      )
      .replace(
        /^(weather|forecast|temperature|прогноз\s+погоди|яка\s+погода|погода)\s+(in|for|at|в|у|для)?\s*/i,
        "",
      )
      .replace(/^(in|for|at|в|у|для)\s+/i, "")
      // Also strip trailing weather keywords so "romania weather",
      // "london forecast today", "paris temperature tomorrow", and the
      // Russian/Ukrainian variants all reduce to just the location. This
      // lets the companion slot (which catches trailing-keyword queries
      // that degoog's prefix-only natural-language matcher skips) reuse
      // this same execute path without a separate parser.
      .replace(
        /\s+(weather|forecast|temperature|погода|прогноз|метео)(\s+(today|tomorrow))?\s*$/i,
        "",
      )
      .replace(/\s+(today|tomorrow)\s*$/i, "")
      .trim();

    if (!city) {
      return {
        title: "Weather",
        html: "<p>Usage: <code>!weather &lt;city&gt;</code></p>",
      };
    }

    try {
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=5&addressdetails=1`,
        {
          headers: {
            "User-Agent": "degoog-weather-slot/1.1",
            "Accept-Language": "en",
          },
        },
      );
      if (!geoRes.ok) return { title: "Weather", html: "" };

      const geoData = await geoRes.json();
      if (!geoData?.length) {
        return { title: "Weather", html: "<p>City not found.</p>" };
      }

      const loc =
        geoData.find((r) =>
          ["city", "town", "village", "municipality"].includes(r.addresstype),
        ) || geoData[0];

      const lat = parseFloat(loc.lat);
      const lon = parseFloat(loc.lon);
      const addr = loc.address || {};
      const cityName =
        addr.city ||
        addr.town ||
        addr.village ||
        addr.municipality ||
        addr.county ||
        loc.name ||
        city;
      const regionName = addr.state || addr.region || "";
      const countryName = addr.country || "";
      // Case-insensitive dedupe so we don't render "kerala, Kerala, India"
      // when the matched OSM feature is itself a state/region/country.
      const _seenLocParts = new Set();
      const displayName = [cityName, regionName, countryName]
        .map((s) => (s == null ? "" : String(s)).trim())
        .filter((s) => {
          if (!s) return false;
          const key = s.toLowerCase();
          if (_seenLocParts.has(key)) return false;
          _seenLocParts.add(key);
          return true;
        })
        .join(", ");

      const tempParam =
        settings.units === "fahrenheit" ? "fahrenheit" : "celsius";
      const tempSign = settings.units === "fahrenheit" ? "°F" : "°C";

      const currentVars = [
        "temperature_2m",
        "apparent_temperature",
        "weather_code",
        "wind_speed_10m",
        "wind_gusts_10m",
        "wind_direction_10m",
        "relative_humidity_2m",
        "surface_pressure",
        "pressure_msl",
        "uv_index",
        "cloud_cover",
        "precipitation",
        "is_day",
        "dew_point_2m",
      ].join(",");

      const hourlyVars = [
        "temperature_2m",
        "apparent_temperature",
        "weather_code",
        "precipitation_probability",
        "precipitation",
        "wind_speed_10m",
        "wind_gusts_10m",
        "cloud_cover",
        "visibility",
        "relative_humidity_2m",
      ].join(",");

      const dailyVars = [
        "weather_code",
        "temperature_2m_max",
        "temperature_2m_min",
        "apparent_temperature_max",
        "apparent_temperature_min",
        "sunrise",
        "sunset",
        "uv_index_max",
        "precipitation_sum",
        "precipitation_probability_max",
        "wind_speed_10m_max",
        "wind_gusts_10m_max",
        "wind_direction_10m_dominant",
        "daylight_duration",
      ].join(",");

      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=${currentVars}` +
        `&hourly=${hourlyVars}` +
        `&daily=${dailyVars}` +
        `&temperature_unit=${tempParam}` +
        `&wind_speed_unit=${settings.windUnit}` +
        `&precipitation_unit=${settings.precipUnit}` +
        `&timezone=auto&forecast_days=7`;

      const wxRes = await fetch(url);
      if (!wxRes.ok) return { title: "Weather", html: "" };
      const wx = await wxRes.json();

      const cur = wx.current || {};
      const daily = wx.daily || {};
      const hourly = wx.hourly || {};

      const pressureHpa = Number.isFinite(cur.pressure_msl)
        ? cur.pressure_msl
        : cur.surface_pressure;
      const pressure = _convertPressure(pressureHpa, settings.pressureUnit);

      const temp = Math.round(cur.temperature_2m);
      const feels = Math.round(cur.apparent_temperature);
      const code = cur.weather_code;
      const desc = WMO_DESC[code] ?? "—";
      const iconType = WMO_ICON[code] ?? "cloud";
      const humidity = Math.round(cur.relative_humidity_2m);
      const wind = _fmtSmall(cur.wind_speed_10m);
      const gusts = _fmtSmall(cur.wind_gusts_10m);
      const windDir = _windDir(cur.wind_direction_10m);
      const uv = Number.isFinite(cur.uv_index)
        ? Number(cur.uv_index).toFixed(1)
        : "—";
      const uvLevel = _uvLevel(cur.uv_index);
      const clouds = Math.round(cur.cloud_cover);
      const dewPoint = Math.round(cur.dew_point_2m);
      const precipNow = _fmtSmall(cur.precipitation);
      const isDay = cur.is_day === 1 || cur.is_day === true;

      const todayIdx = 0;
      const hi0 = Math.round(daily.temperature_2m_max?.[todayIdx]);
      const lo0 = Math.round(daily.temperature_2m_min?.[todayIdx]);
      const precipProbToday = Math.round(
        daily.precipitation_probability_max?.[todayIdx] ?? 0,
      );

      // Sunrise/sunset for today
      const now = new Date();
      const sunrise = _safeDate(daily.sunrise?.[0]);
      const sunset = _safeDate(daily.sunset?.[0]);
      const sunriseStr = sunrise ? _timeFmt(sunrise) : "—";
      const sunsetStr = sunset ? _timeFmt(sunset) : "—";

      let sunPct = 0;
      if (sunrise && sunset) {
        const dayLen = sunset - sunrise;
        const elapsed = Math.max(0, now - sunrise);
        sunPct = Math.min(
          100,
          Math.max(0, Math.round((elapsed / dayLen) * 100)),
        );
      }

      // Closest hourly index to "now"
      let nowIdx = 0;
      if (Array.isArray(hourly.time)) {
        let smallest = Infinity;
        for (let i = 0; i < hourly.time.length; i++) {
          const diff = Math.abs(new Date(hourly.time[i]) - now);
          if (diff < smallest) {
            smallest = diff;
            nowIdx = i;
          }
        }
      }
      const visibility = Number.isFinite(hourly.visibility?.[nowIdx])
        ? _fmtVisibility(hourly.visibility[nowIdx], settings.units)
        : "—";

      // Day names
      const dayNames = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ];
      const dayShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

      // Build per-day data, including full hourly arrays for charts
      const daysData = (daily.time || []).map((t, i) => {
        const d = new Date(t + "T12:00:00");
        const name = i === 0 ? "Today" : dayShort[d.getDay()];
        const longName = i === 0 ? "Today" : dayNames[d.getDay()];
        const hi = Math.round(daily.temperature_2m_max[i]);
        const lo = Math.round(daily.temperature_2m_min[i]);
        const feelsHi = Math.round(daily.apparent_temperature_max?.[i] ?? hi);
        const feelsLo = Math.round(daily.apparent_temperature_min?.[i] ?? lo);
        const dCode = daily.weather_code[i];
        const icon = WMO_ICON[dCode] ?? "cloud";
        const desc2 = WMO_DESC[dCode] ?? "—";
        const precipProb = Math.round(
          daily.precipitation_probability_max?.[i] ?? 0,
        );
        const precipSum = _fmtSmall(daily.precipitation_sum?.[i] ?? 0);
        const windMax = _fmtSmall(daily.wind_speed_10m_max?.[i] ?? 0);
        const gustsMax = _fmtSmall(daily.wind_gusts_10m_max?.[i] ?? 0);
        const windDirDom = _windDir(daily.wind_direction_10m_dominant?.[i]);
        const uvMax = Number.isFinite(daily.uv_index_max?.[i])
          ? Number(daily.uv_index_max[i]).toFixed(1)
          : "—";
        const daylight = _fmtDuration(daily.daylight_duration?.[i]);

        // Per-day sun info
        const sr = _safeDate(daily.sunrise?.[i]);
        const ss = _safeDate(daily.sunset?.[i]);
        const srStr = sr ? _timeFmt(sr) : "—";
        const ssStr = ss ? _timeFmt(ss) : "—";

        let pct = 50;
        if (sr && ss) {
          const dl = ss - sr;
          const el = i === 0 ? Math.max(0, now - sr) : dl * 0.5;
          pct = Math.min(100, Math.max(0, Math.round((el / dl) * 100)));
        }

        // Hourly slice for this day (24 entries, padded if missing)
        const start = i * 24;
        const end = start + 24;
        const hourly24 = {
          time: [],
          labels: [],
          temp: [],
          feels: [],
          precipProb: [],
          precipAmt: [],
          wind: [],
          gusts: [],
          clouds: [],
          humidity: [],
          code: [],
          icon: [],
        };
        for (let h = start; h < end; h++) {
          const raw = hourly.time?.[h];
          if (!raw) continue;
          const ht = new Date(raw);
          hourly24.time.push(raw);
          hourly24.labels.push(_timeFmt(ht, true));
          hourly24.temp.push(_safeNum(hourly.temperature_2m?.[h]));
          hourly24.feels.push(_safeNum(hourly.apparent_temperature?.[h]));
          hourly24.precipProb.push(
            _safeNum(hourly.precipitation_probability?.[h]),
          );
          hourly24.precipAmt.push(_safeNum(hourly.precipitation?.[h]));
          hourly24.wind.push(_safeNum(hourly.wind_speed_10m?.[h]));
          hourly24.gusts.push(_safeNum(hourly.wind_gusts_10m?.[h]));
          hourly24.clouds.push(_safeNum(hourly.cloud_cover?.[h]));
          hourly24.humidity.push(_safeNum(hourly.relative_humidity_2m?.[h]));
          const hc = hourly.weather_code?.[h];
          hourly24.code.push(hc ?? null);
          hourly24.icon.push(WMO_ICON[hc] ?? "cloud");
        }

        return {
          name,
          longName,
          hi,
          lo,
          feelsHi,
          feelsLo,
          icon,
          desc: desc2,
          precipProb,
          precipSum,
          windMax,
          gustsMax,
          windDirDom,
          uvMax,
          daylight,
          sunPct: pct,
          srStr,
          ssStr,
          hourly: hourly24,
        };
      });

      const nowLabel = _timeFmt(now);
      const dateLabel = now.toLocaleDateString([], {
        weekday: "long",
        month: "long",
        day: "numeric",
      });

      const payload = {
        tempUnit: tempSign,
        windUnit: WIND_LABEL[settings.windUnit] || "km/h",
        pressureUnit: PRESSURE_LABEL[settings.pressureUnit] || "hPa",
        precipUnit: PRECIP_LABEL[settings.precipUnit] || "mm",
        current: {
          temp,
          feels,
          desc,
          iconType,
          humidity,
          wind,
          gusts,
          windDir,
          pressure,
          uv,
          uvLevel,
          clouds,
          dewPoint,
          precipNow,
          visibility,
          isDay,
          nowLabel,
          dateLabel,
          hi: hi0,
          lo: lo0,
          precipProb: precipProbToday,
        },
        sun: {
          sunrise: sunriseStr,
          sunset: sunsetStr,
          pct: sunPct,
        },
        location: displayName,
        days: daysData,
      };

      const payloadJson = _escAttr(JSON.stringify(payload));

      const html = template
        .replaceAll("{{location}}", _esc(displayName))
        .replaceAll("{{date_label}}", _esc(dateLabel))
        .replaceAll("{{now_label}}", _esc(nowLabel))
        .replaceAll("{{temp}}", String(temp))
        .replaceAll("{{temp_unit}}", tempSign)
        .replaceAll("{{desc}}", _esc(desc))
        .replaceAll("{{feels}}", `${feels}${tempSign}`)
        .replaceAll("{{hi}}", String(hi0))
        .replaceAll("{{lo}}", String(lo0))
        .replaceAll("{{precip_prob}}", String(precipProbToday))
        .replaceAll(
          "{{wind}}",
          `${wind} ${WIND_LABEL[settings.windUnit]} ${windDir}`.trim(),
        )
        .replaceAll("{{gusts}}", `${gusts} ${WIND_LABEL[settings.windUnit]}`)
        .replaceAll("{{humidity}}", String(humidity))
        .replaceAll(
          "{{pressure}}",
          `${pressure} ${PRESSURE_LABEL[settings.pressureUnit]}`,
        )
        .replaceAll("{{uv}}", String(uv))
        .replaceAll("{{uv_level}}", _esc(uvLevel))
        .replaceAll("{{clouds}}", String(clouds))
        .replaceAll("{{dew_point}}", `${dewPoint}${tempSign}`)
        .replaceAll("{{visibility}}", _esc(visibility))
        .replaceAll(
          "{{precip_now}}",
          `${precipNow} ${PRECIP_LABEL[settings.precipUnit]}`,
        )
        .replaceAll("{{sunrise}}", _esc(sunriseStr))
        .replaceAll("{{sunset}}", _esc(sunsetStr))
        .replaceAll("{{sun_pct}}", String(sunPct))
        .replaceAll("{{icon_type}}", iconType)
        .replaceAll("{{is_day}}", isDay ? "1" : "0")
        .replaceAll("{{payload}}", payloadJson);

      return { title: `Weather — ${displayName}`, html };
    } catch (e) {
      return { title: "Weather", html: "" };
    }
  },
};

// Single-capability plugin: this file exports only a slot. The slot's
// own `trigger(query)` recognises the `!weather` / `!forecast` / etc.
// bang prefixes, so the bang behaviour is an addition to the slot rather
// than a separate command capability. This keeps Settings → Plugins to a
// single row for Weather (see AGENTS.md › "Collapsing to one capability
// per folder"). Supported activations:
//   • `!weather <city>` (and `!forecast`, `!погода`, `!метео`, `!прогноз`)
//   • Leading natural-language phrases (`weather in rome`, `forecast for paris`)
//   • First-word trigger (`weather rome`, `forecast paris`)
//   • Trailing / anywhere-in-query keyword (`rome weather`,
//     `london forecast today`, `paris temperature tomorrow`)
export const slot = slotDef;
export const slotPlugin = slotDef;
export default slotDef;

// ───────── helpers ─────────

function _convertPressure(hpa, unit) {
  if (!Number.isFinite(hpa)) return "—";
  switch (unit) {
    case "kPa":
      return (hpa / 10).toFixed(1);
    case "mmHg":
      return (hpa * 0.750062).toFixed(1);
    case "inHg":
      return (hpa * 0.02953).toFixed(2);
    default:
      return Math.round(hpa).toString();
  }
}

function _fmtVisibility(meters, units) {
  if (!Number.isFinite(meters)) return "—";
  if (units === "fahrenheit") {
    // Imperial -> miles
    const mi = meters / 1609.344;
    if (mi >= 10) return `${Math.round(mi)} mi`;
    return `${mi.toFixed(1)} mi`;
  }
  const km = meters / 1000;
  if (km >= 10) return `${Math.round(km)} km`;
  return `${km.toFixed(1)} km`;
}

function _fmtDuration(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function _fmtSmall(n) {
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 100) return String(Math.round(n));
  if (Math.abs(n) >= 10) return n.toFixed(0);
  return n.toFixed(1);
}

function _safeNum(n) {
  return Number.isFinite(n) ? n : 0;
}

function _safeDate(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function _timeFmt(d, shortHour = false) {
  if (!d) return "—";
  const opts = shortHour
    ? { hour: "numeric" }
    : { hour: "2-digit", minute: "2-digit" };

  if (settings.timeFormat === "24h") {
    opts.hour12 = false;
    if (shortHour) {
      opts.hour = "2-digit";
      opts.minute = "2-digit";
    }
  } else if (settings.timeFormat === "12h") {
    opts.hour12 = true;
  }

  try {
    return d.toLocaleTimeString([], opts);
  } catch {
    return d.toISOString().slice(11, 16);
  }
}

function _windDir(deg) {
  if (!Number.isFinite(deg)) return "";
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(deg / 45) % 8];
}

function _uvLevel(uv) {
  if (!Number.isFinite(uv)) return "—";
  if (uv < 3) return "Low";
  if (uv < 6) return "Moderate";
  if (uv < 8) return "High";
  if (uv < 11) return "Very high";
  return "Extreme";
}

function _esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function _escAttr(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
