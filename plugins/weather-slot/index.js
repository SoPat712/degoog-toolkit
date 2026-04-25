let template = "";
let units = "celsius";
let defaultTarget = "de";

const WMO_DESC = {
  0:"Clear sky",1:"Mainly clear",2:"Partly cloudy",3:"Overcast",
  45:"Foggy",48:"Icy fog",
  51:"Light drizzle",53:"Drizzle",55:"Heavy drizzle",
  61:"Light rain",63:"Rain",65:"Heavy rain",
  71:"Light snow",73:"Snow",75:"Heavy snow",
  80:"Rain showers",81:"Rain showers",82:"Heavy showers",
  85:"Snow showers",86:"Heavy snow showers",
  95:"Thunderstorm",96:"Thunderstorm & hail",99:"Thunderstorm & hail",
};

const WMO_ICON = {
  0:"sun",1:"sun",2:"partly",3:"cloud",
  45:"cloud",48:"cloud",
  51:"rain",53:"rain",55:"rain",61:"rain",63:"rain",65:"rain",
  71:"snow",73:"snow",75:"snow",80:"rain",81:"rain",82:"rain",
  85:"snow",86:"snow",95:"storm",96:"storm",99:"storm",
};

export default {
  name: "Cool Weather",
  description: "Shows current weather and 7-day forecast with animated icons. Usage: !weather <city>",
  trigger: "weather",
  aliases: ["погода", "метео", "forecast"],

  naturalLanguagePhrases: [
    "weather in", "weather for", "weather at",
    "what's the weather in", "what is the weather in",
    "how's the weather in", "whats the weather in",
    "forecast for", "forecast in",
    "temperature in", "temperature at",
    "is it raining in", "is it snowing in",
    "погода в", "погода у", "прогноз для", "прогноз погоди в",
    "яка погода в", "яка погода у",
    "weather today in", "weather tomorrow in",
  ],

  settingsSchema: [
    {
      key: "units",
      label: "Temperature units",
      type: "select",
      options: ["celsius","fahrenheit"],
      description: "Unit for temperature display.",
    },
  ],

  init(ctx) { template = ctx.template; },
  configure(settings) {
    units = settings?.units === "fahrenheit" ? "fahrenheit" : "celsius";
  },

  async execute(args, context) {
    // Only show on "all" tab
    if (context?.tab && context.tab !== "all") return { html: "" };
    // Strip natural language prefixes to get clean city name
    const city = args
      .replace(/^(what'?s?\s+the\s+|how'?s?\s+the\s+|is\s+it\s+(raining|snowing)\s+in\s+|weather\s+(today|tomorrow)\s+)/i, "")
      .replace(/^(weather|forecast|temperature|прогноз\s+погоди|яка\s+погода|погода)\s+(in|for|at|at|в|у|для)?\s*/i, "")
      .replace(/^(in|for|at|at|в|у|для)\s+/i, "")
      .trim();
    if (!city) return { title: "Weather", html: "<p>Usage: !weather &lt;city&gt;</p>" };

    try {
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=5&addressdetails=1`,
        { headers: { "User-Agent": "degoog-weather-slot/1.0", "Accept-Language": "en" } }
      );
      if (!geoRes.ok) return { title: "Weather", html: "" };
      const geoData = await geoRes.json();
      if (!geoData?.length) return { title: "Weather", html: "<p>City not found.</p>" };

      const loc = geoData.find(r => ["city","town","village","municipality"].includes(r.addresstype)) || geoData[0];
      const lat = parseFloat(loc.lat);
      const lon = parseFloat(loc.lon);
      const addr = loc.address || {};
      const cityName = addr.city || addr.town || addr.village || addr.municipality || addr.county || city;
      const countryName = addr.country || "";
      const displayName = countryName ? `${cityName}, ${countryName}` : cityName;

      const unitParam = units === "fahrenheit" ? "fahrenheit" : "celsius";
      const unitSign  = units === "fahrenheit" ? "°F" : "°C";

      const wxRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m,surface_pressure,uv_index` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset` +
        `&hourly=temperature_2m,weather_code` +
        `&temperature_unit=${unitParam}&wind_speed_unit=kmh&timezone=auto&forecast_days=7`
      );
      if (!wxRes.ok) return { title: "Weather", html: "" };
      const wx = await wxRes.json();

      const cur    = wx.current;
      const daily  = wx.daily;
      const hourly = wx.hourly;

      const temp     = Math.round(cur.temperature_2m);
      const feels    = Math.round(cur.apparent_temperature);
      const desc     = WMO_DESC[cur.weather_code] ?? "Unknown";
      const iconType = WMO_ICON[cur.weather_code] ?? "cloud";
      const humidity = Math.round(cur.relative_humidity_2m);
      const wind     = Math.round(cur.wind_speed_10m);
      const windDir  = _windDir(cur.wind_direction_10m);
      const pressure = Math.round(cur.surface_pressure);
      const uv       = cur.uv_index != null ? cur.uv_index.toFixed(1) : "—";
      const hi0      = Math.round(daily.temperature_2m_max[0]);
      const lo0      = Math.round(daily.temperature_2m_min[0]);

      // Sunrise/sunset progress
      const now = new Date();
      const sunrise = new Date(daily.sunrise[0]);
      const sunset  = new Date(daily.sunset[0]);
      const dayLen  = sunset - sunrise;
      const elapsed = Math.max(0, now - sunrise);
      const sunPct  = Math.min(100, Math.max(0, Math.round((elapsed / dayLen) * 100)));
      const sunriseStr = sunrise.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});
      const sunsetStr  = sunset.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});

      // Build per-day data JSON for JS
      const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
      const daysData = daily.time.map((t, i) => {
        const d = new Date(t + "T12:00:00");
        const name = i === 0 ? "Today" : dayNames[d.getDay()];
        const hi   = Math.round(daily.temperature_2m_max[i]);
        const lo   = Math.round(daily.temperature_2m_min[i]);
        const icon = WMO_ICON[daily.weather_code[i]] ?? "cloud";
        const desc2 = WMO_DESC[daily.weather_code[i]] ?? "Unknown";

        // Hourly for this day (24 slots per day)
        const start = i * 24;
        const hrs   = [];
        for (let h = 6; h <= 21; h += 3) {
          const idx = start + h;
          if (hourly.time[idx]) {
            const htime = new Date(hourly.time[idx]);
            hrs.push({
              t: htime.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}),
              c: Math.round(hourly.temperature_2m[idx]),
            });
          }
        }

        // Sun progress per day
        const sr = new Date(daily.sunrise[i]);
        const ss = new Date(daily.sunset[i]);
        const srStr = sr.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});
        const ssStr = ss.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});
        const dl = ss - sr;
        const el = i === 0 ? Math.max(0, now - sr) : dl * 0.5;
        const pct = Math.min(100, Math.max(0, Math.round((el / dl) * 100)));

        // feels-like: use daily max as approx
        const feelsApprox = Math.round(hi - 2);

        return { name, hi, lo, icon, desc: desc2, feels: feelsApprox, sunPct: pct, srStr, ssStr, hourly: hrs };
      });

      const daysJson = JSON.stringify(daysData);

      const html = template
        .split("{{city}}").join(_esc(displayName))
        .split("{{temp}}").join(temp)
        .split("{{unit}}").join(unitSign)
        .split("{{unit2}}").join(unitSign)
        .split("{{unit3}}").join(unitSign)
        .split("{{unit4}}").join(unitSign)
        .split("{{desc}}").join(_esc(desc))
        .split("{{feels}}").join(feels)
        .split("{{hi}}").join(hi0)
        .split("{{lo}}").join(lo0)
        .split("{{icon_type}}").join(iconType)
        .replace("{{humidity}}", humidity)
        .replace("{{wind}}", `${wind} km/h ${windDir}`)
        .replace("{{pressure}}", pressure)
        .replace("{{uv}}", uv)
        .replace("{{sun_pct}}", sunPct)
        .replace("{{sunrise}}", sunriseStr)
        .replace("{{sunset}}", sunsetStr)
        .replace("{{days_json}}", daysJson);

      return { title: `Weather — ${displayName}`, html };
    } catch(e) {
      return { title: "Weather", html: "" };
    }
  },
};

function _windDir(deg) {
  if (deg == null) return "";
  return ["N","NE","E","SE","S","SW","W","NW"][Math.round(deg / 45) % 8];
}
function _esc(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
