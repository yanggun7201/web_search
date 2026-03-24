const { Readability } = require('@mozilla/readability');
const { JSDOM } = require('jsdom');

const SEARXNG_URL = process.env.SEARXNG_URL || 'http://localhost:8888';

function cleanText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

const virtualConsole = new (require('jsdom').VirtualConsole)();

async function fetchContent(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BraveSearchProxy/1.0)' },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return null;
    const html = await res.text();
    const dom = new JSDOM(html, { url, virtualConsole });
    const article = new Readability(dom.window.document).parse();
    return article?.textContent ? cleanText(article.textContent) : null;
  } catch {
    return null;
  }
}

// --- SearXNG 검색 ---
async function searxngSearch(query, count, offset) {
  const url = `${SEARXNG_URL}/search?` + new URLSearchParams({
    q: query,
    format: 'json',
    pageno: Math.floor(offset / count) + 1,
  });
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`SearXNG returned ${res.status}`);
  const data = await res.json();

  const startInPage = offset % count;
  const results = (data.results || []).slice(startInPage, startInPage + count);

  return {
    results,
    suggestions: data.suggestions || [],
    corrections: data.corrections || [],
    answers: data.answers || [],
    infoboxes: data.infoboxes || [],
    number_of_results: data.number_of_results || 0,
  };
}

// --- 캐시 ---
const cache = new Map();
const CACHE_TTL_MS = (parseInt(process.env.CACHE_TTL_MIN, 10) || 5) * 60 * 1000;

function getCacheKey(query, count, offset, shouldFetch) {
  return `${query}|${count}|${offset}|${shouldFetch}`;
}

// --- 메인 검색 ---
async function search(query, options = {}) {
  const { count = 10, offset = 0, fetchContent: shouldFetch = false } = options;

  const cacheKey = getCacheKey(query, count, offset, shouldFetch);
  const cached = cache.get(cacheKey);
  if (cached && cached.expireAt > Date.now()) {
    return cached.data;
  }

  const searxng = await searxngSearch(query, count, offset);

  const contents = shouldFetch
    ? await Promise.all(searxng.results.map((r) => fetchContent(r.url)))
    : searxng.results.map(() => null);

  const results = searxng.results.map((r, i) => {
    const domain = new URL(r.url).hostname;
    return {
      type: 'search_result',
      title: cleanText(r.title || ''),
      url: r.url,
      description: r.content || '',
      snippet: r.content || '',
      content: contents[i],
      engine: r.engine || r.engines?.join(', ') || '',
      score: r.score || 0,
      meta_url: {
        domain,
        favicon: `https://${domain}/favicon.ico`
      },
      language: 'en',
      is_source_local: false
    };
  });

  const response = {
    type: 'search',
    query: { original: query },
    source: 'searxng',
    web: {
      type: 'search',
      results
    },
    suggestions: searxng.suggestions,
    corrections: searxng.corrections,
    answers: searxng.answers,
    infoboxes: searxng.infoboxes,
    number_of_results: searxng.number_of_results,
  };

  cache.set(cacheKey, { data: response, expireAt: Date.now() + CACHE_TTL_MS });

  return response;
}

module.exports = { search, cleanText };
