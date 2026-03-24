jest.mock('jsdom', () => ({
  JSDOM: jest.fn(),
  VirtualConsole: jest.fn(),
}));
jest.mock('@mozilla/readability', () => ({
  Readability: jest.fn(),
}));

const { cleanText } = require('../src/scraper');

// search()는 fetch를 사용하므로 mock 필요
const mockSearxngResponse = {
  results: [
    {
      title: '  Anthropic  announces  update  ',
      url: 'https://www.theverge.com/2026/anthropic-update',
      content: 'Anthropic released a new Claude model...',
      engine: 'google',
      score: 3.5,
    },
    {
      title: 'OpenAI news',
      url: 'https://techcrunch.com/2026/openai-news',
      content: 'OpenAI announced GPT-5...',
      engines: ['google', 'bing'],
      score: 2.1,
    },
  ],
  suggestions: ['anthropic claude'],
  corrections: [],
  answers: [],
  infoboxes: [],
  number_of_results: 1000,
};

// fetch를 mock
beforeEach(() => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(mockSearxngResponse),
    })
  );
});

afterEach(() => {
  jest.restoreAllMocks();
  // 캐시 초기화를 위해 모듈 캐시 삭제
  delete require.cache[require.resolve('../src/scraper')];
});

describe('cleanText', () => {
  test('연속 공백 제거', () => {
    expect(cleanText('hello   world')).toBe('hello world');
  });

  test('앞뒤 공백 제거', () => {
    expect(cleanText('  hello  ')).toBe('hello');
  });

  test('탭/줄바꿈을 공백으로', () => {
    expect(cleanText('hello\n\tworld')).toBe('hello world');
  });
});

describe('search', () => {
  test('Brave API 호환 형식으로 변환', async () => {
    const { search } = require('../src/scraper');
    const result = await search('anthropic', { count: 2 });

    expect(result.type).toBe('search');
    expect(result.source).toBe('searxng');
    expect(result.query.original).toBe('anthropic');
    expect(result.web.type).toBe('search');
    expect(result.web.results).toHaveLength(2);
  });

  test('각 결과에 필수 필드 포함', async () => {
    const { search } = require('../src/scraper');
    const result = await search('anthropic', { count: 2 });
    const item = result.web.results[0];

    expect(item.type).toBe('search_result');
    expect(item.title).toBe('Anthropic announces update');
    expect(item.url).toBe('https://www.theverge.com/2026/anthropic-update');
    expect(item.description).toBe('Anthropic released a new Claude model...');
    expect(item.snippet).toBe('Anthropic released a new Claude model...');
    expect(item.engine).toBe('google');
    expect(item.score).toBe(3.5);
    expect(item.meta_url.domain).toBe('www.theverge.com');
    expect(item.meta_url.favicon).toBe('https://www.theverge.com/favicon.ico');
    expect(item.content).toBeNull();
  });

  test('engines 배열을 쉼표로 합침', async () => {
    const { search } = require('../src/scraper');
    const result = await search('anthropic', { count: 2 });

    expect(result.web.results[1].engine).toBe('google, bing');
  });

  test('SearXNG 부가 필드 포함', async () => {
    const { search } = require('../src/scraper');
    const result = await search('anthropic');

    expect(result.suggestions).toEqual(['anthropic claude']);
    expect(result.corrections).toEqual([]);
    expect(result.answers).toEqual([]);
    expect(result.infoboxes).toEqual([]);
    expect(result.number_of_results).toBe(1000);
  });

  test('SearXNG 에러 시 예외 발생', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, status: 500 })
    );
    const { search } = require('../src/scraper');

    await expect(search('test')).rejects.toThrow('SearXNG returned 500');
  });

  test('캐시 동작 확인', async () => {
    const { search } = require('../src/scraper');

    await search('cached-query');
    await search('cached-query');

    // fetch는 SearXNG에 1번만 호출되어야 함
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
