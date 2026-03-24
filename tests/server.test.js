const http = require('http');

// dotenv를 mock해서 .env 파일 로드 방지
jest.mock('dotenv', () => ({ config: jest.fn() }));

// search를 mock해서 SearXNG 없이 테스트
jest.mock('../src/scraper', () => ({
  search: jest.fn(() => Promise.resolve({
    type: 'search',
    query: { original: 'test' },
    source: 'searxng',
    web: { type: 'search', results: [{ type: 'search_result', title: 'Test', url: 'https://example.com' }] },
    suggestions: [],
  })),
}));

jest.mock('../src/collector', () => ({
  startCron: jest.fn(),
}));

function request(baseUrl, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = http.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, body: JSON.parse(data) });
      });
    });
    req.on('error', reject);
  });
}

describe('API_KEY 미설정', () => {
  let server, baseUrl;

  beforeAll((done) => {
    delete process.env.API_KEY;
    // 모듈 캐시 초기화 후 로드
    delete require.cache[require.resolve('../src/server')];
    const { app } = require('../src/server');
    server = app.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      done();
    });
  });

  afterAll((done) => { server.close(done); });

  test('인증 없이 정상 검색 200', async () => {
    const res = await request(baseUrl, '/res/v1/web/search?q=test');
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('search');
    expect(res.body.web.results).toHaveLength(1);
  });

  test('q 파라미터 없으면 400', async () => {
    const res = await request(baseUrl, '/res/v1/web/search');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Missing required parameter/);
  });

  test('count, offset이 search에 전달됨', async () => {
    const { search } = require('../src/scraper');
    search.mockClear();
    await request(baseUrl, '/res/v1/web/search?q=hello&count=3&offset=5');
    expect(search).toHaveBeenCalledWith('hello', expect.objectContaining({
      count: 3,
      offset: 5,
    }));
  });
});

describe('API_KEY 설정됨', () => {
  let server, baseUrl;

  beforeAll((done) => {
    process.env.API_KEY = 'test-secret';
    delete require.cache[require.resolve('../src/server')];
    const { app } = require('../src/server');
    server = app.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      done();
    });
  });

  afterAll((done) => {
    delete process.env.API_KEY;
    server.close(done);
  });

  test('토큰 없으면 401', async () => {
    const res = await request(baseUrl, '/res/v1/web/search?q=test');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Unauthorized/);
  });

  test('잘못된 토큰이면 401', async () => {
    const res = await request(baseUrl, '/res/v1/web/search?q=test&token=wrong');
    expect(res.status).toBe(401);
  });

  test('쿼리 파라미터 token으로 인증 성공', async () => {
    const res = await request(baseUrl, '/res/v1/web/search?q=test&token=test-secret');
    expect(res.status).toBe(200);
  });

  test('헤더 X-Subscription-Token으로 인증 성공', async () => {
    const res = await request(baseUrl, '/res/v1/web/search?q=test', {
      'x-subscription-token': 'test-secret',
    });
    expect(res.status).toBe(200);
  });
});
