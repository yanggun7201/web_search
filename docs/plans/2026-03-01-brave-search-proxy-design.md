# Brave Search API Proxy Server Design

## Purpose

Replace the paid Brave Search API with a free proxy server that accepts the same request format and returns Brave-compatible responses. Used by OpenClaw which expects the Brave Search API interface.

## Architecture

```
OpenClaw → GET /res/v1/web/search?q=... → [Proxy Server] → DuckDuckGo scraping → Brave API format response
```

## Tech Stack

- Node.js + Express
- axios (HTTP requests to DuckDuckGo)
- cheerio (HTML parsing)

## Files

```
web_search/
├── package.json
├── server.js      # Express server + route
└── scraper.js     # DuckDuckGo scraping + Brave format conversion
```

## API

**Endpoint:** `GET /res/v1/web/search`

**Supported query params:**

| Param | Mapping |
|-------|---------|
| `q` | Search query (required) |
| `count` | Limit results (default 10, max 20) |
| `offset` | Pagination offset |
| `country` | Maps to DuckDuckGo `kl` param |
| `search_lang` | Maps to DuckDuckGo language filter |

**Headers:** `X-Subscription-Token` accepted but ignored (compatibility).

**Response format:**

```json
{
  "type": "search",
  "query": { "original": "..." },
  "web": {
    "type": "web",
    "results": [
      {
        "type": "result",
        "title": "...",
        "url": "https://...",
        "description": "...",
        "meta_url": {
          "domain": "example.com",
          "favicon": "https://example.com/favicon.ico"
        },
        "language": "en",
        "is_source_local": false
      }
    ]
  }
}
```

## Server Config

- Default port: `8789` (uncommon port)
- Configurable via `PORT` environment variable

## Search Backend

DuckDuckGo HTML scraping via `html.duckduckgo.com/html/`.
- No API key required
- No rate limit (within reason)
- Stable HTML structure
