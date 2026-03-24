# Brave Search API 프록시 서버

Brave Search API의 무료 대체 서버. SearXNG(오픈소스 메타검색엔진)를 백엔드로 사용하여 Brave Search API와 동일한 요청/응답 형식을 제공한다.

## 왜 필요한가?

OpenClaw 등 Brave Search API를 사용하는 도구들이 있는데, Brave Search API는 유료다. 이 서버는 동일한 API 인터페이스를 제공하면서 실제 검색은 SearXNG(Google, Bing, DuckDuckGo 등 여러 엔진을 동시 검색)로 수행한다. 클라이언트 측 코드 변경 없이 API URL만 바꾸면 된다.

**흐름:**
```
클라이언트 (OpenClaw, Claude Code 등)
  → GET http://localhost:8789/res/v1/web/search?q=검색어
    → [Node.js 프록시] SearXNG에 검색 요청
      → SearXNG가 Google/Bing/DDG 등에서 결과 수집
        → Brave API 형식으로 변환하여 JSON 응답 반환
```

## 프로젝트 구조

```
web_search/
├── src/
│   ├── server.js        # Express 서버 진입점
│   ├── scraper.js       # SearXNG 검색 + Brave API 형식 변환
│   └── collector.js     # 테크 뉴스 자동 수집기
├── searxng/
│   └── settings.yml     # SearXNG 설정 (JSON format 활성화)
├── mcp-server.mjs       # MCP 서버 (Claude Code용)
├── docker-compose.yml   # SearXNG + Node.js 프록시 통합 실행
├── Dockerfile           # Node.js 앱 이미지
├── .env.example         # 환경변수 템플릿
└── package.json
```

### 파일별 역할

- **src/server.js** — Express 서버. `GET /res/v1/web/search` 엔드포인트를 정의한다. 쿼리 파라미터(`q`, `count`, `offset`)를 파싱해서 `scraper.js`의 `search()` 함수를 호출하고, 결과를 JSON으로 응답한다.
- **src/scraper.js** — 검색 로직. SearXNG JSON API(`/search?format=json`)에 검색을 보내고, 결과를 Brave Search API 형식으로 변환한다. 선택적으로 기사 본문 추출(Readability)도 수행한다.
- **src/collector.js** — 테크 뉴스 자동 수집기. AI/테크 관련 키워드로 정기 검색 후 결과를 JSON으로 저장한다.
- **mcp-server.mjs** — MCP 서버. HTTP API(`localhost:8789`)를 `web_search` tool로 감싸서 Claude Code 등에서 사용 가능하게 한다.

## 사전 준비

- **Docker** 필요 (SearXNG 실행용)
- 로컬 개발 시 **Node.js 18 이상** 필요

## 시작하기

### Docker (권장)

```bash
cp .env.example .env     # 환경변수 설정
docker compose up -d     # SearXNG + Node.js 프록시 시작
# => http://localhost:8789 에서 API 사용 가능
```

종료:
```bash
docker compose down
```

### 로컬 개발

SearXNG를 별도로 띄운 상태에서:

```bash
npm install
npm start
# => Brave Search proxy running on http://localhost:8789
```

### 환경변수 설정 (.env)

`.env.example`을 복사해서 `.env`를 만든다.

| 변수 | 필수 | 기본값 | 설명 |
|------|------|--------|------|
| `SEARXNG_URL` | 선택 | `http://localhost:8888` | SearXNG URL (Docker 내부에서는 자동 설정됨) |
| `API_KEY` | 선택 | (없음) | 설정하면 요청 시 토큰 인증 필요 |
| `PORT` | 선택 | `8789` | 서버 포트 |
| `FETCH_CONTENT` | 선택 | `false` | `true`: 기사 본문 추출 포함, `false`: snippet만 |
| `CACHE_TTL_MIN` | 선택 | `5` | 검색 캐시 TTL (분) |

## API

### `GET /res/v1/web/search`

웹 검색을 수행하고 Brave Search API 형식으로 결과를 반환한다.

#### 쿼리 파라미터

| 파라미터 | 필수 여부 | 타입 | 기본값 | 설명 |
|---------|----------|------|--------|------|
| `q` | **필수** | string | - | 검색어 |
| `count` | 선택 | number | `10` | 반환할 결과 수 |
| `offset` | 선택 | number | `0` | 건너뛸 결과 수 (페이지네이션) |
| `token` | 선택 | string | - | 인증 토큰 (`API_KEY` 설정 시 필요) |

#### 인증

`API_KEY` 환경변수가 설정되어 있으면 인증이 활성화된다:

| 방법 | 예시 |
|------|------|
| 쿼리 파라미터 `token` | `?q=test&token=my-secret-key` |
| 헤더 `X-Subscription-Token` | `-H "X-Subscription-Token: my-secret-key"` |

둘 다 보내면 헤더가 우선한다. `API_KEY` 미설정 시 인증 없이 동작한다.

#### 요청 예시

```bash
# 기본 검색
curl "http://localhost:8789/res/v1/web/search?q=Anthropic+latest+news"

# 토큰 인증 + 결과 3개
curl "http://localhost:8789/res/v1/web/search?q=Anthropic+latest+news&count=3&token=my-secret-key"

# 페이지네이션 (11번째 결과부터)
curl "http://localhost:8789/res/v1/web/search?q=Anthropic+latest+news&count=10&offset=10"
```

#### 성공 응답 (HTTP 200)

```json
{
  "type": "search",
  "query": { "original": "Anthropic latest news" },
  "source": "searxng",
  "web": {
    "type": "search",
    "results": [
      {
        "type": "search_result",
        "title": "Anthropic announces new Claude update",
        "url": "https://www.theverge.com/2026/anthropic-claude-update",
        "description": "Anthropic released a new update to its Claude model...",
        "snippet": "Anthropic released a new update to its Claude model...",
        "content": null,
        "engine": "google",
        "score": 3.5,
        "meta_url": {
          "domain": "www.theverge.com",
          "favicon": "https://www.theverge.com/favicon.ico"
        },
        "language": "en",
        "is_source_local": false
      }
    ]
  },
  "suggestions": ["anthropic claude 4", "anthropic funding"],
  "corrections": [],
  "answers": [],
  "infoboxes": [],
  "number_of_results": 1250000
}
```

#### 응답 필드

**`web.results[]`**

| 필드 | 타입 | 설명 |
|-----|------|------|
| `title` | string | 페이지 제목 |
| `url` | string | 페이지 URL |
| `description` / `snippet` | string | 검색 스니펫 |
| `content` | string \| null | 기사 본문 (`FETCH_CONTENT=true`일 때만, Readability로 추출) |
| `engine` | string | 결과를 제공한 검색 엔진 (google, bing 등) |
| `score` | number | SearXNG 신뢰도 점수 |
| `meta_url.domain` | string | 도메인명 |
| `meta_url.favicon` | string | 파비콘 URL (추정값) |

**최상위 부가 필드**

| 필드 | 타입 | 설명 |
|-----|------|------|
| `suggestions` | string[] | 연관 검색어 추천 |
| `corrections` | string[] | 오타 교정 |
| `answers` | array | 직접 답변 (계산기 등) |
| `infoboxes` | array | 정보 박스 (위키피디아 등) |
| `number_of_results` | number | 전체 검색 결과 수 |

#### 에러 응답

| HTTP | 상황 | 응답 |
|------|------|------|
| 400 | `q` 파라미터 누락 | `{"error": "Missing required parameter: q"}` |
| 401 | 토큰 없거나 틀림 | `{"error": "Unauthorized: invalid or missing token"}` |
| 500 | SearXNG 오류 등 | `{"error": "Search failed", "message": "..."}` |

---

## MCP 서버로 사용하기 (Claude Code 등)

Docker 서비스가 실행 중인 상태에서, Claude Code 설정에 MCP 서버를 등록하면 AI가 직접 `web_search` tool을 사용할 수 있다.

```json
{
  "mcpServers": {
    "web-search": {
      "command": "node",
      "args": ["/absolute/path/to/web_search/mcp-server.mjs"]
    }
  }
}
```

## OpenClaw에서 사용하기

1. `.env` 파일에 `API_KEY`를 설정한다
2. `docker compose up -d`로 서비스를 시작한다
3. OpenClaw 설정에서 Brave Search API URL을 변경한다:
   - 기존: `https://api.search.brave.com`
   - 변경: `http://localhost:8789`
4. API 키 값에 `.env`의 `API_KEY`와 동일한 값을 넣는다

## 뉴스 수집기

AI/테크 관련 뉴스를 자동으로 수집한다. 서버 시작 시 cron으로 스케줄 실행되며, 수동 실행도 가능하다.

```bash
npm run collect:now    # 즉시 수집
```

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `CRON_SCHEDULE` | `0 7 * * *` | 수집 스케줄 |
| `CRON_TZ` | `Pacific/Auckland` | 타임존 |
| `RAW_PATH` | `./state/technews_step1_raw_urls.json` | 전체 결과 저장 경로 |
| `SELECTED_PATH` | `./state/technews_step2_selected.json` | 선별 결과 저장 경로 |

## 기술 스택

| 패키지 | 역할 |
|--------|------|
| SearXNG (Docker) | 오픈소스 메타검색엔진 (Google, Bing, DDG 등 동시 검색) |
| express | HTTP 서버 프레임워크 |
| @mozilla/readability + jsdom | 기사 본문 추출 (Mozilla Reader Mode) |
| @modelcontextprotocol/sdk | MCP 서버 |
| node-cron | 뉴스 수집 스케줄러 |

## 트러블슈팅

| 증상 | 원인 | 해결 |
|------|------|------|
| `EADDRINUSE` 에러 | 포트가 이미 사용 중 | `PORT=9999` 로 변경하거나 해당 포트 사용 프로세스 종료 |
| `Search failed` 500 에러 | SearXNG가 안 떠있음 | `docker compose up -d` 확인 |
| `SearXNG returned 403` | JSON format 비활성화 | `searxng/settings.yml`에 `json` format 포함 확인 |
| 응답이 너무 느림 | `FETCH_CONTENT=true` | `FETCH_CONTENT=false`로 변경하거나 `count`를 줄임 |
| `401 Unauthorized` | 토큰이 없거나 틀림 | `token` 파라미터 또는 `X-Subscription-Token` 헤더 확인 |
