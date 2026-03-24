# Brave Search API Proxy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Node.js proxy server that accepts Brave Search API requests and returns Brave-compatible responses using DuckDuckGo as the search backend.

**Architecture:** Express server with a single GET endpoint (`/res/v1/web/search`) that uses the `duck-duck-scrape` npm package to query DuckDuckGo, then transforms results into Brave Search API response format.

**Tech Stack:** Node.js, Express, duck-duck-scrape

---

### Task 1: Initialize project and install dependencies

**Files:**
- Create: `package.json`

**Step 1: Initialize npm project**

Run: `cd /Users/yanggun7201/clawd/general_apps/web_search && npm init -y`

**Step 2: Install dependencies**

Run: `npm install express duck-duck-scrape`

**Step 3: Verify installation**

Run: `ls node_modules/express node_modules/duck-duck-scrape`
Expected: Both directories exist

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: init project with express and duck-duck-scrape"
```

---

### Task 2: Create the search module (scraper.js)

**Files:**
- Create: `scraper.js`

**Step 1: Create scraper.js with DuckDuckGo search and Brave format conversion**

```javascript
const DDG = require('duck-duck-scrape');

/**
 * Search DuckDuckGo and return results in Brave Search API format.
 * @param {string} query - Search query
 * @param {object} options - { count, offset, safeSearch }
 * @returns {object} Brave-compatible search response
 */
async function search(query, options = {}) {
  const { count = 10, offset = 0, safeSearch = DDG.SafeSearchType.MODERATE } = options;

  const ddgResults = await DDG.search(query, { safeSearch });

  const results = ddgResults.results
    .slice(offset, offset + count)
    .map((r) => ({
      type: 'search_result',
      title: r.title,
      url: r.url,
      description: r.rawDescription || r.description,
      meta_url: {
        domain: r.hostname,
        favicon: r.icon || `https://${r.hostname}/favicon.ico`
      },
      language: 'en',
      is_source_local: false
    }));

  return {
    type: 'search',
    query: { original: query },
    web: {
      type: 'search',
      results
    }
  };
}

module.exports = { search };
```

**Step 2: Verify module loads without errors**

Run: `node -e "const s = require('./scraper'); console.log('OK')"`
Expected: `OK`

**Step 3: Test a real search**

Run: `node -e "const s = require('./scraper'); s.search('hello world', { count: 2 }).then(r => console.log(JSON.stringify(r, null, 2))).catch(e => console.error(e))"`
Expected: JSON output with `type: "search"`, `query.original: "hello world"`, and `web.results` array

**Step 4: Commit**

```bash
git add scraper.js
git commit -m "feat: add DuckDuckGo search with Brave API format conversion"
```

---

### Task 3: Create the Express server (server.js)

**Files:**
- Create: `server.js`

**Step 1: Create server.js**

```javascript
const express = require('express');
const { search } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 8789;

app.get('/res/v1/web/search', async (req, res) => {
  const { q, count, offset } = req.query;

  if (!q) {
    return res.status(400).json({ error: 'Missing required parameter: q' });
  }

  try {
    const results = await search(q, {
      count: count ? parseInt(count, 10) : 10,
      offset: offset ? parseInt(offset, 10) : 0
    });
    res.json(results);
  } catch (err) {
    console.error('Search error:', err.message);
    res.status(500).json({ error: 'Search failed', message: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Brave Search proxy running on http://localhost:${PORT}`);
});
```

**Step 2: Start server and test with curl**

Run (in background): `node server.js &`
Run: `curl -s "http://localhost:8789/res/v1/web/search?q=hello+world&count=3" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const j=JSON.parse(d);console.log('type:',j.type);console.log('query:',j.query.original);console.log('results:',j.web.results.length)"`
Expected:
```
type: search
query: hello world
results: 3
```

Run: `kill %1` (stop background server)

**Step 3: Commit**

```bash
git add server.js
git commit -m "feat: add Express server with Brave Search API endpoint"
```

---

### Task 4: Add npm start script and .gitignore

**Files:**
- Modify: `package.json`
- Create: `.gitignore`

**Step 1: Add start script to package.json**

In `package.json`, set the `"scripts"` section:
```json
"scripts": {
  "start": "node server.js"
}
```

**Step 2: Create .gitignore**

```
node_modules/
```

**Step 3: Verify npm start works**

Run: `npm start &`
Run: `curl -s "http://localhost:8789/res/v1/web/search?q=test" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');console.log(JSON.parse(d).type)"`
Expected: `search`
Run: `kill %1`

**Step 4: Commit**

```bash
git add package.json .gitignore
git commit -m "chore: add start script and gitignore"
```

---

### Task 5: Test error handling

**Step 1: Test missing query parameter**

Run: `node server.js &`
Run: `curl -s "http://localhost:8789/res/v1/web/search" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');console.log(JSON.parse(d))"`
Expected: `{ error: 'Missing required parameter: q' }`

Run: `kill %1`

**Step 2: Test with X-Subscription-Token header (should be ignored)**

Run: `node server.js &`
Run: `curl -s -H "X-Subscription-Token: fake-token" "http://localhost:8789/res/v1/web/search?q=test&count=2" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const j=JSON.parse(d);console.log('works:',j.web.results.length > 0)"`
Expected: `works: true`

Run: `kill %1`
