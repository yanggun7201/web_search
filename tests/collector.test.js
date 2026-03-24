jest.mock('../src/scraper', () => ({ search: jest.fn() }));

const { categorize, isArticleUrl, isQualityContent, diverseSelect } = require('../src/collector');

describe('categorize', () => {
  test('anthropic 키워드 분류', () => {
    expect(categorize('Anthropic latest news')).toBe('anthropic');
    expect(categorize('Claude AI model update')).toBe('anthropic');
    expect(categorize('OpenAI GPT latest news')).toBe('anthropic');
    expect(categorize('ChatGPT new feature')).toBe('anthropic');
  });

  test('ai 키워드 분류', () => {
    expect(categorize('AI breakthrough news today')).toBe('ai');
    expect(categorize('AI research paper published')).toBe('ai');
    expect(categorize('AI startup funding news')).toBe('ai');
    expect(categorize('AI regulation law policy')).toBe('ai');
  });

  test('tech 키워드 분류', () => {
    expect(categorize('tech industry news')).toBe('tech');
    expect(categorize('cybersecurity data breach')).toBe('tech');
    expect(categorize('cloud computing AWS')).toBe('tech');
  });

  test('매칭 안 되면 tech 기본값', () => {
    expect(categorize('random unknown keyword')).toBe('tech');
  });
});

describe('isArticleUrl', () => {
  test('유효한 기사 URL', () => {
    expect(isArticleUrl('https://www.theverge.com/2026/3/25/anthropic-claude-update-12345')).toBe(true);
    expect(isArticleUrl('https://techcrunch.com/2026/03/25/some-article-slug-here')).toBe(true);
  });

  test('인덱스/카테고리 페이지 거부', () => {
    expect(isArticleUrl('https://example.com/category/tech')).toBe(false);
    expect(isArticleUrl('https://example.com/topics/ai')).toBe(false);
    expect(isArticleUrl('https://example.com/tag/news')).toBe(false);
  });

  test('세그먼트 2개 미만 거부', () => {
    expect(isArticleUrl('https://example.com/')).toBe(false);
    expect(isArticleUrl('https://example.com/about')).toBe(false);
  });

  test('짧은 세그먼트 2개만 있으면 섹션 페이지로 간주', () => {
    expect(isArticleUrl('https://example.com/technology/ai')).toBe(false);
  });

  test('긴 슬러그가 있으면 기사로 인정', () => {
    expect(isArticleUrl('https://example.com/tech/this-is-a-very-long-article-slug-name')).toBe(true);
  });

  test('숫자 4자리 이상 있으면 기사로 인정', () => {
    expect(isArticleUrl('https://example.com/news/12345')).toBe(true);
  });

  test('차단된 호스트 거부', () => {
    expect(isArticleUrl('https://news.google.com/articles/some-long-article-slug')).toBe(false);
  });

  test('유효하지 않은 URL', () => {
    expect(isArticleUrl('not-a-url')).toBe(false);
  });
});

describe('isQualityContent', () => {
  test('1500자 미만은 저품질', () => {
    expect(isQualityContent('Short content.')).toBe(false);
  });

  test('충분한 길이 + 문장 5개 이상이면 고품질', () => {
    const sentences = Array(20).fill('This is a sufficiently long sentence that exceeds forty characters easily enough for quality check.');
    const content = sentences.join('. ') + '.';
    expect(content.length).toBeGreaterThan(1500);
    expect(isQualityContent(content)).toBe(true);
  });

  test('길지만 문장이 부족하면 저품질', () => {
    const content = 'a'.repeat(2000);
    expect(isQualityContent(content)).toBe(false);
  });
});

describe('diverseSelect', () => {
  const makeItem = (keyword, domain, hasContent = true) => ({
    keyword,
    url: `https://${domain}/article/${Math.random().toString(36).slice(2, 40)}`,
    snippet: 'test snippet',
    content: hasContent ? 'a'.repeat(1600) + '. ' + Array(5).fill('This is a sufficiently long sentence that exceeds forty characters easily enough').join('. ') + '.' : null,
  });

  test('limit만큼만 선택', () => {
    const items = Array(10).fill(null).map((_, i) =>
      makeItem(`kw${i}`, `domain${i}.com`)
    );
    expect(diverseSelect(items, 3)).toHaveLength(3);
  });

  test('같은 키워드는 최대 2개', () => {
    const items = Array(5).fill(null).map((_, i) =>
      makeItem('same-keyword', `domain${i}.com`)
    );
    expect(diverseSelect(items, 5)).toHaveLength(2);
  });

  test('같은 도메인은 최대 2개', () => {
    const items = Array(5).fill(null).map((_, i) =>
      makeItem(`kw${i}`, 'same-domain.com')
    );
    expect(diverseSelect(items, 5)).toHaveLength(2);
  });

  test('content 없는 항목은 제외', () => {
    const items = [
      makeItem('kw1', 'a.com', false),
      makeItem('kw2', 'b.com', true),
    ];
    const result = diverseSelect(items, 5);
    expect(result).toHaveLength(1);
    expect(result[0].keyword).toBe('kw2');
  });
});
