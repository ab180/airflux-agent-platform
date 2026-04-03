# Airflux Agent

Slack 네이티브 데이터 분석 AI 에이전트. 자연어로 데이터를 질문하면 SQL 생성 → 실행 → 해석 → 응답합니다.

## Quick Start

```bash
# 1. 의존성 설치
npm install

# 2. 초기 설정 (시크릿 확인 + 설정 검증)
npm run bootstrap

# 3. 로컬 개발 시작
npx sst dev

# 4. Slack App 설정
# - Gateway URL → Slash Command, Event Subscriptions, Interactivity
# - 필요 scopes: chat:write, app_mentions:read, im:history, reactions:write 등

# 5. 테스트
# @airflux DAU 알려줘
```

## Architecture

```
[Slack] → [Gateway Lambda (3s)] → [Worker Lambda (120s)] → [Snowflake/Druid]
                                         ↓
                                   [SQL Agent]
                                   LLM → SQL → Guardrails → Execute → Interpret
```

Montgomery(abot) 코드베이스에서 38개 패턴을 학습하여 설계. ~60% 코드 재활용.

## Project Structure

```
├── sst.config.ts              # SST 인프라
├── settings/                  # 설정 (Lambda에 번들)
│   ├── semantic-layer.yaml    # 메트릭 → SQL 매핑
│   ├── domain-glossary.yaml   # 도메인 용어
│   └── feature-flags.yaml     # 기능 플래그
├── src/
│   ├── gateway.ts             # Slack 수신 (3초 내 응답)
│   ├── worker.ts              # 에이전트 실행 (비동기)
│   ├── warmup.ts              # Cold start 방지
│   ├── core/
│   │   ├── base-agent.ts      # 에이전트 추상 클래스
│   │   ├── agent-registry.ts  # 에이전트 레지스트리
│   │   └── guardrails/        # SQL 안전 검증
│   ├── agents/sql-agent/      # Text-to-SQL 에이전트
│   ├── types/                 # TypeScript 타입
│   └── utils/                 # 시크릿, 로깅, 서명 검증
└── tests/                     # 테스트
```

## Commands

```bash
npm run typecheck     # TypeScript 타입 체크
npm test              # 단위 테스트
npm run bootstrap     # 초기 설정 검증
npx sst dev           # 로컬 개발
npx sst deploy        # 배포
```

## Design Document

전체 설계: `.context/airflux-agent-design.md` (11,000+ lines, 38 rounds)
