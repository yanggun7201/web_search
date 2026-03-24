# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A Brave Search API proxy server. Mimics the Brave Search API interface (`/res/v1/web/search`) using SearXNG (self-hosted meta search engine) as the backend. Designed as a drop-in replacement for clients like OpenClaw that expect Brave Search API responses.

## Commands

```bash
# Docker (recommended) — starts both SearXNG + Node.js proxy
docker compose up -d        # Start all services
docker compose down          # Stop all services
docker compose logs -f       # View logs

# Local development (requires SearXNG running separately)
npm install
npm start                    # Start Express server (default port 8789)
npm run collect:now          # Run news collection immediately
npm run collect              # Run collector (waits for cron schedule)
```

No test framework is set up.

## Architecture

```
Client (OpenClaw etc.)
  → Node.js proxy (port 8789, Brave API format)
    → SearXNG (port 8888, Docker)
      → Google/Bing/DDG etc. (multi-engine search)
```

`src/` — plain CommonJS:

- **src/server.js** — Express entry point. Single route `GET /res/v1/web/search` with optional token auth (`X-Subscription-Token` header or `token` query param). Starts the cron scheduler on boot.
- **src/scraper.js** — Search logic. Calls SearXNG JSON API (`/search?format=json`). Has in-memory cache (TTL from `CACHE_TTL_MIN`). Optionally fetches full article content using `@mozilla/readability` + `jsdom`. Returns Brave API compatible response plus SearXNG extras (suggestions, corrections, answers, infoboxes).
- **src/collector.js** — Scheduled tech news collector. Searches predefined keywords across three categories (anthropic/ai/tech), deduplicates, filters for article URLs, selects diverse top results, writes JSON to `./state/`. Runs on cron (default: daily 7am NZST). Can run standalone: `node src/collector.js --now`.

Root files:

- **mcp-server.mjs** — MCP server (ESM). Wraps the HTTP API as a `web_search` tool for Claude Code etc. Calls the proxy via `WEB_SEARCH_URL` env var (default `http://localhost:8789`), no direct source dependency.
- **docker-compose.yml** — Runs SearXNG + Node.js proxy together. Sets `SEARXNG_URL=http://searxng:8080` for Docker internal network.
- **Dockerfile** — Node.js 20-slim, `npm ci --omit=dev`, only copies `src/`
- **searxng/settings.yml** — SearXNG config (JSON format enabled, required for proxy to work)

## Key Environment Variables (.env)

| Variable | Default | Purpose |
|----------|---------|---------|
| `SEARXNG_URL` | `http://localhost:8888` | SearXNG URL (in Docker: `http://searxng:8080`) |
| `PORT` | `8789` | Server port |
| `API_KEY` | (none) | Token auth; omit to disable auth |
| `FETCH_CONTENT` | `false` | Fetch full article text per result via Readability |
| `CACHE_TTL_MIN` | `5` | Search cache TTL in minutes |
| `CRON_SCHEDULE` | `0 7 * * *` | Collector cron expression |
| `CRON_TZ` | `Pacific/Auckland` | Timezone for cron |
| `KEYWORDS` | (built-in list) | Comma-separated collector search keywords |
| `PER_KEYWORD` | `5` | Results to fetch per keyword |
| `PER_CATEGORY` | `5` | Max results to select per category (anthropic/ai/tech) |
| `RAW_PATH` | `./state/technews_step1_raw_urls.json` | Raw collector output path |
| `SELECTED_PATH` | `./state/technews_step2_selected.json` | Filtered collector output path |
| `WEB_SEARCH_URL` | `http://localhost:8789` | MCP server only: proxy URL to call |

## Notes

- README is outdated (still references DuckDuckGo as backend). CLAUDE.md is the authoritative doc.
- README and code comments are in Korean.
- SearXNG JSON format must be enabled in `searxng/settings.yml` (already configured).
- Collector writes output to `./state/` directory (created automatically).
- Collector reloads `.env` on each cron tick to detect schedule changes at runtime.
