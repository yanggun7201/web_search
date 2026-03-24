const cron = require('node-cron');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const { search } = require('./scraper');

const DEFAULT_KEYWORDS = [
  'Anthropic latest news', 'Claude AI model update', 'OpenAI GPT latest news', 'ChatGPT new feature update', 'ChatGPT Apps release',
  'AI breakthrough news today', 'AI research paper published', 'AI startup funding news', 'AI regulation law policy', 'AI new model release announcement',
  'tech industry news this week', 'Apple Google Microsoft news today', 'software engineering developer news', 'cloud computing AWS Azure news', 'cybersecurity data breach attack news'
];

const CATEGORY_PATTERNS = {
  anthropic: ['anthropic', 'claude', 'openai', 'chatgpt', 'gpt'],
  ai: ['ai breakthrough', 'ai research', 'ai startup', 'ai regulation', 'ai new model'],
  tech: ['tech industry', 'apple google', 'software engineering', 'cloud computing', 'cybersecurity']
};

function loadConfig() {
  dotenv.config({ override: true });
  return {
    rawPath: process.env.RAW_PATH || './state/technews_step1_raw_urls.json',
    selectedPath: process.env.SELECTED_PATH || './state/technews_step2_selected.json',
    perKeyword: parseInt(process.env.PER_KEYWORD, 10) || 5,
    perCategory: parseInt(process.env.PER_CATEGORY, 10) || 5,
    fetchContent: process.env.FETCH_CONTENT === 'true',
    keywords: process.env.KEYWORDS
      ? process.env.KEYWORDS.split(',').map(k => k.trim()).filter(Boolean)
      : DEFAULT_KEYWORDS,
    cronSchedule: process.env.CRON_SCHEDULE || '0 7 * * *',
    cronTz: process.env.CRON_TZ || 'Pacific/Auckland'
  };
}

function categorize(keyword) {
  const kw = keyword.toLowerCase();
  for (const [cat, patterns] of Object.entries(CATEGORY_PATTERNS)) {
    if (patterns.some(p => kw.includes(p))) return cat;
  }
  return 'tech';
}

const INDEX_PATTERNS = ['/category/', '/categories/', '/topic/', '/topics/', '/tag/', '/tags/', '/magazine/list/'];
const BLOCKED_HOSTS = ['news.google.com'];

function isArticleUrl(url) {
  try {
    const parsed = new URL(url);
    if (BLOCKED_HOSTS.includes(parsed.hostname)) return false;
    const p = parsed.pathname;
    if (INDEX_PATTERNS.some(pat => p.includes(pat))) return false;
    const segments = p.split('/').filter(Boolean);
    if (segments.length < 2) return false;
    // all segments are short generic words → section page (e.g. /technology/artificial-intelligence/)
    const hasSlug = segments.some(s => s.length > 30 || /\d{4,}/.test(s));
    if (segments.length === 2 && !hasSlug) return false;
    return true;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function collect() {
  const cfg = loadConfig();
  const start = Date.now();
  console.log(`[${new Date().toISOString()}] Starting collection (${cfg.keywords.length} keywords)...`);

  const allResults = [];
  for (const keyword of cfg.keywords) {
    try {
      const data = await search(keyword, { count: cfg.perKeyword, fetchContent: cfg.fetchContent });
      let all = (data.web?.results || []);
      let results = all.filter(r => isArticleUrl(r.url));
      let src = data.source || 'searxng';

      // 필터 후 0개이면 count 늘려서 재시도
      if (results.length === 0) {
        const retry = await search(keyword, { count: cfg.perKeyword * 2, fetchContent: cfg.fetchContent });
        all = (retry.web?.results || []);
        results = all.filter(r => isArticleUrl(r.url));
        src += '→retry';
      }

      const mapped = results.map(r => ({
        keyword,
        url: r.url,
        snippet: r.snippet || r.description || '',
        content: r.content || null
      }));
      allResults.push(...mapped);
      const skipped = all.length - results.length;
      console.log(`  "${keyword}" → ${mapped.length} results${skipped ? ` (${skipped} skipped)` : ''} [${src}]`);
    } catch (err) {
      console.error(`  "${keyword}" → ERROR: ${err.message}`);
    }
    await sleep(500);
  }

  // Dedup by URL
  const seen = new Set();
  const deduped = allResults.filter(r => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });

  // Categorize into buckets
  const buckets = { anthropic: [], ai: [], tech: [] };
  for (const item of deduped) {
    const cat = categorize(item.keyword);
    buckets[cat].push(item);
  }

  // Write raw results
  const rawDir = path.dirname(cfg.rawPath);
  if (!fs.existsSync(rawDir)) fs.mkdirSync(rawDir, { recursive: true });
  fs.writeFileSync(cfg.rawPath, JSON.stringify({ items: deduped }, null, 2));

  function isQualityContent(content) {
    if (content.length < 1500) return false;
    // 마침표로 끝나는 문장이 5개 이상 있어야 진짜 기사
    const sentences = content.split(/[.!?]\s/).filter(s => s.length > 40);
    return sentences.length >= 5;
  }

  // Select top N per category (키워드당 최대 2개, 도메인당 최대 2개)
  function diverseSelect(items, limit) {
    const kwCount = {};
    const domainCount = {};
    const picked = [];
    for (const item of items) {
      const kw = item.keyword;
      const domain = new URL(item.url).hostname;
      if (!item.content || !isQualityContent(item.content)) continue;
      if ((kwCount[kw] || 0) >= 2) continue;
      if ((domainCount[domain] || 0) >= 2) continue;
      picked.push(item);
      kwCount[kw] = (kwCount[kw] || 0) + 1;
      domainCount[domain] = (domainCount[domain] || 0) + 1;
      if (picked.length >= limit) break;
    }
    return picked;
  }

  const selected = [
    ...diverseSelect(buckets.anthropic, cfg.perCategory),
    ...diverseSelect(buckets.ai, cfg.perCategory),
    ...diverseSelect(buckets.tech, cfg.perCategory)
  ];

  // Write selected results
  const selDir = path.dirname(cfg.selectedPath);
  if (selDir !== rawDir && !fs.existsSync(selDir)) fs.mkdirSync(selDir, { recursive: true });
  fs.writeFileSync(cfg.selectedPath, JSON.stringify({ items: selected }, null, 2));

  const ms = Date.now() - start;
  console.log(`[${new Date().toISOString()}] Done: ${deduped.length} raw → ${selected.length} selected (${buckets.anthropic.length}A/${buckets.ai.length}I/${buckets.tech.length}T) ${ms}ms`);
  console.log(`  Raw: ${cfg.rawPath}`);
  console.log(`  Selected: ${cfg.selectedPath}`);
}

let currentJob = null;

function startCron() {
  const cfg = loadConfig();
  console.log(`Tech news collector scheduled: "${cfg.cronSchedule}" (${cfg.cronTz})`);
  console.log(`  Keywords: ${cfg.keywords.length}`);

  currentJob = cron.schedule(cfg.cronSchedule, () => {
    // 스케줄 변경 감지: 실행 시 .env 다시 읽고 스케줄이 바뀌었으면 재등록
    const newCfg = loadConfig();
    if (newCfg.cronSchedule !== cfg.cronSchedule || newCfg.cronTz !== cfg.cronTz) {
      console.log(`[${new Date().toISOString()}] Cron schedule changed → restarting: "${newCfg.cronSchedule}" (${newCfg.cronTz})`);
      currentJob.stop();
      startCron();
    }
    collect().catch(err => console.error('Collection failed:', err.message));
  }, { timezone: cfg.cronTz });
}

module.exports = { collect, startCron };

// 단독 실행: node collector.js --now
if (require.main === module && process.argv.includes('--now')) {
  collect().catch(err => {
    console.error('Collection failed:', err.message);
    process.exit(1);
  });
}
