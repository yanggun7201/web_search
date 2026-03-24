import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BASE_URL = process.env.WEB_SEARCH_URL || 'http://localhost:8789';

const server = new McpServer({
  name: 'web-search',
  version: '1.0.0',
});

server.tool(
  'web_search',
  'Search the web using SearXNG. Returns results in Brave Search API format with titles, URLs, snippets, and optional full article content.',
  {
    query: z.string().describe('Search query'),
    count: z.number().optional().default(10).describe('Number of results (default: 10)'),
    offset: z.number().optional().default(0).describe('Result offset for pagination'),
    fetchContent: z.boolean().optional().default(false).describe('Fetch full article text via Readability'),
  },
  async ({ query, count, offset, fetchContent }) => {
    const params = new URLSearchParams({ q: query });
    if (count) params.set('count', String(count));
    if (offset) params.set('offset', String(offset));

    const url = `${BASE_URL}/res/v1/web/search?${params}`;
    const res = await fetch(url);

    if (!res.ok) {
      const err = await res.text();
      return { content: [{ type: 'text', text: `Search failed (${res.status}): ${err}` }], isError: true };
    }

    const data = await res.json();
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
