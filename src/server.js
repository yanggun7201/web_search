require('dotenv').config();
const express = require('express');
const { search } = require('./scraper');
const { startCron } = require('./collector');

const app = express();
const PORT = process.env.PORT || 8789;
const API_KEY = process.env.API_KEY;
const FETCH_CONTENT = process.env.FETCH_CONTENT === 'true';

app.get('/res/v1/web/search', async (req, res) => {
  const { q, count, offset } = req.query;
  const start = Date.now();

  const token = req.headers['x-subscription-token'] || req.query.token;
  if (API_KEY && token !== API_KEY) {
    const ms = Date.now() - start;
    console.log(`[${new Date().toISOString()}] 401 Unauthorized ${ms}ms ${req.originalUrl}`);
    return res.status(401).json({ error: 'Unauthorized: invalid or missing token' });
  }

  if (!q) {
    const ms = Date.now() - start;
    console.log(`[${new Date().toISOString()}] 400 q=(missing) ${ms}ms`);
    return res.status(400).json({ error: 'Missing required parameter: q' });
  }

  try {
    const results = await search(q, {
      count: count ? parseInt(count, 10) : 10,
      offset: offset ? parseInt(offset, 10) : 0,
      fetchContent: FETCH_CONTENT
    });
    const ms = Date.now() - start;
    const cached = ms < 10 ? ' [cache]' : '';
    console.log(`[${new Date().toISOString()}] 200 q="${q}" → ${results.web.results.length} results ${ms}ms [${results.source}]${cached}`);
    res.json(results);
  } catch (err) {
    const ms = Date.now() - start;
    console.error(`[${new Date().toISOString()}] 500 q="${q}" ${ms}ms - ${err.message}`);
    res.status(500).json({ error: 'Search failed', message: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Brave Search proxy running on http://localhost:${PORT}`);
  startCron();
});
