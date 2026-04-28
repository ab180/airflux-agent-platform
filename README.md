# Airflux Agent Platform

AB180 사내 AI 에이전트 관리 플랫폼. 에이전트를 등록/설정/모니터링하고, 자연어로 데이터를 조회하는 시스템.

## Quickstart

처음이면 [`docs/quickstart.md`](docs/quickstart.md) (첫 5분 절차 + 트러블슈팅 1쪽) 를 먼저 보세요.
한 명령으로 Postgres + 서버 + 대시보드를 띄우려면 `npx airops start` (아래 [로컬 개발 (airops CLI)](#로컬-개발-airops-cli) 참조).

직접 단계별로 띄우려면:

```bash
# 1. 의존성 설치
npm install

# 2. core 패키지 빌드 (server가 의존)
npm run build --workspace=@airflux/core

# 3. 전체 개발 서버 시작 (server + dashboard 동시)
npm run dev
```

개발 서버:
- **API Server**: http://localhost:3000 (Hono)
- **Dashboard**: http://localhost:3001 (Next.js)

## 에이전트 테스트

```bash
# Echo agent에 질문
curl -X POST http://localhost:3000/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "앱 123의 DAU 알려줘"}'

# 또는 shortcut
npm run query -- '{"query": "hello"}'
```

## 프로젝트 구조

```
airflux-agent-platform/
├── packages/
│   ├── core/          @airflux/core — Agent/Skill/Tool 프레임워크
│   │   ├── src/
│   │   │   ├── agents/        BaseAgent, EchoAgent
│   │   │   ├── registries/    AgentRegistry, SkillRegistry, ToolRegistry
│   │   │   ├── providers/     LLM Provider 추상화 (local/bedrock/internal)
│   │   │   ├── config/        YAML 설정 로더
│   │   │   ├── channels/      ResponseChannel (Console, HTTP)
│   │   │   └── types/         TypeScript 타입, 에러 클래스
│   │   └── __tests__/         85개 단위 테스트
│   │
│   └── server/        @airflux/server — Hono API 서버
│       └── src/
│           ├── routes/        query, admin, health 엔드포인트
│           ├── middleware/     security, validation, auth
│           └── bootstrap.ts   설정 로딩 + 에이전트 초기화
│
├── apps/
│   └── dashboard/     Next.js 16 관리 대시보드
│       └── src/
│           ├── app/dashboard/  14개 페이지 (overview, agents, monitoring, ...)
│           ├── components/     StatCard, AgentUsageBar, Sidebar
│           └── lib/            API 클라이언트
│
├── settings/          YAML 설정 파일
│   ├── agents.yaml    에이전트 등록/설정
│   ├── skills.yaml    스킬 정의 (도구 조합 + guardrail)
│   └── feature-flags.yaml
│
└── docs/
    ├── design/        43개 설계 문서 (~10,000줄)
    └── scaffold-v1/   기존 Montgomery 기반 스캐폴드 (참고용)
```

## Agent > Skill > Tool 3계층

```
Agent (에이전트) = LLM + Instructions + Skills + Tools
├── Skill (스킬) = 하나 이상의 도구를 조합한 고수준 능력
│   └── Tool (도구) = 외부 시스템과 상호작용하는 단일 함수
└── 설정: settings/agents.yaml
```

## 주요 명령어

| 명령어 | 설명 |
|--------|------|
| `npm run dev` | 전체 개발 서버 (server + dashboard) |
| `npm run dev:server` | API 서버만 |
| `npm run dev:dashboard` | 대시보드만 |
| `npm run build` | 전체 빌드 |
| `npm run test` | 전체 테스트 |
| `npm run clean` | 빌드 결과물 삭제 |

## API 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/health` | 헬스체크 + LLM 상태 |
| POST | `/api/query` | 에이전트에 질문 (예산 체크 포함) |
| POST | `/api/feedback` | 피드백 제출 |
| POST | `/api/slack/events` | Slack 이벤트 webhook |
| GET | `/api/admin/overview` | 대시보드 통합 현황 |
| GET | `/api/admin/agents` | 에이전트 목록 |
| POST | `/api/admin/agents` | 에이전트 생성 (advisor 지원, YAML 자동 저장) |
| PUT | `/api/admin/agents/:name` | 에이전트 수정 (advisor 추가/제거) |
| DELETE | `/api/admin/agents/:name` | 에이전트 삭제 |
| GET | `/api/admin/logs?agent=&success=` | 로그 조회 (필터 지원) |
| GET | `/api/admin/feedback/:traceId` | 피드백 상세 (원본 질문/응답 포함) |
| GET | `/api/admin/monitoring/metrics` | 상세 메트릭 |
| POST | `/api/admin/eval/run` | 평가 실행 |
| GET | `/api/admin/cost` | 일별 비용 + 모델 가격표 |
| GET | `/api/admin/executions/stats` | 실행 상태 (running/completed/failed/stale) |
| GET | `/api/admin/llm/status` | LLM 연결 상태 |
| POST | `/api/admin/llm/key` | API 키 런타임 설정 |
| GET | `/api/admin/skills/stats` | 스킬 사용 통계 |

## 기술 스택

- **모노레포**: Turborepo
- **서버**: Hono (Node.js)
- **대시보드**: Next.js 16 + shadcn/ui + Tailwind CSS
- **Agent Framework**: AI SDK 6 + Anthropic
- **설정**: YAML
- **테스트**: Vitest
- **LLM**: 로컬(Claude Code) → 인프라(AWS Bedrock)

## 설정 파일

에이전트와 스킬은 `settings/` 디렉토리의 YAML 파일로 관리:

```yaml
# settings/agents.yaml
- name: echo-agent
  enabled: true
  model: default
  skills: []
  tools: [echo, getTimestamp]
```

## Slack 연동

```bash
# 1. Slack App 생성 (api.slack.com)
# 2. 환경변수 설정
export SLACK_BOT_TOKEN="xoxb-..."
export SLACK_SIGNING_SECRET="..."

# 3. 로컬 서버를 외부에 노출 (ngrok 또는 Slack Socket Mode)
ngrok http 3000

# 4. Slack App → Event Subscriptions → Request URL:
#    https://xxxx.ngrok.io/api/slack/events
# 5. Subscribe to: message.channels, app_mention
```

Slack 메시지 → Guardrails → 에이전트 라우팅 → 스레드 응답이 자동으로 동작합니다.
스레드별 대화 히스토리가 유지되며, PII 마스킹과 비용 추적이 적용됩니다.

## Docker

```bash
# 빌드 & 실행
docker compose up --build

# 또는 직접 빌드
docker build -t airflux .
docker run -p 3000:3000 -e ANTHROPIC_API_KEY=sk-ant-... airflux
```

## GSD-2 하네스 패턴

[GSD-2](https://github.com/gsd-build/gsd-2)에서 영감을 받아 적용한 에이전트 관리 패턴:

| 패턴 | 설명 |
|------|------|
| 비용 추적 | 모델별 per-token 비용 계산, 일별 집계 |
| 예산 한도 | `dailyBudget` 초과 시 429 반환 |
| 검증 자동화 | 에이전트 실행 후 검증 명령 자동 실행 |
| 컨텍스트 인젝션 | 최근 5턴만 압축 주입, 도구 설명 구조화 |
| 상태머신 | 실행 lifecycle 추적 (running/completed/failed/timeout) |
| 크래시 복구 | 서버 재시작 시 stale 실행 자동 timeout |
| 스킬 텔레메트리 | 스킬 사용 빈도, 성공률, 비활성 감지 |
| Slack 연동 | webhook 수신, 서명 검증, 스레드 세션 |

자세한 설계는 `docs/design/` 참조. 읽는 순서는 `CLAUDE.md` 참고.

## OSS split 경계 — `ab180-extensions/`

이 레포는 범용 OSS `airops` 의 레퍼런스 구현이자 AB180 사내 인스턴스를
겸합니다. AB180 도메인(Airbridge / Snowflake / 한국어 비즈니스 용어)에
의존하는 코드는 단 한 곳에만 둡니다:

```
packages/server/src/ab180-extensions/
```

핵심 규칙(상세는 [`packages/server/src/ab180-extensions/AGENTS.md`](packages/server/src/ab180-extensions/AGENTS.md)):

- **일반 코드는 이 디렉터리를 import 하지 않는다.** `bootstrap.ts` 가
  `hasAb180Config()` 게이트 뒤에서만 동적으로 로드한다. 라우트, 스토어,
  agent 런타임은 도메인-중립으로 유지.
- **도메인 누출 금지.** Airflux/Airbridge/Snowflake 를 직접 참조하는
  툴 이름·라벨·에러 메시지·프롬프트는 모두 이 디렉터리 안에. 일반 툴은
  `bootstrap.ts` 의 `registerBuiltInTools()` 로.
- **추가만 허용.** `registerAb180Tools()` 는 새 tool id 를 등록할 뿐,
  일반 툴을 변경/덮어쓰지 않는다.
- **설정 파일은 optional.** YAML 이 비어있거나 없어도 throw 하지 않게
  `loadConfigOptional` 만 사용.

장기 목표는 이 디렉터리를 별도 private 패키지(`@airops-ab180/tools`)
로 분리하고, 이 레포는 generic `@airops/*` 만 남기는 것입니다.

## 로컬 개발 (airops CLI)

Postgres(Docker) + server + dashboard 를 한 번에 띄우고 끕니다.

```bash
npm install
npx airops start         # foreground, Ctrl+C 로 일괄 종료
npx airops status        # 현재 URL/포트 확인
npx airops db url        # connection URL 을 GUI 에 붙여넣기용으로 출력
npx airops db psql       # airops-pg 에 즉시 psql 세션
npx airops stop          # 서비스 중단 (데이터 유지)
npx airops stop --reset  # 볼륨까지 삭제 (데이터 삭제, 확인 프롬프트)
```

`airops start` 는:
- `airops-pg` 이름의 postgres:16-alpine 컨테이너를 재사용/재시작/생성 (`airops-pgdata` 볼륨 영속)
- Server 는 3100-3199, Dashboard 는 3200-3299 범위에서 빈 포트 자동 선점
- macOS 에서는 Claude OAuth 토큰을 Keychain 에서 직접 읽어 파일 sync 가 필요 없음
