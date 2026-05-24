# degoog Toolkit

[degoog](https://github.com/fccview/degoog) store repository for SearXNG engines, plugins, and themes.

## AI Usage Awareness

Before I started this repository, I forked it from https://github.com/SiaoZeng/degoog-searxng-extensions, which was coded alongside Claude, and as such, Claude is a contributor on this repo. I myself don't "vibe code", but AI was used in the making of these extensions, with a combination of Github Copilot used for autocompletions, and a local llm running on my own machine for longer completions.

## Included Engines

This repo exposes SearXNG as multiple degoog search engines so each degoog tab can hit the matching SearXNG category:

- **SearXNG** — web/general results
- **SearXNG Images** — images
- **SearXNG Videos** — videos
- **SearXNG News** — news
- **SearXNG File** — files

All engines connect to your SearXNG instance via the JSON API.

**Shared settings (via Configure button):**
- **SearXNG URL** — Base URL of your instance (default: `http://127.0.0.1:8888`)
- **Categories** — Override the default category for that engine (for example `general`, `images`, `videos`, `news`, or `files`)
- **Engines** — Use specific SearXNG engines only (for example `google`, `bing`, `duckduckgo`, `wikipedia`)
- **Safe Search** — 0 (off), 1 (moderate), 2 (strict)

## Included Plugins

- **Sports Results** — shows live sports scores, schedules, and standings above search results
- **Currency** — live currency conversion with fiat and crypto support
- **TMDB** — rich movie, TV, and actor panels when film database or film-site links appear in results
- **Weather** — current weather with interactive tabbed charts (temperature, precipitation, wind, humidity), a 7-day forecast, rich current conditions (pressure, UV, visibility, dew point, cloud cover, wind gusts), a sunrise/sunset arc, and configurable units for temperature, wind speed, pressure and precipitation
- **Speedtest** — minimal internet speed test with selectable servers, latency, download-first flow, a circular gauge, and the `!speedtest` bang command
- **Coinflip** — realistic grey CSS coin flip for quick heads-or-tails decisions
- **Search History** — local search history dropdown and `!history` results view
- **Unit Converter** — fuzzy natural unit conversion for length, mass, volume, temperature, area, and speed
- **Until** — Chrono-powered countdown answers for searches like `years until 3000`, `days since Christmas`, `weeks until July 6th, 2033`, and `!until 5pm`
- **OpenStreetMap** — interactive maps for map, address, and location queries

## Included Themes

- **LiterallyGoogle** — Google-like results styling with a sticky header and full-width above-results plugin slots

**Speedtest** exposes:

- `!speedtest` (primary trigger)
- `!speed` alias (kept for muscle memory; also a guaranteed-working fallback if the core built-in is ever re-enabled)
- Natural-language phrases like `speed test`, `speedtest`, `internet speed`, `wifi speed`, `check my speed`, `test my internet`, `how fast is my internet` — these only activate when degoog's global **Natural language** toggle is on in Settings. Trailing-keyword phrases like `"my internet speed test"` do **not** trigger because degoog's natural-language matcher is prefix-anchored; front-load the keyword.

> **Heads up — conflict with degoog's built-in `!speedtest`:**
> degoog core ships its own `!speedtest` command. The command loader silently keeps the first registration and drops duplicates, so this plugin's `!speedtest` trigger only works if the built-in is disabled.
>
> To use this plugin's Speedtest as `!speedtest`:
>
> 1. Go to **Settings → Plugins**
> 2. Find the **built-in** `Speed Test` entry (from degoog core, not this plugin)
> 3. Toggle it **off**
>
> If you prefer to keep the built-in, you can still invoke this plugin via the `!speed` alias or any of the natural-language phrases above.

**Sports Results** ships as a slot plugin that appears directly in search results.

Example queries:

- `arsenal vs chelsea`
- `football barcelona score`
- `nyk vs bos`
- `chiefs schedule`
- `premier league standings`
- `football scores`
- `yankees vs red sox`

**Sports Results settings:**
- **football-data.org API key** — required for soccer fixtures and standings
- **BALLDONTLIE API key** — required for NFL, NBA, and MLB scores/schedules
- **Preferred soccer competitions** — football-data.org competition codes searched first for generic soccer queries (`PL,PD,CL,BL1,SA,FL1` by default)

**Notes:**
- Soccer uses `football-data.org`
- NFL, NBA, and MLB use `BALLDONTLIE`
- NBA/NFL/MLB standings are intentionally limited on the free BALLDONTLIE tier; this plugin focuses on scores, schedules, and direct matchups there
- Team acronyms and short aliases are supported for built-in NFL/NBA/MLB teams and a curated set of major soccer clubs

## Installation

1. Open degoog **Settings > Store**
2. Add this repository URL:
   ```
   https://github.com/SoPat712/degoog-toolkit.git
   ```
3. Install the SearXNG engines you want
4. Install the plugins or themes you want from this repository
5. Go to **Settings > Engines**, click **Configure** on each installed SearXNG engine, and set your instance URL
6. Go to **Settings > Plugins**, click **Configure** on any installed plugin that needs setup, and add its keys or preferences

## Prerequisites

A running SearXNG instance with JSON output enabled:

```bash
docker run -d --name searxng -p 8888:8080 \
  -e SEARXNG_SECRET=your-secret \
  searxng/searxng:latest
```

Make sure `json` is listed in `formats` in your SearXNG `settings.yml`:

```yaml
search:
  formats:
    - html
    - json
```

For the Sports Results plugin, users also need their own API keys:

- [football-data.org](https://www.football-data.org/client/register)
- [BALLDONTLIE](https://app.balldontlie.io)

TMDB also requires a user-supplied API key from [The Movie Database](https://www.themoviedb.org/settings/api).
