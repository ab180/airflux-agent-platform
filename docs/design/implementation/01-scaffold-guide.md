# Scaffold Guide

> 기존 scaffold (46파일, 4,216줄) + 새 멀티엔드포인트 구조

## Quick Start

```bash
cp -r .context/airflux-scaffold/* /path/to/new-repo/
cd /path/to/new-repo
npm install
# AI Gateway OIDC 설정
vercel link
vercel env pull
# 개발 서버
npx sst dev
```

## 기존 Scaffold 파일 구조

```
airflux-scaffold/
├── sst.config.ts              # SST v3 인프라 (Lambda, VPC, Secrets)
├── package.json
├── tsconfig.json
├── src/
│   ├── gateway.ts             # → endpoints/slack.ts로 이동 예정
│   ├── worker.ts              # 유지 (비동기 작업 처리)
│   ├── warmup.ts              # 유지 (Lambda warmup)
│   ├── agents/
│   │   └── sql-agent/         # SQL Agent (AI SDK 6 Agent class)
│   ├── core/
│   │   ├── agent-registry.ts  # 에이전트 등록/조회
│   │   ├── base-agent.ts      # 기본 에이전트 클래스
│   │   ├── response-formatter.ts
│   │   ├── session-state.ts   # 세션 관리 (→ Redis 전환 예정)
│   │   └── guardrails/
│   ├── datasources/           # Snowflake, MySQL, Druid 연결
│   ├── types/                 # AgentContext, AirfluxError 등
│   └── utils/                 # 로깅, 시크릿, S3, Slack 유틸
├── settings/                  # Semantic Layer, Golden Queries
├── tests/                     # 33 unit tests
└── docs/                      # Montgomery 패턴 문서
```

## 새로 추가할 구조 (v2)

```
src/
├── endpoints/                 # 🆕 멀티 엔드포인트
│   ├── slack.ts               # Slack gateway (기존 gateway.ts 이전)
│   ├── api.ts                 # REST API gateway
│   ├── cron.ts                # Cron 스케줄러
│   └── webhook.ts             # Webhook 수신기
│
├── channels/                  # 🆕 ResponseChannel 구현체
│   ├── base.ts                # ResponseChannel 인터페이스
│   ├── slack-channel.ts       # Slack Block Kit 응답
│   ├── http-channel.ts        # JSON + SSE 스트리밍
│   ├── s3-report-channel.ts   # S3 HTML 리포트
│   └── multi-channel.ts       # 복합 채널 (Cron용)
│
├── agents/                    # 에이전트 확장
│   ├── sql-agent/             # 기존 유지
│   ├── insight-agent/         # 🆕 인사이트/이상탐지
│   ├── image-agent/           # 🆕 차트/이미지 생성
│   └── router-agent/         # 🆕 의도 분류 + 라우팅
│
└── workflows/                 # 🆕 DurableAgent 워크플로우
    ├── app-onboarding.ts
    ├── daily-anomaly.ts
    └── event-drift.ts
```

## 마이그레이션 순서

1. `src/endpoints/` 생성, `gateway.ts` → `endpoints/slack.ts` 이동
2. `src/channels/` 생성, `ResponseChannel` 인터페이스 정의
3. `worker.ts`에서 `ResponseChannel` 사용하도록 수정
4. `endpoints/api.ts` 추가 (REST API)
5. `sst.config.ts`에 새 Lambda 함수 추가
6. 기존 테스트 수정 + 새 엔드포인트 테스트 추가
