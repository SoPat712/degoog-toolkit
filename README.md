# degoog Toolkit

[degoog](https://github.com/fccview/degoog) store repository for SearXNG engines, plugins, and themes.

This repository is forked from and based on the work by [SiaoZeng](https://github.com/SiaoZeng) (from [degoog-searxng-extensions](https://github.com/SiaoZeng/degoog-searxng-extensions)).

We are incredibly grateful to the original authors and contributors in the `degoog` community whose tools, plugins, themes, and examples laid the foundation for this repository, including:

- **[Arkmind](https://github.com/Arkmind)** (creator of the Trankil plugin suite under the author name *arky*, including `calculator`, `stopwatch`, `tmdb`, etc.)
- **[Georgvwt](https://github.com/Georgvwt)** (creator of various slots and plugins like `reddit-slot`, `osm-slot`, `define-slot`, etc.)
- **[TheAnnoying](https://github.com/TheAnnoying)** (creator of the original `LiterallyGoogle` theme)
- **[Federico Dossena](https://github.com/adolfintel)** (creator of the underlying Speedtest)
- **Ben Ng** (creator of the unit/convert-units code)
- **[fccview](https://github.com/fccview)** (creator of degoog and various extensions)

## AI Usage Awareness

Before I started this repository, I forked it from https://github.com/SiaoZeng/degoog-searxng-extensions, which was coded alongside Claude, and as such, Claude is a contributor on this repo. I myself don't "vibe code", but AI was used in the making of these extensions, with a combination of Github Copilot used for autocompletions, and a local llm running on my own machine for longer completions.

## Included Themes

- **LiterallyGoogle** — Google-like results styling with a sticky header and full-width above-results plugin slots

## Included Plugins

- **Barrel Roll** — do a barrel roll or tilt the page on matching queries (`do a barrel roll`, `tilt`, `askew`)
- **Calculator** — scientific calculator with safe expression parsing, interactive keypad, and local canvas graphing
- **Color Translator** — translates colors between HEX, RGB/RGBA, HSL/HSLA, Named CSS colors, and developer `UIColor`/`NSColor` RGB/HSB code formats
- **Currency** — live currency conversion with fiat and crypto support
- **Dictionary** — shows definitions, pronunciation, synonyms, antonyms, and origin for explicit dictionary queries
- **OpenStreetMap** — interactive maps for map, address, and location queries
- **Reddit** — shows the top Reddit post and top comments above search results
- **Search History** — local search history dropdown and `!history` results view
- **Speedtest** — minimal internet speed test with selectable servers, latency, download-first flow, a circular gauge, and the `!speed` bang command
- **Stocks** — no-key stock quotes with Yahoo Finance data and selectable chart ranges
- **Timer / Stopwatch** — compact timer and stopwatch with smooth circular progress, editable durations, and optional sound
- **Tip Calculator** — interactive tip calculator with real-time bill split, custom slider parameters, and animations
- **TMDB** — rich movie, TV, and actor panels when film database or film-site links appear in results
- **Translate** — no-key server-side translation command with provider switching, romanization, speech, and leading natural-language triggers
- **Undecideds** — a premium multi-mode decision-making dashboard featuring Coin Flip, Roll Die, Pick Number, and Yes or No decisions
- **Unit Converter** — fuzzy natural unit conversion for length, mass, volume, temperature, area, and speed
- **Until** — Chrono-powered countdown answers for searches like `years until 3000`, `days since Christmas`, `weeks until July 6th, 2033`, and `!until 5pm`
- **Weather** — current weather with interactive tabbed charts (temperature, precipitation, wind, humidity), a 7-day forecast, rich current conditions (pressure, UV, visibility, dew point, cloud cover, wind gusts), a sunrise/sunset arc, and configurable units for temperature, wind speed, pressure and precipitation

### Speedtest details

**Speedtest** exposes:

- `!speed` (primary trigger, chosen to avoid degoog core's built-in `!speedtest` conflict)
- `!speedtest` alias (works when the core built-in is disabled or the deployment allows the alias to coexist)
- Natural-language phrases like `speed test`, `speedtest`, `internet speed`, `wifi speed`, `check my speed`, `test my internet`, `how fast is my internet` — Speedtest defaults its per-command **Natural language** toggle on for fresh installs. Trailing-keyword phrases like `"my internet speed test"` do **not** trigger because degoog's natural-language matcher is prefix-anchored; front-load the keyword.

> **Heads up — conflict with degoog's built-in `!speedtest`:**
> degoog core ships its own `!speedtest` command. The command loader silently keeps the first registration and drops duplicate primary triggers, so this plugin uses `!speed` as its primary command.
>
> To use this plugin's Speedtest as `!speedtest`:
>
> 1. Go to **Settings → Plugins**
> 2. Find the **built-in** `Speed Test` entry (from degoog core, not this plugin)
> 3. Toggle it **off**
>
> If you prefer to keep the built-in, invoke this plugin via `!speed`, `!speed-test`, `!networkspeed`, `!internetspeed`, or any of the natural-language phrases above.

### Color Translator details

**Color Translator** triggers when entering a color format:
- HEX (e.g., `#1e90ff` or `1e90ff`)
- RGB/RGBA (e.g., `rgb(30, 144, 255)`)
- HSL/HSLA (e.g., `hsl(210, 100%, 56%)`)
- CSS Named Color (e.g., `dodgerblue`, `tomato`)
- Swift/Objective-C code declarations (e.g., `[UIColor colorWithRed:0.118 green:0.565 blue:1 alpha:1]` or `[NSColor colorWithCalibratedHue:0.582 saturation:0.882 brightness:1 alpha:1]`)

It translates the color into HEX, RGB, RGB Percent, HSL, CSS Named, NSColor (calibrated/device RGB/HSB), and UIColor (RGB/HSB) with quick-copy buttons and a color swatch preview.

### Tip Calculator details

**Tip Calculator** triggers on query terms:
- `tip calculator`
- `calculate tip for 75 split by 3`
- `tip 20% on $85`
- `18% tip on 64`

It parses the bill, tip percentage, and split count directly from the query, and presents an interactive calculator with real-time bill split sliders, custom parameters, and animated value reveals.

### Undecideds details

**Undecideds** replaces the coinflip plugin with an interactive decision-making dashboard. Triggers include:
- **Coin Flip**: `coin flip`, `heads or tails`, `flip a coin` (features smooth 3D CSS coin spin animation)
- **Roll Die**: `roll a die`, `roll d20`, `roll d6` (features 3D/holographic animated rolling dice)
- **Pick Number**: `pick a number 1-100`, `random number 5 to 50` (features a staggered slot-machine digit-scrolling reveal and customizable range boundaries)
- **Yes or No**: `yes or no`, `should i` (features a rotating Yes/No wheel spinner with pointer wiggles and fun answers)

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

## Sports Results

- **Sports Results** — shows live sports scores, schedules, and standings above search results

Sports Results ships as a slot plugin that appears directly in search results.

### Example queries

- `arsenal vs chelsea`
- `football barcelona score`
- `nyk vs bos`
- `chiefs schedule`
- `premier league standings`
- `football scores`
- `yankees vs red sox`

### Settings

- **football-data.org API key** — required for soccer fixtures and standings
- **BALLDONTLIE API key** — required for NFL, NBA, and MLB scores/schedules
- **Preferred soccer competitions** — football-data.org competition codes searched first for generic soccer queries (`PL,PD,CL,BL1,SA,FL1` by default)

### Notes

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
