let template = "";
let externalFetch = (...args) => fetch(...args);
import { isInformationalQuestion } from "./query-guards.js";

const settings = {
  // Default to imperial units for brand-new installs. Existing saved
  // preferences still win because `configure(s)` below only falls back to
  // these defaults when the stored value is undefined/empty/invalid.
  units: "fahrenheit",
  windUnit: "mph",
  pressureUnit: "mmHg",
  precipUnit: "inch",
  timeFormat: "auto",
  defaultCity: "",
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
  "météo à",
  "météo pour",
  "meteo à",
  "meteo pour",
  "prévisions pour",
  "previsions pour",
  "prévisions à",
  "previsions à",
  "température à",
  "temperature à",
  "temps à",
  "tiempo en",
  "tiempo para",
  "clima en",
  "clima para",
  "pronóstico para",
  "pronóstico en",
  "pronostico para",
  "pronostico en",
  "temperatura en",
  "погода в",
  "погода у",
  "прогноз для",
  "прогноз погоди в",
  "яка погода в",
  "яка погода у",
  "weather today in",
  "weather today at",
  "weather tomorrow in",
  "sunrise in",
  "sunrise at",
  "sunrise for",
  "sunset in",
  "sunset at",
  "sunset for",
];

// Bang prefixes the slot should accept (mirrors the old command's trigger +
// aliases). Also used by execute() to strip the prefix off the query before
// parsing the city out.
const BANG_PREFIX_RX = /^!(weather|forecast|sunrise|sunset|météo|meteo|prévision|prevision|prévisions|previsions|tiempo|clima|pronóstico|pronostico|погода|прогноз|метео)\b\s*/i;

// Regex used for trailing-keyword matching ("rome weather", "london forecast
// today"). Kept loose; the slot's trigger() does further checks to make sure
// there's an actual location token in the query.
const WEATHER_KEYWORD_RX =
  /\b(weather|forecast|temperature|sunrise|sunset|météo|meteo|prévision|prevision|prévisions|previsions|tiempo|clima|pronóstico|pronostico|погода|прогноз|метео)\b/i;

const LOCATION_STRIP_RX =
  /\b(weather|forecast|temperature|sunrise|sunset|météo|meteo|prévision|prevision|prévisions|previsions|tiempo|clima|pronóstico|pronostico|today|tomorrow|in|for|at|the|pour|en|dans|para|a|погода|прогноз|метео|в|у|для)\b/gi;
const NON_LOCATION_WEATHER_TARGET_RX =
  /^(celsius|fahrenheit|kelvin|centigrade|metric|imperial|degrees?|deg|f|c|k|today|tomorrow|now|current)$/i;

function hasLikelyLocationToken(value) {
  const remainder = String(value || "")
    .replace(LOCATION_STRIP_RX, " ")
    .replace(/[?!.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (
    remainder.length >= 2 &&
    !NON_LOCATION_WEATHER_TARGET_RX.test(remainder.toLowerCase())
  );
}

const slotDef = {
  id: "weather",
  name: "Weather",
  description:
    "Shows current weather, interactive charts, and a 7-day forecast with animated icons. Usage: !weather <city>, or natural queries like 'weather in rome' and 'rome weather'.",
  isClientExposed: false,
  position: "above-results",

  settingsSchema: [
    {
      key: "units",
      label: "Temperature units",
      type: "select",
      // Imperial first so the selector's first option matches the
      // module-level default (`units: "fahrenheit"`).
      options: ["fahrenheit", "celsius"],
      description: "Unit for temperature display.",
    },
    {
      key: "windUnit",
      label: "Wind speed units",
      type: "select",
      // Imperial first to match the default (`windUnit: "mph"`).
      options: ["mph", "kmh", "ms", "kn"],
      description:
        "Unit for wind speed. mph = miles/hour, kmh = km/h, ms = m/s, kn = knots.",
    },
    {
      key: "pressureUnit",
      label: "Pressure units",
      type: "select",
      // Default first (`pressureUnit: "mmHg"`), then the other imperial
      // option (inHg), then metric.
      options: ["mmHg", "inHg", "hPa", "kPa"],
      description: "Unit for atmospheric pressure.",
    },
    {
      key: "precipUnit",
      label: "Precipitation units",
      type: "select",
      // Imperial first to match the default (`precipUnit: "inch"`).
      options: ["inch", "mm"],
      description: "Unit for precipitation amounts.",
    },
    {
      key: "timeFormat",
      label: "Time format",
      type: "select",
      options: ["auto", "24h", "12h"],
      description: "How to display times. 'auto' follows the browser locale.",
    },
    {
      key: "defaultCity",
      label: "Default city",
      type: "text",
      default: "",
      description: "Fallback city to display when you search for weather with no location specified.",
    },
  ],

  init(ctx) {
    template = ctx.template;
    if (typeof ctx?.fetch === "function") {
      externalFetch = (...args) => ctx.fetch(...args);
    }
  },

  trigger(query) {
    const q = String(query || "").trim();
    if (q.length < 2 || q.length > 200) return false;
    if (isInformationalQuestion(q)) return false;

    const lower = q.toLowerCase();
    const isBareTrigger =
      lower === "weather" ||
      lower === "forecast" ||
      lower === "погода" ||
      lower === "метео" ||
      lower === "прогноз" ||
      lower === "weather today" ||
      lower === "weather tomorrow" ||
      lower === "sunrise" ||
      lower === "sunset" ||
      lower === "!weather" ||
      lower === "!forecast" ||
      lower === "!погода" ||
      lower === "!метео" ||
      lower === "!прогноз" ||
      lower === "!sunrise" ||
      lower === "!sunset";

    if (isBareTrigger) {
      return Boolean(settings.defaultCity);
    }

    // Always accept our bang prefixes — this is the "bang is an addition
    // to the slot" behavior the user wants. Works even if degoog's core
    // has no matching command registered for these triggers.
    if (BANG_PREFIX_RX.test(q)) return true;

    // Slot-only plugin: natural-language triggering IS the plugin
    // (there's no companion command export). A user-facing "Natural
    // language" toggle would only ever mean "disable the plugin
    // entirely", which duplicates degoog's own plugin-enable toggle —
    // so no gating is applied here. Bangs are handled above; the rest
    // of this function is unconditional NL matching.

    // Leading phrase match ("weather in rome", "forecast for paris", etc.)
    for (const phrase of NATURAL_LANGUAGE_PHRASES) {
      const p = phrase.toLowerCase();
      if (lower === p) return false;
      if (lower.startsWith(p + " ")) {
        return hasLikelyLocationToken(q.slice(phrase.length));
      }
    }

    // First-word trigger/alias fallback ("weather rome", "forecast paris",
    // Russian/Ukrainian equivalents).
    const firstWord = lower.split(/\s+/)[0];
    if (
      firstWord === "weather" ||
      firstWord === "forecast" ||
      firstWord === "sunrise" ||
      firstWord === "sunset" ||
      firstWord === "météo" ||
      firstWord === "meteo" ||
      firstWord === "tiempo" ||
      firstWord === "clima" ||
      firstWord === "pronóstico" ||
      firstWord === "pronostico" ||
      firstWord === "погода" ||
      firstWord === "метео"
    ) {
      // Require at least one more word so bare "weather" doesn't trigger.
      if (lower.includes(" ")) return hasLikelyLocationToken(q);
    }

    // Trailing-keyword / anywhere-in-query match ("rome weather",
    // "london forecast today", "paris temperature tomorrow"). Needs at
    // least one non-keyword token left after stripping the weather words
    // and fillers, so "weather today" alone doesn't trigger.
    if (WEATHER_KEYWORD_RX.test(q)) {
      if (hasLikelyLocationToken(q)) return true;
    }

    return false;
  },

  configure(s) {
    settings.units = _pick(s?.units, ["celsius", "fahrenheit"], "fahrenheit");
    settings.windUnit = _pick(s?.windUnit, ["kmh", "mph", "ms", "kn"], "mph");
    settings.pressureUnit = _pick(
      s?.pressureUnit,
      ["hPa", "kPa", "mmHg", "inHg"],
      "mmHg",
    );
    settings.precipUnit = _pick(s?.precipUnit, ["mm", "inch"], "inch");
    settings.timeFormat = _pick(s?.timeFormat, ["auto", "24h", "12h"], "auto");
    settings.defaultCity = String(s?.defaultCity || "").trim();
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
        /^(weather|forecast|temperature|sunrise|sunset|прогноз\s+погоди|яка\s+погода|погода)\s*(in|for|at|в|у|для)?\s*/i,
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
        /\s+(weather|forecast|temperature|sunrise|sunset|погода|прогноз|метео)(\s+(today|tomorrow))?\s*$/i,
        "",
      )
      .replace(/\s+(today|tomorrow)\s*$/i, "")
      .trim();

    const targetCity = city || settings.defaultCity;

    if (!targetCity) {
      return {
        title: "Weather",
        html: "<p>Usage: <code>!weather &lt;city&gt;</code></p>",
      };
    }

    try {
      const doFetch =
        typeof context?.fetch === "function"
          ? (...args) => context.fetch(...args)
          : externalFetch;
      const geoRes = await doFetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(targetCity)}&format=json&limit=5&addressdetails=1`,
        {
          headers: {
            "User-Agent": "degoog-weather-slot/1.1",
            "Accept-Language": "en",
          },
        },
      );
      if (!geoRes.ok) return { html: "" };

      const geoData = await geoRes.json();
      if (!geoData?.length) {
        return { html: "<p>City not found.</p>" };
      }

      const loc =
        geoData.find((r) =>
          ["city", "town", "village", "municipality"].includes(r.addresstype),
        ) || geoData[0];

      const lat = parseFloat(loc.lat);
      const lon = parseFloat(loc.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { html: "" };
      const addr = loc.address || {};
      const cityName =
        addr.city ||
        addr.town ||
        addr.village ||
        addr.municipality ||
        addr.county ||
        loc.name ||
        targetCity;
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

      const wxRes = await doFetch(url);
      if (!wxRes.ok) return { html: "" };
      const wx = await wxRes.json();
      const utcOffsetSeconds = Number.isFinite(wx.utc_offset_seconds)
        ? wx.utc_offset_seconds
        : 0;

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
      const desc = `{{ t:plugin-weather-slot.wmo_${code} }}`;
      const iconType = WMO_ICON[code] ?? "cloud";
      const humidity = Math.round(cur.relative_humidity_2m);
      const wind = _fmtSmall(cur.wind_speed_10m);
      const gusts = _fmtSmall(cur.wind_gusts_10m);
      const windDir = _windDir(cur.wind_direction_10m, context);
      const uv = Number.isFinite(cur.uv_index)
        ? Number(cur.uv_index).toFixed(1)
        : "—";
      const uvLevel = _uvLevel(cur.uv_index, context);
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
      const sunrise = _safeApiDate(daily.sunrise?.[0], utcOffsetSeconds);
      const sunset = _safeApiDate(daily.sunset?.[0], utcOffsetSeconds);
      const sunriseStr = sunrise
        ? _timeFmtAt(sunrise, utcOffsetSeconds)
        : "—";
      const sunsetStr = sunset ? _timeFmtAt(sunset, utcOffsetSeconds) : "—";
      const sunriseRelative = _fmtRelativeEvent(sunrise, now);
      const sunsetRelative = _fmtRelativeEvent(sunset, now);

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
          const ht = _safeApiDate(hourly.time[i], utcOffsetSeconds);
          const diff = ht ? Math.abs(ht - now) : Infinity;
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
      // Build per-day data, including full hourly arrays for charts
      const daysData = (daily.time || []).map((tCode, i) => {
        const d = _safeApiDate(`${tCode}T12:00:00`, utcOffsetSeconds) || new Date();
        const weekday = _weekdayAt(d, utcOffsetSeconds);
        const lang = context?.lang || "en-US";
        const name = i === 0 ? "{{ t:plugin-weather-slot.today }}" : d.toLocaleDateString(lang, { weekday: "short" });
        const longName = i === 0 ? "{{ t:plugin-weather-slot.today }}" : d.toLocaleDateString(lang, { weekday: "long" });
        const dayDateLabel = _dateFmtAt(d, utcOffsetSeconds, context);
        const hi = Math.round(daily.temperature_2m_max[i]);
        const lo = Math.round(daily.temperature_2m_min[i]);
        const feelsHi = Math.round(daily.apparent_temperature_max?.[i] ?? hi);
        const feelsLo = Math.round(daily.apparent_temperature_min?.[i] ?? lo);
        const dCode = daily.weather_code[i];
        const icon = WMO_ICON[dCode] ?? "cloud";
        const desc2 = `{{ t:plugin-weather-slot.wmo_${dCode} }}`;
        const precipProb = Math.round(
          daily.precipitation_probability_max?.[i] ?? 0,
        );
        const precipSum = _fmtSmall(daily.precipitation_sum?.[i] ?? 0);
        const windMax = _fmtSmall(daily.wind_speed_10m_max?.[i] ?? 0);
        const gustsMax = _fmtSmall(daily.wind_gusts_10m_max?.[i] ?? 0);
        const windDirDom = _windDir(daily.wind_direction_10m_dominant?.[i], context);
        const uvMax = Number.isFinite(daily.uv_index_max?.[i])
          ? Number(daily.uv_index_max[i]).toFixed(1)
          : "—";
        const daylight = _fmtDuration(daily.daylight_duration?.[i]);

        // Per-day sun info
        const sr = _safeApiDate(daily.sunrise?.[i], utcOffsetSeconds);
        const ss = _safeApiDate(daily.sunset?.[i], utcOffsetSeconds);
        const nextSr = _safeApiDate(
          daily.sunrise?.[i + 1],
          utcOffsetSeconds,
        );
        const srStr = sr ? _timeFmtAt(sr, utcOffsetSeconds) : "—";
        const ssStr = ss ? _timeFmtAt(ss, utcOffsetSeconds) : "—";
        const srRelative = _fmtRelativeEvent(sr, now, context);
        const ssRelative = _fmtRelativeEvent(ss, now, context);

        let pct = 50;
        if (sr && ss) {
          const dl = ss - sr;
          const el = i === 0 ? Math.max(0, now - sr) : dl * 0.5;
          pct = Math.min(100, Math.max(0, Math.round((el / dl) * 100)));
        }

        const dayStart = _localDayStart(tCode, utcOffsetSeconds);
        const moon = _moonDayData({
          dayStart,
          lat,
          lon,
          utcOffsetSeconds,
          now,
          sunrise: sr,
          sunset: ss,
          nextSunrise: nextSr,
          dayIndex: i,
          context,
        });

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
          const ht = _safeApiDate(raw, utcOffsetSeconds);
          hourly24.time.push(raw);
          hourly24.labels.push(_timeFmtAt(ht, utcOffsetSeconds, true));
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
          dateLabel: dayDateLabel,
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
          srRelative,
          ssRelative,
          moon,
          hourly: hourly24,
        };
      });

      const nowLabel = _timeFmtAt(now, utcOffsetSeconds);
      const dateLabel = _dateFmtAt(now, utcOffsetSeconds, context);
      const moonToday = daysData[0]?.moon || _emptyMoonData(false);

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
          sunriseRelative,
          sunsetRelative,
          pct: sunPct,
        },
        moon: moonToday,
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
        .replaceAll("{{sunrise_relative}}", _esc(sunriseRelative))
        .replaceAll("{{sunset_relative}}", _esc(sunsetRelative))
        .replaceAll("{{sun_pct}}", String(sunPct))
        .replaceAll("{{moon_phase}}", _esc(moonToday.phaseLabel))
        .replaceAll("{{moon_illum}}", _esc(moonToday.illuminationLabel))
        .replaceAll("{{moonrise}}", _esc(moonToday.riseStr))
        .replaceAll("{{moonset}}", _esc(moonToday.setStr))
        .replaceAll("{{moonrise_relative}}", _esc(moonToday.riseRelative))
        .replaceAll("{{moonset_relative}}", _esc(moonToday.setRelative))
        .replaceAll("{{moon_apex}}", _esc(moonToday.apexStr))
        .replaceAll("{{moon_pct}}", String(moonToday.nowPct))
        .replaceAll("{{icon_type}}", iconType)
        .replaceAll("{{is_day}}", isDay ? "1" : "0")
        .replaceAll("{{payload}}", payloadJson);

      return { html };
    } catch (e) {
      return { html: "" };
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

function _pick(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

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

function _fmtRelativeEvent(date, now = new Date(), context = null) {
  if (!date || !(date instanceof Date) || !Number.isFinite(date.getTime())) {
    return "—";
  }
  const diffMs = date.getTime() - now.getTime();
  const absMinutes = Math.max(1, Math.ceil(Math.abs(diffMs) / 60000));
  const hours = Math.floor(absMinutes / 60);
  const minutes = absMinutes % 60;
  const label = `${hours}h ${String(minutes).padStart(2, "0")}m`;
  
  const lang = (context?.lang || "en-US").split('-')[0].toLowerCase();
  if (lang === "fr") {
    return diffMs >= 0 ? `dans ${label}` : `il y a ${label}`;
  } else if (lang === "es") {
    return diffMs >= 0 ? `en ${label}` : `hace ${label}`;
  }
  return diffMs >= 0 ? `in ${label}` : `${label} ago`;
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

function _safeApiDate(s, utcOffsetSeconds = 0) {
  if (!s || typeof s !== "string") return null;
  const m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (!m) return _safeDate(s);
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const h = Number(m[4] || 0);
  const min = Number(m[5] || 0);
  const sec = Number(m[6] || 0);
  const ms = Date.UTC(y, mo, d, h, min, sec) - utcOffsetSeconds * 1000;
  const out = new Date(ms);
  return isNaN(out.getTime()) ? null : out;
}

function _localDayStart(dateString, utcOffsetSeconds = 0) {
  return _safeApiDate(`${dateString}T00:00:00`, utcOffsetSeconds) || new Date();
}

function _timeFmt(d, shortHour = false) {
  return _timeFmtAt(d, null, shortHour);
}

function _timeFmtAt(d, utcOffsetSeconds = null, shortHour = false) {
  if (!d) return "—";
  const opts = shortHour
    ? { hour: "numeric" }
    : { hour: "2-digit", minute: "2-digit" };
  if (Number.isFinite(utcOffsetSeconds)) opts.timeZone = "UTC";

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
    const displayDate = Number.isFinite(utcOffsetSeconds)
      ? new Date(d.getTime() + utcOffsetSeconds * 1000)
      : d;
    return displayDate.toLocaleTimeString([], opts);
  } catch {
    return d.toISOString().slice(11, 16);
  }
}

function _dateFmtAt(d, utcOffsetSeconds = null, context = null) {
  const opts = { weekday: "long", month: "long", day: "numeric" };
  if (Number.isFinite(utcOffsetSeconds)) opts.timeZone = "UTC";
  const displayDate = Number.isFinite(utcOffsetSeconds)
    ? new Date(d.getTime() + utcOffsetSeconds * 1000)
    : d;
  try {
    return displayDate.toLocaleDateString(context?.lang || [], opts);
  } catch {
    return displayDate.toISOString().slice(0, 10);
  }
}

function _weekdayAt(d, utcOffsetSeconds = 0) {
  const shifted = new Date(d.getTime() + utcOffsetSeconds * 1000);
  return shifted.getUTCDay();
}

function _windDir(deg) {
  if (!Number.isFinite(deg)) return "";
  const index = Math.round(deg / 45) % 8;
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return `{{ t:plugin-weather-slot.dir_${dirs[index]} }}`;
}

function _uvLevel(uv) {
  if (!Number.isFinite(uv)) return "—";
  if (uv < 3) return "{{ t:plugin-weather-slot.uvLow }}";
  if (uv < 6) return "{{ t:plugin-weather-slot.uvModerate }}";
  if (uv < 8) return "{{ t:plugin-weather-slot.uvHigh }}";
  if (uv < 11) return "{{ t:plugin-weather-slot.uvVeryHigh }}";
  return "{{ t:plugin-weather-slot.uvExtreme }}";
}

// Compact SunCalc-style astronomy formulas for no-key moon data.
const ASTRO_RAD = Math.PI / 180;
const ASTRO_DAY_MS = 86400000;
const ASTRO_J1970 = 2440588;
const ASTRO_J2000 = 2451545;
const ASTRO_E = ASTRO_RAD * 23.4397;
const ASTRO_HOUR_MS = 3600000;

function _toJulian(date) {
  return date.valueOf() / ASTRO_DAY_MS - 0.5 + ASTRO_J1970;
}

function _toDays(date) {
  return _toJulian(date) - ASTRO_J2000;
}

function _rightAscension(l, b) {
  return Math.atan2(
    Math.sin(l) * Math.cos(ASTRO_E) - Math.tan(b) * Math.sin(ASTRO_E),
    Math.cos(l),
  );
}

function _declination(l, b) {
  return Math.asin(
    Math.sin(b) * Math.cos(ASTRO_E) +
      Math.cos(b) * Math.sin(ASTRO_E) * Math.sin(l),
  );
}

function _azimuth(H, phi, dec) {
  return Math.atan2(
    Math.sin(H),
    Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi),
  );
}

function _altitude(H, phi, dec) {
  return Math.asin(
    Math.sin(phi) * Math.sin(dec) +
      Math.cos(phi) * Math.cos(dec) * Math.cos(H),
  );
}

function _siderealTime(d, lw) {
  return ASTRO_RAD * (280.16 + 360.9856235 * d) - lw;
}

function _astroRefraction(h) {
  if (h < 0) h = 0;
  return 0.0002967 / Math.tan(h + 0.00312536 / (h + 0.08901179));
}

function _solarMeanAnomaly(d) {
  return ASTRO_RAD * (357.5291 + 0.98560028 * d);
}

function _eclipticLongitude(M) {
  const C =
    ASTRO_RAD *
    (1.9148 * Math.sin(M) +
      0.02 * Math.sin(2 * M) +
      0.0003 * Math.sin(3 * M));
  const P = ASTRO_RAD * 102.9372;
  return M + C + P + Math.PI;
}

function _sunCoords(d) {
  const M = _solarMeanAnomaly(d);
  const L = _eclipticLongitude(M);
  return {
    dec: _declination(L, 0),
    ra: _rightAscension(L, 0),
  };
}

function _moonCoords(d) {
  const L = ASTRO_RAD * (218.316 + 13.176396 * d);
  const M = ASTRO_RAD * (134.963 + 13.064993 * d);
  const F = ASTRO_RAD * (93.272 + 13.22935 * d);
  const l = L + ASTRO_RAD * 6.289 * Math.sin(M);
  const b = ASTRO_RAD * 5.128 * Math.sin(F);
  const dist = 385001 - 20905 * Math.cos(M);
  return {
    ra: _rightAscension(l, b),
    dec: _declination(l, b),
    dist,
  };
}

function _moonPosition(date, lat, lon) {
  const lw = ASTRO_RAD * -lon;
  const phi = ASTRO_RAD * lat;
  const d = _toDays(date);
  const c = _moonCoords(d);
  const H = _siderealTime(d, lw) - c.ra;
  let h = _altitude(H, phi, c.dec);
  h += _astroRefraction(h);
  return {
    altitude: h,
    azimuth: _azimuth(H, phi, c.dec),
    distance: c.dist,
  };
}

function _moonIllumination(date) {
  const d = _toDays(date);
  const s = _sunCoords(d);
  const m = _moonCoords(d);
  const sdist = 149598000;
  const phi = Math.acos(
    Math.sin(s.dec) * Math.sin(m.dec) +
      Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra),
  );
  const inc = Math.atan2(
    sdist * Math.sin(phi),
    m.dist - sdist * Math.cos(phi),
  );
  const angle = Math.atan2(
    Math.cos(s.dec) * Math.sin(s.ra - m.ra),
    Math.sin(s.dec) * Math.cos(m.dec) -
      Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra),
  );
  return {
    fraction: (1 + Math.cos(inc)) / 2,
    phase: 0.5 + (0.5 * inc * (angle < 0 ? -1 : 1)) / Math.PI,
  };
}

function _moonTimes(dayStart, lat, lon) {
  const hc = 0.133 * ASTRO_RAD;
  let h0 = _moonPosition(dayStart, lat, lon).altitude - hc;
  let rise = null;
  let set = null;
  let ye = 0;

  for (let i = 1; i <= 24; i += 2) {
    const h1 =
      _moonPosition(new Date(dayStart.getTime() + i * ASTRO_HOUR_MS), lat, lon)
        .altitude - hc;
    const h2 =
      _moonPosition(
        new Date(dayStart.getTime() + (i + 1) * ASTRO_HOUR_MS),
        lat,
        lon,
      ).altitude - hc;
    const a = (h0 + h2) / 2 - h1;
    const b = (h2 - h0) / 2;
    if (!Number.isFinite(a) || Math.abs(a) < 1e-12) {
      h0 = h2;
      continue;
    }
    const xe = -b / (2 * a);
    ye = (a * xe + b) * xe + h1;
    const d = b * b - 4 * a * h1;
    let roots = 0;
    let x1 = 0;
    let x2 = 0;

    if (d >= 0) {
      const dx = Math.sqrt(d) / (Math.abs(a) * 2);
      x1 = xe - dx;
      x2 = xe + dx;
      if (Math.abs(x1) <= 1) roots++;
      if (Math.abs(x2) <= 1) roots++;
      if (x1 < -1) x1 = x2;
    }

    if (roots === 1) {
      if (h0 < 0) {
        rise = new Date(dayStart.getTime() + (i + x1) * ASTRO_HOUR_MS);
      } else {
        set = new Date(dayStart.getTime() + (i + x1) * ASTRO_HOUR_MS);
      }
    } else if (roots === 2) {
      rise = new Date(
        dayStart.getTime() + (i + (ye < 0 ? x2 : x1)) * ASTRO_HOUR_MS,
      );
      set = new Date(
        dayStart.getTime() + (i + (ye < 0 ? x1 : x2)) * ASTRO_HOUR_MS,
      );
    }

    if (rise && set) break;
    h0 = h2;
  }

  const out = { rise, set };
  if (!rise && !set) {
    if (ye > 0) out.alwaysUp = true;
    else out.alwaysDown = true;
  }
  return out;
}

function _moonApex(start, end, lat, lon) {
  if (!start || !end || end <= start) return null;
  const span = end - start;
  const steps = Math.max(12, Math.min(72, Math.ceil(span / (30 * 60000))));
  let best = start;
  let bestAlt = -Infinity;

  for (let i = 0; i <= steps; i++) {
    const d = new Date(start.getTime() + (span * i) / steps);
    const alt = _moonPosition(d, lat, lon).altitude;
    if (alt > bestAlt) {
      bestAlt = alt;
      best = d;
    }
  }

  let lo = new Date(Math.max(start.getTime(), best.getTime() - ASTRO_HOUR_MS));
  let hi = new Date(Math.min(end.getTime(), best.getTime() + ASTRO_HOUR_MS));
  for (let i = 0; i < 18; i++) {
    const m1 = new Date(lo.getTime() + (hi - lo) / 3);
    const m2 = new Date(hi.getTime() - (hi - lo) / 3);
    if (_moonPosition(m1, lat, lon).altitude < _moonPosition(m2, lat, lon).altitude) {
      lo = m1;
    } else {
      hi = m2;
    }
  }

  const time = new Date((lo.getTime() + hi.getTime()) / 2);
  return {
    time,
    altitude: _moonPosition(time, lat, lon).altitude,
  };
}

function _moonPhaseLabel(phase) {
  if (!Number.isFinite(phase)) return "{{ t:plugin-weather-slot.moon }}";
  if (phase < 0.03 || phase >= 0.97) return "{{ t:plugin-weather-slot.moonNew }}";
  if (phase < 0.22) return "{{ t:plugin-weather-slot.moonWaxingCrescent }}";
  if (phase < 0.28) return "{{ t:plugin-weather-slot.moonFirstQuarter }}";
  if (phase < 0.47) return "{{ t:plugin-weather-slot.moonWaxingGibbous }}";
  if (phase < 0.53) return "{{ t:plugin-weather-slot.moonFull }}";
  if (phase < 0.72) return "{{ t:plugin-weather-slot.moonWaningGibbous }}";
  if (phase < 0.78) return "{{ t:plugin-weather-slot.moonLastQuarter }}";
  return "{{ t:plugin-weather-slot.moonWaningCrescent }}";
}

function _emptyMoonData(show) {
  return {
    show: Boolean(show),
    phaseLabel: "{{ t:plugin-weather-slot.moon }}",
    illuminationLabel: "—",
    riseStr: "—",
    riseRelative: "—",
    setStr: "—",
    setRelative: "—",
    apexStr: "—",
    apexPct: 50,
    nowPct: 0,
    isUp: false,
  };
}

function _pickMoonEvent(events, type, start, end, preferAfter = null) {
  const candidates = events
    .filter((e) => e.type === type && e.time >= start && e.time <= end)
    .sort((a, b) => a.time - b.time);
  if (!candidates.length) return null;
  if (preferAfter) {
    return candidates.find((e) => e.time >= preferAfter) || candidates[0];
  }
  return candidates[0];
}

function _moonTrackNow(now, rise, set, lat, lon) {
  const hc = 0.133 * ASTRO_RAD;
  const alt = _moonPosition(now, lat, lon).altitude;
  const isUp = alt > hc;

  if (!rise?.time || !set?.time) {
    return { nowPct: isUp ? 50 : 0, isUp };
  }

  const riseT = rise.time.getTime();
  const setT = set.time.getTime();
  const nowT = now.getTime();
  let nowPct = 0;

  if (setT > riseT) {
    if (nowT <= riseT) nowPct = 0;
    else if (nowT >= setT) nowPct = 100;
    else nowPct = Math.round(((nowT - riseT) / (setT - riseT)) * 100);
  } else if (nowT > setT && nowT < riseT) {
    // Below horizon between morning set and evening rise.
    nowPct = 0;
  } else if (nowT >= riseT) {
    const end = setT + ASTRO_DAY_MS;
    nowPct = Math.round(((nowT - riseT) / (end - riseT)) * 100);
  } else {
    const start = riseT - ASTRO_DAY_MS;
    nowPct = Math.round(((nowT - start) / (setT - start)) * 100);
  }

  return {
    nowPct: Math.max(0, Math.min(100, nowPct)),
    isUp,
  };
}

function _moonDayData({
  dayStart,
  lat,
  lon,
  utcOffsetSeconds,
  now,
  sunrise,
  sunset,
  nextSunrise,
  dayIndex,
  context,
}) {
  if (!dayStart || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return _emptyMoonData(false);
  }

  const prevStart = new Date(dayStart.getTime() - ASTRO_DAY_MS);
  const nextStart = new Date(dayStart.getTime() + ASTRO_DAY_MS);
  const nextNextStart = new Date(dayStart.getTime() + 2 * ASTRO_DAY_MS);
  const ranges = [prevStart, dayStart, nextStart, nextNextStart].map((start) =>
    _moonTimes(start, lat, lon),
  );
  const events = [];
  ranges.forEach((times) => {
    if (times.rise) events.push({ type: "rise", time: times.rise });
    if (times.set) events.push({ type: "set", time: times.set });
  });

  const localDayEnd = new Date(dayStart.getTime() + ASTRO_DAY_MS);
  const nightStart =
    dayIndex === 0 && sunrise && now < sunrise
      ? dayStart
      : sunset || dayStart;
  const nightEnd =
    dayIndex === 0 && sunrise && now < sunrise
      ? sunrise
      : nextSunrise || new Date(localDayEnd.getTime() + 6 * ASTRO_HOUR_MS);
  const eventStart = dayIndex === 0 ? now : dayStart;
  const eventEnd = new Date(eventStart.getTime() + 2 * ASTRO_DAY_MS);
  const rise = _pickMoonEvent(events, "rise", eventStart, eventEnd, eventStart);
  const set = _pickMoonEvent(events, "set", eventStart, eventEnd, eventStart);
  const illum = _moonIllumination(
    new Date(dayStart.getTime() + 12 * ASTRO_HOUR_MS),
  );
  const apex = _moonApex(nightStart, nightEnd, lat, lon);
  const refNow =
    dayIndex === 0 ? now : new Date(dayStart.getTime() + 12 * ASTRO_HOUR_MS);
  const track = _moonTrackNow(refNow, rise, set, lat, lon);

  let apexPct = 50;
  if (rise?.time && set?.time && apex?.time && set.time > rise.time) {
    apexPct = Math.round(((apex.time - rise.time) / (set.time - rise.time)) * 100);
  } else if (apex?.time && nightEnd > nightStart) {
    apexPct = Math.round(((apex.time - nightStart) / (nightEnd - nightStart)) * 100);
  }
  apexPct = Math.max(0, Math.min(100, apexPct));

  return {
    show: true,
    phaseLabel: _moonPhaseLabel(illum.phase),
    illuminationLabel: `${Math.round(illum.fraction * 100)}% {{ t:plugin-weather-slot.illuminated }}`,
    riseStr: rise?.time ? _timeFmtAt(rise.time, utcOffsetSeconds) : "—",
    riseRelative: rise?.time ? _fmtRelativeEvent(rise.time, now, context) : "—",
    setStr: set?.time ? _timeFmtAt(set.time, utcOffsetSeconds) : "—",
    setRelative: set?.time ? _fmtRelativeEvent(set.time, now, context) : "—",
    apexStr: apex?.time ? _timeFmtAt(apex.time, utcOffsetSeconds) : "—",
    apexPct,
    nowPct: track.nowPct,
    isUp: track.isUp,
  };
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
