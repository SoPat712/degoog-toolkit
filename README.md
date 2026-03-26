# degoog SearXNG Extensions

[degoog](https://github.com/fccview/degoog) store extension for [SearXNG](https://github.com/searxng/searxng) integration.

## SearXNG Engine

Custom search engine that connects degoog to your SearXNG instance, giving access to **242+ search engines** (Google, DuckDuckGo, Brave, arXiv, PubMed, HuggingFace, npm, crates.io, StackOverflow, and many more) via SearXNG's JSON API.

**Settings (via Configure button):**
- **SearXNG URL** — Base URL of your instance (default: `http://127.0.0.1:8888`)
- **Categories** — Filter by category (e.g. `general,science,it`)
- **Engines** — Use specific engines only (e.g. `google,arxiv,pubmed`)
- **Safe Search** — 0 (off), 1 (moderate), 2 (strict)

## Installation

1. Open degoog **Settings > Store**
2. Add this repository URL:
   ```
   https://github.com/SiaoZeng/degoog-searxng-extensions.git
   ```
3. Install the **SearXNG** engine
4. Go to **Settings > Engines**, click **Configure** on SearXNG, and set your instance URL

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
